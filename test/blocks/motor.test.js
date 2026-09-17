const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("motorRun(-50) sends power byte 188 (compensated: round(35+65/100*50)=68, negated as 256-68) to both ports", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`motorRun(-50)`);
  // -50: |50| = 50; compensated = round(35+65/100*50) = round(35+32.5) = 68; negative encoding: 256-68 = 188
  assert.deepEqual(sent[0], [1, 0x01, 0x01, 188]);
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 188]);
});

test("motorBrake sends power byte 127 to both ports", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`motorBrake()`);
  assert.deepEqual(sent[0], [1, 0x01, 0x01, 127]);
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 127]);
});

test("motorRun compensates low power so it clears the motor's stall floor", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`motorRun(10)`);
  // 10% requested; compensated: round(35 + (65/100)*10) = round(41.5) = 42
  assert.deepEqual(sent[0], [1, 0x01, 0x01, 42]);
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 42]);
});

test("motorRun compensation preserves sign for negative power", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`motorRun(-10)`);
  // -10% requested; compensated magnitude = 42; negative encoding = 256 - 42 = 214
  assert.deepEqual(sent[0], [1, 0x01, 0x01, 214]);
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 214]);
});

test("motorRun(0) still sends 0 (no floor applied when stopping)", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`motorRun(0)`);
  assert.deepEqual(sent[0], [1, 0x01, 0x01, 0]);
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 0]);
});

test("motorRun compensation on levelToPower output: level 1 should send byte 42, not double-compensated 58", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs; window.__levelToPower = levelToPower;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };

  // The production path: Motor Power block sets motorState.power = levelToPower(level)
  // then Motor On For calls motorRun(motorState.power)
  // Level 1 with current buggy levelToPower gives: round(35 + (0/9)*65) = 35
  // Then motorRun(35) re-applies compensation: round(35 + 0.65*35) = 58 (WRONG, double-compensated)
  // After fix, levelToPower(1) gives: 10
  // Then motorRun(10) gives: round(35 + 0.65*10) = 42 (CORRECT, single compensation)
  await window.eval(`motorRun(window.__levelToPower(1))`);

  assert.deepEqual(sent[0], [1, 0x01, 0x01, 42],
    "Level 1→10 raw→compensate to 42, not double-compensate to 58");
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 42]);
});
