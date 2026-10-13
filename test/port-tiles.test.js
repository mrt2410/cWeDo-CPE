const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// Packets copied from a real hub's debug log (port 1 each time).
const DISTANCE = [1, 1, 0, 35, 0, 0, 0, 16, 0, 0, 0, 16];
const TILT = [1, 1, 0, 34, 0, 0, 0, 16, 0, 0, 0, 16];
const MOTOR = [1, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0];
const EMPTY = [1, 0];

const fire = (window, bytes) =>
  window.onPortEvent({ target: { value: new DataView(new Uint8Array(bytes).buffer) } });
const tile = (window, n) => window.document.querySelector('#hubports [data-port="' + n + '"]');

test("port tiles are empty for both ports until something is attached", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  window.renderPorts();
  for (const n of [1, 2]) {
    assert.equal(tile(window, n).dataset.device, "empty");
    assert.match(tile(window, n).textContent, new RegExp(String(n)));
  }
});

test("attaching each device type shows its icon on that port, detach empties it", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  for (const [pkt, dev] of [[DISTANCE, "distance"], [TILT, "tilt"], [MOTOR, "motor"]]) {
    fire(window, pkt);
    assert.equal(tile(window, 1).dataset.device, dev);
    const img = tile(window, 1).querySelector("img");
    assert.ok(img, dev + " tile shows a block sprite");
    assert.match(img.src, /^data:image\/png/);
    assert.equal(tile(window, 2).dataset.device, "empty");
    fire(window, EMPTY);
    assert.equal(tile(window, 1).dataset.device, "empty");
  }
});

test("each device reuses the matching existing block sprite", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  const S = window.WEDO_DATA.bundle.sprites;
  for (const [pkt, key] of [[MOTOR, "MotorPowerBlock"], [TILT, "AnyTilt"], [DISTANCE, "AnyDistanceChange"]]) {
    fire(window, pkt);
    assert.equal(tile(window, 1).querySelector("img").src, S[key].d);
    fire(window, EMPTY);
  }
});

test("a duplicate attach event is harmless and port 2 is tracked independently", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  fire(window, TILT);
  fire(window, TILT);
  fire(window, [2, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0]);
  assert.equal(tile(window, 1).dataset.device, "tilt");
  assert.equal(tile(window, 2).dataset.device, "motor");
});

test("an unrecognised device shows a generic icon; clearSensors empties the tiles", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  fire(window, [2, 1, 0, 99, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(tile(window, 2).dataset.device, "unknown");
  assert.ok(tile(window, 2).querySelector("svg"));
  fire(window, MOTOR);
  window.clearSensors();
  assert.equal(tile(window, 1).dataset.device, "empty");
  assert.equal(tile(window, 2).dataset.device, "empty");
});
