// Quantity parsing, scaling, formatting, and US <-> metric conversion.

const UNICODE_FRACTIONS = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

// Canonical unit -> { kind, factor to base (g or ml), label }
export const UNITS = {
  g: { kind: "mass", toBase: 1, label: "g" },
  kg: { kind: "mass", toBase: 1000, label: "kg" },
  oz: { kind: "mass", toBase: 28.3495, label: "oz" },
  lb: { kind: "mass", toBase: 453.592, label: "lb" },
  ml: { kind: "volume", toBase: 1, label: "ml" },
  l: { kind: "volume", toBase: 1000, label: "l" },
  tsp: { kind: "volume", toBase: 4.92892, label: "tsp" },
  tbsp: { kind: "volume", toBase: 14.7868, label: "tbsp" },
  "fl oz": { kind: "volume", toBase: 29.5735, label: "fl oz" },
  cup: { kind: "volume", toBase: 236.588, label: "cup" },
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

// Non-convertible units that still scale.
const COUNT_UNITS = ["pinch", "pinches", "dash", "dashes", "can", "cans", "stick", "sticks", "sprig", "sprigs", "slice", "slices", "bunch", "bunches", "handful", "handfuls", "piece", "pieces", "clove", "cloves"];

export function normalizeFractions(s) {
  return s.replace(/(\d)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, d, f) => (d ? d + " " : "") + UNICODE_FRACTIONS[f])
    .replace(/⁄/g, "/");
}

// "2 1/4" | "1/3" | "2.8" | "3" -> number
export function parseNumber(s) {
  s = s.trim();
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

export const NUMBER_RE = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
const UNIT_RE = String.raw`(fl\.?\s?oz|${Object.keys(UNIT_ALIASES).filter((u) => !u.includes(" ")).sort((a, b) => b.length - a.length).join("|")}|${COUNT_UNITS.join("|")})\.?`;
const QTY_RE = new RegExp(String.raw`^(${NUMBER_RE})(?:\s*(?:-|–|to)\s*(${NUMBER_RE}))?\s*(?:${UNIT_RE}(?=\s|$))?\s*(.*)$`, "i");

// Parse one ingredient line into { text, qty, qtyMax, unit, item }.
export function parseIngredientLine(line) {
  const text = line.trim();
  const m = normalizeFractions(text).match(QTY_RE);
  if (!m) return { text, qty: null, qtyMax: null, unit: null, item: text };
  let unit = m[3] ? m[3].toLowerCase().replace(/\.$/, "") : null;
  if (unit && /^fl\.?\s?oz$/.test(unit)) unit = "fl oz";
  else if (unit && UNIT_ALIASES[unit]) unit = UNIT_ALIASES[unit];
  return {
    text,
    qty: parseNumber(m[1]),
    qtyMax: m[2] ? parseNumber(m[2]) : null,
    unit,
    item: m[4].trim(),
  };
}

// ---------- formatting ----------

const NICE_FRACTIONS = [
  [0, ""], [1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [3 / 8, "3/8"], [1 / 2, "1/2"],
  [5 / 8, "5/8"], [2 / 3, "2/3"], [3 / 4, "3/4"], [7 / 8, "7/8"], [1, ""],
];

export function formatFraction(x) {
  if (x <= 0) return "0";
  let whole = Math.floor(x);
  const frac = x - whole;
  let best = NICE_FRACTIONS[0], err = Infinity;
  for (const f of NICE_FRACTIONS) {
    const e = Math.abs(frac - f[0]);
    if (e < err) { err = e; best = f; }
  }
  if (best[0] === 1) { whole += 1; best = NICE_FRACTIONS[0]; }
  if (whole === 0 && best[1] === "") return formatDecimal(x); // too small for 1/8 steps
  return [whole || "", best[1]].filter(Boolean).join(" ");
}

export function formatDecimal(x) {
  if (x >= 100) return String(Math.round(x / 5) * 5);
  if (x >= 10) return String(Math.round(x));
  if (x >= 1) return String(Math.round(x * 10) / 10);
  return String(Math.round(x * 100) / 100);
}

const METRIC = new Set(["g", "kg", "ml", "l"]);

function pluralize(unit, qty) {
  if (unit === "cup" && qty > 1) return "cups";
  return unit;
}

function formatQty(qty, unit, style) {
  if (style === "fraction") return formatFraction(qty);
  return formatDecimal(qty);
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

// Convert a quantity to the requested system. Returns { qty, unit }.
export function convert(qty, unit, system) {
  const u = UNITS[unit];
  if (!u || system === "original") return { qty, unit };
  const base = qty * u.toBase;
  if (system === "metric") {
    // Spoons are used in metric kitchens too; 2 tsp reads better than 9.9 ml.
    if (unit === "tsp" || unit === "tbsp") return { qty, unit };
    // Claude's metric cards turn spoons into ml (1 tsp -> 4.9 ml); turn them back.
    if (unit === "ml") { const spoon = spoonFor(qty); if (spoon) return spoon; }
    if (u.kind === "mass") return base >= 1000 ? { qty: base / 1000, unit: "kg" } : { qty: base, unit: "g" };
    return base >= 1000 ? { qty: base / 1000, unit: "l" } : { qty: base, unit: "ml" };
  }
  // US
  if (u.kind === "mass") {
    const oz = base / UNITS.oz.toBase;
    return oz >= 16 ? { qty: oz / 16, unit: "lb" } : { qty: oz, unit: "oz" };
  }
  // 3% slack so 59 ml reads as 1/4 cup, not 4 tbsp.
  if (base < UNITS.tbsp.toBase * 0.97) return { qty: base / UNITS.tsp.toBase, unit: "tsp" };
  if (base < (UNITS.cup.toBase / 4) * 0.97) return { qty: base / UNITS.tbsp.toBase, unit: "tbsp" };
  return { qty: base / UNITS.cup.toBase, unit: "cup" };
}

// Render an ingredient at a scale factor and unit system.
// Returns a display string, e.g. "1 1/2 cups jasmine rice".
export function formatIngredient(ing, factor = 1, system = "original") {
  if (ing.qty == null) return ing.text;
  if (factor === 1 && system === "original") return ing.text;
  const { qty, unit } = convert(ing.qty * factor, ing.unit, system);
  // Already in the requested units and not scaled: show it exactly as written.
  if (factor === 1 && unit === ing.unit) return ing.text;
  const max = ing.qtyMax != null ? convert(ing.qtyMax * factor, ing.unit, system).qty : null;
  const style = unit && METRIC.has(unit) ? "decimal" : "fraction";
  let amount = formatQty(qty, unit, style);
  if (max != null) amount += "–" + formatQty(max, unit, style);
  const u = unit ? " " + pluralize(unit, Math.max(qty, max ?? 0)) : "";
  return `${amount}${u} ${ing.item}`.trim();
}
