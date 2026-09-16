const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, dragBlockFromTrayToBoard, wait } = require("./helpers.js");

test("dropping a block onto the board autosaves the program to localStorage", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, localStorage } = dom.window;

  dragBlockFromTrayToBoard(dom.window, "StartBlock");
  await wait(400); // past the debounce

  const raw = localStorage.getItem("wedo:program");
  assert.notEqual(raw, null, "program should be autosaved after a change");
  const saved = JSON.parse(raw);
  assert.equal(saved.format, "wedo-cpe-program");
  assert.equal(saved.stacks.length, 1);
  assert.equal(saved.stacks[0].items[0].key, "StartBlock");
  assert.equal(document.querySelectorAll("#sheet .blk").length, 1);
});

test("reloading the page restores the program from localStorage", async (t) => {
  const saved = {
    format: "wedo-cpe-program",
    version: 1,
    stacks: [{ id: 7, x: 50, y: 90, items: [{ t: "b", key: "StartBlock", input: null }] }],
  };

  const dom = await loadApp({
    seed(window) {
      window.localStorage.setItem("wedo:program", JSON.stringify(saved));
    },
  });
  t.after(() => dom.window.close());

  assert.equal(dom.window.document.querySelectorAll("#sheet .blk").length, 1);
});

test("a corrupt saved program is ignored instead of crashing the app", async (t) => {
  const dom = await loadApp({
    seed(window) {
      window.localStorage.setItem("wedo:program", "{not json");
    },
  });
  t.after(() => dom.window.close());

  // the app should still boot to an empty, working board
  assert.equal(dom.window.document.querySelectorAll("#sheet .blk").length, 0);
  assert.equal(dom.window.document.querySelectorAll(".pitem").length > 0, true);
});
