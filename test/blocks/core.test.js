// Covers js/blocks/core.js: the pure classification/data helpers, the
// execution engine's non-sensor building blocks, and the shared sensor bus's
// port dispatch (onSensorValue). The block-running side (execBlock/runStack/
// execRepeat) is exercised through the per-device suites instead, since what
// it does is delegate to Motor/Display/RgbLight/etc.
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

// ---------------------------------------------------------------------------
// onSensorValue's port dispatch. The hub reports the port in byte 1, but some
// write-ups put it in byte 0, so there is a fallback to v[0] when v[1] matches
// no attached sensor. js/telemetry/voltage-current.js adds a *second* listener
// to the same characteristic, which means voltage/current notifications now
// also reach onSensorValue — and their ports (4 and 3) never match an attached
// tilt/distance sensor, so without an explicit guard they hit that fallback and
// a raw millivolt float can be handed to Tilt.onValue as a direction code.
//
// Tilt/Motion are top-level `const` namespace objects; `probe` hands the real
// ones to the test (see the note above), and their methods are replaced by
// mutating the object — reassigning the binding from a later eval() wouldn't
// reach the copy core.js actually closes over.

/** Builds a characteristicvaluechanged event in the shape onSensorValue parses:
 * byte 0 and byte 1 are both candidate port bytes, bytes 2..5 a LE float32. */
function fakeSensorEvent(byte0, byte1, reading) {
  const buf = new ArrayBuffer(6);
  const dv = new DataView(buf);
  dv.setUint8(0, byte0);
  dv.setUint8(1, byte1);
  dv.setFloat32(2, reading, true);
  return { target: { value: { buffer: buf } } };
}

test("onSensorValue ignores voltage/current notifications instead of guessing a sensor port", async (t) => {
  const dom = await loadApp({ probe: "window.__Tilt = Tilt; window.__Motion = Motion;" });
  t.after(() => dom.window.close());
  const { window } = dom;

  window.__Tilt.state.port = 1;
  window.__Motion.state.port = 2;
  const tiltValues = [], motionValues = [];
  window.__Tilt.onValue = (v) => tiltValues.push(v);
  window.__Motion.onValue = (v) => motionValues.push(v);

  // a voltage reading (port 4 in byte 1) whose byte 0 happens to be the tilt port
  window.onSensorValue(fakeSensorEvent(1, 4, 12150.5));
  assert.deepEqual(tiltValues, [],
    "a voltage notification must not be parsed as a tilt direction");

  // a current reading (port 3 in byte 1) whose byte 0 happens to be the distance port
  window.onSensorValue(fakeSensorEvent(2, 3, 340.25));
  assert.deepEqual(motionValues, [],
    "a current notification must not be parsed as a distance reading");

  // sanity: a genuine tilt notification still gets through
  window.onSensorValue(fakeSensorEvent(0, 1, 3));
  assert.deepEqual(tiltValues, [3]);
  assert.deepEqual(motionValues, []);
});
