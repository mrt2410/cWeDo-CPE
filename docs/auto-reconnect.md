# Auto-reconnecting to the last Smarthub

## What it does

After connecting to a Smarthub, its id and name are remembered in
`localStorage['wedo:lastHub']`. On the next page load, the app tries to reconnect to
that same hub automatically — no "Choose Smarthub" picker, no click needed — showing
"Reconnecting to `<name>`…" in the hub button while it tries.

A manual disconnect does **not** clear this memory: auto-reconnect only ever runs at
page load, never right after you disconnect something mid-session, so clicking
disconnect won't immediately fight you by reconnecting itself.

## Why it can't be a real background scan

Two Web Bluetooth calls need a recent click to run at all — the browser blocks them
otherwise: `requestDevice()` (today's manual picker) and `requestLEScan()` (the
live-scan mode). Neither can run automatically on page load.

What *can* run without a click is `navigator.bluetooth.getDevices()` — a Chrome/Edge
feature that returns devices you've already paired with in this browser/profile. If
the remembered id is in that list, `device.gatt.connect()` doesn't need a click either.
So "auto-reconnect" here means: look up the remembered device via `getDevices()`, then
retry `connect()` on it — not a real BLE scan, but it reaches the same result (no
re-prompt) while the hub isn't yet in range.

If `getDevices()` isn't supported (older Chromium, or Firefox which has no Web
Bluetooth at all — see [bluetooth-lan-setup.md](bluetooth-lan-setup.md)), this silently
does nothing and the app behaves exactly as before: manual "Choose Smarthub" only.

## Retry behavior

Retries the connect call every 3 seconds, up to 10 attempts (~30 seconds total). If the
hub still isn't reachable by then, it gives up and shows "Not connected" — same as
today, still connectable manually at any time.

## Diagnostics

`autoReconnect()` logs each decision (no remembered hub, `getDevices()` unsupported,
looking for a hub, giving up) to the same diagnostics log used elsewhere in the app —
open "Choose Smarthub" → "Diagnostics (development only)" to see it after a reload.

## Testing

The actual GATT connect (services, characteristics) needs a real browser and real
hardware, same as the rest of Web Bluetooth in this project. `test/auto-reconnect.test.js`
tests the part that doesn't need hardware — finding the remembered device via
`getDevices()` and the retry/timeout logic — with fakes standing in for
`getDevices()`/`connect()`/`isConnected()`.

`test/boot.test.js` guards against a real bug this feature shipped with: the
`autoReconnect()` call was placed right after the save/open startup code, but before
the Bluetooth section further down the file that declares `connectedHub`, `logLines`,
`capabilities`, etc. with `const`. Calling it that early hit a genuine JavaScript
temporal-dead-zone error — which happens in real browsers too, not just tests — and
since it's an `async` function called without `await`, it failed silently as an
unhandled promise rejection instead of a visible error. That's why auto-reconnect did
nothing after a hard refresh with no error shown. Fixed by moving the `autoReconnect()`
call to the very end of the file, after everything it depends on has run.
