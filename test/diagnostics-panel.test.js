const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadApp } = require("./helpers.js");

test("hub details (#ports) live inside the Diagnostics section, closed by default", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  const wrap = doc.getElementById("diagwrap");
  assert.ok(wrap.contains(doc.getElementById("ports")), "#ports is inside #diagwrap");
  assert.ok(wrap.classList.contains("closed"), "Diagnostics starts closed");
});

test("the Diagnostics toggle opens and closes the section", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  const wrap = doc.getElementById("diagwrap");
  doc.getElementById("diagtoggle").click();
  assert.ok(!wrap.classList.contains("closed"));
  doc.getElementById("diagtoggle").click();
  assert.ok(wrap.classList.contains("closed"));
});

test("the panel sizes to its content instead of stretching to the bottom", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "style.css"), "utf8");
  const rule = css.match(/#panel\{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /bottom:0/);
  assert.match(css, /#diagwrap\.closed #ports/);
});
