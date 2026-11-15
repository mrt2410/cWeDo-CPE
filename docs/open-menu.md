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

### Model pictures

A recipe built from a LEGO model can have a picture of the finished model, `recipes/<id>-model.jpg`
(440×294 JPEG, about 17 KB). The manifest picks it up automatically as `model` (null when there is
none). The picker shows it as a 64×43 thumbnail in the recipe's row and larger above the whiteboard
picture in the preview; recipes without one look as before. 27 of the 47 recipes have one: every
LEGO model `wedo_blocks` has building instructions for (Cody ×3, Flex, Grab, Lift, Milo, Motion,
Pull, Push, Spin, Steer, Sweep, Tilt, Turn, Walk, Wobble, Race Car, Recycling Truck, Flower,
Floodgates, Helicopter, Snail, Fan, Satellite, Spy Robot, Robotic Arm). The other 20 have none: the
7 programs not tied to a LEGO model (Counter, Hello Display, …), and Crank, Drive, Reel, Revolve,
Earthquake, Joystick, Alarm Device, Luna Rover, Young Frog and the MILO Arm / Twins variants, for
which `wedo_blocks` has no matching model.

The pictures were rendered from `wedo_blocks`' 3D LDraw models: its instruction viewer at the last
step, step card hidden, viewport 1100×800, cropped below the top bar and scaled down. Rendering is
a one-off; to add one, drop a `<id>-model.jpg` next to the recipe and run `npm run build:recipes`.
Tradeoff: they show the model on the wedo_blocks desk, so the model is small in the frame.

The whiteboard in the preview is the small `recipes/<id>-board.jpg` (800 px wide, JPEG, about 29 KB
each, made from the full-size `<id>.png`), not the 2600 px PNG; the web recipes page keeps the PNG.
Both pictures are embedded in the standalone build, see [standalone-build.md](standalone-build.md).
To make a board picture for a new recipe: resize its `.png` to 800 px wide, save as
`<id>-board.jpg`, run `npm run build:recipes`.

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
