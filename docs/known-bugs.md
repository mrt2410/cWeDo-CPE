# Known bugs

Open bugs that are reported but not yet fixed. Each entry lists what was checked, so the
next person doesn't repeat it.

## Picking a hub from Chrome's picker does not connect by itself

**Status:** open. Reported 2026-10-23 (Chrome, Refresh button).

**Steps:** press Refresh in "Choose Smarthub" → Chrome's device picker opens → pick the hub.
The hub appears in the list, but nothing connects. Clicking the hub's row in the list then
connects normally.

**Expected:** picking the hub from the picker connects straight away.

**What was checked (code path is not the cause in jsdom):**

- `search()` in `js/app.js` calls `connect(device)` right after `requestDevice()` resolves, and
  the row click calls the same `connect(h.device)`. The jsdom test
  `test/picker-auto-connect.test.js` confirms that the connect attempt starts without a row click.
  That test passes, so it guards against regressions but does not reproduce this bug.
- The picker path is only taken when live scanning is unavailable (`requestLEScan` missing), so
  Chrome with live scanning enabled would not show the picker at all.

**Likely area:** the real `device.gatt.connect()` attempt right after the picker closes. It can't
be reproduced in jsdom (Web Bluetooth isn't available there), so it needs a real browser and hub.

**Evidence needed:** the Diagnostics log right after a picker-driven attempt (the `connecting to …`
line and whatever follows: `connect failed: …`, a timeout, or nothing). Also the Chrome version and OS.

## Can't remove a hub from the Choose Smarthub list

**Status:** fixed 2026-10-23. Tests in `test/forget-hub.test.js`.

**Problem:** a hub that isn't connected (found by the picker or a scan) stayed in the list until
the page reloaded, with no way to remove it. Only connected hubs had controls.

**Fix:** each disconnected row has a grey **Forget** button (trash icon). It removes the hub from
the list. If it is the remembered hub, that is forgotten too, so auto-reconnect won't look for
it on the next load. Connected hubs don't get the button; disconnect first.

**Tradeoff:** the hub is not blocked. Scanning or the picker will list it again if it is still
in range. Forget only tidies the list.
