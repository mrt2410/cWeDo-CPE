const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

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
test("ledSetRGB writes the absolute-mode command with r/g/b bytes", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`ledSetRGB(255, 0, 128)`);
  // port 6, command 0x04, len 3, r,g,b
  assert.deepEqual(sent[0], [6, 0x04, 3, 255, 0, 128]);
});

// `RgbLight` (like `hubs`) is a top-level `const` in js/blocks/rgb-light.js —
// same visibility problem, same fix: expose it as a real `window` property via
// `probe` (run inside the same combined eval() call that declares it), then
// call it directly from Node. That sidesteps needing a further eval() call
// (which, per the comment above, couldn't see a later-declared identifier
// named `RgbLight` anyway) to invoke it.
test("RgbLight.execLight uses customRGB over the discrete index when both are set", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs; window.__RgbLight = RgbLight;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.__RgbLight.execLight(
    { key: "LightBlock", input: "NumberInput", inputValue: "RGB",
      customRGB: { r: 10, g: 20, b: 30 } },
    { cancels: new Set() }
  );
  assert.deepEqual(sent[0], [6, 0x04, 3, 10, 20, 30]);
});
