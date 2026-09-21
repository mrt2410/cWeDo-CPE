const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildStandalone } = require("../scripts/build-standalone.js");

test("inlines the stylesheet and removes the <link>", () => {
  const html = buildStandalone();
  assert.doesNotMatch(html, /<link[^>]*rel="stylesheet"/);
  assert.match(html, /<style>[\s\S]*--lime:#a2c300[\s\S]*<\/style>/);
});

test("inlines every <script src> and removes the src attributes", () => {
  const html = buildStandalone();
  assert.doesNotMatch(html, /<script[^>]*\ssrc=/);
  // content from an early-loaded file (js/blocks/core.js) and a late-loaded
  // one (js/app.js) both made it in
  assert.match(html, /const S=B\.sprites, ORDER=B\.order;/);
  assert.match(html, /const BH=179,CAV_L=61,ARCH_TOP=61,ARCH_H=240,/);
});

test("keeps scripts in their original load order", () => {
  const html = buildStandalone();
  // js/blocks/core.js defines ORDER; js/app.js reads it. If the bundle
  // reordered the scripts, core.js's marker would land after app.js's.
  const coreIdx = html.indexOf("const S=B.sprites, ORDER=B.order;");
  const appIdx = html.indexOf("const BH=179,CAV_L=61,ARCH_TOP=61,ARCH_H=240,");
  assert.ok(coreIdx > -1 && appIdx > -1);
  assert.ok(coreIdx < appIdx);
});

test("leaves the rest of the page (markup outside style/script) untouched", () => {
  const html = buildStandalone();
  assert.match(html, /<title>cWeDo CPE<\/title>/);
  assert.match(html, /id="app"/);
});
