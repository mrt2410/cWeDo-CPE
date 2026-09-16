const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// The mic recording itself (MediaRecorder/AudioContext) isn't available in
// jsdom, so these test the encode/decode round trip that persistence relies
// on directly, exactly as it's exercised in js/app.js. Full behavior
// (record -> reload -> still there) needs manual verification in a real browser.

test("a recorded blob round-trips through base64 unchanged", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window } = dom.window;

  const original = new window.Blob(["fake audio bytes"], { type: "audio/webm" });
  const b64 = await window.blobToBase64(original);
  const restored = window.base64ToBlob(b64, "audio/webm");

  assert.equal(restored.type, "audio/webm");
  const text = await restored.text();
  assert.equal(text, "fake audio bytes");
});

test("persisting a recorded blob saves mime and base64 data to localStorage", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window, localStorage } = dom.window;

  const blob = new window.Blob(["clip"], { type: "audio/webm" });
  await window.persistCustomSound(blob);

  const raw = localStorage.getItem("wedo:customSound");
  assert.notEqual(raw, null);
  const saved = JSON.parse(raw);
  assert.equal(saved.mime, "audio/webm");
  const restored = window.base64ToBlob(saved.data, saved.mime);
  assert.equal(await restored.text(), "clip");
});
