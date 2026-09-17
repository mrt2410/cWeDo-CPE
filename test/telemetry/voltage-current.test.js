const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

// Literal GATT UUIDs from js/app.js (same convention as test/telemetry/button-battery.test.js
// hardcoding C_BUTTON) — not exposed on window, so hardcoded here rather than probed out.
const C_INPUT = '00001563-1212-efde-1523-785feabcd123';
const C_SENSOR = '00001560-1212-efde-1523-785feabcd123';

const VOLTAGE_PORT = 4, CURRENT_PORT = 3;   /* unverified, mirrors js/telemetry/voltage-current.js */
const DEV_VOLTAGE = 20, DEV_CURRENT = 21;

/** Matches core.js's inputFormat(port,type,mode,unit) byte layout exactly. */
function inputFormat(port, type, mode, unit) {
  return [0x01, 0x02, port, type, mode, 0x01, 0x00, 0x00, 0x00, unit, 0x01];
}

/** Builds a fake characteristicvaluechanged event carrying a buffer in the shape
 * js/telemetry/voltage-current.js's listener expects: byte[1] = port, bytes[2..5] =
 * a little-endian float32 reading (DataView.getFloat32(2,true)). */
function fakeSensorEvent(port, reading) {
  const buf = new ArrayBuffer(6);
  const dv = new DataView(buf);
  dv.setUint8(1, port);
  dv.setFloat32(2, reading, true);
  return { target: { value: { buffer: buf } } };
}

test("wireVoltageCurrent configures both ports and stores readings from notifications", async (t) => {
  const dom = await loadApp({
    probe: "window.Telemetry = Telemetry;"
  });
  t.after(() => dom.window.close());

  const writes = [];
  let sensorListener = null;
  const fakeChar = (uuid) => ({
    uuid,
    writeValue: (d) => { writes.push([uuid, Array.from(new Uint8Array(d))]); return Promise.resolve(); },
    startNotifications: () => Promise.resolve(),
    addEventListener: (event, cb) => {
      if (uuid === C_SENSOR && event === 'characteristicvaluechanged') sensorListener = cb;
    },
  });
  const io = { getCharacteristic: (u) => Promise.resolve(fakeChar(u)) };
  const h = {};

  await dom.window.Telemetry.wireVoltageCurrent(h, io);

  // --- configure writes: exact byte content, not just a count, so a
  // VOLTAGE_PORT/CURRENT_PORT (or device-type) swap would be caught. ---
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], [C_INPUT, inputFormat(VOLTAGE_PORT, DEV_VOLTAGE, 0, 2)]);
  assert.deepEqual(writes[1], [C_INPUT, inputFormat(CURRENT_PORT, DEV_CURRENT, 0, 2)]);

  // --- notification half: simulate real characteristicvaluechanged events and
  // verify the port-byte parsing + h.voltageMv/h.currentMa assignment. ---
  assert.ok(sensorListener, "a characteristicvaluechanged listener should have been registered on C_SENSOR");

  sensorListener(fakeSensorEvent(VOLTAGE_PORT, 12150.5));
  assert.equal(h.voltageMv, 12150.5);
  assert.equal(h.currentMa, undefined);

  sensorListener(fakeSensorEvent(CURRENT_PORT, 340.25));
  assert.equal(h.currentMa, 340.25);
  assert.equal(h.voltageMv, 12150.5, "an unrelated current reading should not disturb voltageMv");
});
