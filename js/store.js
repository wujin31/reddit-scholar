// Recipe storage. The git repo is the database:
//   recipes/index.json          summary of every recipe (what the library list loads)
//   recipes/<id>/recipe.json    the full recipe, including its cook log
//   recipes/<id>/source.txt     the card text exactly as imported
//
// Reads come from the GitHub API when a token is set (always fresh), otherwise from the
// GitHub Pages copy of the files. Writes commit straight to the repo with the token.
// Everything read is also kept in the Cache API so the app works offline.

import { slugify } from "./parser.js";

// ---------- device-local settings ----------

export function loadLocal(key, fallback) {
  try {
    const v = localStorage.getItem("rb:" + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function saveLocal(key, value) {
  try { localStorage.setItem("rb:" + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function guessRepo() {
  // https://<owner>.github.io/<repo>/
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split("/").filter(Boolean)[0];
  return m ? { owner: m[1], repo: repo || `${m[1]}.github.io` } : { owner: "", repo: "" };
}

export function getSettings() {
  return { ...guessRepo(), branch: "main", token: "", units: "original", timerMode: "app", clockShortcut: "Recipe Timer", ...loadLocal("settings", {}) };
}

export function setSettings(patch) {
  saveLocal("settings", { ...loadLocal("settings", {}), ...patch });
}

export const canWrite = () => { const s = getSettings(); return Boolean(s.token && s.owner && s.repo); };

// ---------- offline cache ----------

const CACHE = "rb-data-v1";
const cacheKey = (path) => new URL("__data/" + path, location.href).href;

async function cachePut(path, text) {
  try { await (await caches.open(CACHE)).put(cacheKey(path), new Response(text)); } catch { /* no Cache API */ }
}

async function cacheGet(path) {
  try {
    const hit = await (await caches.open(CACHE)).match(cacheKey(path));
    return hit ? hit.text() : null;
  } catch { return null; }
}

// ---------- GitHub API ----------

async function gh(path, { method = "GET", body, raw = false } = {}) {
  const s = getSettings();
  const res = await fetch(`https://api.github.com/repos/${s.owner}/${s.repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${s.token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path} → ${res.status}`);
    err.status = res.status;
    try { err.detail = (await res.json()).message; } catch { /* not JSON */ }
    throw err;
  }
  return raw ? res.text() : res.json();
}

export async function testConnection() {
  const s = getSettings();
  const repo = await gh("");
  await gh(`/git/ref/heads/${encodeURIComponent(s.branch)}`);
  // repo.permissions reflects the account, not the token, so prove the token can write by
  // storing a blob. Nothing references it, so it never shows up in the repo.
  try {
    await gh("/git/blobs", { method: "POST", body: { content: "recipe-box connection test\n", encoding: "utf-8" } });
  } catch (e) {
    if (e.status === 403 || e.status === 404) e.readOnly = true;
    throw e;
  }
  return repo.full_name;
}

// Read a text file. `ref` pins it to a commit (used when committing).
async function readFile(path, ref) {
  if (canWrite()) {
    const s = getSettings();
    try {
      const text = await gh(`/contents/${path}?ref=${encodeURIComponent(ref ?? s.branch)}`, { raw: true });
      cachePut(path, text);
      return text;
    } catch (e) {
      if (e.status === 404) return null;
      if (ref) throw e;
      // offline or API trouble: fall through to Pages / cache
    }
  }
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (res.status === 404) return null;
    if (res.ok) {
      const text = await res.text();
      cachePut(path, text);
      return text;
    }
  } catch { /* offline */ }
  return cacheGet(path);
}

// Commit several files at once. `files` maps path -> text, or null to delete.
// `build(ref)` computes the files from the repo state at commit `ref`, and is re-run if
// someone else pushed in between (e.g. saving from two devices).
async function commit(message, build) {
  const s = getSettings();
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await gh(`/git/ref/heads/${encodeURIComponent(s.branch)}`);
    const parent = await gh(`/git/commits/${head.object.sha}`);
    const files = await build(parent.sha);
    const tree = await gh("/git/trees", {
      method: "POST",
      body: {
        base_tree: parent.tree.sha,
        tree: Object.entries(files).map(([path, content]) =>
          content == null
            ? { path, mode: "100644", type: "blob", sha: null }
            : { path, mode: "100644", type: "blob", content }),
      },
    });
    const next = await gh("/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [parent.sha] } });
    try {
      await gh(`/git/refs/heads/${encodeURIComponent(s.branch)}`, { method: "PATCH", body: { sha: next.sha } });
      for (const [path, content] of Object.entries(files)) if (content != null) cachePut(path, content);
      return;
    } catch (e) {
      if (e.status !== 422) throw e; // 422 = branch moved; rebuild on the new head
    }
  }
  throw new Error("Couldn't save: the repo kept changing. Try again.");
}

// ---------- recipes ----------

const INDEX = "recipes/index.json";
const recipePath = (id) => `recipes/${id}/recipe.json`;
const sourcePath = (id) => `recipes/${id}/source.txt`;
const json = (v) => JSON.stringify(v, null, 2) + "\n";

export function summarize(r) {
  return {
    id: r.id,
    name: r.name,
    englishName: r.englishName,
    nativeName: r.nativeName,
    romanized: r.romanized,
    tags: r.tags ?? [],
    favorite: Boolean(r.favorite),
    servings: r.servings ?? null,
    items: r.ingredients.map((i) => i.item).join(" · "),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastCooked: r.log?.length ? r.log[r.log.length - 1].date : null,
    cookCount: r.log?.length ?? 0,
  };
}

function parseIndex(text) {
  if (!text) return { version: 1, recipes: [] };
  const idx = JSON.parse(text);
  return { version: 1, recipes: idx.recipes ?? [] };
}

let indexMemo = null;

export async function listRecipes({ fresh = false } = {}) {
  if (!indexMemo || fresh) indexMemo = parseIndex(await readFile(INDEX));
  return indexMemo.recipes;
}

export async function getRecipe(id) {
  const text = await readFile(recipePath(id));
  return text ? JSON.parse(text) : null;
}

function withSummary(index, recipe) {
  const rest = index.recipes.filter((r) => r.id !== recipe.id);
  return { ...index, recipes: [...rest, summarize(recipe)].sort((a, b) => a.id.localeCompare(b.id)) };
}

// Save a newly imported recipe. Returns the saved recipe (with its id).
export async function createRecipe(parsed, sourceText, extra = {}) {
  const now = new Date().toISOString();
  let saved;
  await commit(`Add recipe: ${parsed.englishName || parsed.name}`, async (ref) => {
    const index = parseIndex(await readFile(INDEX, ref));
    const taken = new Set(index.recipes.map((r) => r.id));
    const base = slugify(parsed);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    saved = { id, ...parsed, ...extra, favorite: false, log: [], createdAt: now, updatedAt: now };
    const next = withSummary(index, saved);
    indexMemo = next;
    return { [recipePath(id)]: json(saved), [sourcePath(id)]: sourceText.trim() + "\n", [INDEX]: json(next) };
  });
  return saved;
}

// Apply `change(recipe)` to the latest copy of a recipe and commit it.
export async function updateRecipe(id, message, change) {
  let saved;
  await commit(message, async (ref) => {
    const current = JSON.parse(await readFile(recipePath(id), ref));
    saved = { ...change(current), id, updatedAt: new Date().toISOString() };
    const next = withSummary(parseIndex(await readFile(INDEX, ref)), saved);
    indexMemo = next;
    return { [recipePath(id)]: json(saved), [INDEX]: json(next) };
  });
  return saved;
}

export async function deleteRecipe(id) {
  await commit(`Delete recipe: ${id}`, async (ref) => {
    const index = parseIndex(await readFile(INDEX, ref));
    const next = { ...index, recipes: index.recipes.filter((r) => r.id !== id) };
    indexMemo = next;
    const files = { [INDEX]: json(next) };
    for (const path of [recipePath(id), sourcePath(id)]) {
      if ((await readFile(path, ref)) != null) files[path] = null;
    }
    return files;
  });
}
