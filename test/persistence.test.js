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

// The tone picker's note tiles call render() (and so persistProgram()) when
// they set a note, but the octave stepper only mutated the item — so a program
// whose only edit was an octave change was never autosaved, and came back at
// the old octave on reload.
test("changing only the octave in the tone picker autosaves the program", async (t) => {
  const dom = await loadApp({ probe: "window.__stacks = stacks;" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const { document, localStorage } = window;

  const item = window.mkItem("PlayToneBlock");   // note 'A', octave 4
  window.__stacks.push({ id: 4242, x: 60, y: 60, items: [item] });
  window.openTonePicker(item);

  const oc = document.getElementById("tnoctave");
  oc.value = "6";
  oc.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(400);   // past persistProgram's 250ms debounce

  assert.equal(item.octave, 6);
  const saved = JSON.parse(localStorage.getItem("wedo:program"));
  const stack = saved.stacks.find((s) => s.id === 4242);
  assert.ok(stack, "the tone block's stack should have been saved");
  assert.equal(stack.items[0].octave, 6, "the new octave should be in the autosave");
});
