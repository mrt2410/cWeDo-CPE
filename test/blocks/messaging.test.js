const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("triggerButtonPress runs stacks headed by StartOnButtonPressBlock", async (t) => {
  const dom = await loadApp({ probe: "window.__stacks = stacks;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const ran = [];
  window.__stacks.length = 0;
  window.__stacks.push({ id: 1, items: [{ t:'b', key:'StartOnButtonPressBlock', input:null }] });
  window.runStack = (st) => { ran.push(st.id); };
  window.eval(`triggerButtonPress()`);
  assert.deepEqual(ran, [1]);
});

test("triggerButtonPress ignores stacks headed by something else", async (t) => {
  const dom = await loadApp({ probe: "window.__stacks = stacks;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const ran = [];
  window.__stacks.length = 0;
  window.__stacks.push({ id: 1, items: [{ t:'b', key:'StartBlock', input:null }] });
  window.runStack = (st) => { ran.push(st.id); };
  window.eval(`triggerButtonPress()`);
  assert.deepEqual(ran, []);
});
