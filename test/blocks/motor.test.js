const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("motorRun(-50) sends power byte 206 (256-50) to both ports", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`motorRun(-50)`);
  // -50 encodes as 256 + (-50) = 206
  assert.deepEqual(sent[0], [1, 0x01, 0x01, 206]);
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 206]);
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
