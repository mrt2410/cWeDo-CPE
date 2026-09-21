const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

const HUB_SERVICE = '00001523-1212-efde-1523-785feabcd123';
const C_OUTPUT = '00001565-1212-efde-1523-785feabcd123';
const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL_UUID = '00002a19-0000-1000-8000-00805f9b34fb';

/** A fake BleClient recording every call, standing in for the native plugin —
 * the real native GATT round-trip can only be verified on a device (see
 * docs/android-apk-build.md), but everything this shim itself does with the
 * plugin's return values/callback shapes is covered here. */
function fakeBleClient(overrides) {
  const calls = [];
  const notifyCallbacks = new Map(); // "deviceId|service|char" -> callback
  const disconnectCallbacks = new Map(); // deviceId -> callback
  const client = {
    calls,
    initialize: async () => { calls.push(['initialize']); },
    requestDevice: async (opts) => { calls.push(['requestDevice', opts]); return { deviceId: 'AA:BB', name: 'Smarthub' }; },
    getDevices: async (ids) => { calls.push(['getDevices', ids]); return ids.map(id => ({ deviceId: id, name: 'Remembered' })); },
    connect: async (deviceId, onDisconnect) => {
      calls.push(['connect', deviceId]);
      disconnectCallbacks.set(deviceId, onDisconnect);
    },
    disconnect: async (deviceId) => { calls.push(['disconnect', deviceId]); },
    read: async (deviceId, service, char) => { calls.push(['read', deviceId, service, char]); return new DataView(new ArrayBuffer(1)); },
    write: async (deviceId, service, char, value) => { calls.push(['write', deviceId, service, char, Array.from(new Uint8Array(value.buffer))]); },
    writeWithoutResponse: async (deviceId, service, char, value) => { calls.push(['writeWithoutResponse', deviceId, service, char, Array.from(new Uint8Array(value.buffer))]); },
    startNotifications: async (deviceId, service, char, cb) => {
      calls.push(['startNotifications', deviceId, service, char]);
      notifyCallbacks.set(deviceId + '|' + service + '|' + char, cb);
    },
    requestLEScan: async (opts, cb) => { calls.push(['requestLEScan', opts]); client._scanCallback = cb; },
    stopLEScan: async () => { calls.push(['stopLEScan']); },
    // test helpers, not part of the real BleClient shape
    _fireNotification(deviceId, service, char, dataView) { notifyCallbacks.get(deviceId + '|' + service + '|' + char)(dataView); },
    _fireDisconnect(deviceId) { disconnectCallbacks.get(deviceId)(); },
  };
  return Object.assign(client, overrides);
}

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

/** Objects/arrays the shim itself constructs (it runs inside the jsdom window)
 * are foreign-realm values — structurally identical to a same-looking Node
 * literal, but assert/strict's deepEqual also checks prototype identity, so
 * it reports them as unequal. JSON round-tripping strips that identity;
 * every value normalised with this below is plain, JSON-safe data anyway. */
function plain(x) { return JSON.parse(JSON.stringify(x)); }

/** Every loadApp() starts core.js's setInterval(renderPorts,250) — closing
 * the window (as the project's other tests already do) stops it, so an
 * unclosed dom doesn't keep the process alive after the test run. */
async function loadShim(t) {
  const dom = await loadApp({});
  t.after(() => dom.window.close());
  return dom.window.createCapacitorBluetoothShim;
}

test("requestDevice initializes BleClient and returns a device shim with id/name", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());

  const device = await shim.requestDevice({ filters: [{ services: [HUB_SERVICE] }], optionalServices: ['battery_service'] });

  assert.equal(device.id, 'AA:BB');
  assert.equal(device.name, 'Smarthub');
  assert.deepEqual(ble.calls[0], ['initialize']);
  assert.deepEqual(plain(ble.calls[1]), ['requestDevice', { services: [HUB_SERVICE], optionalServices: [BATTERY_SERVICE_UUID] }]);
});

test("connect() calls BleClient.connect and getPrimaryService resolves mnemonic GATT names", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());
  const device = await shim.requestDevice({ filters: [{ services: [HUB_SERVICE] }] });

  const server = await device.gatt.connect();
  assert.equal(device.gatt.connected, true);
  assert.deepEqual(ble.calls.find(c => c[0] === 'connect'), ['connect', 'AA:BB']);

  const battSvc = await server.getPrimaryService('battery_service');
  const battChar = await battSvc.getCharacteristic('battery_level');
  await battChar.readValue();
  assert.deepEqual(ble.calls.at(-1), ['read', 'AA:BB', BATTERY_SERVICE_UUID, BATTERY_LEVEL_UUID]);
});

test("writeValue/writeValueWithResponse/writeValueWithoutResponse delegate with a correctly-sliced DataView", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());
  const device = await shim.requestDevice({ filters: [{ services: [HUB_SERVICE] }] });
  const server = await device.gatt.connect();
  const svc = await server.getPrimaryService(HUB_SERVICE);
  const out = await svc.getCharacteristic(C_OUTPUT);

  await out.writeValue(new Uint8Array([1, 2, 3]));
  assert.deepEqual(ble.calls.at(-1), ['write', 'AA:BB', HUB_SERVICE, C_OUTPUT, [1, 2, 3]]);

  await out.writeValueWithResponse(new Uint8Array([4, 5]));
  assert.deepEqual(ble.calls.at(-1), ['write', 'AA:BB', HUB_SERVICE, C_OUTPUT, [4, 5]]);

  await out.writeValueWithoutResponse(new Uint8Array([6]));
  assert.deepEqual(ble.calls.at(-1), ['writeWithoutResponse', 'AA:BB', HUB_SERVICE, C_OUTPUT, [6]]);
  assert.equal(out.properties.writeWithoutResponse, true);
});

test("getCharacteristic returns the same shim for a repeated (device,service,char) triple, sharing notifications", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());
  const device = await shim.requestDevice({ filters: [{ services: [HUB_SERVICE] }] });
  const server = await device.gatt.connect();
  const svc = await server.getPrimaryService(HUB_SERVICE);

  const c1 = await svc.getCharacteristic(C_OUTPUT);
  const c2 = await svc.getCharacteristic(C_OUTPUT);
  assert.equal(c1, c2, "must be the identical object so listeners share one subscription");

  const seen1 = [], seen2 = [];
  c1.addEventListener('characteristicvaluechanged', ev => seen1.push(ev.target.value));
  c2.addEventListener('characteristicvaluechanged', ev => seen2.push(ev.target.value));
  await c1.startNotifications();
  await c2.startNotifications(); // must not start a second native subscription

  const startCalls = ble.calls.filter(c => c[0] === 'startNotifications');
  assert.equal(startCalls.length, 1);

  const dv = new DataView(new ArrayBuffer(2));
  ble._fireNotification('AA:BB', HUB_SERVICE, C_OUTPUT, dv);
  assert.equal(seen1.length, 1);
  assert.equal(seen2.length, 1);
  assert.equal(seen1[0], dv);
});

test("addEventListener does not register the same listener twice", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());
  const device = await shim.requestDevice({ filters: [{ services: [HUB_SERVICE] }] });
  const server = await device.gatt.connect();
  const svc = await server.getPrimaryService(HUB_SERVICE);
  const c = await svc.getCharacteristic(C_OUTPUT);

  let fired = 0;
  const listener = () => { fired++; };
  c.addEventListener('characteristicvaluechanged', listener);
  c.addEventListener('characteristicvaluechanged', listener);
  await c.startNotifications();
  ble._fireNotification('AA:BB', HUB_SERVICE, C_OUTPUT, new DataView(new ArrayBuffer(1)));
  assert.equal(fired, 1);
});

test("a native disconnect fires the device's gattserverdisconnected listener and clears gatt.connected", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());
  const device = await shim.requestDevice({ filters: [{ services: [HUB_SERVICE] }] });
  await device.gatt.connect();

  let firedCount = 0;
  device.addEventListener('gattserverdisconnected', () => { firedCount++; });
  ble._fireDisconnect('AA:BB');

  assert.equal(device.gatt.connected, false);
  assert.equal(firedCount, 1);
});

test("device.gatt.disconnect() calls BleClient.disconnect with the device id", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());
  const device = await shim.requestDevice({ filters: [{ services: [HUB_SERVICE] }] });
  await device.gatt.connect();

  device.gatt.disconnect();
  await new Promise(r => setTimeout(r, 0)); // disconnect() is fire-and-forget, matching the real (sync) API
  assert.ok(ble.calls.some(c => c[0] === 'disconnect' && c[1] === 'AA:BB'));
});

test("getDevices() reads the remembered hub id from storage and asks BleClient for it", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage({ 'wedo:lastHub': JSON.stringify({ id: 'AA:BB', name: 'Smarthub' }) }));

  const devices = await shim.getDevices();
  assert.equal(devices.length, 1);
  assert.equal(devices[0].id, 'AA:BB');
  assert.deepEqual(plain(ble.calls.find(c => c[0] === 'getDevices')), ['getDevices', ['AA:BB']]);
});

test("getDevices() returns an empty list when nothing is remembered", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());

  assert.deepEqual(plain(await shim.getDevices()), []);
  assert.ok(!ble.calls.some(c => c[0] === 'getDevices'));
});

test("requestLEScan dispatches advertisementreceived with Map-wrapped manufacturer/service data", async (t) => {
  const create = await loadShim(t);
  const ble = fakeBleClient();
  const shim = create(ble, fakeStorage());

  const seen = [];
  shim.addEventListener('advertisementreceived', ev => seen.push(ev));
  const scanning = await shim.requestLEScan({ filters: [{ services: [HUB_SERVICE] }], keepRepeatedDevices: true });

  assert.deepEqual(plain(ble.calls.find(c => c[0] === 'requestLEScan')[1]), { services: [HUB_SERVICE], allowDuplicates: true });

  const mfrDv = new DataView(new ArrayBuffer(2));
  ble._scanCallback({
    device: { deviceId: 'CC:DD', name: 'Smarthub2' },
    localName: 'Smarthub2',
    rssi: -60,
    manufacturerData: { '97': mfrDv },
    serviceData: {},
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].device.id, 'CC:DD');
  assert.equal(seen[0].name, 'Smarthub2');
  assert.equal(seen[0].rssi, -60);
  // instanceof Map fails cross-realm (jsdom's Map isn't the test file's Map),
  // so check the tag instead of using an identity-based instanceof check.
  assert.equal(Object.prototype.toString.call(seen[0].manufacturerData), '[object Map]');
  assert.equal(seen[0].manufacturerData.get('97'), mfrDv);

  scanning.stop();
  assert.ok(ble.calls.some(c => c[0] === 'stopLEScan'));
});
