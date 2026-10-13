# Port tiles (Port 1 / Port 2)

While a Smarthub is connected, two small tiles under the hub widget (top-right) show what
is plugged into the hub's external ports, 1 and 2. Issue #3.

- **Icons:** reuses the block-palette art from `data/bundle.js` — `MotorPowerBlock`
  (motor + gauge) for a motor, `AnyTilt` (shaking brick) for the tilt sensor,
  `AnyDistanceChange` (arrows brick) for the distance sensor — plus a `?` for a device the
  app doesn't recognise and a dashed empty tile when nothing is attached. Hover for a title
  such as "Port 1: tilt sensor".
- **Live:** updated from the hub's port attach/detach events (`onPortEvent` in
  [js/blocks/core.js](../js/blocks/core.js)) and reset on disconnect (`clearSensors()`).
  Duplicate attach events (the hub sometimes sends one twice) are harmless.
- **Visibility:** the tiles are hidden by CSS unless the hub widget is in its connected
  (`.on`) state.
- **Scope:** only ports 1 and 2. Hub-internal devices (RGB light, piezo, voltage/current)
  are not shown. Recognised types are the same three as the rest of the app
  (`DEV_MOTOR`, `DEV_TILT`, `DEV_DISTANCE`); add a new type to `PORT_KINDS`/`PORT_SPRITES`.

## Testing

`test/port-tiles.test.js` feeds packets copied from a real hub's debug log. Icon
appearance and real attach/detach still need a look on hardware.

## Hub details live under Diagnostics (2026-10-13)

The text block listing Tilt / Distance / Motor / Microphone and the tilt/distance
condition chips (`#ports`) is part of the "Diagnostics (development only)" section in the
Choose Smarthub panel. The section is closed by default; click its header to show the
hub details and the log. The panel is only as tall as its content, so a closed
Diagnostics leaves no blank area below it.
