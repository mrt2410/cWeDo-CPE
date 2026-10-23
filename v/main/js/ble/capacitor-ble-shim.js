/* ================= Native BLE bridge for the packaged Android app =================
   Android's WebView has no Web Bluetooth implementation at all (neither does
   iOS's WKWebView, nor Safari — see docs/android-apk-build.md), so none of
   the navigator.bluetooth code elsewhere in this app (js/app.js,
   js/blocks/core.js, js/telemetry/*.js) can run inside the packaged APK.

   This file plugs that gap, but ONLY inside the Capacitor-wrapped app — see
   the self-activation check at the bottom, which is false (a no-op) in every
   normal browser, including the desktop/Android Chrome tabs used for regular
   web development, so nothing here changes the existing, already-tested
   Web Bluetooth code path.

   It fakes just enough of the real Web Bluetooth object shape — a device's
   .gatt.connect()/getPrimaryService()/getCharacteristic() chain, and
   characteristics with .readValue()/.writeValue()/.startNotifications()/
   'characteristicvaluechanged' — that none of the existing BLE code needs to
   change. The real work is delegated to @capacitor-community/bluetooth-le's
   BleClient (vendored as a plain global by the Docker Android build, see
   docker/build-android.sh), which talks to Android's native BLE stack.

   UNVERIFIED against real hardware: built and unit-tested here against a
   fake BleClient (test/ble/capacitor-ble-shim.test.js), but the actual
   native GATT round-trip — permission prompts, real characteristic
   discovery, notification delivery — needs a real Android device. */

/* Mnemonic GATT names (as used by js/telemetry/button-battery.js, matching
   Web Bluetooth's own name-to-UUID table) — BleClient only accepts literal
   UUIDs, so these need resolving before being passed through. */
const NATIVE_BLE_GATT_NAMES = {
  battery_service: '0000180f-0000-1000-8000-00805f9b34fb',
  battery_level: '00002a19-0000-1000-8000-00805f9b34fb',
  device_information: '0000180a-0000-1000-8000-00805f9b34fb',
};
const resolveGattName = u => NATIVE_BLE_GATT_NAMES[u] || u;

/* Must match js/app.js's own LAST_HUB_KEY constant — getDevices() below
   needs to read the remembered hub id and there's no shared module system
   between these plain, script-tag-loaded files. */
const NATIVE_BLE_LAST_HUB_KEY = 'wedo:lastHub';

/**
 * Builds a navigator.bluetooth-shaped object backed by a
 * @capacitor-community/bluetooth-le BleClient instance. Kept as a pure
 * factory (no reference to `navigator`/`window` inside) so it can be unit
 * tested with a fake BleClient standing in for the native plugin.
 */
function createCapacitorBluetoothShim(BleClient, storage) {
  let initPromise = null;
  function ensureInit() {
    if (!initPromise) initPromise = BleClient.initialize().catch(e => { initPromise = null; throw e; });
    return initPromise;
  }

  function toDataView(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return new DataView(u.buffer, u.byteOffset, u.byteLength);
  }

  /* One shim object per (deviceId, service, characteristic) triple, so a
     second getCharacteristic() call for the same triple — js/telemetry/
     voltage-current.js does exactly this for the shared sensor
     characteristic — adds a listener to the same subscription instead of
     creating an independent one, matching real Web Bluetooth's behaviour
     (the browser dedupes by UUID under the hood; see that file's own
     comment on this). */
  const charCache = new Map();
  function getCharacteristicShim(deviceId, serviceUUID, charUUID) {
    const key = deviceId + '|' + serviceUUID + '|' + charUUID;
    let c = charCache.get(key);
    if (c) return c;
    const listeners = [];
    let notifying = false;
    c = {
      properties: { writeWithoutResponse: true },
      value: null,
      async readValue() { return BleClient.read(deviceId, serviceUUID, charUUID); },
      async writeValue(bytes) { return BleClient.write(deviceId, serviceUUID, charUUID, toDataView(bytes)); },
      async writeValueWithResponse(bytes) { return BleClient.write(deviceId, serviceUUID, charUUID, toDataView(bytes)); },
      async writeValueWithoutResponse(bytes) { return BleClient.writeWithoutResponse(deviceId, serviceUUID, charUUID, toDataView(bytes)); },
      async startNotifications() {
        if (!notifying) {
          notifying = true;
          await BleClient.startNotifications(deviceId, serviceUUID, charUUID, dv => {
            c.value = dv;
            listeners.forEach(fn => fn({ target: c }));
          });
        }
        return c;
      },
      addEventListener(type, fn) {
        if (type === 'characteristicvaluechanged' && listeners.indexOf(fn) < 0) listeners.push(fn);
      },
      removeEventListener(type, fn) {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    charCache.set(key, c);
    return c;
  }

  function getServiceShim(deviceId, serviceUUID) {
    return { async getCharacteristic(charUUID) { return getCharacteristicShim(deviceId, serviceUUID, resolveGattName(charUUID)); } };
  }

  const deviceCache = new Map();
  function getDeviceShim(deviceId, name) {
    let d = deviceCache.get(deviceId);
    if (d) { if (name) d.name = name; return d; }
    const disconnectListeners = [];
    d = {
      id: deviceId,
      name,
      addEventListener(type, fn) {
        if (type === 'gattserverdisconnected' && disconnectListeners.indexOf(fn) < 0) disconnectListeners.push(fn);
      },
      gatt: {
        connected: false,
        async connect() {
          await ensureInit();
          await BleClient.connect(deviceId, () => {
            d.gatt.connected = false;
            disconnectListeners.forEach(fn => fn());
          });
          d.gatt.connected = true;
          return { async getPrimaryService(uuid) { return getServiceShim(deviceId, resolveGattName(uuid)); } };
        },
        disconnect() { BleClient.disconnect(deviceId).catch(() => {}); },
      },
    };
    deviceCache.set(deviceId, d);
    return d;
  }

  const advertListeners = [];

  return {
    isNativeBleShim: true,
    async getDevices() {
      try {
        const raw = storage.getItem(NATIVE_BLE_LAST_HUB_KEY);
        if (!raw) return [];
        const { id } = JSON.parse(raw);
        if (!id) return [];
        await ensureInit();
        const found = await BleClient.getDevices([id]);
        return found.map(dev => getDeviceShim(dev.deviceId, dev.name));
      } catch (e) { return []; }
    },
    async requestDevice(options) {
      await ensureInit();
      const filterServices = ((options && options.filters && options.filters[0] && options.filters[0].services) || []).map(resolveGattName);
      const optionalServices = ((options && options.optionalServices) || []).map(resolveGattName);
      const dev = await BleClient.requestDevice({ services: filterServices, optionalServices });
      return getDeviceShim(dev.deviceId, dev.name);
    },
    async requestLEScan(options) {
      await ensureInit();
      const services = ((options && options.filters && options.filters[0] && options.filters[0].services) || []).map(resolveGattName);
      await BleClient.requestLEScan({ services, allowDuplicates: !!(options && options.keepRepeatedDevices) }, result => {
        const device = getDeviceShim(result.device.deviceId, result.device.name || result.localName);
        advertListeners.forEach(fn => fn({
          device,
          name: result.localName || device.name,
          rssi: result.rssi,
          manufacturerData: new Map(Object.entries(result.manufacturerData || {})),
          serviceData: new Map(Object.entries(result.serviceData || {})),
        }));
      });
      let stopped = false;
      return { stop() { if (!stopped) { stopped = true; BleClient.stopLEScan().catch(() => {}); } } };
    },
    addEventListener(type, fn) {
      if (type === 'advertisementreceived' && advertListeners.indexOf(fn) < 0) advertListeners.push(fn);
    },
    removeEventListener(type, fn) {
      const i = advertListeners.indexOf(fn);
      if (i >= 0) advertListeners.splice(i, 1);
    },
  };
}

if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform
    && window.Capacitor.isNativePlatform() && typeof capacitorCommunityBluetoothLe !== 'undefined') {
  navigator.bluetooth = createCapacitorBluetoothShim(capacitorCommunityBluetoothLe.BleClient, window.localStorage);
}
