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

// ---------------------------------------------------------------------------
// Input-format ("mode switch") write. Both LED commands go out on the same
// port/command pair and differ only in payload length, so each one declares the
// mode it wants on the input characteristic (h.inp) first, exactly the way
// configurePort() does for tilt/distance. The writes land on two different
// characteristics, so the fake hub carries both and everything is recorded into
// one ordered list — that's what makes "mode before payload" assertable.

/** Matches js/blocks/core.js's inputFormat(port,type,mode,unit) byte layout. */
function inputFormat(port, type, mode, unit) {
  return [0x01, 0x02, port, type, mode, 0x01, 0x00, 0x00, 0x00, unit, 0x01];
}
const LED_PORT = 6, DEV_RGB_LIGHT = 23;

/** Seats a fake connected hub whose input + output characteristics both record
 * into `sent` as {to, bytes}, preserving the order the app wrote them in. */
function fakeHubRecording(window, sent) {
  window.__hubs.set("test-hub", {
    connected: true,
    out: {},
    inp: {
      writeValueWithResponse: (d) => {
        sent.push({ to: "inp", bytes: [...new Uint8Array(d)] });
        return Promise.resolve();
      },
    },
  });
  window.writeOut = (c, data) => { sent.push({ to: "out", bytes: [...data] }); return Promise.resolve(); };
}

test("ledSet switches the LED to discrete mode before sending the palette index", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  fakeHubRecording(window, sent);
  await window.eval(`ledSet(7)`);
  assert.deepEqual(sent.map((w) => w.to), ["inp", "out"],
    "the mode switch must go out on the input characteristic before the payload");
  assert.deepEqual(sent[0].bytes, inputFormat(LED_PORT, DEV_RGB_LIGHT, 0, 0));
  assert.deepEqual(sent[1].bytes, [6, 0x04, 0x01, 7]);
});

test("ledSetRGB switches the LED to absolute mode before sending the r/g/b payload", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  fakeHubRecording(window, sent);
  await window.eval(`ledSetRGB(255, 0, 128)`);
  assert.deepEqual(sent.map((w) => w.to), ["inp", "out"]);
  assert.deepEqual(sent[0].bytes, inputFormat(LED_PORT, DEV_RGB_LIGHT, 1, 0));
  assert.deepEqual(sent[1].bytes, [6, 0x04, 3, 255, 0, 128]);
});

test("a hub with no input characteristic still gets the LED payload", async (t) => {
  const dom = await loadApp({ probe: "window.__hubs = hubs;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const sent = [];
  window.__hubs.set("test-hub", { out: {}, connected: true });   // no h.inp
  window.writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  await window.eval(`ledSet(2)`);
  assert.deepEqual(sent, [[6, 0x04, 0x01, 2]]);
});

// ---------------------------------------------------------------------------
// customRGB lifetime: execLight checks it *before* the socket's attached input,
// so a custom colour left behind on an item silently wins over whatever number
// is now plugged in. Both drag/drop paths that change a Light block's socket
// therefore have to clear it. These two tests drive the real pointer-event
// handlers (beginDrag / finishDrag via the app's own pointerup listener) rather
// than poking the fields directly, so they fail if the clearing is dropped from
// either site in js/app.js.
//
// `stacks`/`anchors`/`mkItem`/`S`/`OVER`/`scale` are file-level bindings in
// js/app.js and js/blocks/core.js; `probe` runs in that same lexical scope (see
// helpers.js) so it can hand the real objects to the test.
const DRAG_PROBE =
  "window.__app = { stacks, mkItem, render, S, OVER, scale, pscale," +
  " anchors: () => anchors };";

/** Lays a Light block on the sheet with a custom colour already chosen, and
 * returns it together with its rendered socket anchor. */
function seedLightBlockWithCustomRGB(window) {
  const app = window.__app;
  // scale()/pscale() read the --cu/--pu custom properties off the root element.
  // jsdom's getComputedStyle doesn't resolve custom properties declared in a
  // stylesheet, so they come back NaN and every anchor lands at NaN. Setting
  // them inline (exactly what the app's own zoom buttons do) restores real
  // geometry — the default values from css/style.css.
  window.document.documentElement.style.setProperty("--cu", 118);
  window.document.documentElement.style.setProperty("--pu", 92);
  const item = app.mkItem("LightBlock");           // seats NumberInput '1' by default
  item.customRGB = { r: 11, g: 22, b: 33 };
  app.stacks.push({ id: 9001, x: 60, y: 60, items: [item] });
  app.render();
  const anchor = app.anchors().find((a) => a.kind === "socket" && a.item === item);
  assert.ok(anchor, "render() should publish a socket anchor for the Light block");
  return { item, anchor };
}

test("pulling an input out of a Light block's socket also clears its custom colour", async (t) => {
  const dom = await loadApp({ probe: DRAG_PROBE });
  t.after(() => dom.window.close());
  const { window } = dom;
  const { document } = window;
  const { item } = seedLightBlockWithCustomRGB(window);

  // the rendered input tile carries the app's own hit-test reference
  const socketEl = [...document.querySelectorAll("#sheet .blk")]
    .find((e) => e.__ref && e.__ref.type === "input" && e.__ref.item === item);
  assert.ok(socketEl, "the seated NumberInput should be rendered with an input ref");
  socketEl.getBoundingClientRect = () =>
    ({ left: 100, top: 100, right: 140, bottom: 140, width: 40, height: 40 });

  socketEl.dispatchEvent(new window.PointerEvent("pointerdown", {
    bubbles: true, cancelable: true, button: 0, clientX: 110, clientY: 110, pointerType: "mouse",
  }));
  // past the 6px mouse slop, so the press becomes a real drag (beginDrag)
  window.dispatchEvent(new window.PointerEvent("pointermove", {
    bubbles: true, cancelable: true, clientX: 150, clientY: 160, pointerType: "mouse",
  }));

  assert.equal(item.input, null, "the input should have left the socket");
  assert.equal("customRGB" in item, false,
    "the custom colour must not survive the input being pulled out");
});

test("dropping a new input into a Light block's socket clears its custom colour", async (t) => {
  const dom = await loadApp({ probe: DRAG_PROBE });
  t.after(() => dom.window.close());
  const { window } = dom;
  const { document } = window;
  const app = window.__app;
  const { item, anchor } = seedLightBlockWithCustomRGB(window);

  // find the tray tab that holds NumberInput and show it
  const numberTile = () => document.querySelector('.pitem[data-key="NumberInput"]');
  for (const tab of [...document.querySelectorAll("#traytabs .tab")]) {
    tab.click();
    if (numberTile()) break;
  }
  const pitem = numberTile();
  assert.ok(pitem, "NumberInput should be reachable in one of the tray tabs");

  // jsdom lays nothing out, so give the tray and the tile realistic boxes —
  // the tray's top edge is what decides "dropped back into the tray".
  pitem.getBoundingClientRect = () =>
    ({ left: 40, top: 700, right: 100, bottom: 760, width: 60, height: 60 });
  document.getElementById("tray").getBoundingClientRect = () =>
    ({ left: 0, top: 680, right: 800, bottom: 800, width: 800, height: 120 });

  // Aim the drop so bestAnchor()'s socket distance lands on our anchor: it
  // compares the ghost's centre-x and its OVER-inset top against the anchor.
  const s = app.scale(), k = s / app.pscale();
  const ghostW = app.S.NumberInput.w * s;
  const grabX = (60 - 40) * k, grabY = (720 - 700) * k;
  const dropX = anchor.x - ghostW / 2 + grabX;
  const dropY = anchor.y - app.OVER * s + grabY;

  pitem.dispatchEvent(new window.PointerEvent("pointerdown", {
    bubbles: true, cancelable: true, button: 0, clientX: 60, clientY: 720, pointerType: "mouse",
  }));
  for (const pt of [{ x: 70, y: 690 }, { x: dropX, y: dropY }]) {
    window.dispatchEvent(new window.PointerEvent("pointermove", {
      bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, pointerType: "mouse",
    }));
  }
  window.dispatchEvent(new window.PointerEvent("pointerup", {
    bubbles: true, cancelable: true, clientX: dropX, clientY: dropY, pointerType: "mouse",
  }));

  assert.equal(item.input, "NumberInput", "the dragged input should have landed in the socket");
  assert.equal("customRGB" in item, false,
    "a freshly dropped input must not be overridden by the previous custom colour");
});
