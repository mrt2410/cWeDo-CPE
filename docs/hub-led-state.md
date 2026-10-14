# Hub icon LED reflects connection state

The small LED on the hub icon in the Choose Smarthub list is green only while the hub is
connected (`.row.connected`, or `.row.pressed` for the button-press highlight). A hub that
is found but not connected, or blocked, shows a grey LED. Previously the LED was always
green, so a disconnected hub still looked connected.

Test: `test/hub-led-state.test.js` (checks the CSS source; jsdom can't compute `::before`).
Visual check in a real browser is still manual.
