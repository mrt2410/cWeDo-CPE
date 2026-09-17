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

Block roster is defined in `js/app.js` (`SOCKETED`/`INPUTS` sets near the top, and
the `execBlock` switch around [js/app.js:789](js/app.js#L789)).

### Outputs (actuators)

| Block(s) | Hub feature | Notes |
|---|---|---|
| `MotorPowerBlock`, `MotorThisWayBlock`, `MotorThatWayBlock`, `MotorOffBlock`, `MotorOnForBlock`, `MotorBrakeBlock` | Motor (type 1) | [js/blocks/motor.js](../js/blocks/motor.js): `motorRun()` (run at %), `MotorOffBlock`/`execOff` for drift (power 0), and `MotorBrakeBlock`/`execBrake` for instant brake (power 127) per `MOTOR_POWER_BRAKE`. Always writes to **both** ports 1 and 2 with the same command rather than the actual attached motor's port — fine for the classic single-motor WeDo model, but not per-motor addressable. |
| `LightBlock` | RGB Light (type 23), **Discrete + Absolute mode** | [js/blocks/rgb-light.js](../js/blocks/rgb-light.js) `ledSet()`/`ledSetRGB()`. Discrete: `[0x06, 0x04, 0x01, index]`, 1-byte palette index 0–10, matches the SDK's `set_color_index()`. Absolute (full-colour): `[0x06, 0x04, 0x03, r, g, b]`, 3-byte RGB payload, matches `set_color()`/`RGBLightMode.RGB_LIGHT_MODE_ABSOLUTE` — same port (6) and command (`0x04`) as the discrete write; the hub tells the two apart by payload length alone, so no separate mode-switch write is needed. Reachable in the UI via a 12th "Custom…" tile in the existing colour dialog (`js/app.js` `buildColourList()`/`openRgbSliders()`), which opens three R/G/B sliders; the chosen triple is stored on the block item as `it.customRGB={r,g,b}` (same pattern as `StartOnKeyPressBlock.letter`), with `it.input`/`it.inputValue` left as a display-only `'RGB'` placeholder. |
| `PlaySoundBlock` | *(not a hub feature)* | Plays a bundled/recorded sound through the **tablet's own speaker** via Web Audio (`js/app.js:432` `playSound()`), not the hub's piezo buzzer. |
| `PlayToneBlock` | Piezo Tone Player (type 22) — **implemented** | [js/blocks/piezo-tone-player.js](../js/blocks/piezo-tone-player.js) `playTone()`/`stopTone()`. Sends `[port, 0x02, 0x04, freq_lo, freq_hi, dur_lo, dur_hi]` to play (command `0x02` = `PLAY_PIEZO_TONE_COMMAND_ID`, little-endian u16 frequency/duration) and `[port, 0x03, 0x00]` to stop (`0x03` = `STOP_PIEZO_TONE_COMMAND_ID`), matching `output_command.py` exactly. Note-to-frequency uses equal temperament (A4=440Hz). **The hub port (`5`) is an unverified guess** by analogy with the LED's hardcoded port `6` — the SDK doesn't hardcode a port for the piezo (it discovers `connect_id` dynamically), so this needs confirming against real hardware. |
| `DisplayBlock`, `DisplayBackgroundBlock`, `DisplayClosedBlock`, `DisplayMediumsizeBlock`, `DisplayFullsizeBlock`, `Add/Subtract/Multiply/DivideDisplayBlock` | *(not a hub feature)* | A virtual on-screen "display" widget, purely software (mirrors the original WeDo/ScratchJr-style app screen). |
| `SendMessageBlock` / `StartOnMessageBlock` / `StartOnKeyPressBlock` / `WaitForBlock` | *(not a hub feature)* | In-app broadcast/messaging between block stacks. |

### Inputs (sensors)

| Block(s) | Hub feature | Notes |
|---|---|---|
| `AnyTilt`, `TiltUp`, `TiltDown`, `TiltThisWay`, `TiltThatWay`, `TiltSensorInput` | Tilt Sensor (type 34), **Tilt/direction mode only** | [js/app.js:186](js/app.js#L186)–302. Reports the same 5-state direction enum as the SDK's `TiltSensorMode.TILT_SENSOR_MODE_TILT` (0/3/5/7/9). Auto-detected and auto-configured on attach via `configurePort()`. |
| `AnyDistanceChange`, `DistanceChangeCloser`, `DistanceChangeFurther`, `DistanceSensorInput` | Motion/Distance Sensor (type 35), **Detect mode only** | Same file, 0–10 range clamp matches the SDK's `MAX_DISTANCE`/`MIN_DISTANCE`. |
| `StartOnButtonPressBlock` | Hub button (standard GATT), **implemented** | [js/blocks/messaging.js](../js/blocks/messaging.js) `triggerButtonPress()` and [js/telemetry/button-battery.js](../js/telemetry/button-battery.js) for state tracking. Reuses the existing `h.pressed` boolean flag updated on every button characteristic notification. |
| `SoundSensorInput` | *(not a hub feature)* | Uses the **tablet's microphone** via `getUserMedia` ([js/app.js:444](js/app.js#L444)), not a hub sensor — WeDo 2.0 never had a physical sound sensor. |
| `NumberInput`, `TextInput`, `DisplayInput`, `RandomInput` | *(not a hub feature)* | Generic literal/software inputs used to feed numeric sockets. |

### Extras beyond the SDK's scope

The app also surfaces two things the SDK doesn't expose at all (no `IOType` covers
them — they're standard BLE GATT services the hub also implements):
- **Hub button** state (`C_BUTTON` characteristic, [js/telemetry/button-battery.js](../js/telemetry/button-battery.js)) — **now wired to a programmable block** via `StartOnButtonPressBlock` and `triggerButtonPress()` ([js/blocks/messaging.js](../js/blocks/messaging.js)). Also shown in the hub panel for telemetry.
- **Battery level** (standard `battery_level` GATT characteristic, [js/telemetry/button-battery.js](../js/telemetry/button-battery.js)) — telemetry-only, shown in the hub panel.

Also now implemented, this time an actual `IOType` the SDK does cover:
- **Voltage (type 20) / Current (type 21) sensors**, read-only hub-panel telemetry — [js/telemetry/voltage-current.js](../js/telemetry/voltage-current.js) `wireVoltageCurrent()`. Configured once per connect (hub-internal, not port-attached, so no `configurePort()`/attach-detection needed) via an `inputFormat` write against each sensor's own fixed connect ID, same idea as the SDK's `VoltageSensor`/`CurrentSensor` constructors. Readings are shown next to the battery badge in the hub panel (`.voltcur` in `renderHubs()`). **Ports 4 (voltage) and 3 (current) are unverified guesses**, same caveat as the piezo's port `5` — needs confirming against real hardware. No block/program use case yet, per the design doc — telemetry-only for now.

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
`writeOut()` output-command plumbing ([js/app.js:743](js/app.js#L743)) and the
`configurePort()` / `onSensorValue()` input-format plumbing already in the file —
no new architecture needed, just new device types and blocks.

1. ~~**Piezo Tone Player output**~~ — **Implemented** (`PlayToneBlock`, see section 1's
   Outputs table above and [js/blocks/piezo-tone-player.js](../js/blocks/piezo-tone-player.js)).
   Note + octave is chosen via a tap dialog (`#tones`, mirrors the existing motor-speed
   picker); duration comes from the block's own numeric socket, same as every other
   timed block. The one item from this proposal still outstanding: **the hub port (`5`)
   is an unverified guess** and needs confirming against real hardware — everything else
   (wire format, command IDs, note-to-frequency math) was carried over unchanged
   from this proposal.

2. ~~**Motor brake**~~ — **Implemented** (`MotorBrakeBlock`, see section 1's Outputs table
   and [js/blocks/motor.js](../js/blocks/motor.js)) sending power byte `127` for instant
   stop, distinct from `MotorOffBlock`'s drift behavior (power byte `0`).

3. ~~**RGB Light Absolute mode**~~ — **Implemented** (extends the existing `LightBlock`/
   `ledSet` path, no new block — there's no sprite art for a second light block)
   - No separate mode-switch write turned out to be needed: the hub tells Absolute
     mode apart from Discrete mode purely by payload length (`0x04` command, 1-byte
     index vs. 3-byte RGB), so `ledSetRGB(r,g,b)` in
     [js/blocks/rgb-light.js](../js/blocks/rgb-light.js) just sends
     `[0x06, 0x04, 0x03, r, g, b]` directly.
   - UI: upgraded the existing colour dialog (`js/app.js` `openColourDialog`) with a
     12th "Custom…" tile that opens three R/G/B sliders (`#rgbsliders` in
     `WeDo CPE v1.0.html`), alongside the current 11-swatch palette. The chosen triple
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
     reusing the `h.pressed` state already tracked at [js/app.js:1874](js/app.js#L1874).

Items 1 (Piezo Tone Player), 2 (Motor brake), 3 (RGB Light Absolute mode), 4 (Motor power offset compensation), 5 (Voltage/Current telemetry), and 7 (Hub Button as a programmable input) have been implemented — see section 1's Outputs/Extras tables and the "Inputs" section.

Items 6 (Tilt Angle mode and Motion Count mode) remain in the proposal — they require additional UI design work for mode selection per sensor.

Follow the project's TDD convention (`AGENTS.md`) when building any of the above: write a
failing test in `test/` first, since the BLE writes themselves can't be exercised in
jsdom (Web Bluetooth isn't available there) — test the byte-encoding/state-management
logic directly, and note plainly that the actual GATT writes need manual verification
against real hardware.
