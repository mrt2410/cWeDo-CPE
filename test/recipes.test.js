const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadApp } = require("./helpers.js");
const { validateProgram, NOTES } = require("./recipe-rules.js");

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["recipes/template", "recipes"].map((d) => path.join(ROOT, d));
const jsonFiles = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".wedo.json")).map((f) => path.join(dir, f)) : [];

/* what the app's own palette/engine says is legal, read from the real files */
const PROBE = "window.__t={S,ORDER,canAccept,SOCKETED,STARTS,INPUTS,applyProgram};";

test("each recipes directory has a README and at least one program file", () => {
  for (const dir of DIRS) {
    assert.ok(fs.existsSync(path.join(dir, "README.md")), `${dir} needs README.md`);
    assert.ok(jsonFiles(dir).length > 0, `${dir} needs *.wedo.json files`);
  }
});

test("every recipe has a whiteboard picture next to it", () => {
  for (const f of jsonFiles(DIRS[1])) {
    const png = f.replace(/\.wedo\.json$/, ".png");
    assert.ok(fs.existsSync(png), `${path.basename(f)} needs ${path.basename(png)}`);
  }
});

test("every recipe and the template carry meta (title, description, needs[], tags[])", () => {
  for (const f of DIRS.flatMap(jsonFiles)) {
    const m = JSON.parse(fs.readFileSync(f, "utf8")).meta;
    const name = path.basename(f);
    assert.ok(m && typeof m.title === "string" && m.title, `${name} needs meta.title`);
    assert.ok(typeof m.description === "string" && m.description, `${name} needs meta.description`);
    assert.ok(typeof m.author === "string" && m.author, `${name} needs meta.author`);
    assert.ok(m.source == null || /^https?:\/\//.test(m.source), `${name} meta.source must be an http(s) URL when present`);
    assert.ok(Array.isArray(m.needs), `${name} needs meta.needs[]`);
    assert.ok(Array.isArray(m.tags) && m.tags.length > 0, `${name} needs meta.tags[]`);
  }
});

test("recipes/manifest.json is up to date (run `npm run build:recipes`)", () => {
  const { buildManifest } = require("../scripts/build-recipes-manifest.js");
  const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, "recipes/manifest.json"), "utf8"));
  assert.deepEqual(onDisk, buildManifest());
});

test("the manifest discovers every recipe, its picture, and the template", () => {
  const { buildManifest } = require("../scripts/build-recipes-manifest.js");
  const m = buildManifest();
  const files = jsonFiles(DIRS[1]).map((f) => path.basename(f)).sort();
  assert.deepEqual(m.recipes.map((r) => r.file).sort(), files);
  for (const r of m.recipes) assert.equal(r.image, r.file.replace(".wedo.json", ".png"));
  assert.deepEqual(m.templates.map((r) => r.file), ["template/full-template.wedo.json"]);
  assert.ok(m.recipes.every((r) => r.blocks > 0 && r.stacks > 0));
  assert.equal(m.guide, "AGENTS.md");
  for (const r of [...m.recipes, ...m.templates]) {
    assert.ok(r.author, `${r.id} author in manifest`);
    assert.ok(r.source === null || /^https?:\/\//.test(r.source), `${r.id} source in manifest`);
  }
});

test("every recipes program is accepted by the app and follows the block rules", async (t) => {
  const dom = await loadApp({ probe: PROBE });
  t.after(() => dom.window.close());
  const T = dom.window.__t;
  for (const file of DIRS.flatMap(jsonFiles)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(data.format, "wedo-cpe-program", file);
    assert.equal(data.version, 1, file);
    assert.doesNotThrow(() => T.applyProgram(JSON.parse(JSON.stringify(data))), file);
    assert.deepEqual(validateProgram(data, T), [], file);
  }
});

test("the full template uses every block in the tray and every tone note", async (t) => {
  const dom = await loadApp({ probe: PROBE });
  t.after(() => dom.window.close());
  const T = dom.window.__t;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "recipes/template/full-template.wedo.json"), "utf8"));
  const used = new Set();
  const walk = (items) => items.forEach((it) => {
    if (it.key) used.add(it.key);
    if (it.t === "r") used.add("RepeatBlock");
    if (it.input) used.add(it.input);
    if (it.children) walk(it.children);
  });
  data.stacks.forEach((st) => walk(st.items));
  const all = Array.from(T.ORDER).flatMap(([, blocks]) => Array.from(blocks).map(([k]) => k));
  assert.deepEqual(all.filter((k) => !used.has(k)), [], "blocks missing from the template");
  const notes = new Set();
  JSON.stringify(data, (k, v) => { if (k === "note") notes.add(v); return v; });
  assert.deepEqual(NOTES.filter((n) => !notes.has(n)), [], "notes missing from the template");
});

test("the template documents the blocks the tray lists (doc names every key)", async (t) => {
  const dom = await loadApp({ probe: PROBE });
  t.after(() => dom.window.close());
  const doc = fs.readFileSync(path.join(ROOT, "recipes/AGENTS.md"), "utf8");
  const all = Array.from(dom.window.__t.ORDER).flatMap(([, blocks]) => Array.from(blocks).map(([k]) => k));
  assert.deepEqual(all.filter((k) => !doc.includes("`" + k + "`")), [], "blocks missing from the doc");
});

test("data/recipes.js (embedded for the app's picker) is up to date (run `npm run build:recipes`)", () => {
  const { buildRecipesData } = require("../scripts/build-recipes-manifest.js");
  const onDisk = fs.readFileSync(path.join(ROOT, "data/recipes.js"), "utf8");
  assert.equal(onDisk, buildRecipesData());
});
