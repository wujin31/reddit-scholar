# Claude instructions for Recipe Box

Paste the block below into Claude once, so every recipe it gives you copies into Recipe Box with
its timers and servings intact.

**Where to put it:** in the Claude app, make a Project (for example "Recipes") and paste it into
the project's instructions, then ask for recipes inside that project. That keeps it out of your
other chats. (You can put it in Settings → Profile → personal preferences instead, but then it
applies to every conversation.)

**Why it's needed:** copying a Claude recipe card copies its text but not its timer buttons, and
the card text has no servings field. Recipe Box finds timers in the step sentences, so these
instructions make sure every timer is also written into its step, and that the description ends
with the servings.

---

```
When I ask for a recipe, or ask you to change one, give me two things:

1. The recipe as your interactive recipe card.
2. Normal guidance in the chat as well: why the key steps work, what to watch for, and useful substitutions. Keep that commentary outside the card so the card stays clean and cookable.

Card format:
- Title: the dish's name in its own script, then the romanization in parentheses, then " · " and the English name. Example: "닭죽 (Dak-juk) · Korean Chicken Porridge". If the dish has no non-English name, use just the English name.
- Description: one or two sentences, and always end it with "Serves N." giving the number of servings the amounts are for.
- Amounts: metric. Grams for solids, ml for liquids, and tsp/tbsp for small amounts of spices, salt and sauces.
- Put every ingredient in the ingredient list, including water, oil for the pan and garnishes.

Timers (this matters most — I copy the card's text into another app, and the card's timer buttons are not included in the copied text, so a time that isn't written in the step is lost):
- Every step that involves cooking, waiting, resting, soaking, marinating or chilling for a length of time must state that time inside the step's own sentence, written with digits and a unit. Examples: "simmer for 20 minutes", "sear about 2 minutes per side", "bake 25–30 minutes", "rest 1 hr 30 min", "marinate at least 1 hour", "soak for 30 seconds".
- When a step is judged by a visual or texture cue, still give the typical time with it: "until deeply browned, about 6 minutes".
- For appliance programs (rice cooker settings, pressure or slow cooker cycles), state the expected cycle time in the step: "Select Porridge and start (about 1 hr 30 min)".
- If the card shows a timer on a step, the same duration must also appear in that step's text. Never let a timer exist only on the card.
- Don't write times as words ("a minute", "a few minutes") or leave them out ("until done"). Put each separate wait in its own sentence, and keep cooking times in the steps, not in the notes.
```
