const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "css", "style.css"), "utf8");
const bg = (selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp("(?:^|\\})\\s*" + esc + "\\s*\\{[^}]*?background:([^;}]+)"));
  return m && m[1].trim();
};

test("hub icon LED is green only while the hub is connected", () => {
  assert.notEqual(bg(".row .hbrick:before"), "#37b34a", "idle/found hub must not show a green LED");
  assert.match(css, /\.row\.connected \.hbrick:before,\s*\.row\.pressed \.hbrick:before\s*\{background:#37b34a\}/);
});
