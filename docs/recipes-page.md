# Recipes page

`recipes/index.html` is a static page (no dependencies) that lists every recipe in
`recipes/`: header, search and tag filter, a table of contents that follows your scroll, a
whiteboard preview (click to enlarge), and per recipe **View JSON** (opens the exact file
in a viewer you can copy from), **Copy** and **Download**. The header also has **Open the
app**, and **Copy AI guide** / **Read AI guide**, which copy or show `recipes/AGENTS.md`
for pasting into an AI chat. `#view=<recipe-id>` in the URL opens that recipe's JSON.

## How recipes are discovered

A static host such as GitHub Pages cannot list a folder, so `scripts/build-recipes-manifest.js`
(`npm run build:recipes`) scans `recipes/*.wedo.json` and `recipes/template/*.wedo.json` and
writes `recipes/manifest.json`; the page loads that. Each recipe supplies its title,
description, **author** (required, shown on the card as "By …"), optional **source** URL
(shown as a "Source" link — use it when a recipe is based on someone else's work), hardware and tags in an optional `meta` block, which the app's Open ignores.
The block count and stack count are computed. A picture is picked up automatically when
`<name>.png` exists.

`test/recipes.test.js` fails if a recipe lacks `meta`, or if `manifest.json` is stale — so
forgetting `npm run build:recipes` is caught by `npm test`. The same command also regenerates
`data/recipes.js`, the copy embedded in the app for Open > Recipe (see [open-menu.md](open-menu.md)). The deploy workflow also
regenerates it.

## Deployment

The Pages workflow copies `recipes/` into the site root and each version folder, so it is
live at `/recipes/` (latest) and `/vX.Y.Z/recipes/`. Links back to the app are relative
(`../index.html`) so they work in both places. See
[github-pages-deployment.md](github-pages-deployment.md).

## Tradeoffs

- Opening the page straight from a file (`file://`) can't fetch the manifest; it shows a
  message saying to use a web server.
- Pictures are rendered by `npm run render:recipes` (`scripts/render-recipe-pictures.js`: headless
  Chrome + the DevTools protocol, no dependencies; needs Chrome/Chromium installed, or `$CHROME`).
  It only renders recipes without a picture unless you pass `-- --all`, so edit a recipe → delete
  its `.png` (or use `--all`) to refresh it.
- Copy uses the async clipboard API when available (HTTPS or localhost) and falls back to a
  hidden textarea on plain-http LAN servers; if both are blocked, select the text in the viewer.
- Tested with jsdom (`test/recipes-page.test.js`); the visual layout was checked in a real
  browser at desktop and phone widths, but only on Chromium.
