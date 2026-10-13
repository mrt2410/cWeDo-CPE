const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// Real GATT hangs/drops need a real hub, so these drive connect() with a fake
// BluetoothDevice whose gatt.connect() hangs or whose service lookup fails.

function fakeDevice(connect) {
  return { id: "d1", name: "cWeDo CPE", addEventListener() {},
    gatt: { connected: false, disconnects: 0, connect, disconnect() { this.disconnects++; } } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("a gatt.connect() that never settles times out and frees the UI", async (t) => {
  const dom = await loadApp({ probe: "connectTimeoutMs=50;" });
  t.after(() => dom.window.close());
  const { window } = dom.window;
  const dev = fakeDevice(() => new Promise(() => {}));
  window.connect(dev);
  await wait(20);
  assert.equal(window.document.getElementById("refresh").disabled, true, "busy while connecting");
  await wait(200);
  assert.equal(window.document.getElementById("refresh").disabled, false, "UI freed after timeout");
  assert.match(window.document.getElementById("hint").textContent, /timed out/i);
  assert.equal(dev.gatt.disconnects, 1, "pending attempt cancelled");
});

test("a failed connect tears the GATT link down so the next attempt starts clean", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  const dev = fakeDevice(async () => ({
    getPrimaryService: async () => { throw new Error("GATT Server is disconnected."); } }));
  await window.connect(dev);
  assert.equal(dev.gatt.disconnects, 1);
  assert.equal(window.document.getElementById("refresh").disabled, false);
});
