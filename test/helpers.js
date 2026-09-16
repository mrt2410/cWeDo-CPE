const { JSDOM } = require("jsdom");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(ROOT, "WeDo CPE v1.0.html");

// jsdom's <script src> file:// loading is unreliable across versions, so the
// scripts are stripped from the parsed HTML and evaluated manually in order —
// equivalent to what a browser does with these classic (non-module) scripts,
// without depending on jsdom's resource loader.
const SCRIPTS = ["data/bundle.js", "data/soundbank.js", "data/bgbank.js",
  "js/blocks/core.js", "js/blocks/tilt-sensor.js", "js/app.js"];

/**
 * Loads the real app (real HTML + real css/js/data files) into a jsdom window,
 * exactly as a browser would. `seed(window)` runs before any app script executes,
 * so tests can pre-populate localStorage to exercise restore-on-load.
 *
 * `probe`, if given, is a snippet of code appended into the *same* combined
 * eval() call as the app's own scripts (see the comment below on why that
 * matters), so it can read otherwise-unreachable top-level `const`/`let`
 * values (e.g. a one-liner arrow-function helper that isn't a `function`
 * declaration, so never becomes a `window` property) and expose them for the
 * test to read back off `window` — without duplicating their logic.
 */
async function loadApp({ seed, probe } = {}) {
  let html = fs.readFileSync(HTML_PATH, "utf8");
  for (const rel of SCRIPTS) html = html.replace(`<script src="${rel}"></script>`, "");

  const dom = new JSDOM(html, {
    // a real (non-file://) origin: file:// is an opaque origin in jsdom, which
    // disables localStorage — the app needs it for autosave.
    url: "http://localhost/wedo/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom doesn't implement window.isSecureContext; real browsers always do.
      window.isSecureContext = true;
      if (seed) seed(window);
    },
  });

  // Concatenated into a single eval() call rather than one eval() per file:
  // separate indirect-eval() calls each get their own throwaway lexical
  // environment, so a top-level `const`/`let` in one call is invisible to a
  // later call (verified: `eval("const X=1")` then `eval("X")` in a second
  // call throws "X is not defined") — unlike real <script> tags, which all
  // share one global lexical environment. Concatenating restores that
  // script-tag-like sharing so cross-file top-level const/let (e.g.
  // js/blocks/core.js's `ORDER`, read by js/app.js's drawTray()) resolve
  // correctly, matching real-browser behaviour.
  let combined = SCRIPTS.map(rel => fs.readFileSync(path.join(ROOT, rel), "utf8")).join("\n;\n");
  if (probe) combined += "\n;\n" + probe;
  dom.window.eval(combined);

  // let the app's own load-time async work (e.g. sound restore) settle
  await new Promise((r) => setTimeout(r, 300));
  return dom;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Simulates a real mouse drag of a tray block onto the sheet/board. */
function dragBlockFromTrayToBoard(window, key, target = { x: 300, y: 300 }) {
  const doc = window.document;
  const pitem = doc.querySelector(`.pitem[data-key="${key}"]`);
  if (!pitem) throw new Error(`no tray item for key ${key}`);
  pitem.getBoundingClientRect = () => ({ left: 40, top: 700, right: 100, bottom: 760, width: 60, height: 60 });
  // jsdom doesn't lay elements out, so the tray defaults to a 0-height rect at
  // (0,0) — which makes every drop look like it landed "over the tray". Give it
  // a realistic box so drops above it land on the board instead.
  const tray = doc.getElementById("tray");
  tray.getBoundingClientRect = () => ({ left: 0, top: 680, right: 800, bottom: 800, width: 800, height: 120 });

  const down = { x: 60, y: 720 };
  pitem.dispatchEvent(new window.PointerEvent("pointerdown", {
    bubbles: true, cancelable: true, button: 0, clientX: down.x, clientY: down.y, pointerType: "mouse",
  }));
  const path = [
    { x: down.x + 10, y: down.y - 30 },
    { x: target.x, y: target.y },
  ];
  for (const pt of path) {
    window.dispatchEvent(new window.PointerEvent("pointermove", {
      bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, pointerType: "mouse",
    }));
  }
  window.dispatchEvent(new window.PointerEvent("pointerup", {
    bubbles: true, cancelable: true, clientX: target.x, clientY: target.y, pointerType: "mouse",
  }));
}

module.exports = { loadApp, wait, dragBlockFromTrayToBoard, HTML_PATH };
