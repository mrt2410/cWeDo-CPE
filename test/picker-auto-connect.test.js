const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// Chrome's own picker: after the user picks a hub from the Refresh button's
// requestDevice() dialog, the app should connect straight away, without the
// user also clicking the hub's row in the Choose Smarthub list.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fakePickedDevice() {
  const dev = { id: "picked-1", name: "LEGO Smarthub", addEventListener() {},
    gatt: { connected: false, connects: 0, disconnects: 0,
      async connect() { this.connects++; return { getPrimaryService: async () => { throw new Error("stop here"); } }; },
      disconnect() { this.disconnects++; } } };
  return dev;
}

test("picking a hub from Chrome's picker connects without a second click on the list", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  const dev = fakePickedDevice();
  window.navigator.bluetooth = { requestDevice: async () => dev };
  window.document.getElementById("refresh").click();
  await wait(50);
  assert.equal(dev.gatt.connects, 1, "connect attempted right after the picker");
});
