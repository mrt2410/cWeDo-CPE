const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// The real GATT write needs a real hub (and clone firmware may refuse it), so
// these test validation and the write-then-read-back logic against a fake
// characteristic.

function fakeNameChar({ accept = true } = {}) {
  let stored = new TextEncoder().encode("LPF2 Smart Hub 2 I/O");
  return {
    writes: [],
    async writeValue(bytes) { this.writes.push(Array.from(bytes)); if (accept) stored = bytes; },
    async readValue() { return new DataView(new Uint8Array(stored).buffer); },
  };
}

test("validateHubName trims and accepts up to 20 bytes", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  assert.equal(window.validateHubName("  Robot 1  "), "Robot 1");
  assert.equal(window.validateHubName("12345678901234567890"), "12345678901234567890");
});

test("validateHubName rejects empty names and names over 20 bytes", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  assert.throws(() => window.validateHubName("   "), /empty/i);
  assert.throws(() => window.validateHubName("123456789012345678901"), /20/);
  // 11 x 2-byte chars = 22 bytes though only 11 characters
  assert.throws(() => window.validateHubName("é".repeat(11)), /20/);
});

test("writeHubName writes the UTF-8 bytes and returns the name read back", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  const c = fakeNameChar();
  const result = await window.writeHubName(c, "Robot 1");
  assert.deepEqual(c.writes, [Array.from(new TextEncoder().encode("Robot 1"))]);
  assert.equal(result, "Robot 1");
});

test("writeHubName throws when the hub's read-back doesn't match (write ignored)", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;
  await assert.rejects(window.writeHubName(fakeNameChar({ accept: false }), "Robot 1"), /did not accept/i);
});
