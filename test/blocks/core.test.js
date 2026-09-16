// Covers the pieces of js/blocks/core.js that are usable in isolation today —
// pure classification/data helpers and the execution engine's non-sensor
// building blocks. execBlock/runStack/onPortEvent/onSensorValue/
// sensorCondition/etc. all need Tilt/Motion/Motor to exist and are left for
// the full suite once those land (Task 9) — see the module comment in
// js/blocks/core.js and docs/superpowers/plans/2026-09-16-wedo2-io-blocks.md.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

// isNumeric and prettyKey are one-liner arrow functions (`const isNumeric =
// k => ...`), not `function` declarations, so — unlike canAccept/mkItem/etc.
// — they never become `window` properties, even under the single combined
// eval() loadApp() uses (see the comment there): a `const` only lives in the
// lexical scope of the code that declared it. `probe` runs a tiny snippet in
// that exact same scope right after the app's own scripts, so it can reach
// the real bindings and hand them to the test via window, without
// re-implementing their logic here.
test("isNumeric: true for number-shaped inputs, false for a condition", async (t) => {
  const dom = await loadApp({ probe: "window.__isNumeric = isNumeric;" });
  t.after(() => dom.window.close());

  assert.equal(dom.window.__isNumeric("NumberInput"), true);
  assert.equal(dom.window.__isNumeric("TiltUp"), false);
});

test("prettyKey: splits a PascalCase block key into lowercase words", async (t) => {
  const dom = await loadApp({ probe: "window.__prettyKey = prettyKey;" });
  t.after(() => dom.window.close());

  assert.equal(dom.window.__prettyKey("TiltUp"), "tilt up");
  assert.equal(dom.window.__prettyKey("AnyDistanceChange"), "any distance change");
});

test("canAccept: Repeat/Wait For take a time or a condition; Motor Power takes only numbers", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { canAccept } = dom.window;

  assert.equal(canAccept("RepeatBlock", "NumberInput"), true);
  assert.equal(canAccept("RepeatBlock", "TiltUp"), true); // a condition, not a number
  assert.equal(canAccept("MotorPowerBlock", "TextInput"), false);
});

test("mkItem('RepeatBlock') starts empty with no input and no children", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());

  // mkItem's return value is a plain object from inside the jsdom realm, so a
  // structural assert.deepEqual against a same-shaped literal from this
  // (different) Node realm fails on prototype identity, not content — compare
  // fields individually instead, as the other test files do for app-internal
  // objects.
  const item = dom.window.mkItem("RepeatBlock");
  assert.equal(item.t, "r");
  assert.equal(item.input, null);
  assert.equal(item.children.length, 0);
});

test("mkItem seats a block's DEFAULT_INPUT automatically", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());

  const item = dom.window.mkItem("MotorPowerBlock");
  assert.equal(item.t, "b");
  assert.equal(item.key, "MotorPowerBlock");
  assert.equal(item.input, "NumberInput");
  assert.equal(item.inputValue, "5");
});

test("mkItem leaves a block with no DEFAULT_INPUT entry unattached", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());

  const item = dom.window.mkItem("MotorOffBlock");
  assert.equal(item.t, "b");
  assert.equal(item.key, "MotorOffBlock");
  assert.equal(item.input, null);
});

test("registerCustomBlock adds a synthetic sprite and a tray entry in its group", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document } = dom.window;

  dom.window.registerCustomBlock("TestBlock", { label: "Test Block", group: "Motor" });

  // S/ORDER are core.js-internal consts, not window properties (see the note
  // in test/helpers.js about eval() scoping) — so the effect is checked the
  // same way the app's other tests check internal state: through the DOM
  // that render()/drawTray() (which do close over S/ORDER) produce.
  const motorTab = [...document.querySelectorAll("#traytabs .tab")].find(b => b.textContent === "Motor");
  assert.ok(motorTab, "a Motor tab should exist");
  motorTab.click(); // sets activeTab and re-renders that tab's palette

  const item = document.querySelector('.pitem[data-key="TestBlock"]');
  assert.ok(item, "the new block should appear in the Motor tray tab");
  assert.equal(item.title, "Test Block");
});

test("registerCustomBlock creates a new tab when the group doesn't exist yet", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document } = dom.window;

  dom.window.registerCustomBlock("BrandNewBlock", { label: "Brand New", group: "Totally New Group" });
  dom.window.drawTray(); // tabs are rebuilt from ORDER on each call, not live-bound

  const tabs = [...document.querySelectorAll("#traytabs .tab")].map(b => b.textContent);
  assert.ok(tabs.includes("Totally New Group"), `expected a new tab, got: ${tabs.join(", ")}`);
});

test("loopCount falls back to DEFAULT_LOOPS (3) when no input is attached", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());

  assert.equal(dom.window.loopCount({ input: null }), 3);
});

test("loopCount reads a plain number input", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());

  const item = { input: "NumberInput", inputValue: "7" };
  assert.equal(dom.window.loopCount(item), 7);
});

test("randomFor returns an integer within the parent block's RAND_RANGE", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());

  for (let i = 0; i < 30; i++) {
    const n = dom.window.randomFor({ t: "b", key: "MotorPowerBlock" });
    assert.equal(Number.isInteger(n), true);
    assert.ok(n >= 1 && n <= 10, `expected 1-10, got ${n}`);
  }
});

test("randomFor uses a Repeat block's own range regardless of its (absent) key", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());

  const n = dom.window.randomFor({ t: "r" });
  assert.equal(Number.isInteger(n), true);
  assert.ok(n >= 1 && n <= 10, `expected 1-10, got ${n}`);
});
