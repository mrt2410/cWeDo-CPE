# Recipes

Ready-made cWeDo CPE programs. **Browse them on the recipes page** — `index.html` in this
folder (on GitHub Pages: `…/recipes/`), where each one has a whiteboard preview, a JSON
viewer with Copy, and a download. The page discovers recipes automatically from
`manifest.json`.

| What | Where |
|------|-------|
| Recipes (`*.wedo.json` + `*.png` preview) | this folder |
| One file with every block and option | [template/](template/README.md) |
| Format reference and rules, written for AI agents | [AGENTS.md](AGENTS.md) |
| The recipes page | [index.html](index.html) (serve the repo root with any static server, open `/recipes/`) |

**Use a recipe:** download it, then in the app click Open and choose the file.

**Add a recipe:** see section 7 of [AGENTS.md](AGENTS.md) (a `meta` block, then
`npm run render:recipes` for its picture, then `npm run build:recipes`). `test/recipes.test.js` and `test/recipes-page.test.js` check the
files, the manifest, and the page.

## LEGO Education models

The `lego-*.wedo.json` recipes (one per model in LEGO Education's WeDo 2.0
[building instructions](https://education.lego.com/en-us/product-resources/wedo-2/downloads/building-instructions/))
credit **LEGO Education** for the model and **cWeDo CPE contributors** for the program: LEGO's
building-instruction PDFs contain build steps only, no programs, so the programs are our own
demos for those models. Each links to its PDF as `source`. No LEGO text, images or PDFs are
copied into this repository. Which motors/sensors each model has was read from small renders
of the PDFs and is a best guess; corrections are welcome.

LEGO® and WeDo are trademarks of the LEGO Group, which does not sponsor, authorize or endorse
this project.
