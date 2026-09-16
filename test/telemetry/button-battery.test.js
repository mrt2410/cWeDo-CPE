const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("wireButtonBattery sets h.pressed from initial button readValue()", async (t) => {
  const dom = await loadApp({
    probe: "window.Telemetry = Telemetry;"
  });
  t.after(() => dom.window.close());
  const { window } = dom.window;

  // Create a fake hub object
  const h = { pressed: false };

  // Create fake characteristics with DataView-like objects
  const fakeButtonCharacteristic = {
    async startNotifications() {},
    addEventListener() {},
    async readValue() {
      return { getUint8: (i) => 1 }; // button pressed (byte value 1)
    }
  };

  const fakeBatteryCharacteristic = {
    async readValue() {
      return { getUint8: (i) => 75 }; // 75% battery
    },
    async startNotifications() {},
    addEventListener() {}
  };

  const fakeBatteryService = {
    async getCharacteristic(name) {
      if (name === 'battery_level') return fakeBatteryCharacteristic;
      throw new Error('unknown characteristic: ' + name);
    }
  };

  const fakeSvc = {
    async getCharacteristic(uuid) {
      // C_BUTTON uuid
      if (uuid === '00001526-1212-efde-1523-785feabcd123') {
        return fakeButtonCharacteristic;
      }
      throw new Error('unknown button characteristic');
    }
  };

  const fakeServer = {
    async getPrimaryService(name) {
      if (name === 'battery_service') return fakeBatteryService;
      throw new Error('unknown service: ' + name);
    }
  };

  // Call wireButtonBattery
  await window.Telemetry.wireButtonBattery(h, fakeSvc, fakeServer);

  // Verify h.pressed and h.battery were set from the initial readValue() calls
  assert.equal(h.pressed, true, "h.pressed should be true from readValue() returning 1");
  assert.equal(h.battery, 75, "h.battery should be 75 from readValue() returning 75");
});

test("wireButtonBattery button characteristic updates h.pressed on value change", async (t) => {
  const dom = await loadApp({
    probe: "window.Telemetry = Telemetry; window.triggerButtonPress = () => {};"
  });
  t.after(() => dom.window.close());
  const { window } = dom.window;

  const h = { pressed: false };
  let buttonEventListener = null;

  const fakeButtonCharacteristic = {
    async startNotifications() {},
    addEventListener(event, callback) {
      if (event === 'characteristicvaluechanged') {
        buttonEventListener = callback;
      }
    },
    async readValue() {
      return { getUint8: (i) => 0 }; // initially not pressed
    }
  };

  const fakeBatteryCharacteristic = {
    async readValue() {
      return { getUint8: (i) => 50 };
    },
    async startNotifications() {},
    addEventListener() {}
  };

  const fakeBatteryService = {
    async getCharacteristic(name) {
      if (name === 'battery_level') return fakeBatteryCharacteristic;
      throw new Error('unknown characteristic');
    }
  };

  const fakeSvc = {
    async getCharacteristic(uuid) {
      if (uuid === '00001526-1212-efde-1523-785feabcd123') {
        return fakeButtonCharacteristic;
      }
      throw new Error('unknown characteristic');
    }
  };

  const fakeServer = {
    async getPrimaryService(name) {
      if (name === 'battery_service') return fakeBatteryService;
      throw new Error('unknown service');
    }
  };

  await window.Telemetry.wireButtonBattery(h, fakeSvc, fakeServer);

  assert.equal(h.pressed, false, "h.pressed should be false from initial readValue()");

  // Simulate a button press event (byte value 1)
  const fakeEvent = {
    target: {
      value: {
        getUint8: (i) => 1
      }
    }
  };

  assert.ok(buttonEventListener, "button event listener should have been registered");
  buttonEventListener(fakeEvent);

  assert.equal(h.pressed, true, "h.pressed should be true after event with value 1");

  // Simulate a button release event (byte value 0)
  const releaseEvent = {
    target: {
      value: {
        getUint8: (i) => 0
      }
    }
  };

  buttonEventListener(releaseEvent);
  assert.equal(h.pressed, false, "h.pressed should be false after event with value 0");
});

test("wireButtonBattery battery characteristic updates h.battery on value change", async (t) => {
  const dom = await loadApp({
    probe: "window.Telemetry = Telemetry;"
  });
  t.after(() => dom.window.close());
  const { window } = dom.window;

  const h = { battery: null };
  let batteryEventListener = null;

  const fakeButtonCharacteristic = {
    async startNotifications() {},
    addEventListener() {},
    async readValue() {
      return { getUint8: (i) => 0 };
    }
  };

  const fakeBatteryCharacteristic = {
    async readValue() {
      return { getUint8: (i) => 80 }; // initially 80%
    },
    async startNotifications() {},
    addEventListener(event, callback) {
      if (event === 'characteristicvaluechanged') {
        batteryEventListener = callback;
      }
    }
  };

  const fakeBatteryService = {
    async getCharacteristic(name) {
      if (name === 'battery_level') return fakeBatteryCharacteristic;
      throw new Error('unknown characteristic');
    }
  };

  const fakeSvc = {
    async getCharacteristic(uuid) {
      if (uuid === '00001526-1212-efde-1523-785feabcd123') {
        return fakeButtonCharacteristic;
      }
      throw new Error('unknown characteristic');
    }
  };

  const fakeServer = {
    async getPrimaryService(name) {
      if (name === 'battery_service') return fakeBatteryService;
      throw new Error('unknown service');
    }
  };

  await window.Telemetry.wireButtonBattery(h, fakeSvc, fakeServer);

  assert.equal(h.battery, 80, "h.battery should be 80 from initial readValue()");

  // Simulate a battery change event (drop to 50%)
  const batteryEvent = {
    target: {
      value: {
        getUint8: (i) => 50
      }
    }
  };

  assert.ok(batteryEventListener, "battery event listener should have been registered");
  batteryEventListener(batteryEvent);

  assert.equal(h.battery, 50, "h.battery should be 50 after battery change event");
});

test("wireButtonBattery catches button characteristic errors and continues", async (t) => {
  const dom = await loadApp({
    probe: "window.Telemetry = Telemetry;"
  });
  t.after(() => dom.window.close());
  const { window } = dom.window;

  const h = { pressed: false, battery: null };

  const fakeBatteryCharacteristic = {
    async readValue() {
      return { getUint8: (i) => 60 };
    },
    async startNotifications() {},
    addEventListener() {}
  };

  const fakeBatteryService = {
    async getCharacteristic(name) {
      if (name === 'battery_level') return fakeBatteryCharacteristic;
      throw new Error('unknown characteristic');
    }
  };

  const fakeSvc = {
    async getCharacteristic(uuid) {
      // Button characteristic is unavailable (hardware error)
      if (uuid === '00001526-1212-efde-1523-785feabcd123') {
        throw new Error('button characteristic not found');
      }
      throw new Error('unknown characteristic');
    }
  };

  const fakeServer = {
    async getPrimaryService(name) {
      if (name === 'battery_service') return fakeBatteryService;
      throw new Error('unknown service');
    }
  };

  // Should not throw even though button characteristic fails
  await window.Telemetry.wireButtonBattery(h, fakeSvc, fakeServer);

  // Battery should still work
  assert.equal(h.battery, 60, "h.battery should be set even when button fails");
  // h.pressed should remain its initial value since button failed
  assert.equal(h.pressed, false, "h.pressed should remain unchanged when button characteristic fails");
});

test("wireButtonBattery catches battery service errors and continues", async (t) => {
  const dom = await loadApp({
    probe: "window.Telemetry = Telemetry;"
  });
  t.after(() => dom.window.close());
  const { window } = dom.window;

  const h = { pressed: false, battery: null };

  const fakeButtonCharacteristic = {
    async startNotifications() {},
    addEventListener() {},
    async readValue() {
      return { getUint8: (i) => 1 };
    }
  };

  const fakeSvc = {
    async getCharacteristic(uuid) {
      if (uuid === '00001526-1212-efde-1523-785feabcd123') {
        return fakeButtonCharacteristic;
      }
      throw new Error('unknown characteristic');
    }
  };

  const fakeServer = {
    async getPrimaryService(name) {
      // Battery service is unavailable
      throw new Error('battery_service not found');
    }
  };

  // Should not throw even though battery service fails
  await window.Telemetry.wireButtonBattery(h, fakeSvc, fakeServer);

  // Button should work
  assert.equal(h.pressed, true, "h.pressed should be set even when battery service fails");
  // h.battery should remain null since battery failed
  assert.equal(h.battery, null, "h.battery should remain null when battery service fails");
});
