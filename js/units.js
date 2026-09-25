// Quantity parsing, scaling, formatting, and US <-> metric conversion.

const UNICODE_FRACTIONS = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

// Canonical unit -> { kind, factor to base (g or ml) }
export const UNITS = {
  g: { kind: "mass", toBase: 1 },
  kg: { kind: "mass", toBase: 1000 },
  oz: { kind: "mass", toBase: 28.3495 },
  lb: { kind: "mass", toBase: 453.592 },
  ml: { kind: "volume", toBase: 1 },
  l: { kind: "volume", toBase: 1000 },
  tsp: { kind: "volume", toBase: 4.92892 },
  tbsp: { kind: "volume", toBase: 14.7868 },
  "fl oz": { kind: "volume", toBase: 29.5735 },
  cup: { kind: "volume", toBase: 236.588 },
};

const UNIT_ALIASES = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp",
  "fl oz": "fl oz", "fl. oz": "fl oz",
  cup: "cup", cups: "cup", c: "cup",
};

// Units that scale but don't convert: canonical singular -> plural.
const COUNT_UNITS = {
  pinch: "pinches", dash: "dashes", can: "cans", stick: "sticks", sprig: "sprigs", slice: "slices",
  bunch: "bunches", handful: "handfuls", piece: "pieces", clove: "cloves",
};
const COUNT_SINGULAR = Object.fromEntries(Object.entries(COUNT_UNITS).flatMap(([one, many]) => [[one, one], [many, one]]));

export function normalizeFractions(s) {
  return s.replace(new RegExp(`(\\d)?([${FRACTION_CHARS}])`, "g"), (_, d, f) => (d ? d + " " : "") + UNICODE_FRACTIONS[f])
    .replace(/⁄/g, "/");
}

// "2 1/4" | "1/3" | "2.8" | "3" | "1½" -> number
export function parseNumber(s) {
  s = normalizeFractions(String(s)).trim();
  let total = 0;
  for (const part of s.split(/\s+/)) {
    if (part.includes("/")) {
      const [n, d] = part.split("/").map(Number);
      if (!d) return NaN;
      total += n / d;
    } else total += Number(part);
  }
  return total;
}

// A number, as written: "2 1/4", "1/3", "2.8", "1½", "½". Never starts inside another number.
export const NUMBER_RE = String.raw`(?<![\d.,/])(?:\d+\s?[${FRACTION_CHARS}]|[${FRACTION_CHARS}]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
const RANGE_SEP = String.raw`\s*(?:-|–|—|to)\s*`;
const UNIT_RE = String.raw`(fl\.?\s?oz|${[...Object.keys(UNIT_ALIASES).filter((u) => !u.includes(" ")), ...Object.keys(COUNT_SINGULAR)].sort((a, b) => b.length - a.length).join("|")})\.?`;
const QTY_RE = new RegExp(String.raw`^(${NUMBER_RE})(?:${RANGE_SEP}(${NUMBER_RE}))?\s*(?:${UNIT_RE}(?=\s|$))?\s*(.*)$`, "i");

// Parse one ingredient line into { text, qty, qtyMax, unit, item }.
export function parseIngredientLine(line) {
  const text = line.replace(/[​-‍﻿]/g, "").trim();
  const none = { text, qty: null, qtyMax: null, unit: null, item: text };
  let s = normalizeFractions(text.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)))
    .replace(/^(\d+)-(\d+\/\d+)(?=\s)/, "$1 $2") //            "1-1/2 cups" is 1 1/2, not a range
    .replace(/^(\d+),(\d+)(?=\s*[a-z])/i, "$1.$2") //          "1,5 kg"
    .replace(/^\.(\d)/, "0.$1"); //                            ".5 tsp"
  // "2-inch piece ginger", "5 cm piece kombu": a size, not an amount to scale.
  if (/^\d+(?:\.\d+)?\s*-?\s*(?:inch|inches|in\.|cm|mm)\b/i.test(s)) return none;
  const m = s.match(QTY_RE);
  if (!m) return none;
  let unit = m[3] ? m[3].toLowerCase().replace(/\.$/, "") : null;
  if (unit && /^fl\.?\s?oz$/.test(unit)) unit = "fl oz";
  else if (unit && UNIT_ALIASES[unit]) unit = UNIT_ALIASES[unit];
  else if (unit && COUNT_SINGULAR[unit]) unit = COUNT_SINGULAR[unit];
  const qty = parseNumber(m[1]);
  let qtyMax = m[2] ? parseNumber(m[2]) : null;
  if (qtyMax != null && qtyMax <= qty) qtyMax = null;
  return { text, qty, qtyMax, unit, item: m[4].trim() };
}

// ---------- formatting ----------

// Fractions a cook can actually measure, per unit.
const FRACTIONS = {
  default: [[1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]],
  spoon: [[1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]],
  fine: [[1 / 8, "1/8"], [1 / 4, "1/4"], [3 / 8, "3/8"], [1 / 2, "1/2"], [5 / 8, "5/8"], [3 / 4, "3/4"], [7 / 8, "7/8"]],
  quarters: [[1 / 4, "1/4"], [1 / 2, "1/2"], [3 / 4, "3/4"]],
};

function fractionsFor(unit, x) {
  if (unit === "tsp" || unit === "tbsp") return FRACTIONS.spoon;
  if (unit === "oz") return x < 4 ? FRACTIONS.fine : FRACTIONS.quarters;
  if (unit === "lb") return FRACTIONS.quarters;
  return FRACTIONS.default;
}

export function formatFraction(x, fractions = FRACTIONS.fine) {
  if (x <= 0) return "0";
  const options = [[0, ""], ...fractions, [1, ""]];
  let whole = Math.floor(x);
  const frac = x - whole;
  let best = options[0], err = Infinity;
  for (const f of options) {
    const e = Math.abs(frac - f[0]);
    if (e < err) { err = e; best = f; }
  }
  if (best[0] === 1) { whole += 1; best = options[0]; }
  if (whole === 0 && best[1] === "") return formatDecimal(x); // smaller than any fraction
  return [whole || "", best[1]].filter(Boolean).join(" ");
}

export function formatDecimal(x) {
  if (x >= 100) return String(Math.round(x / 5) * 5);
  if (x >= 10) return String(Math.round(x));
  if (x >= 1) return String(Math.round(x * 10) / 10);
  return String(Math.round(x * 100) / 100);
}

const METRIC = new Set(["g", "kg", "ml", "l"]);

function formatAmount(qty, unit) {
  return METRIC.has(unit) ? formatDecimal(qty) : formatFraction(qty, fractionsFor(unit, qty));
}

// Unit label for the amount as displayed ("1 cup", "1 1/2 cups", "1 clove", "2 cloves").
function unitLabel(unit, shown) {
  const many = parseNumber(shown.split("–").pop()) > 1;
  if (unit === "cup") return many ? "cups" : "cup";
  if (COUNT_UNITS[unit]) return many ? COUNT_UNITS[unit] : unit;
  return unit;
}

const SPOONS = [
  [0.25, "tsp"], [0.5, "tsp"], [0.75, "tsp"], [1, "tsp"], [1.5, "tsp"], [2, "tsp"],
  [1, "tbsp"], [1.5, "tbsp"], [2, "tbsp"], [3, "tbsp"],
];

// 4.9 ml -> 1 tsp, 2.5 ml -> 1/2 tsp, 30 ml -> 2 tbsp. Only close matches under 50 ml.
function spoonFor(ml) {
  if (ml > 50) return null;
  for (const [qty, unit] of SPOONS) {
    const exact = qty * UNITS[unit].toBase;
    if (Math.abs(ml - exact) / exact < 0.04) return { qty, unit };
  }
  return null;
}

// Rewrite temperatures in step text for a unit system: "160°F" -> "71°C" in metric.
export function convertTemperatures(text, system) {
  if (system !== "us" && system !== "metric") return text;
  return text.replace(/(\d+(?:\.\d+)?)\s*°\s*([CF])\b/g, (all, n, scale) => {
    const t = Number(n);
    if (system === "metric" && scale === "F") return `${Math.round((t - 32) * 5 / 9)}°C`;
    if (system === "us" && scale === "C") return `${Math.round((t * 9 / 5 + 32) / 5) * 5}°F`;
    return all;
  });
}

// Which unit a quantity should be shown in for a unit system.
function targetUnit(qty, unit, system) {
  const u = UNITS[unit];
  if (!u || system === "original") return unit;
  const base = qty * u.toBase;
  if (system === "metric") {
    // Spoons are used in metric kitchens too; 2 tsp reads better than 9.9 ml. Big ones go to ml.
    if ((unit === "tsp" || unit === "tbsp") && base <= 60) return unit;
    if (u.kind === "mass") return base >= 1000 ? "kg" : "g";
    return base >= 1000 ? "l" : "ml";
  }
  // US
  if (u.kind === "mass") {
    if (METRIC.has(unit) && base < 14) return unit; // a few grams of salt: 1/8 oz would be 3x off
    const oz = base / UNITS.oz.toBase;
    return oz >= 16 ? "lb" : "oz";
  }
  // Teaspoons stay teaspoons below 2 tbsp (4 tsp, not 1 1/3 tbsp).
  if (unit === "tsp" && base < UNITS.tbsp.toBase * 2 * 0.97) return "tsp";
  // 3% slack so 59 ml reads as 1/4 cup, not 4 tbsp.
  if (base < UNITS.tbsp.toBase * 0.97) return "tsp";
  if (base < (UNITS.cup.toBase / 4) * 0.97) return "tbsp";
  return "cup";
}

const convertTo = (qty, from, to) => (from === to || !UNITS[from] ? qty : (qty * UNITS[from].toBase) / UNITS[to].toBase);

// Convert a quantity to the requested system. Returns { qty, unit }.
export function convert(qty, unit, system) {
  if (system === "metric" && unit === "ml") {
    // Claude's metric cards turn spoons into ml (1 tsp -> 4.9 ml); turn them back.
    const spoon = spoonFor(qty);
    if (spoon) return spoon;
  }
  const to = targetUnit(qty, unit, system);
  return { qty: convertTo(qty, unit, to), unit: to };
}

// Render an ingredient at a scale factor and unit system.
// Returns a display string, e.g. "1 1/2 cups jasmine rice".
export function formatIngredient(ing, factor = 1, system = "original") {
  if (ing.qty == null) return ing.text;
  if (factor === 1 && system === "original") return ing.text;
  // Both ends of a range share the unit picked for the smaller end, so "800–1200 g" never
  // becomes "800–1.2 g" and "30–60 ml" reads "2–4 tbsp", not "1/4–1/4 cup".
  let { qty, unit } = convert(ing.qty * factor, ing.unit, system);
  // Under 1/4 cup, cup fractions get coarse (1/3 cup halved is not 1/4 cup): use tablespoons.
  if (unit === "cup" && qty < 0.24 && ing.qtyMax == null) { qty = convertTo(qty, "cup", "tbsp"); unit = "tbsp"; }
  const qtyMax = ing.qtyMax != null ? convertTo(ing.qtyMax * factor, ing.unit, unit) : null;
  // Already in the requested units and not scaled: show it exactly as written.
  if (factor === 1 && unit === ing.unit) return ing.text;
  if (unit === "tsp" && ing.qtyMax == null && qty < 0.1) return `pinch ${ing.item}`.trim();
  let amount = formatAmount(qty, unit);
  if (qtyMax != null) amount += "–" + formatAmount(qtyMax, unit);
  const label = unit ? " " + unitLabel(unit, amount) : "";
  return `${amount}${label} ${ing.item}`.trim();
}
