#!/usr/bin/env node
// Manage recipes from a computer instead of the phone.
//
//   node scripts/recipes.mjs add card.txt [--servings 4] [--tags thai,rice] [--chat <url>]
//   node scripts/recipes.mjs reindex          rebuild recipes/index.json from recipe files
//   node scripts/recipes.mjs reindex --check  fail if recipes/index.json is out of date (CI)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseRecipeText, slugify } from "../js/parser.js";
import { summarize } from "../js/store.js";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "recipes");
const INDEX = join(DIR, "index.json");
const json = (v) => JSON.stringify(v, null, 2) + "\n";

function buildIndex() {
  const recipes = readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, "recipe.json")))
    .map((d) => summarize(JSON.parse(readFileSync(join(DIR, d.name, "recipe.json"), "utf8"))))
    .sort((a, b) => a.id.localeCompare(b.id));
  return json({ version: 1, recipes });
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "add") {
  const file = args[0];
  if (!file) throw new Error("usage: add <card.txt> [--servings N] [--tags a,b] [--chat url]");
  const text = readFileSync(file, "utf8");
  const parsed = parseRecipeText(text);
  let id = slugify(parsed);
  for (let n = 2; existsSync(join(DIR, id)); n++) id = `${slugify(parsed)}-${n}`;
  const now = new Date().toISOString();
  const servings = flag(args, "--servings");
  const recipe = {
    id, ...parsed,
    servings: servings ? Number(servings) : null,
    tags: (flag(args, "--tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    chatUrl: flag(args, "--chat") ?? null,
    favorite: false, log: [], createdAt: now, updatedAt: now,
  };
  mkdirSync(join(DIR, id), { recursive: true });
  writeFileSync(join(DIR, id, "recipe.json"), json(recipe));
  writeFileSync(join(DIR, id, "source.txt"), text.trim() + "\n");
  writeFileSync(INDEX, buildIndex());
  console.log(`Added recipes/${id}`);
} else if (cmd === "reindex") {
  const next = buildIndex();
  if (args.includes("--check")) {
    const current = existsSync(INDEX) ? readFileSync(INDEX, "utf8") : "";
    if (current !== next) {
      console.error("recipes/index.json is out of date. Run: node scripts/recipes.mjs reindex");
      process.exit(1);
    }
    console.log("recipes/index.json is up to date");
  } else {
    writeFileSync(INDEX, next);
    console.log("Rebuilt recipes/index.json");
  }
} else {
  console.error("usage: recipes.mjs add <file> [--servings N] [--tags a,b] [--chat url] | reindex [--check]");
  process.exit(1);
}
