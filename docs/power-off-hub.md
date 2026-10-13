# Remote power off of the Smarthub

A connected hub's row has an amber power button (left of the pencil and the red
disconnect button). It asks for confirmation, then switches the hub off over BLE.

## How it works

On connect, `js/app.js` looks up the hub's "turn off" characteristic (`C_OFF`,
`0000152b-1212-efde-1523-785feabcd123`) in the hub service. `powerOffHub()` confirms,
halts running programs, and `writePowerOff()` writes a single `0x00` byte. The button
only appears when that characteristic was found (clone hubs may lack it).

- The hub drops the BLE link while shutting down, so a failed write on a link that is
  already gone is treated as success; a failed write on a still-connected hub shows an error.
- A powered-off hub cannot be woken remotely — press its button.

## Status

Verified on a real hub (2026-10-13): clicking the button and confirming powers the hub
off, so the UUID (`0000152b-…`) and the `0x00` value are correct for that hub. Tests
(`test/power-off-hub.test.js`) cover the confirm/write/disconnect handling against a fake
characteristic. Still unchecked: a genuine LEGO hub (vs. clone), and the iOS/Capacitor build.
If the button is missing on some hub, the log shows "power-off unavailable".
