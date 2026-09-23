// Parses the text of a Claude recipe card (copy/paste or PDF text) into a recipe object.
//
// Card layout:
//   <native name> (<romanized>) · <English name>
//   <description>
//   Ingredients
//   • <ingredient>            (bullets are missing in PDF text)
//   Steps
//   1. <step>                 (PDF text wraps steps across lines)
//   Notes
//   <notes>

import { parseIngredientLine, normalizeFractions, NUMBER_RE, parseNumber } from "./units.js";

const SECTIONS = {
  ingredients: "ingredients",
  steps: "steps", instructions: "steps", directions: "steps", method: "steps",
  notes: "notes", "chef's notes": "notes", tips: "notes",
};

function sectionOf(line) {
  const key = line.replace(/^#+\s*/, "").replace(/[:*]/g, "").trim().toLowerCase();
  return SECTIONS[key] ?? null;
}

const BULLET_RE = /^\s*(?:[•●◦▪\-*–]\s+)/;
const STEP_NUM_RE = /^\s*(?:step\s*)?(\d+)[.)]\s+/i;

// Join a wrapped line onto the previous one ("low-" + "sodium" -> "low-sodium").
function joinWrapped(prev, next) {
  return /[-–]$/.test(prev) ? prev + next : prev + " " + next;
}

// "ข้าวหมกไก่ (Khao Mok Kai) · Thai Chicken Biryani" | "Pad Kra Pao · Thai Basil Chicken" | "Pancakes"
export function parseTitle(title) {
  const m = title.match(/^(.*?)\s*\(([^)]+)\)\s*[·•|—–]\s*(.+)$/);
  if (m) return { nativeName: m[1].trim(), romanized: m[2].trim(), englishName: m[3].trim() };
  const parts = title.split(/\s+[·•|—–]\s+/);
  if (parts.length === 2) {
    const [left, right] = parts.map((p) => p.trim());
    const latin = /^[\p{Script=Latin}\p{N}\p{P}\s]+$/u.test(left);
    return { nativeName: latin ? "" : left, romanized: latin ? left : "", englishName: right };
  }
  return { nativeName: "", romanized: "", englishName: title.trim() };
}

const TIMER_RE = new RegExp(
  String.raw`(${NUMBER_RE})(?:\s*(?:-|–|to)\s*(${NUMBER_RE}))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`,
  "gi",
);

export function findTimers(text) {
  const timers = [];
  for (const m of normalizeFractions(text).matchAll(TIMER_RE)) {
    const unit = m[3].toLowerCase();
    const mult = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
    const hi = m[2] ? parseNumber(m[2]) : parseNumber(m[1]);
    timers.push({ text: m[0], seconds: Math.round(hi * mult) });
  }
  return timers;
}

// Find which ingredients a step mentions verbatim (the card pastes full ingredient text into steps).
export function findIngredientRefs(stepText, ingredients) {
  return ingredients
    .map((ing, i) => (ing.text && stepText.includes(ing.text) ? i : -1))
    .filter((i) => i >= 0);
}

export function parseRecipeText(raw) {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const first = lines.findIndex((l) => l);
  if (first < 0) throw new Error("Nothing to import — the text is empty.");

  const title = lines[first].replace(/^#+\s*/, "");
  const recipe = {
    name: title,
    ...parseTitle(title),
    description: "",
    ingredients: [],
    steps: [],
    notes: "",
  };

  let section = null;
  let group = null;
  for (const line of lines.slice(first + 1)) {
    if (!line) continue;
    const s = sectionOf(line);
    if (s) { section = s; group = null; continue; }

    if (section === null) {
      recipe.description = recipe.description ? joinWrapped(recipe.description, line) : line;
    } else if (section === "ingredients") {
      const bulleted = BULLET_RE.test(line);
      const text = line.replace(BULLET_RE, "");
      // A short unbulleted line ending in ":" is a sub-heading ("For the sauce:").
      if (!bulleted && /:$/.test(text)) { group = text.replace(/:$/, ""); continue; }
      const ing = parseIngredientLine(text);
      if (group) ing.group = group;
      recipe.ingredients.push(ing);
    } else if (section === "steps") {
      const m = line.match(STEP_NUM_RE);
      if (m || recipe.steps.length === 0) {
        recipe.steps.push({ text: line.replace(STEP_NUM_RE, "") });
      } else {
        const last = recipe.steps[recipe.steps.length - 1];
        last.text = joinWrapped(last.text, line);
      }
    } else if (section === "notes") {
      recipe.notes = recipe.notes ? joinWrapped(recipe.notes, line) : line;
    }
  }

  if (!recipe.ingredients.length && !recipe.steps.length) {
    throw new Error("Couldn't find an Ingredients or Steps section. Paste the whole recipe card.");
  }

  for (const step of recipe.steps) {
    step.ingredientRefs = findIngredientRefs(step.text, recipe.ingredients);
    step.timers = findTimers(step.text);
  }
  return recipe;
}

// Turn a recipe back into card text (round-trips through parseRecipeText).
export function recipeToText(r) {
  const out = [r.name, ""];
  if (r.description) out.push(r.description, "");
  out.push("Ingredients");
  let group = null;
  for (const ing of r.ingredients) {
    if (ing.group && ing.group !== group) { group = ing.group; out.push(`${group}:`); }
    out.push(`• ${ing.text}`);
  }
  out.push("", "Steps");
  r.steps.forEach((s, i) => out.push(`${i + 1}. ${s.text}`));
  if (r.notes) out.push("", "Notes", r.notes);
  return out.join("\n");
}

export function slugify(r) {
  const base = (r.romanized || r.englishName || r.name || "recipe")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base.slice(0, 60) || "recipe";
}
