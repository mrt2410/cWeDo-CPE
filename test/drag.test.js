const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

function drag(window, pitem, path, pointerType) {
  const doc = window.document;
  const ghost = doc.getElementById("ghost");
  ghost.style.display = "none";
  pitem.dispatchEvent(new window.PointerEvent("pointerdown", {
    bubbles: true, cancelable: true, button: 0, clientX: path[0].x, clientY: path[0].y, pointerType,
  }));
  for (const pt of path.slice(1)) {
    window.dispatchEvent(new window.PointerEvent("pointermove", {
      bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, pointerType,
    }));
  }
  const began = ghost.style.display === "block";
  window.dispatchEvent(new window.PointerEvent("pointerup", {
    bubbles: true, cancelable: true, clientX: path.at(-1).x, clientY: path.at(-1).y, pointerType,
  }));
  return began;
}

test("a diagonal mouse drag lifts a block out of the tray", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window, document } = dom.window;
  const pitem = document.querySelector(".pitem");
  pitem.getBoundingClientRect = () => ({ left: 40, top: 700, right: 100, bottom: 760, width: 60, height: 60 });

  const began = drag(window, pitem, [
    { x: 60, y: 720 }, { x: 78, y: 710 }, { x: 160, y: 560 },
  ], "mouse");

  assert.equal(began, true);
});

test("a horizontal-dominant touch swipe still scrolls the tray instead of dragging", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { window, document } = dom.window;
  const pitem = document.querySelector(".pitem");
  pitem.getBoundingClientRect = () => ({ left: 40, top: 700, right: 100, bottom: 760, width: 60, height: 60 });

  const began = drag(window, pitem, [
    { x: 60, y: 720 }, { x: 90, y: 722 },
  ], "touch");

  assert.equal(began, false);
});
