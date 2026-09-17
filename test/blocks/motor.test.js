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
