const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, dragBlockFromTrayToBoard, wait } = require("./helpers.js");

/** Captures the Blob passed to URL.createObjectURL and the filename of the
 *  next <a download> click, without needing real navigation/downloads. */
function captureDownload(window) {
  const captured = { blob: null, filename: null };
  window.URL.createObjectURL = (blob) => { captured.blob = blob; return "blob:mock"; };
  window.URL.revokeObjectURL = () => {};
  const origClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    captured.filename = this.download;
  };
  captured.restore = () => { window.HTMLAnchorElement.prototype.click = origClick; };
  return captured;
}

test("Save As dialog opens with a pre-filled filename", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document } = dom.window;

  document.getElementById("saveasbtn").click();

  assert.equal(document.getElementById("saveas").classList.contains("open"), true);
  assert.notEqual(document.getElementById("saname").value.trim(), "");
});

test("confirming Save As downloads the current program as JSON and closes the dialog", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  dragBlockFromTrayToBoard(dom.window, "StartBlock");
  await wait(50);

  const captured = captureDownload(dom.window);
  document.getElementById("saveasbtn").click();
  document.getElementById("saname").value = "my program";
  document.getElementById("saok").click();

  assert.equal(document.getElementById("saveas").classList.contains("open"), false);
  assert.equal(captured.filename, "my program.wedo.json");

  const text = await captured.blob.text();
  const data = JSON.parse(text);
  assert.equal(data.format, "wedo-cpe-program");
  assert.equal(data.stacks[0].items[0].key, "StartBlock");
  captured.restore();
});

test("opening a valid program file replaces the board and persists it", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window, localStorage } = dom.window;
  const file = new window.File(
    [JSON.stringify({ format: "wedo-cpe-program", version: 1, stacks: [
      { id: 1, x: 10, y: 10, items: [{ t: "b", key: "StartBlock", input: null }] },
    ] })],
    "prog.wedo.json",
    { type: "application/json" },
  );

  const input = document.getElementById("openfile");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await wait(400); // past the autosave debounce

  assert.equal(document.querySelectorAll("#sheet .blk").length, 1);
  const saved = JSON.parse(localStorage.getItem("wedo:program"));
  assert.equal(saved.stacks[0].items[0].key, "StartBlock");
});

test("opening an invalid file leaves the board unchanged and reports the error", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window } = dom.window;
  dragBlockFromTrayToBoard(dom.window, "StartBlock");
  await wait(50);
  const before = document.querySelectorAll("#sheet .blk").length;
  const bannerBefore = document.getElementById("banner").textContent;

  const file = new window.File(["not json"], "prog.wedo.json", { type: "application/json" });
  const input = document.getElementById("openfile");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(50);

  assert.equal(document.querySelectorAll("#sheet .blk").length, before);
  assert.notEqual(document.getElementById("banner").textContent, bannerBefore);
});
