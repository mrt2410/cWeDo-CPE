const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.js");

// A hub that is not connected stays in the Choose Smarthub list until the page
// reloads. "Forget" removes it from that list, and clears the remembered hub when
// it is the one that gets removed, so auto-reconnect doesn't try it on the next load.

const PROBE = "window.hubsMap = hubs; window.lastHubKey = LAST_HUB_KEY;";

function addHub(window, id, name, connected = false) {
  const device = { id, name, addEventListener() {}, gatt: { connected: false, disconnect() {} } };
  window.hubsMap.set(id, { device, name, connected, pressed: false });
  window.renderHubs();
}

test("a disconnected hub shows a Forget button, a connected one does not", async (t) => {
  const dom = await loadApp({ probe: PROBE });
  t.after(() => dom.window.close());
  const { window } = dom.window;
  addHub(window, "idle", "Idle hub");
  addHub(window, "live", "Live hub", true);
  const rows = [...window.document.querySelectorAll("#list .row")];
  const idle = rows.find((r) => r.textContent.includes("Idle hub"));
  const live = rows.find((r) => r.textContent.includes("Live hub"));
  assert.ok(idle.querySelector(".forget"), "disconnected row has Forget");
  assert.equal(live.querySelector(".forget"), null, "connected row has no Forget");
});

test("Forget removes the disconnected hub from the list", async (t) => {
  const dom = await loadApp({ probe: PROBE });
  t.after(() => dom.window.close());
  const { window } = dom.window;
  addHub(window, "idle", "Idle hub");
  addHub(window, "other", "Other hub");
  const idle = [...window.document.querySelectorAll("#list .row")].find((r) => r.textContent.includes("Idle hub"));
  idle.querySelector(".forget").click();
  assert.equal(window.hubsMap.has("idle"), false);
  assert.equal(window.document.querySelector("#list").textContent.includes("Idle hub"), false);
  assert.ok(window.document.querySelector("#list").textContent.includes("Other hub"), "other hub kept");
});

test("Forget clears the remembered hub when it is the one forgotten", async (t) => {
  const dom = await loadApp({ probe: PROBE });
  t.after(() => dom.window.close());
  const { window } = dom.window;
  window.localStorage.setItem("wedo:lastHub", JSON.stringify({ id: "idle", name: "Idle hub" }));
  addHub(window, "idle", "Idle hub");
  window.forgetHub(window.hubsMap.get("idle"));
  assert.equal(window.localStorage.getItem("wedo:lastHub"), null);
});

test("Forget keeps the remembered hub when a different hub is forgotten", async (t) => {
  const dom = await loadApp({ probe: PROBE });
  t.after(() => dom.window.close());
  const { window } = dom.window;
  const saved = JSON.stringify({ id: "keep", name: "Keep hub" });
  window.localStorage.setItem("wedo:lastHub", saved);
  addHub(window, "idle", "Idle hub");
  window.forgetHub(window.hubsMap.get("idle"));
  assert.equal(window.localStorage.getItem("wedo:lastHub"), saved);
});
