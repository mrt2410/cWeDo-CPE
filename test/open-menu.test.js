const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

async function setup(t) {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  let pickerClicks = 0;
  document.getElementById("openfile").click = () => { pickerClicks++; };
  return { dom, document, window: dom.window, picks: () => pickerClicks };
}
const isOpen = (document) => document.getElementById("openmenu").classList.contains("open");

test("Open button shows a menu instead of going straight to the file picker", async (t) => {
  const { document, picks } = await setup(t);
  const btn = document.getElementById("openbtn");

  btn.click();

  assert.equal(isOpen(document), true);
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.equal(picks(), 0);
  const items = [...document.querySelectorAll("#openmenu [role=menuitem]")].map((e) => e.textContent.trim());
  assert.deepEqual(items, ["Device", "Recipe"]);
  assert.equal(btn.title, "Open");
});

test("'Device' closes the menu and runs the existing Open flow", async (t) => {
  const { document, picks } = await setup(t);
  document.getElementById("openbtn").click();

  document.getElementById("openfromdevice").click();

  assert.equal(isOpen(document), false);
  assert.equal(document.getElementById("openbtn").getAttribute("aria-expanded"), "false");
  assert.equal(picks(), 1);
});

test("'Recipe' closes the menu (picker comes in the next step)", async (t) => {
  const { document, picks } = await setup(t);
  document.getElementById("openbtn").click();

  document.getElementById("openfromrecipe").click();

  assert.equal(isOpen(document), false);
  assert.equal(picks(), 0);
});

test("Escape and outside click close the menu; the button toggles it", async (t) => {
  const { document, window } = await setup(t);
  const btn = document.getElementById("openbtn");

  btn.click();
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(isOpen(document), false);

  btn.click();
  document.body.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(isOpen(document), false);

  btn.click();
  btn.click();
  assert.equal(isOpen(document), false);
});
