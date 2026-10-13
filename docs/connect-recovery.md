# Connect recovery (stuck "Could not connect" state)

**Symptom:** after a failed attempt the UI could get stuck on
`Could not connect: GATT Server is disconnected. Cannot retrieve services…`, the search
button stayed greyed out, and no hub could be connected or disconnected short of a hard
refresh. The log ended on a `connecting to … ...` line with no result.

**Cause:** `device.gatt.connect()` in Chrome can hang forever after a failed attempt.
`connect()` in `js/app.js` sets `busy=true` and only clears it when that await settles,
so a hang left `busy` set permanently (search disabled, rows blocked). A half-open GATT
link was also left behind after other failures.

**Fix:**
- `gatt.connect()` is raced against `connectTimeoutMs` (15 s) and fails with
  "Connection timed out. Switch the hub off and on, then try again."
- Any failed connect calls `device.gatt.disconnect()` to cancel a pending or half-open
  link so the next attempt starts clean.
- The hint line under the search button is now selectable/copyable (`#hint` in
  `css/style.css`).

Tests: `test/connect-recovery.test.js` (fake device). The real hang needs a real hub and
Chrome; verify manually.

## Hub list height cap

`#list` had `max-height:34vh`, so in a window shorter than ~295px a single connected hub
row (~100px with padding and margin) was clipped and showed a scrollbar. It is now
`max(34vh,112px)`: one row always fits, and taller windows behave as before.
