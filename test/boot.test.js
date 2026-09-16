const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, wait } = require("./helpers.js");

// A single large classic script is easy to get load-order wrong in (e.g. a
// startup call placed before the `const`s it depends on, which throws a
// silent, uncaught rejection with no visible error in a real browser). This
// catches that class of bug explicitly, rather than relying on it incidentally
// failing whichever other test happens to be running at that moment.
test("the app boots without any unhandled promise rejections", async (t) => {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  t.after(() => process.removeListener("unhandledRejection", onRejection));

  const dom = await loadApp();
  t.after(() => dom.window.close());
  await wait(200);

  assert.deepEqual(rejections, []);
});
