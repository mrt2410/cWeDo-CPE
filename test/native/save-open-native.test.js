const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, dragBlockFromTrayToBoard, wait } = require("../helpers.js");

/** Same capture helper as test/save-open.test.js, used here to prove the
 * native path does NOT fall back to the (non-functional, in a packaged
 * Android app) Blob download. */
function captureDownload(window) {
  const captured = { filename: null };
  const origClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { captured.filename = this.download; };
  captured.restore = () => { window.HTMLAnchorElement.prototype.click = origClick; };
  return captured;
}

function fakeNativeStorage(initial) {
  const files = new Map(Object.entries(initial || {}));
  return {
    available: true,
    calls: [],
    async save(name, text) { this.calls.push(['save', name, text]); files.set(name, text); },
    async list() { return [...files.keys()].sort(); },
    async load(name) { if (!files.has(name)) throw new Error('not found'); return files.get(name); },
    async remove(name) { files.delete(name); },
  };
}

test("Save As writes through NativeProgramStorage when present, and never downloads", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window } = dom.window;
  dragBlockFromTrayToBoard(window, "StartBlock");
  await wait(50);

  const storage = fakeNativeStorage();
  window.NativeProgramStorage = storage;
  const captured = captureDownload(window);

  document.getElementById("saveasbtn").click();
  document.getElementById("saname").value = "my program";
  document.getElementById("saok").click();
  await wait(10);

  assert.equal(document.getElementById("saveas").classList.contains("open"), false);
  assert.equal(captured.filename, null, "must not fall back to the Blob download");
  assert.equal(storage.calls[0][0], "save");
  assert.equal(storage.calls[0][1], "my program.wedo.json");
  const saved = JSON.parse(storage.calls[0][2]);
  assert.equal(saved.stacks[0].items[0].key, "StartBlock");
  assert.match(document.getElementById("banner").textContent, /Saved/);
  captured.restore();
});

test("Save As reports an error banner when NativeProgramStorage.save() rejects", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window } = dom.window;

  window.NativeProgramStorage = {
    available: true,
    save: async () => { throw new Error("disk full"); },
  };

  document.getElementById("saveasbtn").click();
  document.getElementById("saname").value = "x";
  document.getElementById("saok").click();
  await wait(10);

  assert.match(document.getElementById("banner").textContent, /Could not save: disk full/);
});

test("Open shows the native in-app list instead of the OS file picker when NativeProgramStorage is present", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window } = dom.window;
  window.NativeProgramStorage = fakeNativeStorage({
    "b.wedo.json": JSON.stringify({ format: "wedo-cpe-program", version: 1, stacks: [] }),
    "a.wedo.json": JSON.stringify({ format: "wedo-cpe-program", version: 1, stacks: [] }),
  });

  let filePickerClicked = false;
  document.getElementById("openfile").click = () => { filePickerClicked = true; };

  document.getElementById("openbtn").click();
  await wait(10);

  assert.equal(document.getElementById("openlist").classList.contains("open"), true);
  assert.equal(filePickerClicked, false);
  const rows = [...document.querySelectorAll("#olgrid .orow .pick")].map(b => b.textContent);
  assert.deepEqual(rows, ["a.wedo.json", "b.wedo.json"]);
});

test("Open shows an empty-state message when nothing is saved yet", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window } = dom.window;
  window.NativeProgramStorage = fakeNativeStorage();

  document.getElementById("openbtn").click();
  await wait(10);

  assert.equal(document.querySelectorAll("#olgrid .orow").length, 0);
  assert.match(document.getElementById("olgrid").textContent, /No saved programs yet/);
});

test("picking a program from the native list opens it and closes the dialog", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window } = dom.window;
  window.NativeProgramStorage = fakeNativeStorage({
    "prog.wedo.json": JSON.stringify({ format: "wedo-cpe-program", version: 1, stacks: [
      { id: 1, x: 10, y: 10, items: [{ t: "b", key: "StartBlock", input: null }] },
    ] }),
  });

  document.getElementById("openbtn").click();
  await wait(10);
  document.querySelector("#olgrid .orow .pick").click();
  await wait(10);

  assert.equal(document.getElementById("openlist").classList.contains("open"), false);
  assert.equal(document.querySelectorAll("#sheet .blk").length, 1);
  assert.match(document.getElementById("banner").textContent, /Opened "prog\.wedo\.json"/);
});

test("deleting a program from the native list removes it and refreshes the list", async (t) => {
  const dom = await loadApp();
  t.after(() => dom.window.close());
  const { document, window } = dom.window;
  window.NativeProgramStorage = fakeNativeStorage({ "prog.wedo.json": "{}" });

  document.getElementById("openbtn").click();
  await wait(10);
  document.querySelector("#olgrid .orow .del").click();
  await wait(10);

  assert.equal(document.getElementById("openlist").classList.contains("open"), true, "delete must not close the dialog");
  assert.match(document.getElementById("olgrid").textContent, /No saved programs yet/);
});
