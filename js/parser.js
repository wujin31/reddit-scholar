// Turns a Claude recipe card into a recipe object. Two inputs are understood:
//
// 1. The card's copied text (or the text of a PDF printed from it):
//      <native name> (<romanized>) · <English name>
//      <description>
//      Ingredients
//      • <ingredient>            (bullets are missing in PDF text)
//      Steps
//      1. <step>                 (PDF text wraps steps across lines)
//      Notes
//      <notes>
//    Copying a card drops its timer chips, so timers only come from times written in the steps,
//    plus explicit "⏱ 8 min" markers (which this app writes when exporting).
//
// 2. JSON, from the export prompt (EXPORT_PROMPT) or schema.org Recipe data. This keeps the
//    card's timers and servings.

import { parseIngredientLine, normalizeFractions, NUMBER_RE, parseNumber } from "./units.js";

const SECTION_WORDS = [
  ["ingredients", "ingredients"],
  ["steps", "steps"], ["instructions", "steps"], ["directions", "steps"], ["method", "steps"], ["preparation", "steps"],
  ["notes", "notes"], ["note", "notes"], ["chef's notes", "notes"], ["tips", "notes"],
];

// "Ingredients", "## Steps", "**Method:**", "Ingredients (makes 16)", "Chef’s Notes".
// Returns { section, servings } or null.
function sectionOf(line) {
  const plain = line.replace(/^#+\s*/, "").replace(/\*\*|__/g, "").replace(/’/g, "'").trim();
  const m = plain.match(/^([a-z' ]+?)\s*(?:\(([^)]*)\))?\s*:?$/i);
  if (!m) return null;
  const hit = SECTION_WORDS.find(([word]) => word === m[1].toLowerCase());
  if (!hit) return null;
  const serves = m[2]?.match(/(?:serves|makes|for)\s+(\d+)/i);
  return { section: hit[1], servings: serves ? Number(serves[1]) : null };
}

const BULLET_RE = /^\s*(?:[•●◦▪·▢☐○]\s*|[-*–]\s+)/;
const STEP_NUM_RE = /^\s*(?:step\s*)?(\d+)\s*[.):]\s*/i;
const NUMBERED_ITEM_RE = /^\s*\d+[.)]\s+(?=\S)/; // "1. 2 eggs" in an ingredient list
const SERVES_RE = /^(?:serves|servings|yield|yields|makes)\s*:?\s*(\d+(?:\.\d+)?)\b/i;
const PAGE_FOOTER_RE = /^(?:page\s+)?\d+\s*(?:of|\/)\s*\d+$/i;

// "For the sauce:", "For the filling", "**For the glaze**": a sub-heading, not an ingredient.
function groupHeading(text) {
  const plain = text.replace(/\*\*|__/g, "").trim();
  if (/\d/.test(plain)) return null;
  if (/:$/.test(plain) || /^for\s+(?:the\s+)?\S/i.test(plain)) return plain.replace(/:$/, "").trim();
  return null;
}

function joinWrapped(prev, next) {
  return /[-–]$/.test(prev) ? prev + next : prev + " " + next;
}

const isLatin = (s) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(s);

// "ข้าวหมกไก่ (Khao Mok Kai) · Thai Chicken Biryani" | "ハヤシライス (Hayashi Raisu / Hayashi Rice)"
// | "Pad Kra Pao · Thai Basil Chicken" | "Pancakes"
export function parseTitle(title) {
  if (title.length > 200) return { nativeName: "", romanized: "", englishName: title.trim() }; // not a real title
  const m = title.match(/^(.*?)\s*\(([^)]+)\)\s*[·•|—–]\s*(.+)$/);
  if (m) return { nativeName: m[1].trim(), romanized: m[2].trim(), englishName: m[3].trim() };
  const paren = title.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (paren && !isLatin(paren[1])) {
    const [romanized, english] = paren[2].split(/\s+\/\s+/);
    return { nativeName: paren[1].trim(), romanized: romanized.trim(), englishName: (english ?? romanized).trim() };
  }
  const parts = title.split(/\s+[·•|—–]\s+/);
  if (parts.length === 2) {
    const [left, right] = parts.map((p) => p.trim());
    const latin = isLatin(left);
    return { nativeName: latin ? "" : left, romanized: latin ? left : "", englishName: right };
  }
  return { nativeName: "", romanized: "", englishName: title.trim() };
}

// ---------- timers ----------

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, "twenty-five": 25, thirty: 30,
  forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90,
};
const WORDS = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join("|");
const NUM = String.raw`(?:${NUMBER_RE}|\b(?:${WORDS})\b)`;
const UNIT = String.raw`(hours?|hrs?|h|minutes?|mins?|seconds?|secs?)\b`;
// 1: "half an hour"  2-4: amount, range end, unit  5-6: second part ("1 hr 15 min")
// 7: "or two" ("a minute or two")  8: "and a half"
const DURATION = String.raw`\b(half an? hour)\b|(${NUM})(?:\s*(?:-|–|to|or)\s*(${NUM}))?(?:\s*|-)${UNIT}(?:,?\s*(?:and\s+)?(${NUM})\s*${UNIT})?(?:\s+or\s+(two|three))?(\s+and\s+a\s+half)?`;
const TIMER_RE = new RegExp(DURATION, "gi");

const unitSeconds = (u) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);
const amount = (s) => {
  const w = WORD_NUMBERS[s.toLowerCase()];
  return w ?? parseNumber(s);
};

function durationSeconds(m) {
  if (m[1]) return 1800;
  const unit = unitSeconds(m[4]);
  // "a second batch" is not a one-second timer.
  if (unit === 1 && !m[3] && WORD_NUMBERS[m[2].toLowerCase()] != null) return 0;
  let n = amount(m[3] ?? m[2]);
  if (m[7]) n = Math.max(n, WORD_NUMBERS[m[7].toLowerCase()]);
  if (m[8]) n += 0.5;
  let seconds = n * unit;
  if (m[5] && unitSeconds(m[6]) < unit) seconds += amount(m[5]) * unitSeconds(m[6]);
  return Math.round(seconds);
}

// Times written in a step ("about 20 minutes", "for a minute", "1 hr 15 min").
export function findTimers(text) {
  const timers = [];
  for (const m of normalizeFractions(text).matchAll(TIMER_RE)) {
    const seconds = durationSeconds(m);
    if (seconds > 0) timers.push({ text: m[0], seconds });
  }
  return timers;
}

export function formatDurationText(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h && `${h} hr`, m && `${m} min`, s && `${s} sec`].filter(Boolean).join(" ") || "0 sec";
}

// "⏱ 8 min" or "[timer 8 min]" in a step: a timer that isn't part of the sentence.
const MARKER_RE = new RegExp(String.raw`\s*(?:⏱️?\s*|\[timer:?\s*)(${DURATION})\]?`, "gi");

function takeMarkers(text) {
  const timers = [];
  const clean = text.replace(MARKER_RE, (_, dur) => {
    const t = findTimers(dur)[0];
    if (t) timers.push({ text: null, seconds: t.seconds });
    return "";
  }).trim();
  return { text: clean, timers };
}

// Timers written in the text win; extra timers are kept unless the text already has that time.
function mergeTimers(found, extra) {
  const out = [...found];
  for (const t of extra) if (!out.some((f) => f.seconds === t.seconds)) out.push(t);
  return out;
}

// Find which ingredients a step mentions verbatim (the card pastes full ingredient text into
// steps). Longer texts claim their span first, so "5 ml sesame oil" isn't found inside
// "15 ml sesame oil (for the sauce)", and a match can't start in the middle of a number.
export function findIngredientRefs(stepText, ingredients) {
  const order = ingredients.map((ing, i) => i).filter((i) => ingredients[i].text)
    .sort((a, b) => ingredients[b].text.length - ingredients[a].text.length);
  const taken = [];
  const refs = new Set();
  for (const i of order) {
    const needle = ingredients[i].text;
    for (let at = stepText.indexOf(needle); at >= 0; at = stepText.indexOf(needle, at + 1)) {
      const end = at + needle.length;
      if (/[\d.,/]/.test(stepText[at - 1] ?? "") && /^\d/.test(needle)) continue;
      if (/\w/.test(stepText[end] ?? "") && /\w$/.test(needle)) continue;
      if (taken.some(([s, e]) => at < e && end > s)) continue;
      taken.push([at, end]);
      refs.add(i);
    }
  }
  return [...refs].sort((a, b) => a - b);
}

function finishSteps(recipe) {
  recipe.steps = recipe.steps.map((step) => {
    const { text, timers: marked } = takeMarkers(step.text);
    return {
      text,
      ingredientRefs: findIngredientRefs(text, recipe.ingredients),
      timers: mergeTimers(findTimers(text), [...marked, ...(step.timers ?? [])]),
    };
  });
  return recipe;
}

// Re-derive what the parser computes (amounts, ingredient links, timers) from a saved recipe's
// text, so parser improvements reach recipes saved earlier. Timers that aren't in the text
// (from the export prompt or ⏱ markers) are kept.
export function refreshRecipe(r) {
  const ingredients = r.ingredients.map((ing) => ({ ...parseIngredientLine(ing.text), ...(ing.group ? { group: ing.group } : {}) }));
  const steps = r.steps.map((s) => ({ text: s.text, timers: (s.timers ?? []).filter((t) => !t.text) }));
  return finishSteps({ ...r, ingredients, steps });
}

// ---------- card text ----------

export function parseRecipeText(raw) {
  const lines = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[​-‍﻿]/g, "")
    .split("\n").map((l) => l.replace(/ /g, " ").trim())
    .filter((l) => !PAGE_FOOTER_RE.test(l));
  const first = lines.findIndex((l) => l);
  if (first < 0) throw new Error("Nothing to import — the text is empty.");

  // A paste that starts at "Ingredients" has no title line.
  const startsWithSection = sectionOf(lines[first]);
  const title = startsWithSection ? "Untitled recipe" : lines[first].replace(/^#+\s*/, "").replace(/\*\*|__/g, "").trim();
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
  let blank = false;
  let numberedSteps = false;
  let prevLength = 0;
  for (const line of lines.slice(startsWithSection ? first : first + 1)) {
    if (!line) { blank = true; continue; }
    const afterBlank = blank;
    const wrapped = prevLength >= 60; // the previous line was long enough to have been wrapped
    blank = false;
    prevLength = line.length;
    const heading = sectionOf(line);
    if (heading) {
      section = heading.section;
      group = null;
      if (heading.servings && !recipe.servings) recipe.servings = heading.servings;
      continue;
    }

    if (section === null) {
      const serves = line.match(SERVES_RE);
      if (serves) recipe.servings = Number(serves[1]);
      else recipe.description = !recipe.description ? line : afterBlank ? `${recipe.description}\n\n${line}` : joinWrapped(recipe.description, line);
    } else if (section === "ingredients") {
      const bulleted = BULLET_RE.test(line);
      const text = line.replace(BULLET_RE, "").replace(NUMBERED_ITEM_RE, "");
      const sub = groupHeading(text);
      if (sub) { group = sub; continue; }
      const prev = recipe.ingredients[recipe.ingredients.length - 1];
      // A PDF line break inside an ingredient: a long line, then one starting lowercase, no bullet.
      if (!bulleted && !afterBlank && wrapped && prev && /^[a-z(]/.test(text)) {
        Object.assign(prev, parseIngredientLine(joinWrapped(prev.text, text)));
        continue;
      }
      const ing = parseIngredientLine(text);
      if (group) ing.group = group;
      recipe.ingredients.push(ing);
    } else if (section === "steps") {
      const numbered = STEP_NUM_RE.test(line);
      const bulleted = BULLET_RE.test(line);
      if (numbered) numberedSteps = true;
      const text = line.replace(numbered ? STEP_NUM_RE : BULLET_RE, "");
      // New step: a number, a bullet, or (in steps written without numbers) a new paragraph.
      if (numbered || bulleted || !recipe.steps.length || (afterBlank && !numberedSteps)) {
        recipe.steps.push({ text });
      } else {
        const last = recipe.steps[recipe.steps.length - 1];
        last.text = joinWrapped(last.text, text);
      }
    } else if (section === "notes") {
      const text = BULLET_RE.test(line) ? `• ${line.replace(BULLET_RE, "")}` : line;
      if (!recipe.notes) recipe.notes = text;
      else if (afterBlank || text.startsWith("• ")) recipe.notes += (afterBlank ? "\n\n" : "\n") + text;
      else recipe.notes = joinWrapped(recipe.notes, text);
    }
  }

  if (!recipe.ingredients.length) {
    throw new Error("Couldn't find an Ingredients list. Paste the whole recipe card, starting from its title.");
  }
  return finishSteps(recipe);
}

// ---------- JSON (export prompt or schema.org) ----------

export const EXPORT_PROMPT = `Export the recipe card above for my recipe app. Reply with only a JSON code block, no other text, in exactly this shape:

{
  "title": "<the card's title, exactly as shown>",
  "description": "<the card's description>",
  "servings": <number of servings the amounts are for>,
  "ingredients": ["<one string per ingredient, exactly as shown on the card>"],
  "steps": [
    { "text": "<the step, exactly as shown>", "timers": [<minutes for each timer the card shows on this step>] }
  ],
  "notes": "<the card's notes>"
}

Use the card's current wording, amounts and units. Put every timer the card shows for a step in that step's "timers" as minutes (decimals are fine, e.g. 0.5), and use [] when a step has no timer.`;

// "PT1H15M" -> 4500
function isoDurationSeconds(s) {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(String(s).trim());
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, sec = 0] = m;
  return Math.round(d * 86400 + h * 3600 + min * 60 + Number(sec));
}

function jsonTimer(t) {
  if (typeof t === "number") return t * 60;
  if (typeof t === "string") return isoDurationSeconds(t) || (findTimers(t)[0]?.seconds ?? Number(t) * 60) || 0;
  if (t && typeof t === "object") {
    if (t.seconds != null) return Number(t.seconds);
    if (t.minutes != null) return Number(t.minutes) * 60;
    if (t.duration != null) return jsonTimer(t.duration);
  }
  return 0;
}

const textOf = (v) => (typeof v === "string" ? v : v?.text ?? v?.name ?? "");

function jsonSteps(list, out = []) {
  for (const s of [list].flat()) {
    if (!s) continue;
    if (s.itemListElement) { jsonSteps(s.itemListElement, out); continue; } // HowToSection
    const text = textOf(s).trim();
    if (!text) continue;
    const raw = [...[s.timers ?? []].flat(), s.timer, s.timer_minutes, s.timeRequired, s.performTime].filter((t) => t != null && t !== "");
    const timers = raw.map(jsonTimer).filter((sec) => sec > 0).map((seconds) => ({ text: null, seconds: Math.round(seconds) }));
    out.push({ text, timers });
  }
  return out;
}

function jsonIngredients(list) {
  const out = [];
  for (const item of [list].flat()) {
    if (!item) continue;
    if (Array.isArray(item.items)) {
      for (const sub of item.items) out.push({ ...parseIngredientLine(textOf(sub)), ...(item.group || item.name ? { group: item.group ?? item.name } : {}) });
      continue;
    }
    const text = textOf(item).trim();
    if (!text) continue;
    const ing = parseIngredientLine(text);
    if (item.group) ing.group = item.group;
    out.push(ing);
  }
  return out;
}

function findRecipeObject(data) {
  if (Array.isArray(data)) return data.map(findRecipeObject).find(Boolean) ?? null;
  if (!data || typeof data !== "object") return null;
  if (data["@graph"]) return findRecipeObject(data["@graph"]);
  const type = [data["@type"]].flat().join(" ");
  if (/Recipe/.test(type) || data.ingredients || data.recipeIngredient || data.steps || data.recipeInstructions) return data;
  return findRecipeObject(data.recipe);
}

export function parseRecipeJson(data) {
  const o = findRecipeObject(data);
  if (!o) throw new Error("That JSON doesn't look like a recipe.");
  const title = String(o.title ?? o.name ?? "Untitled recipe").trim();
  const recipe = {
    name: title,
    ...parseTitle(title),
    description: String(o.description ?? "").trim(),
    ingredients: jsonIngredients(o.ingredients ?? o.recipeIngredient ?? []),
    steps: jsonSteps(o.steps ?? o.recipeInstructions ?? []),
    notes: [o.notes ?? o.tips ?? ""].flat().join(" ").trim(),
  };
  const servings = parseFloat([o.servings ?? o.recipeYield ?? ""].flat()[0]);
  if (servings > 0) recipe.servings = servings;
  if (!recipe.ingredients.length && !recipe.steps.length) throw new Error("That JSON has no ingredients or steps.");
  return finishSteps(recipe);
}

// Card text, PDF text, or JSON (optionally in a ```json code block, as Claude replies).
export function parseRecipeInput(raw) {
  raw = String(raw ?? "");
  // A code block, or the start of one when the copy cut off before the closing fence.
  const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)(?:\n\s*```|$)/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  if (/^[[{]/.test(candidate)) {
    let data;
    try { data = JSON.parse(candidate); } catch {
      throw new Error("That looks like JSON but it's incomplete. Copy Claude's whole reply.");
    }
    return parseRecipeJson(data);
  }
  return parseRecipeText(raw);
}

// ---------- back to text ----------

// Card text that parses back to the same recipe. Timers that aren't written in a step's
// sentence are kept as "⏱ 8 min" markers; `servings: false` leaves out the "Serves" line.
export function recipeToText(r, { servings = true } = {}) {
  const out = [r.name, ""];
  if (r.description) out.push(r.description, "");
  if (servings && r.servings) out.push(`Serves ${r.servings}`, "");
  out.push("Ingredients");
  let group = null;
  for (const ing of r.ingredients) {
    if (ing.group && ing.group !== group) { group = ing.group; out.push(`${group}:`); }
    out.push(`• ${ing.text}`);
  }
  out.push("", "Steps");
  r.steps.forEach((s, i) => {
    const inText = findTimers(s.text).map((t) => t.seconds);
    const markers = (s.timers ?? []).filter((t) => !inText.includes(t.seconds)).map((t) => ` ⏱ ${formatDurationText(t.seconds)}`);
    out.push(`${i + 1}. ${s.text}${markers.join("")}`);
  });
  if (r.notes) out.push("", "Notes", r.notes);
  return out.join("\n");
}

export function slugify(r) {
  const base = (r.romanized || r.englishName || r.name || "recipe")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base.slice(0, 60) || "recipe";
}
