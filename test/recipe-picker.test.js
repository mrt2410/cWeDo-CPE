const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, wait } = require("./helpers.js");

async function setup(t) {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  const open = () => {
    doc.getElementById("openbtn").click();
    doc.getElementById("openfromrecipe").click();
  };
  const rows = () => [...doc.querySelectorAll("#rplist .rprow")];
  const recipes = () => dom.window.WEDO_DATA.recipes;
  return { dom, doc, window: dom.window, open, rows, recipes };
}
const isOpen = (doc) => doc.getElementById("recipepick").classList.contains("open");

test("Open > Recipe opens the picker with one row per embedded recipe and the first one selected", async (t) => {
  const { doc, open, rows, recipes } = await setup(t);
  assert.ok(recipes().length >= 40);

  open();

  assert.equal(isOpen(doc), true);
  assert.equal(rows().length, recipes().length);
  assert.equal(rows()[0].classList.contains("sel"), true);
  assert.equal(doc.getElementById("rptitle").textContent, recipes()[0].title);
});

test("selecting a row shows its preview, description, author and hardware", async (t) => {
  const { doc, open, rows, recipes } = await setup(t);
  open();
  const i = recipes().findIndex((r) => r.needs.length > 0);
  const r = recipes()[i];

  rows()[i].click();

  assert.equal(rows()[i].classList.contains("sel"), true);
  assert.equal(doc.querySelectorAll("#rplist .rprow.sel").length, 1);
  assert.equal(doc.getElementById("rptitle").textContent, r.title);
  assert.equal(doc.getElementById("rpdesc").textContent, r.description);
  assert.match(doc.getElementById("rpby").textContent, new RegExp(r.author.slice(0, 10)));
  assert.match(doc.getElementById("rpneeds").textContent, new RegExp(r.needs[0], "i"));
  assert.match(doc.getElementById("rpimg").getAttribute("src"), /^recipes\/.+\.png$/);
});

test("search filters the list by title, tag and description", async (t) => {
  const { doc, window, open, rows, recipes } = await setup(t);
  open();
  const q = doc.getElementById("rpsearch");
  const r = recipes()[0];

  q.value = r.title.toUpperCase();
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.ok(rows().length >= 1 && rows().length < recipes().length);
  assert.ok(rows().some((row) => row.textContent.includes(r.title)));

  q.value = "zzzz-no-such-recipe";
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(rows().length, 0);
  assert.notEqual(doc.getElementById("rpempty").hidden, true);
});

test("'Open recipe' loads the selected program onto the board and closes the picker", async (t) => {
  const { doc, window, open, rows, recipes } = await setup(t);
  open();
  const i = 1;
  rows()[i].click();

  doc.getElementById("rpopen").click();
  await wait(50);

  assert.equal(isOpen(doc), false);
  assert.ok(doc.querySelectorAll("#sheet .blk").length > 0);
  assert.match(doc.getElementById("banner").textContent, new RegExp(recipes()[i].title));
});

test("opening a recipe twice does not mutate the embedded copy", async (t) => {
  const { doc, open, rows, recipes } = await setup(t);
  const before = JSON.stringify(recipes()[0].program);
  for (let n = 0; n < 2; n++) {
    open();
    doc.getElementById("rpopen").click();
    await wait(20);
  }
  assert.equal(JSON.stringify(recipes()[0].program), before);
});

test("Cancel and Escape close the picker without touching the board", async (t) => {
  const { doc, window, open } = await setup(t);
  const before = doc.querySelectorAll("#sheet .blk").length;

  open();
  doc.getElementById("rpcancel").click();
  assert.equal(isOpen(doc), false);

  open();
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(isOpen(doc), false);
  assert.equal(doc.querySelectorAll("#sheet .blk").length, before);
});

const chips = (doc) => [...doc.querySelectorAll("#rpfilter button")];
const chip = (doc, name) => chips(doc).find((b) => b.dataset.hw === name);

test("filter buttons list the hardware recipes need (not LEGO model names), most common first", async (t) => {
  const { doc, open, recipes } = await setup(t);
  open();

  const names = chips(doc).map((b) => b.dataset.hw);
  assert.equal(names[0], "Motor");
  assert.ok(names.includes("Distance sensor") && names.includes("Tilt sensor"));
  assert.ok(names.every((n) => !/ model$/.test(n)));
  assert.ok(chips(doc).every((b) => b.getAttribute("aria-pressed") === "false"));
});

test("clicking a hardware button lists only recipes that need it; clicking again clears it", async (t) => {
  const { doc, open, rows, recipes } = await setup(t);
  open();
  const withTilt = recipes().filter((r) => r.needs.includes("Tilt sensor")).length;
  assert.ok(withTilt > 0 && withTilt < recipes().length);

  chip(doc, "Tilt sensor").click();
  assert.equal(rows().length, withTilt);
  assert.equal(chip(doc, "Tilt sensor").getAttribute("aria-pressed"), "true");
  assert.equal(doc.getElementById("rptitle").textContent.length > 0, true);

  chip(doc, "Tilt sensor").click();
  assert.equal(rows().length, recipes().length);
  assert.equal(chip(doc, "Tilt sensor").getAttribute("aria-pressed"), "false");
});

test("several hardware buttons narrow the list (recipe must need all), and combine with search", async (t) => {
  const { doc, window, open, rows, recipes } = await setup(t);
  open();
  const both = recipes().filter((r) => r.needs.includes("Motor") && r.needs.includes("Distance sensor"));

  chip(doc, "Motor").click();
  chip(doc, "Distance sensor").click();
  assert.equal(rows().length, both.length);

  const q = doc.getElementById("rpsearch");
  q.value = "zzzz-no-such-recipe";
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(rows().length, 0);
});

test("filters reset each time the picker opens", async (t) => {
  const { doc, open, rows, recipes } = await setup(t);
  open();
  chip(doc, "Tilt sensor").click();
  doc.getElementById("rpcancel").click();

  open();

  assert.equal(chip(doc, "Tilt sensor").getAttribute("aria-pressed"), "false");
  assert.equal(rows().length, recipes().length);
});
