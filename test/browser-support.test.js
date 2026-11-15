const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// Browsers without Web Bluetooth (Firefox, Safari, iOS browsers) get a
// "Browser Not Supported" page at start, with a small "Still Try" button to
// get past it. The packaged Android app has its own Bluetooth shim, so it
// must never see the page.

test("shows the Browser Not Supported page when Web Bluetooth is missing", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const page = dom.window.document.getElementById("unsupported");
  assert.equal(page.hidden, false);
});

test("hides the Browser Not Supported page when Web Bluetooth is available", async (t) => {
  const dom = await loadApp({
    seed(window) {
      Object.defineProperty(window.navigator, "bluetooth", {
        value: { requestDevice: async () => null },
      });
    },
  });
  t.after(() => dom.window.close());
  const page = dom.window.document.getElementById("unsupported");
  assert.equal(page.hidden, true);
});

test("Still Try dismisses the page", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  document.getElementById("stilltry").click();
  assert.equal(document.getElementById("unsupported").hidden, true);
});

test("the packaged Android app is never gated", async (t) => {
  const dom = await loadApp({
    seed(window) {
      window.Capacitor = { isNativePlatform: () => true };
    },
  });
  t.after(() => dom.window.close());
  const page = dom.window.document.getElementById("unsupported");
  assert.equal(page.hidden, true);
});
