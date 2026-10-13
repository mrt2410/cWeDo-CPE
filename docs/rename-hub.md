# Renaming the Smarthub

A connected hub can be renamed from its row in the hub list: click the grey pencil
button (left of the red disconnect button), type a new name, confirm.

## How it works

`js/app.js` already reads the hub's name from the Name ID characteristic
(`00001524-1212-efde-1523-785feabcd123`) on connect. Renaming writes UTF-8 bytes to the
same characteristic (`renameHub()` → `validateHubName()` → `writeHubName()`).

- **20-byte cap** (`HUB_NAME_MAX_BYTES`). Deliberately conservative: the factory default
  `LPF2 Smart Hub 2 I/O` is 20 bytes, and 20 is the most a single default-MTU BLE write
  carries. Bytes, not characters — `é` counts as 2. The real limit is unverified.
- **Read-back verification.** After writing, the name is read back and that is what the
  app shows. Some clone hubs accept the write without storing it; in that case the app
  reports "The hub did not accept the new name" instead of pretending it worked.
- Also updates the remembered last hub (`wedo:lastHub`) so auto-reconnect shows the new name.
- The pencil button only appears when the name characteristic was found on connect.

## Tradeoffs / still to verify on real hardware

- The BLE write itself can't run in jsdom; tests (`test/rename-hub.test.js`) cover
  validation and write/read-back against a fake characteristic.
- Unverified: whether clone hubs persist the name across power cycles, and whether the
  browser's device picker shows the new name immediately or a cached old one until re-pair.
- The name prompt uses `window.prompt()`, which Capacitor's Android/iOS WebViews support.
