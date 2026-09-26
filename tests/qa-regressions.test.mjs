// Regressions from the QA pass over 30 synthetic cards (tests/fixtures/synthetic) and the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseRecipeInput, recipeToText, findTimers, parseTitle } from "../js/parser.js";
import { parseIngredientLine, formatIngredient } from "../js/units.js";

const dir = new URL("./fixtures/synthetic/", import.meta.url);
const synthetic = Object.fromEntries(readdirSync(dir).map((f) => [f.slice(0, 2), readFileSync(new URL(f, dir), "utf8")]));
const show = (line, factor = 1, units = "original") => formatIngredient(parseIngredientLine(line), factor, units);

test("every synthetic card parses and round-trips", () => {
  for (const [n, text] of Object.entries(synthetic)) {
    const r = parseRecipeInput(text);
    assert.ok(r.ingredients.length && r.steps.length, n);
    const back = parseRecipeInput(recipeToText(r));
    for (const key of ["ingredients", "steps", "description", "notes", "englishName", "nativeName", "romanized"]) {
      assert.deepEqual(back[key], r[key], `${n} ${key}`);
    }
  }
});

test("ranges keep one unit", () => {
  assert.equal(show("800–1200 g pork chops", 2, "metric"), "1.6–2.4 kg pork chops");
  assert.equal(show("12–20 oz kidney beans", 1, "us"), "12–20 oz kidney beans");
  assert.equal(show("15–30 ml lemon juice", 2, "us"), "2–4 tbsp lemon juice");
  assert.equal(show("2-4 tsp brown sugar", 1, "us"), "2-4 tsp brown sugar");
});

test("plurals follow the amount shown", () => {
  assert.equal(show("240 ml dashi", 1, "us"), "1 cup dashi");
  assert.equal(show("16 tbsp butter", 1, "us"), "1 cup butter");
  assert.equal(show("2 cloves garlic", 0.5), "1 clove garlic");
  assert.equal(show("1 pinch basil", 3), "3 pinches basil");
  assert.equal(show("1 stick butter", 2), "2 sticks butter");
});

test("quantity forms", () => {
  assert.equal(parseIngredientLine("1-1/2 cups chopped onion").qty, 1.5);
  assert.equal(show("1-1/2 cups chopped onion", 2), "3 cups chopped onion");
  assert.equal(parseIngredientLine("2-inch piece ginger").qty, null, "a size is not an amount");
  assert.equal(show("2-inch piece ginger", 2, "us"), "2-inch piece ginger");
  assert.equal(parseIngredientLine("1,5 kg flour").qty, 1.5);
  assert.equal(parseIngredientLine(".5 tsp salt").qty, 0.5);
  assert.equal(show("2—3 chipotles", 2), "4–6 chipotles");
  assert.equal(parseIngredientLine("２ cups rice").qty, 2);
});

test("small amounts stay measurable", () => {
  assert.equal(show("2 g kosher salt", 1, "us"), "2 g kosher salt", "not 1/8 oz");
  assert.equal(show("⅛ tsp salt", 0.5), "pinch salt");
  assert.equal(show("1/3 cup white vinegar", 0.5), "2 2/3 tbsp white vinegar");
  assert.equal(show("400 g tomatoes", 1, "us"), "14 oz tomatoes");
});

test("step links: longest text wins, no matches inside numbers", () => {
  const r = parseRecipeInput(synthetic["25"]);
  assert.deepEqual(r.steps.map((s) => s.ingredientRefs), [[3], [1, 6], [0], [5]]);
});

test("bullets, numbered ingredients, sub-groups", () => {
  const dots = parseRecipeInput(synthetic["13"]);
  assert.ok(dots.ingredients.every((i) => !i.text.startsWith("·")));
  assert.ok(dots.ingredients.filter((i) => i.qty != null).length >= dots.ingredients.length - 1);
  const groups = parseRecipeInput(synthetic["17"]);
  assert.deepEqual([...new Set(groups.ingredients.map((i) => i.group))], ["For the dough", "For the filling", "For the glaze", "For the garnish"]);
  assert.ok(groups.ingredients.every((i) => i.qty != null), "no sub-heading became an ingredient");
  const numbered = parseRecipeInput("T\n\nIngredients\n1. 2 eggs\n•2 tbsp melted butter\n▢ 1 1/2 cups flour\n\nSteps\n1. Mix.");
  assert.deepEqual(numbered.ingredients.map((i) => i.qty), [2, 2, 1.5]);
});

test("steps without numbers", () => {
  assert.equal(parseRecipeInput(synthetic["22"]).steps.length, 4);
  const colon = parseRecipeInput(synthetic["21"]);
  assert.ok(colon.steps.length > 1 && colon.steps.every((s) => !/^Step \d/i.test(s.text)));
  const bullets = parseRecipeInput(synthetic["23"]);
  assert.ok(bullets.steps.length > 1 && bullets.steps.every((s) => !s.text.startsWith("- ")));
});

test("heading variants", () => {
  const r = parseRecipeInput(synthetic["29"]);
  assert.equal(r.ingredients.length, 6);
  assert.equal(r.servings, 16, "Ingredients (makes 16)");
  assert.equal(r.steps.length, 2);
  assert.equal(r.notes, "Chill 2 hours before cutting.");
  assert.deepEqual(r.steps[1].timers.map((t) => t.seconds), [1500], "notes don't leak timers into the last step");
  const curly = parseRecipeInput("T\n\nIngredients\n• 1 egg\n\nSteps\n1. Boil 1 egg.\n\nChef’s Notes\nSalt the water.");
  assert.equal(curly.notes, "Salt the water.");
});

test("PDF text: wrapped ingredients and page footers", () => {
  const r = parseRecipeInput(synthetic["14"]);
  assert.ok(!r.ingredients.some((i) => i.text === "can"), "wrapped line joined");
  assert.ok(r.steps.every((s) => !/Page \d/.test(s.text)), "footer dropped");
});

test("titles", () => {
  assert.equal(parseRecipeInput(synthetic["16"]).englishName, "Japanese Curry Rice");
  assert.equal(parseTitle("**Shakshuka** · Eggs in Tomato").romanized, "**Shakshuka**", "parseTitle alone keeps markup");
  assert.equal(parseRecipeInput("**Shakshuka** · Eggs\n\nIngredients\n• 4 eggs\n\nSteps\n1. Cook.").romanized, "Shakshuka");
  assert.equal(parseRecipeInput("Ingredients\n• 2 cups flour\n\nSteps\n1. Mix.").name, "Untitled recipe");
});

test("not a recipe", () => {
  assert.throws(() => parseRecipeInput("Here's how to reset your router.\n\nSteps\n1. Unplug it."), /Ingredients/);
  assert.throws(() => parseRecipeInput(null), /empty/);
});

test("timer scan stays fast on huge digit runs", () => {
  const t0 = Date.now();
  findTimers("1".repeat(50000) + " minutes");
  parseTitle("a (".repeat(5000));
  assert.ok(Date.now() - t0 < 500);
});

test("a card written by the Claude instructions (docs/claude-instructions.md) keeps every timer and the servings", () => {
  const r = parseRecipeInput(synthetic["31"]);
  assert.equal(r.servings, 4);
  assert.equal(r.englishName, "Korean Chicken Porridge");
  assert.deepEqual(r.steps.map((s) => s.timers.map((t) => t.seconds)), [[3600], [120], [5400], [300], []]);
  assert.ok(r.steps.every((s, i) => i === 4 || s.ingredientRefs.length), "steps link their ingredients");
});
