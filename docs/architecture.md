# Code layout: `js/blocks/`, `js/telemetry/`, `js/ble/`, `js/native/`, `app.js`

## Loading model

No bundler, no ES modules — `import`/`export` breaks `file://` loading (blocked by
CORS), which this app must keep supporting. Every file is a plain `<script src>` tag
in [cWeDo CPE v1.0.html](../cWeDo%20CPE%20v1.0.html), evaluated in order, all sharing
one global scope (classic, non-module scripts share top-level `let`/`const`/`function`
bindings across `<script>` tags in the same document — the same way
`data/bundle.js`/`soundbank.js`/`bgbank.js` already worked before the split below).

**Ordering hazard:** top-level code that runs *immediately* at load (not inside a
function) must stay in the last-loaded file, after everything it needs exists. This
project hit that bug once — `autoReconnect()` had to move to the end of `app.js` (see
[auto-reconnect.md](auto-reconnect.md)). All boot-time calls (`restoreProgram()`,
`restoreCustomSound()`, `autoReconnect()`, initial `render()`) stay at the bottom of
`app.js`, which remains the last file loaded. Everything else is called from inside
event handlers / async functions, which resolve identifiers at call time — safe
regardless of file order, since all scripts finish loading before any user interaction
or timer fires.

`test/helpers.js`'s `SCRIPTS` array must list every file in the same order as the
`<script>` tags in the HTML — adding a new file to one without the other will pass in
the browser and fail (or silently skip coverage) in tests, or vice versa.

## File layout

```
js/
  blocks/
    core.js               -- shared block-classification sets (STARTS/SOCKETED/
                              INPUTS/NUM_INPUTS), canAccept(), sendOut()/writeOut(),
                              execBlock() dispatcher, the execution engine
                              (sleep/until/runStack/execSeq/execRepeat), generic
                              value blocks (NumberInput/TextInput/DisplayInput/
                              RandomInput), and the shared sensor bus
                              (onPortEvent/onSensorValue/sensorCondition/
                              sensorAttached/clearSensors/renderPorts)
    motor.js                -- motorState, motorRun(), power-offset compensation,
                              MotorPowerBlock/MotorThisWayBlock/MotorThatWayBlock/
                              MotorOffBlock/MotorOnForBlock/MotorBrakeBlock
    rgb-light.js             -- LED_NAMES/LED_HEX, ledSet() (discrete),
                              ledSetRGB() (absolute/full-colour), LightBlock
    piezo-tone-player.js      -- note table, playTone()/stopTone(), PlayToneBlock
    tilt-sensor.js            -- tilt state slice, TILT/TILT_INFO, port-attach
                              config, tilt condition checks
    motion-sensor.js          -- distance state slice, DIST_EPS, port-attach
                              config, distance condition checks
    sound.js                  -- tablet mic (SoundSensorInput) + tablet speaker
                              (PlaySoundBlock, custom recording) — kept together,
                              they share one Web Audio context
    display.js                -- virtual on-screen display state/paint/math
                              blocks (software-only, no hub feature)
    messaging.js               -- broadcast()/triggerKey(), SendMessageBlock,
                              StartOnMessageBlock, StartOnKeyPressBlock,
                              StartOnButtonPressBlock
  telemetry/
    button-battery.js          -- hub-button + battery GATT wiring (standard
                              GATT services, not part of the WeDo2 IOType enum)
    voltage-current.js         -- voltage/current sensor wiring (hub-internal,
                              not port-attached — configured once per connect)
  ble/
    capacitor-ble-shim.js       -- native BLE bridge for the packaged Android
                              app (WebView has no Web Bluetooth); a no-op in
                              every normal browser — see
                              [android-apk-build.md](android-apk-build.md)
  native/
    capacitor-file-shim.js      -- native file save/open for the packaged
                              Android app; also a no-op in every normal browser
  app.js                        -- engine only: canvas rendering/geometry,
                              drag-and-drop, all dialogs (colour/speed/sound/
                              bg/letter pickers), save/open, autosave, BLE
                              scan/connect/disconnect/reconnect, boot sequence
```

## Boundary rule

A file under `blocks/` or `telemetry/` owns a device's runtime state, its BLE
read/write functions, its `execBlock` case bodies, and (for inputs) its attach/config
and condition-check logic. Everything about *how a block looks or is dragged/edited on
the canvas* — including the colour/speed/sound/bg dialogs — stays in `app.js`, since
it's shared interaction machinery (`handleTap`, `beginDrag`) rather than device-specific
behavior. Block-classification sets and per-block-type metadata tables
(`DEFAULT_INPUT`, `RAND_RANGE`) stay centralized in `blocks/core.js`: they're consulted
generically by the block-creation/execution engine keyed by block name, not by device
logic, so splitting them per-file would add indirection without isolating anything
meaningful.

Each device file exposes a small namespaced object at the bottom, e.g.:
```js
const Motor = { run, execPower, execThisWay, execThatWay, execOff, execOnFor, execBrake };
```
so `blocks/core.js`'s `execBlock` switch reads as
`case 'MotorPowerBlock': Motor.execPower(it); break;`. This isn't required by the
loading model (one shared global scope either way) — it exists purely so each file has
a legible "what does this expose" surface for troubleshooting.

## Hub protocol details

For the actual BLE wire format (GATT characteristics, command bytes, port numbers, and
what's confirmed vs. unverified against real hardware) per device, see
[io-inventory-vs-wedo2-sdk.md](io-inventory-vs-wedo2-sdk.md).

## Testing

Each file under `blocks/`/`telemetry/` has a matching test file under
`test/blocks/`/`test/telemetry/`, loaded through `test/helpers.js`'s `loadApp()`. Web
Bluetooth itself can't be exercised in jsdom — tests cover byte-encoding and
state-transition logic directly, and anything that needs real hardware is called out
in [io-inventory-vs-wedo2-sdk.md](io-inventory-vs-wedo2-sdk.md) instead of being
asserted here.
