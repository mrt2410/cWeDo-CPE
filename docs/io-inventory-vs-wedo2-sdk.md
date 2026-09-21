# Input/Output inventory vs. LEGO-WeDo-2.0-Python-SDK

Compares every Input/Output (sensor + actuator) block this app implements against
what the LEGO Smart Hub actually exposes, using
[jannopet/LEGO-WeDo-2.0-Python-SDK](https://github.com/jannopet/LEGO-WeDo-2.0-Python-SDK)
as the reference for hub-side capabilities (it talks to the same hub over the same
four GATT characteristics, just via a BLED112 USB dongle instead of Web Bluetooth).

The SDK exposes exactly 7 I/O device types (`wedo2/bluetooth/connect_info.py`,
`IOType` enum): Motor(1), Voltage(20), Current(21), Piezo Tone Player(22),
RGB Light(23), Tilt Sensor(34), Motion/Distance Sensor(35).

## 1. What this app currently implements

Block roster is defined in [js/blocks/core.js](../js/blocks/core.js) (`SOCKETED`/`INPUTS`
sets near the top, and the `execBlock` switch around
[js/blocks/core.js:300](../js/blocks/core.js#L300)), which dispatches to the per-device
files under `js/blocks/` and `js/telemetry/`.

### Outputs (actuators)

| Block(s) | Hub feature | Notes |
|---|---|---|
| `MotorPowerBlock`, `MotorThisWayBlock`, `MotorThatWayBlock`, `MotorOffBlock`, `MotorOnForBlock`, `MotorBrakeBlock` | Motor (type 1) | [js/blocks/motor.js](../js/blocks/motor.js): `motorRun()` (run at %), `MotorOffBlock`/`execOff` for drift (power 0), and `MotorBrakeBlock`/`execBrake` for instant brake (power 127) per `MOTOR_POWER_BRAKE`. Always writes to **both** ports 1 and 2 with the same command rather than the actual attached motor's port — fine for the classic single-motor WeDo model, but not per-motor addressable. |
| `LightBlock` | RGB Light (type 23), **Discrete + Absolute mode** | [js/blocks/rgb-light.js](../js/blocks/rgb-light.js) `ledSet()`/`ledSetRGB()`. Discrete: `[0x06, 0x04, 0x01, index]`, 1-byte palette index 0–10, matches the SDK's `set_color_index()`. Absolute (full-colour): `[0x06, 0x04, 0x03, r, g, b]`, 3-byte RGB payload, matches `set_color()`/`RGBLightMode.RGB_LIGHT_MODE_ABSOLUTE` — same port (6) and command (`0x04`) as the discrete write, differing only in payload length. Each command declares its mode first: `ledSetMode()` writes an input format (`inputFormat(6, 23, mode, 0)` — the same byte layout `configurePort()` uses for tilt/distance) to the input characteristic, mode `0` before a discrete write and mode `1` before an absolute one, so neither command depends on what mode the other left the hub in. **This mode-switch write is UNVERIFIED against real hardware** — nobody has confirmed on a real hub whether it is actually required (payload length alone may be enough to disambiguate), nor that `23`/`0`/`1` are the right type and mode bytes. (The piezo/voltage/current port numbers that used to share this caveat have since been confirmed against real hardware — see their own entries.) It is written because the SDK's own device classes set an input format before driving a device, and a redundant write is cheaper than a silently misread colour command. Reachable in the UI via a 12th "Custom…" tile in the existing colour dialog (`js/app.js` `buildColourList()`/`openRgbSliders()`), which opens three R/G/B sliders; the chosen triple is stored on the block item as `it.customRGB={r,g,b}` (same pattern as `StartOnKeyPressBlock.letter`), with `it.input`/`it.inputValue` left as a display-only `'RGB'` placeholder. |
| `PlaySoundBlock` | *(not a hub feature)* | Plays a bundled/recorded sound through the **tablet's own speaker** via Web Audio ([js/blocks/sound.js:82](../js/blocks/sound.js#L82) `playSound()`), not the hub's piezo buzzer. |
| `PlayToneBlock` | Piezo Tone Player (type 22) — **implemented, port confirmed, hub has no speaker** | [js/blocks/piezo-tone-player.js](../js/blocks/piezo-tone-player.js) `playTone()`/`stopTone()`. Sends `[port, 0x02, 0x04, freq_lo, freq_hi, dur_lo, dur_hi]` to play (command `0x02` = `PLAY_PIEZO_TONE_COMMAND_ID`, little-endian u16 frequency/duration) and `[port, 0x03, 0x00]` to stop (`0x03` = `STOP_PIEZO_TONE_COMMAND_ID`), matching `output_command.py` exactly. Note-to-frequency uses equal temperament (A4=440Hz). **Port `5` is now confirmed against real hardware**: connecting a real Smarthub broadcasts connect ID `5` attached with IO type `22` in its "Attached I/O" event, matching this port exactly. However, testing on real hardware also established that **the retail WeDo 2.0 Smarthub has no physical speaker** — the command is accepted by the hub's firmware (harmless) but never produces audible sound there; LEGO's own app never exposed a hub-tone block for the same reason. So `playTone()`/`stopTone()` now *also* synthesise the tone locally via Web Audio (`ac()`, from `sound.js`), the same mechanism `PlaySoundBlock` uses — that's the only way this block is actually audible on real WeDo 2.0 hardware. The BLE command is still sent as-is, both because the hub accepts it harmlessly and to keep the block working unchanged on other LEGO hubs that do have a physical piezo (e.g. BOOST/Powered Up, which share this protocol). Not covered by the automated test suite — jsdom has no Web Audio, same limitation as the mic/recording code in `sound.js` — so the tablet-audio path needs manual verification in a real browser. The note/octave picker (`#tones`) now also has a Play button (`#tnplay`, next to the octave field) so you can hear the currently selected note before closing the picker — `PiezoTonePlayer.preview(note,octave)` reuses the same `playToneAudio()` synth path but skips `sendOut()` entirely, since a preview shouldn't move a motor or trigger any other hub side-effect while you're just auditioning a sound. Its oscillator's peak gain was bumped from `0.2` to `0.22` to exactly match `sound.js`'s `playPlaceholder()` gain, so a previewed/played tone and a placeholder `PlaySoundBlock` tone are equally loud. |
| `DisplayBlock`, `DisplayBackgroundBlock`, `DisplayClosedBlock`, `DisplayMediumsizeBlock`, `DisplayFullsizeBlock`, `Add/Subtract/Multiply/DivideDisplayBlock` | *(not a hub feature)* | A virtual on-screen "display" widget, purely software (mirrors the original WeDo/ScratchJr-style app screen). |
| `SendMessageBlock` / `StartOnMessageBlock` / `StartOnKeyPressBlock` / `WaitForBlock` | *(not a hub feature)* | In-app broadcast/messaging between block stacks. |

### Inputs (sensors)

| Block(s) | Hub feature | Notes |
|---|---|---|
| `AnyTilt`, `TiltUp`, `TiltDown`, `TiltThisWay`, `TiltThatWay`, `TiltSensorInput` | Tilt Sensor (type 34), **Tilt/direction mode only** | [js/blocks/tilt-sensor.js](../js/blocks/tilt-sensor.js). Reports the same 5-state direction enum as the SDK's `TiltSensorMode.TILT_SENSOR_MODE_TILT` (0/3/5/7/9). Auto-detected and auto-configured on attach via `configurePort()`. |
| `AnyDistanceChange`, `DistanceChangeCloser`, `DistanceChangeFurther`, `DistanceSensorInput` | Motion/Distance Sensor (type 35), **Detect mode only** | [js/blocks/motion-sensor.js](../js/blocks/motion-sensor.js), 0–10 range clamp matches the SDK's `MAX_DISTANCE`/`MIN_DISTANCE`. |
| `StartOnButtonPressBlock` | Hub button (standard GATT), **implemented** | [js/blocks/messaging.js](../js/blocks/messaging.js) `triggerButtonPress()` and [js/telemetry/button-battery.js](../js/telemetry/button-battery.js) for state tracking. Reuses the existing `h.pressed` boolean flag updated on every button characteristic notification. |
| `SoundSensorInput` | *(not a hub feature)* | Uses the **tablet's microphone** via `getUserMedia` ([js/blocks/sound.js:98](../js/blocks/sound.js#L98)), not a hub sensor — WeDo 2.0 never had a physical sound sensor. |
| `NumberInput`, `TextInput`, `DisplayInput`, `RandomInput` | *(not a hub feature)* | Generic literal/software inputs used to feed numeric sockets. |

### Extras beyond the SDK's scope

The app also surfaces two things the SDK doesn't expose at all (no `IOType` covers
them — they're standard BLE GATT services the hub also implements):
- **Hub button** state (`C_BUTTON` characteristic, [js/telemetry/button-battery.js](../js/telemetry/button-battery.js)) — **now wired to a programmable block** via `StartOnButtonPressBlock` and `triggerButtonPress()` ([js/blocks/messaging.js](../js/blocks/messaging.js)). Also shown in the hub panel for telemetry.
- **Battery level** (standard `battery_level` GATT characteristic, [js/telemetry/button-battery.js](../js/telemetry/button-battery.js)) — telemetry-only, shown in the hub panel.

Also now implemented, this time an actual `IOType` the SDK does cover:
- **Voltage (type 20) / Current (type 21) sensors**, read-only hub-panel telemetry — [js/telemetry/voltage-current.js](../js/telemetry/voltage-current.js) `wireVoltageCurrent()`. Configured once per connect (hub-internal, not port-attached, so no `configurePort()`/attach-detection needed) via an `inputFormat` write against each sensor's own fixed connect ID, same idea as the SDK's `VoltageSensor`/`CurrentSensor` constructors. Readings are shown next to the battery badge in the hub panel (`.voltcur` in `renderHubs()`). **Ports 4 (voltage) and 3 (current) are now confirmed against real hardware**: a real Smarthub's "Attached I/O" broadcast reports connect ID `4` for IO type `20` (voltage) and connect ID `3` for IO type `21` (current), matching both guesses exactly — same hardware test that confirmed the piezo's port `5`. No block/program use case yet, per the design doc — telemetry-only for now.

## 2. What's missing, compared to the SDK

| Missing capability | SDK reference | Why it matters |
|---|---|---|
| ~~**RGB Light Absolute mode**~~ — **Implemented** | `rgb_light.py::set_color()`, `RGBLightMode.RGB_LIGHT_MODE_ABSOLUTE` | Full 0–255/0–255/0–255 colour now reachable via a "Custom…" tile in the existing colour dialog. See [js/blocks/rgb-light.js](../js/blocks/rgb-light.js) `ledSetRGB()`. |
| ~~**Motor power offset compensation**~~ — **Implemented** | `bluetooth_io.py::write_motor_power()` — remaps 1–100 input onto an actual 35–100 output range | Remaps input power 1–100 onto output 35–100 before sending so low settings still move the motor (hardware stall floor ~35%), matching the SDK's behavior. See [js/blocks/motor.js](../js/blocks/motor.js) `motorRun()`. |
| **Tilt Sensor Angle mode** (continuous x/y degrees, −45..45) | `tilt_sensor.py::get_angle()`, `TiltSensorMode.TILT_SENSOR_MODE_ANGLE` | Only the 5-state discrete direction is read; no continuous tilt angle input exists for e.g. steering-wheel-style controls. |
| **Motion Sensor Count mode** (counts objects passing) | `motion_sensor.py::get_count()`, `MotionSensorMode.MOTION_SENSOR_MODE_COUNT` | Only "current distance" (Detect mode) is read; there's no "count objects that passed" input. |
| ~~**Voltage sensor** (type 20)~~ — **Implemented** | `smarthub.py::get_voltage()` | Now read as hub-panel telemetry (mV, shown as V). See [js/telemetry/voltage-current.js](../js/telemetry/voltage-current.js). |
| ~~**Current sensor** (type 21)~~ — **Implemented** | `smarthub.py::get_current()` | Now read as hub-panel telemetry (mA). Same file. |
| ~~**Hub button as a programmable input**~~ — **Implemented** | *(not in SDK — see note)* | Wired to `StartOnButtonPressBlock`, reusing `h.pressed` state tracked at [js/telemetry/button-battery.js](../js/telemetry/button-battery.js). See [js/blocks/messaging.js](../js/blocks/messaging.js) `triggerButtonPress()`. |

## 3. Proposed implementation

Ordered roughly by value vs. effort. All of these reuse the existing `sendOut()` /
`writeOut()` output-command plumbing ([js/blocks/core.js:283](../js/blocks/core.js#L283)) and
the `configurePort()` / `onSensorValue()` input-format plumbing already in
[js/blocks/core.js](../js/blocks/core.js) —
no new architecture needed, just new device types and blocks.

1. ~~**Piezo Tone Player output**~~ — **Implemented** (`PlayToneBlock`, see section 1's
   Outputs table above and [js/blocks/piezo-tone-player.js](../js/blocks/piezo-tone-player.js)).
   Note + octave is chosen via a tap dialog (`#tones`, mirrors the existing motor-speed
   picker); duration comes from the block's own numeric socket, same as every other
   timed block. **The hub port (`5`) has since been confirmed against real hardware**
   (a real Smarthub's "Attached I/O" broadcast reports connect ID `5` for IO type `22`)
   — everything else (wire format, command IDs, note-to-frequency math) was carried
   over unchanged from this proposal and is also confirmed correct. What real-hardware
   testing did surface: **the retail Smarthub has no physical speaker**, so the block
   now also plays the tone through the tablet via Web Audio — see section 1's Outputs
   table for details.

2. ~~**Motor brake**~~ — **Implemented** (`MotorBrakeBlock`, see section 1's Outputs table
   and [js/blocks/motor.js](../js/blocks/motor.js)) sending power byte `127` for instant
   stop, distinct from `MotorOffBlock`'s drift behavior (power byte `0`).

3. ~~**RGB Light Absolute mode**~~ — **Implemented** (extends the existing `LightBlock`/
   `ledSet` path, no new block — there's no sprite art for a second light block)
   - `ledSetMode()` in [js/blocks/rgb-light.js](../js/blocks/rgb-light.js) writes an
     input-format mode switch (mode `0` before a discrete write, mode `1` before an
     absolute one) ahead of the `[0x06, 0x04, …]` payload, mirroring `configurePort()`'s
     input-format writes for tilt/distance. **Whether this mode-switch write is actually
     required is UNVERIFIED against real hardware** — the hub may already tell the two
     apart by payload length alone. (The piezo/voltage/current port numbers that used to
     share this caveat have since been confirmed against real hardware.)
   - UI: upgraded the existing colour dialog (`js/app.js` `openColourDialog`) with a
     12th "Custom…" tile that opens three R/G/B sliders (`#rgbsliders` in
     `cWeDo CPE v1.0.html`), alongside the current 11-swatch palette. The chosen triple
     is stored as `it.customRGB={r,g,b}` on the block item, checked first by
     `RgbLight.execLight` ahead of the discrete-index path.

4. ~~**Motor power offset compensation**~~ — **Implemented** (bug-fix-sized, no new block)
   - In `motorRun()` ([js/blocks/motor.js](../js/blocks/motor.js)), remaps the 1–100 input range to
     35–100 before sending, exactly as `bluetooth_io.py::write_motor_power()` does:
     `actual = round(35 + (100 - 35) / 100 * power)` (sign preserved separately).

5. ~~**Voltage / Current telemetry**~~ — **Implemented** (read-only, hub-panel telemetry,
   see section 1's Extras and [js/telemetry/voltage-current.js](../js/telemetry/voltage-current.js))
   - Hub-internal sensors (not port-attached), so no `configurePort()` /
     attach-detection needed — just an `inputFormat` write once per connect targeting
     the hub's fixed voltage/current connect IDs, then a second listener on the
     existing sensor-value characteristic, the same way `onSensorValue` already
     does for tilt/distance.
   - Shipped as hub-panel telemetry (like button/battery today) rather than a new
     block, since there's no obvious "program" use case yet — a natural follow-up
     once it's wired up would be a `BatteryLowInput` condition block.

6. **Tilt Angle mode** and **Motion Count mode** (nice-to-have, more UI design work)
   - Both require: (a) a way to pick the sensor's mode from the block UI (today mode
     is fixed per sensor type in `configurePort()`), and (b) new numeric input blocks
     (`TiltAngleXInput`/`TiltAngleYInput`, `DistanceCountInput`) since the current
     `NUM_INPUTS`/`INPUTS` model assumes one fixed input per sensor. This is more
     invasive than 1–5 and worth a separate design pass before implementing.

7. **Hub Button as a programmable input** (not an SDK gap, but adjacent — cheap since
   the button is already read)
   - Add `StartOnButtonPressBlock` alongside the existing `StartOnKeyPressBlock`,
     reusing the `h.pressed` state already tracked at
     [js/telemetry/button-battery.js:11](../js/telemetry/button-battery.js#L11).

Items 1 (Piezo Tone Player), 2 (Motor brake), 3 (RGB Light Absolute mode), 4 (Motor power offset compensation), 5 (Voltage/Current telemetry), and 7 (Hub Button as a programmable input) have been implemented — see section 1's Outputs/Extras tables and the "Inputs" section.

Items 6 (Tilt Angle mode and Motion Count mode) remain in the proposal — they require additional UI design work for mode selection per sensor.

Follow the project's TDD convention (`AGENTS.md`) when building any of the above: write a
failing test in `test/` first, since the BLE writes themselves can't be exercised in
jsdom (Web Bluetooth isn't available there) — test the byte-encoding/state-management
logic directly, and note plainly that the actual GATT writes need manual verification
against real hardware.
