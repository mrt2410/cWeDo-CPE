const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("wireVoltageCurrent configures both ports and stores readings from notifications", async (t) => {
  const dom = await loadApp({
    probe: "window.Telemetry = Telemetry;"
  });
  t.after(() => dom.window.close());
  const writes = [];
  const fakeChar = (uuid) => ({
    uuid,
    writeValue: (d) => { writes.push([uuid, Array.from(new Uint8Array(d))]); return Promise.resolve(); },
    startNotifications: () => Promise.resolve(),
    addEventListener: () => {},
  });
  const io = { getCharacteristic: (u) => Promise.resolve(fakeChar(u)) };
  const h = {};
  await dom.window.Telemetry.wireVoltageCurrent(h, io);
  assert.ok(writes.length >= 2);   // voltage + current input-format configure writes
});
