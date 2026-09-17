const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("blockEl renders a CSS fallback block for a custom-registered key", async () => {
  const dom = await loadApp();
  const { window } = dom;
  window.eval(`registerCustomBlock('TestCustomBlock',{label:'Test',group:'Motor'});`);
  const el = window.eval(`blockEl('TestCustomBlock', 1, null)`);
  assert.equal(el.classList.contains("custom-blk"), true);
  assert.equal(el.querySelector(".custom-label").textContent, "Test");
  assert.equal(el.querySelector("img"), null);
});

test("blockEl still renders a real sprite block with an <img>", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const el = window.eval(`blockEl('MotorOffBlock', 1, null)`);
  assert.equal(el.classList.contains("custom-blk"), false);
  assert.notEqual(el.querySelector("img"), null);
});
