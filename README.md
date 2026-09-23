# Recipe Box

A personal home-screen app for keeping the recipe cards Claude makes, and cooking from them.

Copy a recipe card in the Claude app, paste it here, and it becomes a permanent card with the
same interactivity: servings scaling, US/metric units, a step-by-step **Get cooking** mode with
tap-to-start timers, plus the things Claude's cards don't have: a searchable library, tags,
favorites, ingredient check-offs, and a cook log for tuning a recipe over time.

It's a static web app on GitHub Pages. Your recipes are plain files in this repo, so they're
versioned, portable, and never locked into an app.

## Set up (once)

1. **Turn on GitHub Pages.** Repo → Settings → Pages → *Deploy from a branch* → pick the branch
   this code is on and `/ (root)`. The app appears at `https://<you>.github.io/<repo>/` a minute later.
2. **Make a token so the app can save.** GitHub → Settings → Developer settings →
   Personal access tokens → *Fine-grained tokens* → Generate:
   - Repository access: *Only select repositories* → this repo
   - Permissions → Repository → **Contents: Read and write**
3. **On your iPhone**, open the Pages URL in Safari → Share → **Add to Home Screen**.
4. Open the app from the home screen → ⚙︎ Settings → paste the token (and set the branch if it
   isn't `main`) → **Test connection**.

The token is stored only on that device. Home-screen apps have their own storage, separate
from Safari, so enter it inside the home-screen app.

## Adding a recipe

1. In Claude, open the recipe card. **Switch it to Metric first.** Grams are what the card
   actually uses; its ounce amounts are rounded conversions.
2. Copy the recipe text.
3. In Recipe Box tap **+** → **Paste** → set servings (Claude's card text doesn't include them)
   and tags → **Save recipe**.

Plain text works best. A PDF printed from the card has the same text, but the page breaks
split lines apart.

## Timers

Tap any time in a step (e.g. **20 minutes**) to start a timer. By default timers run in the app
and chime while it's open. In cooking mode the screen stays on.

For timers that ring even when the app is closed, switch Settings → Timers → **iOS Clock** and
make a shortcut named `Recipe Timer` in the Shortcuts app:
*Receive Text input → Get Numbers from Shortcut Input → Start Timer for (Numbers) seconds*.

## How recipes are stored

```
recipes/
  index.json                 one summary per recipe (what the library loads)
  <id>/recipe.json           the parsed recipe, tags, servings, favorite, cook log
  <id>/source.txt            the card text exactly as pasted, never edited
```

Every save is a commit, so the history of each recipe is in `git log`. Reads come from the
GitHub API when a token is set (always fresh) and from the Pages copy otherwise; both are cached
for offline use. Per-device things (checked ingredients, chosen servings/units, running timers)
stay on the device.

## From a computer

```sh
node scripts/recipes.mjs add card.txt --servings 4 --tags thai,dinner   # add a recipe
node scripts/recipes.mjs reindex                                        # rebuild recipes/index.json
npm test                                                                 # parser + units tests
```

## Code

No build step and no dependencies: `index.html`, `styles.css`, and ES modules in `js/`:

- `parser.js` turns Claude recipe card text into a recipe (title parts, ingredients, steps,
  notes), links each step to the ingredients it mentions, and finds timers.
- `units.js` handles quantities, scaling, fractions, and US/metric conversion.
- `store.js` reads and writes recipe files through the GitHub API (multi-file commits that
  retry if another device saved in between) plus an offline cache.
- `timers.js` runs the kitchen timers, chime, and screen wake lock.
- `app.js` has the screens: library, recipe card, cooking mode, import/edit, cook log, settings.

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
