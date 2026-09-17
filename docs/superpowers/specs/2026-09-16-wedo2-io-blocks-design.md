# Design: per-device block files + new WeDo 2.0 hub I/O features

Status: approved 2026-09-16. Implements the proposal in
[docs/io-inventory-vs-wedo2-sdk.md](../../io-inventory-vs-wedo2-sdk.md).

## Problem

1. All block logic (rendering, drag/drop, BLE, sensors, execution) lives in one
   1966-line `js/app.js`, making it hard to isolate and troubleshoot a single
   device's behavior.
2. Five hub capabilities identified as missing against the reference
   [LEGO-WeDo-2.0-Python-SDK](https://github.com/jannopet/LEGO-WeDo-2.0-Python-SDK)
   are not implemented: Piezo Tone Player, motor brake, motor power offset
   compensation, RGB Light absolute (full-color) mode, and a programmable
   hub-button block.

## Loading model

No bundler, no ES modules — `import`/`export` breaks `file://` loading (blocked by
CORS), which this app must keep supporting. New files follow the existing
`data/*.js` pattern: plain `<script src>` tags, evaluated in order, all sharing one
global scope (classic, non-module scripts share top-level `let`/`const`/`function`
bindings across `<script>` tags in the same document — confirmed by how
`data/bundle.js`/`soundbank.js`/`bgbank.js` already work today).

**Ordering hazard:** top-level code that runs *immediately* at load (not inside a
function) must stay in the last-loaded file, after everything it needs exists. This
project already hit this exact bug once — `autoReconnect()` had to move to the end
of `app.js` (see CHANGELOG 2026-09-16 (6)). All boot-time calls (`restoreProgram()`,
`restoreCustomSound()`, `autoReconnect()`, initial `render()`) stay at the bottom of
`app.js`, which remains the last file loaded. Everything else is called from inside
event handlers / async functions, which resolve identifiers at call time — safe
regardless of file order, since all scripts finish loading before any user
interaction or timer fires.

`test/helpers.js`'s `SCRIPTS` array (currently `["data/bundle.js",
"data/soundbank.js", "data/bgbank.js", "js/app.js"]`) gets every new filename added,
in the same order as the `<script>` tags in `WeDo CPE v1.0.html`.

## File layout

```
js/
  blocks/
    core.js               -- shared block-classification sets (STARTS/SOCKETED/
                              INPUTS/NUM_INPUTS), canAccept(), sendOut()/writeOut(),
                              execBlock() dispatcher, generic value blocks
                              (NumberInput/TextInput/DisplayInput/RandomInput,
                              inputNumber(), randomFor()/RAND_RANGE, DEFAULT_INPUT)
    motor.js               -- motorState, motorRun(), power-offset compensation,
                              execBlock handlers: MotorPowerBlock, MotorThisWayBlock,
                              MotorThatWayBlock, MotorOffBlock, MotorOnForBlock,
                              MotorBrakeBlock (new)
    rgb-light.js            -- LED_NAMES/LED_HEX, ledSet() (discrete),
                              ledSetRGB() (new, absolute mode), execBlock handler
                              for LightBlock, new SetLightColorBlock
    piezo-tone-player.js     -- NEW: note table, playTone()/stopTone(), execBlock
                              handler for new PlayToneBlock
    tilt-sensor.js           -- tilt state slice, TILT/TILT_INFO, port-attach
                              config, tilt condition checks
    motion-sensor.js         -- distance state slice, DIST_EPS, port-attach config,
                              distance condition checks
    sound.js                 -- tablet mic (SoundSensorInput) + tablet speaker
                              (PlaySoundBlock, custom recording) — kept together,
                              they share one Web Audio context
    display.js               -- virtual display state/paint/math blocks
                              (DisplayBlock, DisplayBackgroundBlock,
                              DisplayClosed/Medium/FullsizeBlock, Add/Subtract/
                              Multiply/DivideDisplayBlock)
    messaging.js              -- broadcast()/triggerKey(), SendMessageBlock,
                              StartOnMessageBlock, StartOnKeyPressBlock,
                              StartOnButtonPressBlock (new)
  telemetry/
    button-battery.js         -- existing hub-button + battery GATT wiring,
                              moved out of app.js's connect()
    voltage-current.js        -- NEW voltage/current sensor wiring
  app.js                      -- engine only: canvas rendering/geometry, drag-and-
                              drop, all dialogs (colour/speed/sound/bg/letter
                              pickers), save/open, autosave, BLE scan/connect/
                              disconnect/reconnect, boot sequence
```

**Boundary rule:** a file under `blocks/` or `telemetry/` owns a device's runtime
state, its BLE read/write functions, its `execBlock` case bodies, and (for inputs)
its attach/config and condition-check logic. Everything about *how a block looks or
is dragged/edited on the canvas* — including the colour/speed/sound/bg dialogs —
stays in `app.js`, since it's shared interaction machinery (`handleTap`,
`beginDrag`) rather than device-specific behavior. Block-classification sets and
per-block-type metadata tables (`DEFAULT_INPUT`, `RAND_RANGE`) stay centralized in
`blocks/core.js`: they're consulted generically by the block-creation/execution
engine keyed by block name, not by device logic, so splitting them per-file would
add indirection without isolating anything meaningful.

Each device file exposes a small namespaced object at the bottom, e.g.:
```js
const Motor = { run, execPower, execThisWay, execThatWay, execOff, execOnFor, execBrake };
```
so `blocks/core.js`'s `execBlock` switch reads as
`case 'MotorPowerBlock': Motor.execPower(it); break;`. This isn't required by the
loading model (one shared global scope either way) — it exists purely so each file
has a legible "what does this expose" surface for troubleshooting.

## New features

| Feature | New block(s) | File | Wire format (from SDK reference) |
|---|---|---|---|
| Piezo Tone Player | `PlayToneBlock` | `blocks/piezo-tone-player.js` | play: `[connect_id, 0x02, 0x04, freq_lo, freq_hi, dur_lo, dur_hi]` (command `0x02`, little-endian u16 frequency + duration ms); stop: `[connect_id, 0x03, 0x00]` (command `0x03`) |
| Motor brake | `MotorBrakeBlock` | `blocks/motor.js` | power byte `127` (vs. `0` for the existing drift/off) |
| Motor power offset compensation | *(fix to existing blocks, no new block)* | `blocks/motor.js` | remap the 1–100 input range to 35–100 before sending: `actual = round(35 + (100-35)/100 * power)`, sign handled separately |
| RGB Light absolute mode | `SetLightColorBlock` (full RGB) | `blocks/rgb-light.js` | mode-switch input-format write (`[0x01,0x02,port,23,1,...]`, mode 1 = absolute), then `[0x06, 0x04, 0x03, r, g, b]` (command `0x04`, 3-byte payload) |
| Hub button as a block | `StartOnButtonPressBlock` | `blocks/messaging.js` + `telemetry/button-battery.js` wiring | reuses existing `h.pressed` state, no new BLE traffic |

Tilt-angle-mode and motion-count-mode are explicitly out of scope for this pass
(flagged in the original proposal as needing their own UI design — mode-switching
UI, new numeric input blocks).

## Testing

TDD per `AGENTS.md`. Each file under `blocks/`/`telemetry/` gets a matching test
file under `test/blocks/` (e.g. `test/blocks/motor.test.js`,
`test/blocks/piezo-tone-player.test.js`), loaded through the existing `loadApp()`
helper once its `SCRIPTS` array includes the new files. The restructuring itself
(moving existing motor/tilt/distance/display/messaging code) is behavior-preserving
and must keep all existing tests green throughout — run `npm test` after each
extraction, not only at the end. Web Bluetooth itself still can't be exercised in
jsdom; test the byte-encoding and state-transition logic directly, same as today,
and call out anything that still needs manual verification against real hardware.

## Documentation

Every extraction and every feature gets a dated `CHANGELOG.md` entry, per this
project's standing convention. `docs/io-inventory-vs-wedo2-sdk.md` gets updated to
mark implemented items once done. This spec itself is the design record for the
restructuring; no separate `docs/block-file-layout.md` is needed since this file
already serves that purpose (the file layout table above stays accurate as the
description of the structure — if it drifts, update this file rather than forking a
duplicate description elsewhere).

## Out of scope

- Tilt Sensor angle mode, Motion Sensor count mode (need their own design pass).
- Moving dialogs (colour/speed/sound/bg pickers) into device files.
- Any build tooling / bundler / ES modules — stays zero-runtime-dependency, `file://`-compatible.
