import { parseRecipeInput, recipeToText, refreshRecipe, EXPORT_PROMPT } from "./parser.js";
import { formatIngredient, convertTemperatures, UNITS } from "./units.js";
import {
  listRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe,
  getSettings, setSettings, canWrite, testConnection, loadLocal, saveLocal, safeUrl,
} from "./store.js";
import {
  startTimer, cancelTimer, addTime, getTimers, onTimersChange,
  formatDuration, shortDuration, keepAwake,
} from "./timers.js";

// ---------- tiny DOM helper ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k in el && (typeof v !== "string" || k === "value")) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren/append turn null into the text "null"; skip empty slots like h() does.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/>',
};

const icon = (name, cls = "") =>
  h("span", { class: `icon ${cls}`, "aria-hidden": "true", html: `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>` });

const iconButton = (name, label, onClick, cls = "") =>
  h("button", { class: `icon-btn ${cls}`, "aria-label": label, title: label, onClick }, icon(name));

function toast(message, kind = "") {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = h("div", { class: `toast ${kind}`, role: "status" }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, kind === "error" ? 5000 : 2500);
}

function errorMessage(e) {
  if (e.readOnly || (e.status === 403 && /personal access token/i.test(e.detail ?? ""))) {
    const { owner, repo } = getSettings();
    return `The token can read but not save. On GitHub, edit the token: Repository access must include ${owner}/${repo}, and Repository permissions → Contents must be “Read and write”.`;
  }
  if (e.status === 401) return "GitHub rejected the token. Check it in Settings.";
  if (e.status === 403 || e.status === 404) return `GitHub said no (${e.status}${e.detail ? `: ${e.detail}` : ""}). Check the repo and token in Settings.`;
  return e.message || String(e);
}

const navbar = (left, title, right) =>
  h("header", { class: "nav" }, h("div", { class: "nav-side" }, left), h("div", { class: "nav-title" }, title ?? ""), h("div", { class: "nav-side right" }, right));

const backButton = (to = "#/") => iconButton("back", "Back", () => (location.hash = to));

// ---------- per-recipe view state (this device only) ----------

const viewKey = (id) => `view:${id}`;
function getView(id) {
  return { factor: 1, units: getSettings().units, checked: [], ...loadLocal(viewKey(id), {}) };
}
function setView(id, patch) {
  saveLocal(viewKey(id), { ...getView(id), ...patch });
}

// ---------- rendering helpers ----------

const displayName = (r) => r.englishName || r.name;
const subName = (r) => [r.nativeName, r.romanized].filter(Boolean).join(" · ");

// Step text with each referenced ingredient replaced by its scaled/converted amount and each
// time turned into a tap-to-start timer.
function renderStep(step, recipe, factor, units, stepLabel) {
  const text = step.text;
  const marks = [];
  const refs = [...(step.ingredientRefs ?? [])].sort((a, b) => recipe.ingredients[b].text.length - recipe.ingredients[a].text.length);
  const overlaps = (s, e) => marks.some((m) => s < m.end && e > m.start);
  for (const i of refs) {
    const ing = recipe.ingredients[i];
    let from = 0;
    for (;;) {
      const at = text.indexOf(ing.text, from);
      if (at < 0) break;
      const end = at + ing.text.length;
      if (!overlaps(at, end)) marks.push({ start: at, end, kind: "ing", ing });
      from = end;
    }
  }
  const unplaced = [];
  for (const t of step.timers ?? []) {
    const at = t.text ? text.indexOf(t.text) : -1;
    if (at >= 0 && !overlaps(at, at + t.text.length)) marks.push({ start: at, end: at + t.text.length, kind: "timer", t });
    else unplaced.push(t);
  }
  marks.sort((a, b) => a.start - b.start);

  const out = [];
  let pos = 0;
  for (const m of marks) {
    out.push(convertTemperatures(text.slice(pos, m.start), units));
    if (m.kind === "ing") out.push(h("span", { class: "ing-ref" }, formatIngredient(m.ing, factor, units)));
    else out.push(timerChip(m.t, stepLabel, m.t.text));
    pos = m.end;
  }
  out.push(convertTemperatures(text.slice(pos), units));
  for (const t of unplaced) out.push(" ", timerChip(t, stepLabel));
  return out;
}

function timerChip(t, label, text) {
  return h("button", {
    class: "timer-chip",
    onClick: (e) => { e.stopPropagation(); startTimer(label, t.seconds); },
    "aria-label": `Start a ${shortDuration(t.seconds)} timer`,
  }, icon("timer"), text ?? shortDuration(t.seconds));
}

function segmented(options, value, onChange) {
  return h("div", { class: "segmented", role: "radiogroup" },
    options.map(([v, label]) => h("button", {
      role: "radio", "aria-checked": String(v === value), class: v === value ? "on" : "",
      onClick: () => onChange(v),
    }, label)));
}

const splitTags = (s) => [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

// ---------- library ----------

const libraryState = { query: "", filter: "all", sort: loadLocal("sort", "recent"), shown: 100 };

function normalize(s) {
  return (s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matches(r, terms) {
  const hay = normalize([r.name, r.englishName, r.nativeName, r.romanized, (r.tags ?? []).join(" "), r.items].join(" "));
  return terms.every((t) => hay.includes(t));
}

async function viewLibrary(root) {
  const list = h("div", { class: "list" }, h("p", { class: "muted pad" }, "Loading…"));
  const chips = h("div", { class: "chips" });
  const search = h("input", {
    type: "search", placeholder: "Search", value: libraryState.query,
    autocomplete: "off", "aria-label": "Search",
    onInput: (e) => { libraryState.query = e.target.value; libraryState.shown = 100; draw(); },
  });
  const sort = h("select", {
    "aria-label": "Sort",
    onChange: (e) => { libraryState.sort = e.target.value; saveLocal("sort", e.target.value); draw(); },
  }, [["recent", "Newest"], ["cooked", "Last cooked"], ["az", "A–Z"]].map(([v, l]) =>
    h("option", { value: v, selected: v === libraryState.sort }, l)));

  root.append(
    navbar(iconButton("gear", "Settings", () => (location.hash = "#/settings")), "", iconButton("plus", "Add recipe", () => (location.hash = "#/import"), "accent")),
    h("h1", { class: "large-title" }, "Recipes"),
    h("div", { class: "search-row" }, h("label", { class: "search" }, icon("search"), search), sort),
    chips,
    list,
  );

  let recipes = [];
  try {
    recipes = await listRecipes({ fresh: true });
  } catch (e) {
    list.replaceChildren(h("p", { class: "muted pad" }, "Couldn't load recipes. ", errorMessage(e)));
    return;
  }

  function draw() {
    const counts = new Map();
    recipes.forEach((r) => (r.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    const tags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
    const filters = [["all", "All"], ["fav", "★ Favorites"], ...tags.map((t) => [`tag:${t}`, t])];
    chips.replaceChildren(...filters.map(([v, l]) => h("button", {
      class: `chip ${libraryState.filter === v ? "on" : ""}`,
      onClick: () => { libraryState.filter = libraryState.filter === v ? "all" : v; draw(); },
    }, l)));

    const terms = normalize(libraryState.query).split(/\s+/).filter(Boolean);
    let rows = recipes.filter((r) => matches(r, terms));
    if (libraryState.filter === "fav") rows = rows.filter((r) => r.favorite);
    else if (libraryState.filter.startsWith("tag:")) rows = rows.filter((r) => (r.tags ?? []).includes(libraryState.filter.slice(4)));
    const by = {
      recent: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      cooked: (a, b) => (b.lastCooked ?? "").localeCompare(a.lastCooked ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      az: (a, b) => displayName(a).localeCompare(displayName(b)),
    }[libraryState.sort];
    rows.sort(by);

    if (!recipes.length) {
      list.replaceChildren(h("div", { class: "empty" },
        h("p", {}, "No recipes yet."),
        h("p", { class: "muted" }, "Copy a recipe card in Claude, then tap + to paste it in."),
        h("a", { class: "button primary", href: "#/import" }, "Add your first recipe")));
      return;
    }
    if (!rows.length) {
      list.replaceChildren(h("p", { class: "muted pad" }, "No matches."));
      return;
    }
    list.replaceChildren(
      ...rows.slice(0, libraryState.shown).map((r) => h("a", { class: "row", href: `#/r/${r.id}` },
        h("div", { class: "row-main" },
          h("div", { class: "row-title" }, displayName(r), r.favorite ? h("span", { class: "fav-dot", "aria-label": "Favorite" }, "★") : null),
          subName(r) ? h("div", { class: "row-sub" }, subName(r)) : null,
          h("div", { class: "row-meta" },
            (r.tags ?? []).slice(0, 4).map((t) => h("span", { class: "tag" }, t)),
            r.cookCount ? h("span", { class: "muted" }, `Cooked ${r.cookCount}×`) : null)),
        h("span", { class: "chev", "aria-hidden": "true" }, "›"))),
      rows.length > libraryState.shown
        ? h("button", { class: "button subtle more", onClick: () => { libraryState.shown += 200; draw(); } }, `Show more (${rows.length - libraryState.shown})`)
        : h("p", { class: "muted pad center small" }, `${rows.length} recipe${rows.length === 1 ? "" : "s"}`),
    );
  }
  draw();
}

// ---------- recipe card ----------

async function loadRecipeOr404(root, id) {
  root.append(navbar(backButton(), ""), h("p", { class: "muted pad" }, "Loading…"));
  let r;
  try { r = await getRecipe(id); } catch (e) { r = null; toast(errorMessage(e), "error"); }
  if (r) r = refreshRecipe(r);
  root.replaceChildren();
  if (!r) {
    root.append(navbar(backButton(), ""), h("div", { class: "empty" }, h("p", {}, "Recipe not found."), h("a", { class: "button", href: "#/" }, "Back to recipes")));
    return null;
  }
  return r;
}

async function viewRecipe(root, id, query) {
  let r = await loadRecipeOr404(root, id);
  if (!r) return;
  let view = getView(id);

  const star = iconButton("star", "Favorite", async () => {
    if (!requireWrite()) return;
    const favorite = !r.favorite;
    star.classList.toggle("on", favorite);
    try { r = await updateRecipe(id, `${favorite ? "Favorite" : "Unfavorite"}: ${displayName(r)}`, (cur) => ({ ...cur, favorite })); }
    catch (e) { star.classList.toggle("on", !favorite); toast(errorMessage(e), "error"); }
  }, r.favorite ? "star on" : "star");

  const menu = h("div", { class: "menu", hidden: true },
    h("button", { onClick: () => shareRecipe(r) }, "Share…"),
    h("button", { onClick: () => copyText(recipeToText(r)) }, "Copy as text"),
    h("a", { href: `#/r/${id}/edit` }, "Edit"),
    safeUrl(r.chatUrl) ? h("a", { href: safeUrl(r.chatUrl), target: "_blank", rel: "noopener noreferrer" }, "Open Claude chat") : null,
    h("button", { class: "danger", onClick: async () => {
      if (!requireWrite() || !confirm(`Delete “${displayName(r)}”? Its cook log goes too.`)) return;
      try { await deleteRecipe(id); toast("Deleted"); location.hash = "#/"; } catch (e) { toast(errorMessage(e), "error"); }
    } }, "Delete"),
  );
  const more = iconButton("more", "More", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener("click", () => (menu.hidden = true), { once: false, signal: pageSignal() });

  const body = h("div", { class: "recipe" });
  root.append(navbar(backButton(), "", h("div", { class: "menu-anchor" }, star, more, menu)), body);

  function draw() {
    const { factor, units } = view;
    const checked = new Set(view.checked);
    const servingsNow = r.servings ? Math.round(r.servings * factor * 10) / 10 : null;
    const stepFactor = (dir) => {
      if (r.servings) {
        const next = Math.max(1, Math.round(servingsNow) + dir);
        return next / r.servings;
      }
      const steps = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
      const i = steps.findIndex((s) => s >= factor - 1e-9);
      return steps[Math.min(steps.length - 1, Math.max(0, (i < 0 ? steps.length - 1 : i) + dir))];
    };
    const setFactor = (f) => { view = { ...view, factor: f }; setView(id, { factor: f }); draw(); };
    const hasConvertible = r.ingredients.some((i) => i.unit && UNITS[i.unit]);

    const groups = [];
    r.ingredients.forEach((ing, i) => {
      const g = ing.group ?? "";
      if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, items: [] });
      groups[groups.length - 1].items.push([ing, i]);
    });

    fill(body,
      h("h1", { class: "recipe-title" }, displayName(r)),
      subName(r) ? h("p", { class: "recipe-sub" }, subName(r)) : null,
      r.description ? h("p", { class: "description" }, r.description) : null,
      r.tags?.length ? h("div", { class: "row-meta" }, r.tags.map((t) => h("a", { class: "tag", href: "#/", onClick: () => { libraryState.filter = `tag:${t}`; } }, t))) : null,

      h("div", { class: "controls card" },
        h("div", { class: "stepper" },
          h("button", { "aria-label": r.servings ? "Fewer servings" : "Smaller batch", onClick: () => setFactor(stepFactor(-1)) }, "−"),
          h("div", { class: "stepper-value" },
            r.servings ? h("strong", {}, servingsNow) : h("strong", {}, `×${+factor.toFixed(2)}`),
            h("span", {}, r.servings ? (servingsNow === 1 ? "serving" : "servings") : "batch")),
          h("button", { "aria-label": r.servings ? "More servings" : "Bigger batch", onClick: () => setFactor(stepFactor(1)) }, "+")),
        hasConvertible ? segmented([["original", "Original"], ["us", "US"], ["metric", "Metric"]], units, (u) => {
          view = { ...view, units: u }; setView(id, { units: u }); draw();
        }) : null,
        factor !== 1 ? h("button", { class: "link small", onClick: () => setFactor(1) }, "Reset amounts") : null,
      ),

      h("a", { class: "button primary big", href: `#/r/${id}/cook` }, "Get cooking"),

      h("section", {},
        h("div", { class: "section-head" },
          h("h2", {}, "Ingredients"),
          checked.size ? h("button", { class: "link small", onClick: () => { view.checked = []; setView(id, { checked: [] }); draw(); } }, "Clear checks") : null),
        groups.map((g) => [
          g.name ? h("h3", {}, g.name) : null,
          h("ul", { class: "ingredients" }, g.items.map(([ing, i]) => h("li", {},
            h("button", {
              class: `check ${checked.has(i) ? "done" : ""}`, role: "checkbox", "aria-checked": String(checked.has(i)),
              onClick: () => {
                checked.has(i) ? checked.delete(i) : checked.add(i);
                view.checked = [...checked]; setView(id, { checked: view.checked }); draw();
              },
            }, h("span", { class: "box" }, icon("check")), h("span", {}, formatIngredient(ing, factor, units)))))),
        ])),

      h("section", {},
        h("h2", {}, "Steps"),
        h("ol", { class: "steps" }, r.steps.map((s, i) => h("li", {},
          h("span", { class: "num" }, i + 1),
          h("p", {}, renderStep(s, r, factor, units, `${displayName(r)} · step ${i + 1}`)))))),

      r.notes ? h("section", {}, h("h2", {}, "Notes"), h("p", { class: "notes" }, r.notes)) : null,

      cookLogSection(r, (next) => { r = next; draw(); }),

      h("p", { class: "muted small center pad" },
        `Added ${new Date(r.createdAt).toLocaleDateString()}`,
        safeUrl(r.chatUrl) ? [" · ", h("a", { href: safeUrl(r.chatUrl), target: "_blank", rel: "noopener noreferrer" }, "Claude chat")] : null),
    );
  }
  draw();
  if (query.get("log") === "1" && canWrite()) {
    history.replaceState(null, "", `#/r/${id}`);
    openLogSheet(r, (next) => { r = next; draw(); });
  }
}

function cookLogSection(r, onSaved) {
  const log = [...(r.log ?? [])].reverse();
  return h("section", {},
    h("div", { class: "section-head" },
      h("h2", {}, "Cook log"),
      h("button", { class: "button small", onClick: () => openLogSheet(r, onSaved) }, "Log a cook")),
    log.length
      ? h("ul", { class: "log" }, log.map((e) => h("li", { class: "card" },
        h("div", { class: "log-head" },
          h("strong", {}, new Date(e.date + "T12:00").toLocaleDateString(undefined, { dateStyle: "medium" })),
          e.rating ? h("span", { class: "stars", "aria-label": `${e.rating} of 5` }, "★".repeat(e.rating) + "☆".repeat(5 - e.rating)) : null,
          e.scale && e.scale !== 1 ? h("span", { class: "muted small" }, `×${e.scale}`) : null),
        e.variables ? h("p", {}, h("span", { class: "label" }, "Variables "), e.variables) : null,
        e.notes ? h("p", {}, e.notes) : null)))
      : h("p", { class: "muted" }, "Track what you changed and how it came out, so the next cook is better."),
  );
}

function openLogSheet(r, onSaved) {
  if (!requireWrite()) return;
  const last = r.log?.[r.log.length - 1];
  let rating = 0;
  const stars = h("div", { class: "star-input" });
  const drawStars = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
    h("button", { type: "button", class: n <= rating ? "on" : "", "aria-label": `${n} star${n > 1 ? "s" : ""}`, onClick: () => { rating = rating === n ? 0 : n; drawStars(); } }, "★")));
  drawStars();
  const date = h("input", { type: "date", value: new Date().toLocaleDateString("en-CA"), required: true });
  const variables = h("textarea", { rows: 2, placeholder: last?.variables ? `Last time: ${last.variables}` : "e.g. liquid 540 ml, bottom scorched slightly" });
  const notes = h("textarea", { rows: 3, placeholder: "How did it turn out? What to change next time?" });
  const save = h("button", { class: "button primary", type: "submit" }, "Save");

  const dialog = h("dialog", { class: "sheet" },
    h("form", {
      method: "dialog",
      onSubmit: async (e) => {
        e.preventDefault();
        save.disabled = true; save.textContent = "Saving…";
        const entry = { date: date.value, rating, variables: variables.value.trim(), notes: notes.value.trim(), scale: getView(r.id).factor };
        try {
          const next = await updateRecipe(r.id, `Log cook: ${displayName(r)}`, (cur) => ({ ...cur, log: [...(cur.log ?? []), entry] }));
          dialog.close(); toast("Logged"); onSaved(next);
        } catch (err) {
          toast(errorMessage(err), "error"); save.disabled = false; save.textContent = "Save";
        }
      },
    },
    h("div", { class: "sheet-head" },
      h("button", { type: "button", class: "link", onClick: () => dialog.close() }, "Cancel"),
      h("strong", {}, "Log a cook"), save),
    h("label", {}, "Date", date),
    h("div", { class: "field", role: "group", "aria-label": "Rating" }, h("span", {}, "Rating"), stars),
    h("label", {}, "Variables", variables),
    h("label", {}, "Notes", notes)));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

async function shareRecipe(r) {
  const text = recipeToText(r);
  if (navigator.share) {
    try { await navigator.share({ title: displayName(r), text }); } catch { /* cancelled */ }
  } else copyText(text);
}

async function copyText(text, done = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast("Couldn't copy", "error"); }
}

function requireWrite() {
  if (canWrite()) return true;
  toast("Connect GitHub in Settings to save changes.", "error");
  return false;
}

// ---------- cooking mode ----------

async function viewCook(root, id) {
  const r = await loadRecipeOr404(root, id);
  if (!r) return;
  const { factor, units } = getView(id);
  let i = Math.min(loadLocal(`step:${id}`, 0), r.steps.length - 1);
  keepAwake(true);
  onLeave(() => keepAwake(false));
  document.body.classList.add("cooking");
  onLeave(() => document.body.classList.remove("cooking"));

  const stage = h("div", { class: "cook-stage" });
  const progress = h("div", { class: "progress" }, h("div"));
  const counter = h("div", { class: "nav-title" });
  const prev = h("button", { class: "button big", onClick: () => go(i - 1) }, "Back");
  const next = h("button", { class: "button primary big", onClick: () => (i < r.steps.length - 1 ? go(i + 1) : finish()) });

  root.append(
    h("header", { class: "nav cook-nav" },
      h("div", { class: "nav-side" }, iconButton("close", "Close cooking mode", () => (location.hash = `#/r/${id}`))),
      counter,
      h("div", { class: "nav-side right" })),
    progress, stage,
    h("footer", { class: "cook-foot" }, prev, next));

  function go(n) {
    i = Math.max(0, Math.min(r.steps.length - 1, n));
    saveLocal(`step:${id}`, i);
    draw();
    window.scrollTo(0, 0);
  }

  function finish() {
    saveLocal(`step:${id}`, 0);
    location.hash = `#/r/${id}?log=1`;
  }

  function draw() {
    const step = r.steps[i];
    counter.textContent = `Step ${i + 1} of ${r.steps.length}`;
    progress.firstChild.style.width = `${((i + 1) / r.steps.length) * 100}%`;
    prev.disabled = i === 0;
    next.textContent = i === r.steps.length - 1 ? "Done" : "Next";
    const refs = step.ingredientRefs ?? [];
    fill(stage,
      h("p", { class: "cook-step" }, renderStep(step, r, factor, units, `${displayName(r)} · step ${i + 1}`)),
      refs.length ? h("div", { class: "cook-ings card" },
        h("h3", {}, "For this step"),
        h("ul", {}, refs.map((k) => h("li", {}, formatIngredient(r.ingredients[k], factor, units))))) : null,
      step.timers?.length ? h("div", { class: "cook-timers" }, step.timers.map((t) =>
        h("button", { class: "button big timer-big", onClick: () => startTimer(`${displayName(r)} · step ${i + 1}`, t.seconds) },
          icon("timer"), `Start ${shortDuration(t.seconds)}`))) : null,
    );
  }

  // Swipe between steps.
  let x0 = null, y0 = null;
  stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(i + 1);
    if (e.key === "ArrowLeft") go(i - 1);
  }, { signal: pageSignal() });
  draw();
}

// ---------- import & edit ----------

function recipeForm({ title, text = "", draftKey = null, editing = false, servings = "", tags = "", chatUrl = "", submitLabel, onSubmit }) {
  const source = h("textarea", {
    class: "source", rows: 10, value: text, spellcheck: false,
    placeholder: "Paste a Claude recipe card here.\n\nIn Claude: tap the recipe card's copy button (or select all and copy), then come back and tap Paste.",
  });
  // Copying a card drops its timer chips; the export prompt gets Claude to send them as JSON.
  const exportHelp = editing ? null : h("details", { class: "card helper" },
    h("summary", {}, "Keep the card's timers"),
    h("p", { class: "small" }, "Copying a card leaves out its timer buttons. To keep them, send this prompt to Claude in the same chat as the recipe, then copy Claude's whole reply and paste it here."),
    h("button", { type: "button", class: "button small", onClick: () => copyText(EXPORT_PROMPT, "Prompt copied. Send it to Claude.") }, "Copy prompt for Claude"));
  const preview = h("div", { class: "preview" });
  let servingsTouched = Boolean(servings);
  const servingsIn = h("input", { type: "number", inputmode: "decimal", min: "0", step: "any", value: servings, placeholder: "e.g. 4", onInput: () => { servingsTouched = true; } });
  const tagsIn = h("input", { type: "text", value: tags, placeholder: "e.g. thai, rice cooker, dinner", autocapitalize: "off" });
  const chatIn = h("input", { type: "url", value: chatUrl, placeholder: "https://claude.ai/chat/…", autocapitalize: "off" });
  const submit = h("button", { class: "button primary big", type: "submit" }, submitLabel);
  let parsed = null;

  function update() {
    if (draftKey) saveLocal(draftKey, source.value);
    parsed = null;
    if (!source.value.trim()) { preview.replaceChildren(); submit.disabled = true; return; }
    try {
      parsed = parseRecipeInput(source.value);
      if (parsed.servings && !servingsTouched) servingsIn.value = parsed.servings;
      const timers = parsed.steps.reduce((n, s) => n + s.timers.length, 0);
      const fromJson = /^\s*(```|[[{])/.test(source.value);
      const noQty = parsed.ingredients.filter((i) => i.qty == null).length;
      const us = parsed.ingredients.filter((i) => ["oz", "lb", "cup", "tbsp", "tsp", "fl oz"].includes(i.unit)).length;
      const metric = parsed.ingredients.filter((i) => ["g", "kg", "ml", "l"].includes(i.unit)).length;
      fill(preview, h("div", { class: "card ok" },
        h("strong", {}, displayName(parsed)),
        subName(parsed) ? h("div", { class: "muted" }, subName(parsed)) : null,
        h("div", { class: "small" }, `${parsed.ingredients.length} ingredients · ${parsed.steps.length} steps · ${timers} timer${timers === 1 ? "" : "s"}`),
        noQty ? h("div", { class: "small muted" }, `${noQty} ingredient${noQty === 1 ? "" : "s"} without an amount (won't scale)`) : null,
        us > metric ? h("div", { class: "small hint" }, "Tip: switch the card to Metric in Claude before copying. Grams are exact; the ounce conversions are rounded.") : null,
        exportHelp && !fromJson && timers < parsed.steps.length / 3
          ? h("div", { class: "small hint" }, "Few or no timers found in the text. If the card showed timers, use “Keep the card's timers” above.")
          : null));
      submit.disabled = false;
    } catch (e) {
      preview.replaceChildren(h("div", { class: "card warn small" }, e.message));
      submit.disabled = true;
    }
  }
  let pending = null;
  source.addEventListener("input", () => { clearTimeout(pending); pending = setTimeout(update, 150); });

  const paste = h("button", { type: "button", class: "button", onClick: async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) { toast("The clipboard is empty"); return; }
      source.value = t; update();
    } catch { toast("Couldn't read the clipboard. Long-press the box and choose Paste.", "error"); source.focus(); }
  } }, icon("paste"), "Paste");

  const form = h("form", {
    class: "form",
    onSubmit: async (e) => {
      e.preventDefault();
      clearTimeout(pending);
      update(); // the preview may be a keystroke behind
      if (!parsed || !requireWrite()) return;
      if (chatIn.value.trim() && !safeUrl(chatIn.value.trim())) { toast("The chat link must start with https://", "error"); return; }
      submit.disabled = true; const label = submit.textContent; submit.textContent = "Saving…";
      try {
        await onSubmit(parsed, source.value, {
          servings: servingsIn.value ? Number(servingsIn.value) : null,
          tags: splitTags(tagsIn.value),
          chatUrl: safeUrl(chatIn.value.trim()),
        });
      } catch (err) {
        toast(errorMessage(err), "error");
        submit.disabled = false; submit.textContent = label;
      }
    },
  },
  h("div", { class: "section-head" }, h("h1", { class: "large-title flush" }, title), paste),
  exportHelp,
  source,
  editing ? h("p", { class: "help small muted" }, "To add a timer to a step, end it with ⏱ 10 min or [timer 10 min].") : null,
  preview,
  h("label", {}, "Servings", servingsIn, h("span", { class: "help" }, "Copied card text doesn't include servings; set it so the amounts scale by servings.")),
  h("label", {}, "Tags", tagsIn),
  h("label", {}, "Claude chat link (optional)", chatIn),
  canWrite() ? null : h("p", { class: "card warn small" }, "GitHub isn't connected yet, so this can't be saved. ", h("a", { href: "#/settings" }, "Open Settings")),
  submit);
  update();
  return form;
}

function viewImport(root, query) {
  root.append(
    navbar(backButton(), ""),
    recipeForm({
      title: "Add recipe",
      // Keep what was pasted if you leave to fix Settings and come back.
      text: query.get("text") ?? loadLocal("draft:import", ""),
      draftKey: "draft:import",
      submitLabel: "Save recipe",
      onSubmit: async (parsed, text, extra) => {
        const saved = await createRecipe(parsed, text, extra);
        saveLocal("draft:import", "");
        toast("Saved");
        location.replace(`#/r/${saved.id}`);
      },
    }));
}

async function viewEdit(root, id) {
  const r = await loadRecipeOr404(root, id);
  if (!r) return;
  root.append(
    navbar(backButton(`#/r/${id}`), ""),
    recipeForm({
      title: "Edit recipe",
      text: recipeToText(r, { servings: false }),
      editing: true,
      servings: r.servings ?? "",
      tags: (r.tags ?? []).join(", "),
      chatUrl: r.chatUrl ?? "",
      submitLabel: "Save changes",
      onSubmit: async (parsed, _text, extra) => {
        await updateRecipe(id, `Edit recipe: ${displayName(parsed)}`, (cur) => ({ ...cur, ...parsed, ...extra }));
        toast("Saved");
        location.replace(`#/r/${id}`);
      },
    }));
}

// ---------- settings ----------

function viewSettings(root) {
  const s = getSettings();
  const field = (label, key, attrs = {}, help) => h("label", {}, label,
    h("input", { value: s[key] ?? "", autocapitalize: "off", autocomplete: "off", spellcheck: false, ...attrs, onChange: (e) => setSettings({ [key]: e.target.value.trim() }) }),
    help ? h("span", { class: "help" }, help) : null);
  const status = h("p", { class: "small" });

  root.append(
    navbar(backButton(), ""),
    h("div", { class: "form" },
      h("h1", { class: "large-title flush" }, "Settings"),

      h("h2", {}, "GitHub"),
      h("p", { class: "muted small" }, "Recipes are saved as files in your GitHub repo. The token stays on this device."),
      field("Owner", "owner"),
      field("Repository", "repo"),
      field("Branch", "branch", {}, "The branch GitHub Pages publishes from."),
      field("Token", "token", { type: "password", placeholder: "github_pat_…" },
        "Fine-grained token, only this repository, permission Contents: Read and write."),
      h("button", { class: "button", onClick: async () => {
        status.textContent = "Checking…"; status.className = "small";
        try { status.textContent = `Connected to ${await testConnection()} ✓`; status.className = "small ok-text"; }
        catch (e) { status.textContent = errorMessage(e); status.className = "small warn-text"; }
      } }, "Test connection"),
      status,

      h("h2", {}, "Units"),
      segmented([["original", "As written"], ["us", "US"], ["metric", "Metric"]], s.units, (u) => { setSettings({ units: u }); root.replaceChildren(); viewSettings(root); }),
      h("p", { class: "muted small" }, "Default for recipes you haven't changed yourself."),

      h("h2", {}, "Timers"),
      segmented([["app", "In the app"], ["clock", "iOS Clock"]], s.timerMode, (m) => { setSettings({ timerMode: m }); root.replaceChildren(); viewSettings(root); }),
      s.timerMode === "clock"
        ? [field("Shortcut name", "clockShortcut"),
          h("p", { class: "muted small" },
            "Timers go to the Clock app so they ring even with this app closed. Make a shortcut with that name in the Shortcuts app: ",
            h("b", {}, "Receive Text input → Get Numbers from Shortcut Input → Start Timer for Numbers seconds"), ".")]
        : h("p", { class: "muted small" }, "In-app timers chime while the app is open. The screen stays on in cooking mode."),
    ));
}

// ---------- timer tray ----------

function mountTimerTray() {
  const tray = h("div", { class: "timer-tray", "aria-live": "polite" });
  document.body.append(tray);
  let shape = null;
  const remaining = (t) => (t.done ? "Done!" : formatDuration((t.endsAt - Date.now()) / 1000));
  const draw = (timers) => {
    // Only rebuild when timers are added, removed or finish; otherwise just tick the clocks,
    // so buttons aren't replaced under your finger.
    const next = timers.map((t) => `${t.id}:${t.done}:${t.endsAt}`).join("|");
    if (next === shape) {
      timers.forEach((t, i) => { tray.children[i].querySelector("strong").textContent = remaining(t); });
      return;
    }
    shape = next;
    tray.hidden = !timers.length;
    tray.replaceChildren(...timers.map((t) => h("div", { class: `timer ${t.done ? "done" : ""}` },
      h("div", { class: "timer-info" },
        h("strong", {}, remaining(t)),
        h("span", {}, t.label)),
      t.done ? null : h("button", { class: "link small", onClick: () => addTime(t.id, 60) }, "+1 min"),
      iconButton("close", t.done ? "Dismiss" : "Cancel timer", () => cancelTimer(t.id)))));
  };
  onTimersChange(draw);
  draw(getTimers());
}

// ---------- router ----------

let leaveHooks = [];
let pageAbort = new AbortController();
const onLeave = (fn) => leaveHooks.push(fn);
const pageSignal = () => pageAbort.signal;
const scrollMemo = new Map();

async function route() {
  leaveHooks.forEach((fn) => fn());
  leaveHooks = [];
  pageAbort.abort();
  pageAbort = new AbortController();

  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const query = new URLSearchParams(qs);
  const parts = path.split("/").filter(Boolean);
  const root = document.getElementById("app");
  root.replaceChildren();
  window.scrollTo(0, 0);

  const key = location.hash || "#/";
  onLeave(() => scrollMemo.set(key, window.scrollY));

  if (parts[0] === "r" && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    if (parts[2] === "cook") await viewCook(root, id);
    else if (parts[2] === "edit") await viewEdit(root, id);
    else await viewRecipe(root, id, query);
  } else if (parts[0] === "import") viewImport(root, query);
  else if (parts[0] === "settings") viewSettings(root);
  else await viewLibrary(root);

  if (scrollMemo.has(key)) window.scrollTo(0, scrollMemo.get(key));
}

// Refuse to run inside another site's frame (clickjacking); the token lives on this origin.
if (window.top !== window.self) {
  document.getElementById("app").textContent = "Open Recipe Box directly, not inside another page.";
  throw new Error("framed");
}

window.addEventListener("hashchange", route);
mountTimerTray();
route();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
