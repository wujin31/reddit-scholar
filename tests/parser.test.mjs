import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRecipeText, recipeToText, slugify, findTimers, parseTitle } from "../js/parser.js";
import { parseIngredientLine, formatIngredient, formatFraction } from "../js/units.js";
import { isRecipeId, safeUrl } from "../js/store.js";

const here = (p) => new URL(p, import.meta.url);
const pasted = readFileSync(here("../recipes/khao-mok-kai/source.txt"), "utf8");
const pdfText = readFileSync(here("./khao-mok-kai.pdf.txt"), "utf8");

test("parses the copy/paste card", () => {
  const r = parseRecipeText(pasted);
  assert.equal(r.nativeName, "ข้าวหมกไก่");
  assert.equal(r.romanized, "Khao Mok Kai");
  assert.equal(r.englishName, "Thai Chicken Biryani");
  assert.match(r.description, /^Thai-Muslim yellow rice.*Mixed setting\.$/);
  assert.equal(r.ingredients.length, 24);
  assert.ok(r.ingredients.every((i) => i.qty != null), "every ingredient has a quantity");
  assert.equal(r.steps.length, 7);
  assert.match(r.notes, /^Calibration variables/);
});

test("PDF text parses to the same recipe as copy/paste", () => {
  const a = parseRecipeText(pasted);
  const b = parseRecipeText(pdfText);
  assert.deepEqual(b.ingredients, a.ingredients);
  assert.deepEqual(b.steps, a.steps);
  assert.equal(b.description, a.description);
  assert.equal(b.notes, a.notes);
});

test("links ingredients to steps and finds timers", () => {
  const r = parseRecipeText(pasted);
  const used = new Set(r.steps.flatMap((s) => s.ingredientRefs));
  assert.equal(used.size, r.ingredients.length, "every ingredient is referenced by a step");
  assert.deepEqual(r.steps[1].timers, [{ text: "20 minutes", seconds: 1200 }]);
  assert.deepEqual(r.steps[3].timers.map((t) => t.seconds), [300]);
  assert.deepEqual(r.steps[0].timers.map((t) => t.seconds), [3600]);
});

test("round-trips through recipeToText", () => {
  const r = parseRecipeText(pasted);
  const again = parseRecipeText(recipeToText(r));
  assert.deepEqual(again.ingredients, r.ingredients);
  assert.deepEqual(again.steps, r.steps);
});

test("ingredient lines", () => {
  assert.deepEqual(parseIngredientLine("2 1/4 cup jasmine rice"), {
    text: "2 1/4 cup jasmine rice", qty: 2.25, qtyMax: null, unit: "cup", item: "jasmine rice",
  });
  assert.equal(parseIngredientLine("1 3/8 oz salted butter").qty, 1.375);
  assert.equal(parseIngredientLine("½ tsp salt").qty, 0.5);
  assert.equal(parseIngredientLine("1½ cups flour").qty, 1.5);
  assert.equal(parseIngredientLine("2-3 tbsp oil").qtyMax, 3);
  assert.equal(parseIngredientLine("4 green Thai chilies").unit, null);
  assert.equal(parseIngredientLine("2 large eggs").unit, null);
  assert.equal(parseIngredientLine("200 g flour").unit, "g");
  assert.equal(parseIngredientLine("Salt to taste").qty, null);
});

test("scaling and unit conversion", () => {
  const rice = parseIngredientLine("2 1/4 cup jasmine rice");
  assert.equal(formatIngredient(rice, 2), "4 1/2 cups jasmine rice");
  assert.equal(formatIngredient(rice, 1, "metric"), "530 ml jasmine rice");
  const chicken = parseIngredientLine("25 oz bone-in, skin-on chicken thighs (4)");
  assert.equal(formatIngredient(chicken, 1, "metric"), "710 g bone-in, skin-on chicken thighs (4)");
  assert.equal(formatIngredient(chicken, 1, "us"), "1 1/2 lb bone-in, skin-on chicken thighs (4)");
  const flour = parseIngredientLine("200 g flour");
  assert.equal(formatIngredient(flour, 1, "us"), "7 oz flour");
  assert.equal(formatIngredient(parseIngredientLine("2 tsp sugar"), 2, "metric"), "4 tsp sugar");
  assert.equal(formatIngredient(parseIngredientLine("1/4 cup evaporated milk"), 1, "metric"), "59 ml evaporated milk");
  const salt = parseIngredientLine("Salt to taste");
  assert.equal(formatIngredient(salt, 3), "Salt to taste");
  assert.equal(formatFraction(0.05), "0.05");
  assert.equal(formatIngredient(chicken, 2, "metric"), "1.4 kg bone-in, skin-on chicken thighs (4)");
});

test("timers and slugs", () => {
  assert.deepEqual(findTimers("simmer 10-15 minutes, then rest 1 1/2 hours").map((t) => t.seconds), [900, 5400]);
  assert.equal(slugify({ romanized: "Khao Mok Kai" }), "khao-mok-kai");
  assert.equal(slugify({ englishName: "Crème Brûlée" }), "creme-brulee");
});

test("titles", () => {
  assert.deepEqual(parseTitle("Pad Kra Pao Gai · Thai Basil Chicken"), { nativeName: "", romanized: "Pad Kra Pao Gai", englishName: "Thai Basil Chicken" });
  assert.deepEqual(parseTitle("ผัดไทย · Pad Thai"), { nativeName: "ผัดไทย", romanized: "", englishName: "Pad Thai" });
  assert.deepEqual(parseTitle("Weeknight Miso-Glazed Salmon"), { nativeName: "", romanized: "", englishName: "Weeknight Miso-Glazed Salmon" });
});

test("security: recipe ids and saved links", () => {
  assert.ok(isRecipeId("khao-mok-kai"));
  for (const bad of ["../index", "a/b", "..", "", "Khao", "x%2F..", "-x", null]) assert.ok(!isRecipeId(bad), String(bad));
  assert.equal(safeUrl("https://claude.ai/chat/abc"), "https://claude.ai/chat/abc");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "  javascript:x", "not a url", ""]) {
    assert.equal(safeUrl(bad), null, bad);
  }
});
