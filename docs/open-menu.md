# Open menu

The **Open** button (folder icon, top-left rail) no longer opens a file picker directly. It
opens a small popover with two choices:

- **Device** — the original Open: the OS file picker on the web, the in-app saved list
  in the packaged app.
- **Recipe** — opens the recipe picker (below).

The icon carries a small chevron to hint at the menu. The menu closes on a choice, an outside
tap, or Esc (focus returns to the button); Up/Down move between items. The button exposes
`aria-haspopup`/`aria-expanded`, the items are `role="menuitem"`.

Open now takes one extra click on the web and in the native app. Tests: `test/open-menu.test.js`;
the native Open tests click "Device" first.

## Recipe picker

A modal with a searchable list on the left (title + block count) and a preview on the right:
whiteboard picture, description, author/source, "Needs …" hardware chips and tags. The first
recipe is preselected; **Open recipe** loads the selected one (replacing the current program,
like Open > Device), **Cancel**/Esc closes it. Search matches title, description, author,
tags and hardware. On narrow screens the list sits above the preview.

**Hardware filter buttons** sit under the search box: one per piece of hardware that recipes
need (Motor, Distance sensor, Tilt sensor, Smarthub button — built from the recipes' `needs`,
leaving out the "LEGO … model" entries, most common first). Click to toggle; with several
pressed a recipe must need all of them. They combine with the search and reset each time the
picker opens.

Preview-then-open is deliberately two steps, so a stray tap can't replace the board. There is
no extra "replace your program?" confirm in this version.

### Where the data comes from

`data/recipes.js` (loaded like the other `data/` banks) embeds every recipe plus its program,
about 90 KB, so the picker works offline: standalone build, Android, `file://`. It is generated
by `npm run build:recipes` (same script as `recipes/manifest.json`, see
[recipes-page.md](recipes-page.md)); `test/recipes.test.js` fails if it is stale. Programs
are opened from a JSON string, so the embedded copy is never mutated.

Pictures are *not* embedded (4 MB): they load from `recipes/<name>.png` and are hidden if
missing, so in the standalone build or the Android app the preview shows text only.
Tests: `test/recipe-picker.test.js`. The visual layout was checked in Chromium at desktop and
phone width only.
