const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// The real GATT write needs a real hub, so these test the confirm/write/disconnect
// handling against a fake characteristic and device.

function fakeHub({ writeThrows = false, stillConnected = false } = {}) {
  const char = {
    writes: [],
    async writeValue(bytes) {
      this.writes.push(Array.from(bytes));
      if (writeThrows) throw new Error("GATT Server is disconnected.");
    },
  };
  return { offChar: char, device: { gatt: { connected: stillConnected } }, char };
}

test("writePowerOff writes a single 0x00 byte", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  const h = fakeHub();
  await window.writePowerOff(h.char);
  assert.deepEqual(h.char.writes, [[0]]);
});

test("powerOffHub does nothing when the user cancels the confirmation", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  window.confirm = () => false;
  const h = fakeHub();
  assert.equal(await window.powerOffHub(h), false);
  assert.deepEqual(h.char.writes, []);
});

test("powerOffHub sends the command after confirmation", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  window.confirm = () => true;
  const h = fakeHub();
  assert.equal(await window.powerOffHub(h), true);
  assert.deepEqual(h.char.writes, [[0]]);
});

test("powerOffHub treats a write error as success when the hub dropped the link", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  window.confirm = () => true;
  assert.equal(await window.powerOffHub(fakeHub({ writeThrows: true, stillConnected: false })), true);
});

test("powerOffHub reports failure when the write errors and the hub is still connected", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  window.confirm = () => true;
  assert.equal(await window.powerOffHub(fakeHub({ writeThrows: true, stillConnected: true })), false);
});
