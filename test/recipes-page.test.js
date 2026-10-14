const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = path.resolve(__dirname, "../recipes");
const read = (rel) => fs.readFileSync(path.join(DIR, rel), "utf8");

/** Loads recipes/index.html the way a browser would, serving fetch() from the
 *  real recipes/ directory. `hash` lets a test start from a deep link. */
async function loadPage({ hash = "", manifest, manifestOverride } = {}) {
  const copied = [];
  const dom = new JSDOM(read("index.html"), {
    url: "http://localhost/recipes/" + hash,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async (url) => {
        const rel = String(url).replace(/^\.\//, "");
        if (manifest === null && rel === "manifest.json") return { ok: false, status: 404 };
        const file = path.join(DIR, rel);
        if (manifestOverride && rel === "manifest.json") {
          const t = JSON.stringify(manifestOverride);
          return { ok: true, status: 200, text: async () => t, json: async () => manifestOverride };
        }
        if (!fs.existsSync(file)) return { ok: false, status: 404 };
        const text = fs.readFileSync(file, "utf8");
        return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
      };
      window.navigator.clipboard = { writeText: async (t) => { copied.push(t); } };
      window.HTMLElement.prototype.scrollIntoView = () => {};
    },
  });
  await dom.window.__recipesReady;
  return { dom, document: dom.window.document, copied };
}

const manifest = () => JSON.parse(read("manifest.json"));

test("the page builds a card and a ToC link for every discovered recipe and template", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  const m = manifest();
  const entries = [...m.recipes, ...m.templates];
  assert.equal(document.querySelectorAll("article.card").length, entries.length);
  for (const e of entries) {
    assert.ok(document.getElementById(e.id), `card #${e.id}`);
    assert.ok(document.querySelector(`#toc a[href="#${e.id}"]`), `toc link #${e.id}`);
  }
  assert.match(document.querySelector("header h1").textContent, /Recipes/);
});

test("recipe cards show a preview picture; the template card has none", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  for (const r of manifest().recipes) {
    const img = document.querySelector(`#${r.id} img.preview`);
    assert.ok(img, `${r.id} preview`);
    assert.equal(img.getAttribute("src"), r.image);
  }
  for (const r of manifest().templates) assert.equal(document.querySelector(`#${r.id} img.preview`), null);
});

test("clicking View JSON opens the code in a viewer, exactly as in the file", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  const r = manifest().recipes[0];
  const viewer = document.getElementById("viewer");
  assert.equal(viewer.hidden, true);
  document.querySelector(`#${r.id} [data-action="view"]`).click();
  await dom.window.__viewerLoaded;
  assert.equal(viewer.hidden, false);
  assert.equal(document.getElementById("viewer-code").textContent, read(r.file));
  assert.match(document.getElementById("viewer-title").textContent, new RegExp(r.file));
});

test("the viewer's Copy button puts the exact file text on the clipboard", async (t) => {
  const { dom, document, copied } = await loadPage();
  t.after(() => dom.window.close());
  const r = manifest().recipes[0];
  document.querySelector(`#${r.id} [data-action="view"]`).click();
  await dom.window.__viewerLoaded;
  document.getElementById("viewer-copy").click();
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(copied, [read(r.file)]);
});

test("Copy on a card copies the file without opening the viewer", async (t) => {
  const { dom, document, copied } = await loadPage();
  t.after(() => dom.window.close());
  const r = manifest().recipes[1];
  document.querySelector(`#${r.id} [data-action="copy"]`).click();
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(copied, [read(r.file)]);
  assert.equal(document.getElementById("viewer").hidden, true);
});

test("Escape closes the viewer", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  document.querySelector(`#${manifest().recipes[0].id} [data-action="view"]`).click();
  await dom.window.__viewerLoaded;
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(document.getElementById("viewer").hidden, true);
});

test("a #view=<id> deep link opens that recipe's JSON on load", async (t) => {
  const r = manifest().recipes[2];
  const { dom, document } = await loadPage({ hash: "#view=" + r.id });
  t.after(() => dom.window.close());
  await dom.window.__viewerLoaded;
  assert.equal(document.getElementById("viewer").hidden, false);
  assert.equal(document.getElementById("viewer-code").textContent, read(r.file));
});

test("search filters the cards, and clearing it restores them", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  const search = document.getElementById("search");
  search.value = "ping-pong";
  search.dispatchEvent(new dom.window.Event("input"));
  const visible = [...document.querySelectorAll("article.card")].filter((c) => !c.hidden);
  assert.deepEqual(visible.map((c) => c.id), ["message-ping-pong"]);
  search.value = "";
  search.dispatchEvent(new dom.window.Event("input"));
  assert.equal([...document.querySelectorAll("article.card")].filter((c) => c.hidden).length, 0);
});

test("a tag chip filters to recipes with that tag", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  const chip = [...document.querySelectorAll(".chip")].find((c) => c.dataset.tag === "motor");
  assert.ok(chip, "motor chip");
  chip.click();
  const expected = [...manifest().recipes, ...manifest().templates].filter((e) => e.tags.includes("motor")).map((e) => e.id);
  const visible = [...document.querySelectorAll("article.card")].filter((c) => !c.hidden).map((c) => c.id);
  assert.deepEqual(visible.sort(), expected.sort());
});

test("the AI guide can be viewed and copied from the header", async (t) => {
  const { dom, document, copied } = await loadPage();
  t.after(() => dom.window.close());
  document.getElementById("guide-copy").click();
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(copied, [read("AGENTS.md")]);
  document.getElementById("guide-view").click();
  await dom.window.__viewerLoaded;
  assert.equal(document.getElementById("viewer-code").textContent, read("AGENTS.md"));
});

test("an unreachable manifest shows a helpful message instead of a blank page", async (t) => {
  const { dom, document } = await loadPage({ manifest: null });
  t.after(() => dom.window.close());
  assert.match(document.getElementById("status").textContent, /serve|server|manifest/i);
  assert.equal(document.querySelectorAll("article.card").length, 0);
});

test("every card credits its author", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  for (const e of [...manifest().recipes, ...manifest().templates]) {
    const by = document.querySelector(`#${e.id} .byline`);
    assert.ok(by, `${e.id} byline`);
    assert.ok(by.textContent.includes(e.author), `${e.id} names ${e.author}`);
  }
});

test("a recipe with a source shows an attribution link to it; one without shows none", async (t) => {
  const m = manifest();
  const withSource = { ...m.recipes[0], id: "from-lego", author: "LEGO Education", source: "https://education.lego.com/example" };
  const { dom, document } = await loadPage({ manifestOverride: { ...m, recipes: [withSource, m.recipes[1]] } });
  t.after(() => dom.window.close());
  const link = document.querySelector("#from-lego .byline a");
  assert.ok(link, "source link");
  assert.equal(link.getAttribute("href"), "https://education.lego.com/example");
  assert.match(document.querySelector("#from-lego .byline").textContent, /LEGO Education/);
  assert.equal(document.querySelector(`#${m.recipes[1].id} .byline a`), null);
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
});

test("the author is searchable", async (t) => {
  const m = manifest();
  const lego = { ...m.recipes[0], id: "from-lego", title: "Zzz", author: "LEGO Education", source: null };
  const { dom, document } = await loadPage({ manifestOverride: { ...m, recipes: [lego, m.recipes[1]] } });
  t.after(() => dom.window.close());
  const search = document.getElementById("search");
  search.value = "lego";
  search.dispatchEvent(new dom.window.Event("input"));
  assert.deepEqual([...document.querySelectorAll("article.card")].filter((c) => !c.hidden).map((c) => c.id), ["from-lego"]);
});

test("a ToC heading disappears when every recipe under it is filtered out", async (t) => {
  const { dom, document } = await loadPage();
  t.after(() => dom.window.close());
  const search = document.getElementById("search");
  search.value = "ping-pong";
  search.dispatchEvent(new dom.window.Event("input"));
  const heads = [...document.querySelectorAll("#toc h2")];
  assert.deepEqual(heads.filter((h) => h.style.display !== "none").map((h) => h.textContent), ["Recipes"]);
});
