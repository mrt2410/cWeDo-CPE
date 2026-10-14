/* Scans recipes/ and writes recipes/manifest.json — what the recipes page
   (recipes/index.html) uses for auto-discovery, because a static site such as
   GitHub Pages cannot list a directory — and data/recipes.js, the same recipes
   with their programs embedded so the app's Open > Recipe picker works offline
   (standalone build, Android, file://). Run via `npm run build:recipes`;
   test/recipes.test.js fails if either committed file is stale. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "recipes");
const EXT = ".wedo.json";

function countBlocks(items) {
  let n = 0;
  for (const it of items) {
    if (it.t === "b" || it.t === "r") n++;
    if (it.children) n += countBlocks(it.children);
  }
  return n;
}

function entry(dir, file) {
  const rel = path.posix.join(dir, file);
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  const m = data.meta;
  if (!m || !m.title || !m.description || !m.author || !Array.isArray(m.needs) || !Array.isArray(m.tags))
    throw new Error(`${rel}: needs meta {title, description, author, needs[], tags[]} (source is optional)`);
  const id = file.slice(0, -EXT.length);
  const png = id + ".png";
  return {
    id,
    title: m.title,
    description: m.description,
    author: m.author,
    source: m.source || null,
    needs: m.needs,
    tags: m.tags,
    file: rel,
    image: fs.existsSync(path.join(ROOT, dir, png)) ? path.posix.join(dir, png) : null,
    stacks: data.stacks.length,
    blocks: data.stacks.reduce((n, s) => n + countBlocks(s.items), 0),
  };
}

const list = (dir) => {
  const abs = path.join(ROOT, dir);
  return fs.existsSync(abs)
    ? fs.readdirSync(abs).filter((f) => f.endsWith(EXT)).sort().map((f) => entry(dir, f))
    : [];
};

function buildManifest() {
  return { guide: "AGENTS.md", recipes: list("."), templates: list("template") };
}

function buildRecipesData() {
  const recipes = list(".").map((e) => ({
    ...e,
    image: e.image && "recipes/" + e.image,
    program: JSON.parse(fs.readFileSync(path.join(ROOT, e.file), "utf8")),
  }));
  return "window.WEDO_DATA=window.WEDO_DATA||{};\nWEDO_DATA.recipes=" + JSON.stringify(recipes) + ";\n";
}

if (require.main === module) {
  const m = buildManifest();
  fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  fs.writeFileSync(path.join(ROOT, "..", "data", "recipes.js"), buildRecipesData());
  console.log(`recipes/manifest.json: ${m.recipes.length} recipes, ${m.templates.length} templates`);
}

module.exports = { buildManifest, buildRecipesData };
