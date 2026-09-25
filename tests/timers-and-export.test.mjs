import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseRecipeInput, recipeToText, findTimers, parseTitle, EXPORT_PROMPT } from "../js/parser.js";
import { parseIngredientLine, formatIngredient, convertTemperatures } from "../js/units.js";

const fixtures = new URL("./fixtures/", import.meta.url);
const cards = readdirSync(fixtures).filter((f) => f.endsWith(".txt"));
const read = (f) => readFileSync(new URL(f, fixtures), "utf8");
const seconds = (text) => findTimers(text).map((t) => t.seconds);

test("times written in words and compound times", () => {
  assert.deepEqual(seconds("toss hard over low heat for a minute"), [60]);
  assert.deepEqual(seconds("rest for half an hour"), [1800]);
  assert.deepEqual(seconds("braise an hour and a half"), [5400]);
  assert.deepEqual(seconds("bake 1 hr 15 min"), [4500]);
  assert.deepEqual(seconds("roast 1 hour and 15 minutes"), [4500]);
  assert.deepEqual(seconds("a 30-minute rest"), [1800]);
  assert.deepEqual(seconds("cook a minute or two"), [120]);
  assert.deepEqual(seconds("sear for 1–2 minutes"), [120]);
  assert.deepEqual(seconds("simmer 10 to 12 minutes"), [720]);
  assert.deepEqual(seconds("stir for about 30 seconds"), [30]);
  assert.deepEqual(seconds("cook 45 mins, then 2h more"), [2700, 7200]);
});

test("things that are not timers", () => {
  assert.deepEqual(seconds("add a second batch"), []);
  assert.deepEqual(seconds("a 5 cm piece, cut into 3 mm dice, until 160°F, at 1:5.5"), []);
  assert.deepEqual(seconds("soak overnight"), []);
  assert.deepEqual(seconds("Go by the sauce, not the timer."), []);
});

test("every real card round-trips through export text, extra timers included", () => {
  for (const f of cards) {
    const r = parseRecipeInput(read(f));
    r.servings = 3;
    r.steps.at(-1).timers.push({ text: null, seconds: 480 }); // a timer the text doesn't mention
    const back = parseRecipeInput(recipeToText(r));
    assert.deepEqual(back.steps, r.steps, f);
    assert.deepEqual(back.ingredients, r.ingredients, f);
    assert.equal(back.servings, 3, f);
    assert.equal(back.description, r.description, f);
    assert.equal(back.notes, r.notes, f);
  }
});

test("timer markers typed by hand", () => {
  const r = parseRecipeInput("T\n\nIngredients\n• 1 egg\n\nSteps\n1. Boil 1 egg. ⏱ 7 min\n2. Chill it [timer 2 min]\n3. Peel.");
  assert.deepEqual(r.steps.map((s) => s.text), ["Boil 1 egg.", "Chill it", "Peel."]);
  assert.deepEqual(r.steps.map((s) => s.timers.map((t) => t.seconds)), [[420], [120], []]);
  assert.deepEqual(r.steps[0].ingredientRefs, [0]);
});

test("JSON from the export prompt keeps the card's timers and servings", () => {
  const reply = "Here it is:\n\n```json\n" + JSON.stringify({
    title: "ハヤシライス (Hayashi Raisu / Hayashi Rice)",
    description: "Yōshoku-ya style.",
    servings: 4,
    ingredients: ["300 g yellow onion, 1 cm wedges", "10 g neutral oil"],
    steps: [
      { text: "Add 10 g neutral oil, then the 300 g yellow onion, 1 cm wedges. Leave them alone.", timers: [8] },
      { text: "Simmer about 20 minutes.", timers: [20] },
      { text: "Serve.", timers: [] },
    ],
    notes: "Salt at the end.",
  }, null, 2) + "\n```";
  const r = parseRecipeInput(reply);
  assert.equal(r.servings, 4);
  assert.equal(r.englishName, "Hayashi Rice");
  assert.deepEqual(r.steps.map((s) => s.timers.map((t) => t.seconds)), [[480], [1200], []]);
  assert.equal(r.steps[1].timers[0].text, "20 minutes", "the written time is kept once, not doubled");
  assert.deepEqual(r.steps[0].ingredientRefs, [0, 1]);
  assert.ok(EXPORT_PROMPT.includes('"timers"'));
});

test("schema.org Recipe JSON", () => {
  const r = parseRecipeInput(JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [{ "@type": "WebPage" }, {
      "@type": "Recipe", name: "Toast", recipeYield: ["2", "2 servings"],
      recipeIngredient: ["2 slices bread"],
      recipeInstructions: [{ "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Toast 2 slices bread.", performTime: "PT3M" }] }],
    }],
  }));
  assert.equal(r.servings, 2);
  assert.deepEqual(r.steps[0].timers, [{ text: null, seconds: 180 }]);
});

test("bad JSON gets a clear error", () => {
  assert.throws(() => parseRecipeInput('```json\n{"title": "Cut off'), /incomplete/);
  assert.throws(() => parseRecipeInput('{"hello": 1}'), /doesn't look like a recipe/);
});

test("servings line in card text", () => {
  const r = parseRecipeInput("Toast\n\nCrisp.\n\nServes 2\n\nIngredients\n• 2 slices bread\n\nSteps\n1. Toast.");
  assert.equal(r.servings, 2);
  assert.equal(r.description, "Crisp.");
});

test("titles with a slash and no English part", () => {
  assert.deepEqual(parseTitle("ハヤシライス (Hayashi Raisu / Hayashi Rice)"), { nativeName: "ハヤシライス", romanized: "Hayashi Raisu", englishName: "Hayashi Rice" });
  assert.deepEqual(parseTitle("Chicken (Thai style)"), { nativeName: "", romanized: "", englishName: "Chicken (Thai style)" });
});

test("metric display turns Claude's spoon conversions back into spoons", () => {
  const show = (line, factor = 1, units = "metric") => formatIngredient(parseIngredientLine(line), factor, units);
  assert.equal(show("4.9 ml olive oil"), "1 tsp olive oil");
  assert.equal(show("2.5 ml sugar"), "1/2 tsp sugar");
  assert.equal(show("30 ml tomato paste"), "2 tbsp tomato paste");
  assert.equal(show("296 ml heavy cream"), "296 ml heavy cream", "real ml amounts stay as written");
  assert.equal(show("59 ml soy sauce", 1, "us"), "1/4 cup soy sauce");
});

test("temperatures follow the unit setting", () => {
  assert.equal(convertTemperatures("until it reaches 160°F", "metric"), "until it reaches 71°C");
  assert.equal(convertTemperatures("oven at 180°C", "us"), "oven at 355°F");
  assert.equal(convertTemperatures("oven at 180°C", "original"), "oven at 180°C");
});
