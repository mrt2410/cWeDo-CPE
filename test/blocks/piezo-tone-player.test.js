const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("noteToFrequency matches equal-temperament A4=440Hz", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const freq = dom.window.eval(`noteToFrequency('A',4)`);
  assert.ok(Math.abs(freq - 440) < 0.01);
});

test("noteToFrequency: C4 is below A4", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const freq = dom.window.eval(`noteToFrequency('C',4)`);
  assert.ok(freq > 260 && freq < 262);   // C4 ~ 261.63 Hz
});

// `connectedHub` and `hubs` are top-level `const`s in js/app.js. Per the
// comment in helpers.js, a `const` declared inside loadApp()'s one combined
// eval() call is invisible to code run in a *later*, separate eval() call —
// reassigning `connectedHub` from a later eval (as the task brief's literal
// test snippet did) silently creates an unrelated global instead of shadowing
// the real binding sendOut()'s closure actually resolves, so sendOut() still
// sees no hub connected and never reaches writeOut. Exposing the real `hubs`
// Map via `probe` (run in the *same* eval call, see helpers.js) and mutating
// that same Map object from Node afterwards sidesteps the issue: object
// mutation doesn't need identifier rebinding to cross the eval-call boundary.
// `writeOut` itself is a `function` declaration, which real browsers (and
// jsdom) bind as a genuine global-object property, so it can be reassigned
// directly from Node without going through eval() at all.
test("playTone writes the piezo play command with little-endian freq/duration", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`playTone('A', 4, 500)`);
  const bytes = sent[0];
  // port 5 (best-guess), command 0x02, len 4, freq=440 LE, duration=500 LE
  assert.equal(bytes[0], 5);
  assert.equal(bytes[1], 0x02);
  assert.equal(bytes[2], 4);
  assert.equal(bytes[3] | (bytes[4] << 8), 440);
  assert.equal(bytes[5] | (bytes[6] << 8), 500);
});

test("stopTone writes the piezo stop command", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`stopTone()`);
  assert.deepEqual(sent[0], [5, 0x03, 0]);
});

// PiezoTonePlayer.preview() is the tone picker's "Play" button: it should
// synthesise the note locally (same playToneAudio() path as an executed
// PlayToneBlock) without sending any BLE command — previewing a sound while
// building a program shouldn't move a motor or click a relay via sendOut.
test("preview does not send a BLE command", async (t) => {
  // PiezoTonePlayer is a top-level `const` (see the eval-scoping comment
  // above): capture its preview() via `probe`, in the same eval call that
  // declares it, rather than reaching for it from a later window.eval().
  const dom = await loadApp({ probe: "window.__hubs = hubs; window.__preview = PiezoTonePlayer.preview;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  // jsdom has no Web Audio (see header comment in piezo-tone-player.js); the
  // point of this test is only that no BLE command goes out, not that sound
  // plays — playToneAudio()'s own try/catch swallows the missing-AudioContext
  // error the same way it does for an executed PlayToneBlock.
  window.__preview('A', 4);
  assert.equal(sent.length, 0);
});
