const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// The real GATT connect path needs a real browser + real hardware (same
// limitation as the rest of Web Bluetooth in this suite), so these test the
// device-selection and retry/timeout logic directly, with fakes standing in
// for getDevices()/connect()/isConnected().

function fakeWait(calls) {
  return (ms) => { calls.push(ms); return Promise.resolve(); };
}

test("connects immediately when the stored device is found and connects on the first try", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;

  let connectCalls = 0;
  const waits = [];
  const ok = await window.attemptAutoReconnect({
    getDevices: async () => [{ id: "abc" }, { id: "other" }],
    connect: async () => { connectCalls++; },
    isConnected: () => true,
    lastId: "abc",
    wait: fakeWait(waits),
  });

  assert.equal(ok, true);
  assert.equal(connectCalls, 1);
  assert.deepEqual(waits, []);
});

test("retries the connect call until it succeeds", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;

  let attempts = 0;
  const waits = [];
  const ok = await window.attemptAutoReconnect({
    getDevices: async () => [{ id: "abc" }],
    connect: async () => { attempts++; },
    isConnected: () => attempts >= 3,
    lastId: "abc",
    wait: fakeWait(waits),
  });

  assert.equal(ok, true);
  assert.equal(attempts, 3);
  assert.equal(waits.length, 2); // waited between attempts 1->2 and 2->3, not after success
});

test("gives up after the retry budget is exhausted", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;

  let attempts = 0;
  const waits = [];
  const ok = await window.attemptAutoReconnect({
    getDevices: async () => [{ id: "abc" }],
    connect: async () => { attempts++; },
    isConnected: () => false,
    lastId: "abc",
    retries: 4,
    wait: fakeWait(waits),
  });

  assert.equal(ok, false);
  assert.equal(attempts, 4);
  assert.equal(waits.length, 3);
});

test("does nothing when the stored device id isn't among getDevices()", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;

  let connectCalls = 0;
  const ok = await window.attemptAutoReconnect({
    getDevices: async () => [{ id: "someone-else" }],
    connect: async () => { connectCalls++; },
    isConnected: () => false,
    lastId: "abc",
    wait: fakeWait([]),
  });

  assert.equal(ok, false);
  assert.equal(connectCalls, 0);
});

test("does nothing when there is no stored last-hub id", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;

  let getDevicesCalls = 0;
  const ok = await window.attemptAutoReconnect({
    getDevices: async () => { getDevicesCalls++; return [{ id: "abc" }]; },
    connect: async () => {},
    isConnected: () => false,
    lastId: null,
    wait: fakeWait([]),
  });

  assert.equal(ok, false);
  assert.equal(getDevicesCalls, 0);
});

test("remembering a hub saves its id and name to localStorage", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window, localStorage } = dom.window;

  window.rememberLastHub("abc-123", "My Smarthub");

  const saved = JSON.parse(localStorage.getItem("wedo:lastHub"));
  assert.deepEqual(saved, { id: "abc-123", name: "My Smarthub" });
});
