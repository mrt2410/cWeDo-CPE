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
| `MotorPowerBlock`, `MotorThisWayBlock`, `MotorThatWayBlock`, `MotorOffBlock`, `MotorOnForBlock` | Motor (type 1) | [js/app.js:760](js/app.js#L760) `motorRun()`. Always writes to **both** ports 1 and 2 with the same command rather than the actual attached motor's port — fine for the classic single-motor WeDo model, but not per-motor addressable. Only "run at %" is implemented; no brake vs. drift distinction (see gap below). |
| `LightBlock` | RGB Light (type 23), **Discrete mode only** | [js/app.js:783](js/app.js#L783) `ledSet()`. Sends `[0x06, 0x04, 0x01, index]` — port 6 (the hub's built-in LED), command `0x04` (`WRITE_RGB_COMMAND_ID` in the SDK), 1-byte palette index 0–10. Matches the SDK's `set_color_index()` exactly. |
| `PlaySoundBlock` | *(not a hub feature)* | Plays a bundled/recorded sound through the **tablet's own speaker** via Web Audio (`js/app.js:432` `playSound()`), not the hub's piezo buzzer. |
| `DisplayBlock`, `DisplayBackgroundBlock`, `DisplayClosedBlock`, `DisplayMediumsizeBlock`, `DisplayFullsizeBlock`, `Add/Subtract/Multiply/DivideDisplayBlock` | *(not a hub feature)* | A virtual on-screen "display" widget, purely software (mirrors the original WeDo/ScratchJr-style app screen). |
| `SendMessageBlock` / `StartOnMessageBlock` / `StartOnKeyPressBlock` / `WaitForBlock` | *(not a hub feature)* | In-app broadcast/messaging between block stacks. |

### Inputs (sensors)

| Block(s) | Hub feature | Notes |
|---|---|---|
| `AnyTilt`, `TiltUp`, `TiltDown`, `TiltThisWay`, `TiltThatWay`, `TiltSensorInput` | Tilt Sensor (type 34), **Tilt/direction mode only** | [js/app.js:186](js/app.js#L186)–302. Reports the same 5-state direction enum as the SDK's `TiltSensorMode.TILT_SENSOR_MODE_TILT` (0/3/5/7/9). Auto-detected and auto-configured on attach via `configurePort()`. |
| `AnyDistanceChange`, `DistanceChangeCloser`, `DistanceChangeFurther`, `DistanceSensorInput` | Motion/Distance Sensor (type 35), **Detect mode only** | Same file, 0–10 range clamp matches the SDK's `MAX_DISTANCE`/`MIN_DISTANCE`. |
| `SoundSensorInput` | *(not a hub feature)* | Uses the **tablet's microphone** via `getUserMedia` ([js/app.js:444](js/app.js#L444)), not a hub sensor — WeDo 2.0 never had a physical sound sensor. |
| `NumberInput`, `TextInput`, `DisplayInput`, `RandomInput` | *(not a hub feature)* | Generic literal/software inputs used to feed numeric sockets. |

### Extras beyond the SDK's scope

The app also surfaces two things the SDK doesn't expose at all (no `IOType` covers
them — they're standard BLE GATT services the hub also implements):
- **Hub button** state (`C_BUTTON` characteristic, [js/app.js:1872](js/app.js#L1872)) — currently telemetry-only (shown in the hub panel), not wired to a programmable block.
- **Battery level** (standard `battery_level` GATT characteristic, [js/app.js:1878](js/app.js#L1878)) — same, telemetry-only.

## 2. What's missing, compared to the SDK

| Missing capability | SDK reference | Why it matters |
|---|---|---|
| **Piezo Tone Player** (type 22) — entire device | `wedo2/services/piezo_tone_player.py`, `smarthub.py::play_note/play_frequency/stop_playing` | The hub has a built-in buzzer, completely unused. This is a real hub *output*, unlike `PlaySoundBlock` which only plays through the tablet. |
| **RGB Light Absolute mode** (full 0–255/0–255/0–255 color) | `rgb_light.py::set_color()`, `RGBLightMode.RGB_LIGHT_MODE_ABSOLUTE` | Only the 11-color discrete palette is reachable today; the hub also supports arbitrary RGB. |
| **Motor brake vs. drift** | `motor.py`: `MOTOR_POWER_BRAKE = 127`, `MOTOR_POWER_DRIFT = 0` | `MotorOffBlock` always sends power 0 (drift/coast). There's no "brake" (`127`, instant stop) distinct from "drift" (coast to a stop from inertia). |
| **Motor power offset compensation** | `bluetooth_io.py::write_motor_power()` — remaps 1–100 input onto an actual 35–100 output range | Low motor power settings in this app may do nothing (motor stall), since raw percentages are sent unmodified — the SDK compensates so "low power" still reliably moves the motor. |
| **Tilt Sensor Angle mode** (continuous x/y degrees, −45..45) | `tilt_sensor.py::get_angle()`, `TiltSensorMode.TILT_SENSOR_MODE_ANGLE` | Only the 5-state discrete direction is read; no continuous tilt angle input exists for e.g. steering-wheel-style controls. |
| **Motion Sensor Count mode** (counts objects passing) | `motion_sensor.py::get_count()`, `MotionSensorMode.MOTION_SENSOR_MODE_COUNT` | Only "current distance" (Detect mode) is read; there's no "count objects that passed" input. |
| **Voltage sensor** (type 20) | `smarthub.py::get_voltage()` | Hub reports its own battery voltage in mV; not read at all (the app only reads the coarse GATT `battery_level` %, a different, standard BLE service). |
| **Current sensor** (type 21) | `smarthub.py::get_current()` | Hub reports live current draw in mA; not read at all. |
| **Hub button as a programmable input** | *(not in SDK — see note)* | Not an SDK gap, but a related gap in this app: button state is tracked but not exposed as a "Start on Button Press" block, even though the wiring to read it already exists. |

## 3. Proposed implementation

Ordered roughly by value vs. effort. All of these reuse the existing `sendOut()` /
`writeOut()` output-command plumbing ([js/app.js:743](js/app.js#L743)) and the
`configurePort()` / `onSensorValue()` input-format plumbing already in the file —
no new architecture needed, just new device types and blocks.

1. **Piezo Tone Player output** (new device, biggest gap)
   - New block(s): `PlayToneBlock` (note + octave, or raw frequency + duration) and
     an implicit "stop" on program stop (mirrors how `PlaySoundBlock` stops on `r.stop`).
   - Wire format (from `output_command.py`): `[connect_id, 0x02, 0x04, freq_lo, freq_hi, dur_lo, dur_hi]`
     (command `0x02` = `PLAY_PIEZO_TONE_COMMAND_ID`, little-endian unsigned shorts for
     frequency and duration in ms), and `[connect_id, 0x03, 0x00]` to stop
     (`0x03` = `STOP_PIEZO_TONE_COMMAND_ID`).
   - The hub's piezo is a fixed internal port — the LED's `0x06` hardcoded port is a
     precedent; will need to confirm the piezo's port number against real hardware or
     the WeDo 2.0 protocol write-ups (the SDK doesn't hardcode a port because it
     discovers it dynamically per `connect_info`).
   - Note-to-frequency math (equal temperament, A4=440Hz) can be lifted directly from
     `piezo_tone_player.py::play_note()`.

2. **RGB Light Absolute mode** (extends the existing `LightBlock`/`ledSet` path)
   - Add a mode switch (`[0x01,0x02,port,23,1,...]` input-format write to select
     Absolute mode 1 vs. Discrete mode 0, same as `configurePort()` already does for
     tilt/distance) plus a new output write `[0x06, 0x04, 0x03, r, g, b]` (command
     `0x04`, 3-byte payload instead of 1).
   - UI: either a second block ("Set Light Color RGB") or upgrade the existing colour
     dialog ([js/app.js:1277](js/app.js#L1277) `openColourDialog`) with an RGB picker
     alongside the current 11-swatch palette.

3. **Motor brake** (small, high-value fix)
   - Add a `MotorBrakeBlock` (or extend `MotorOffBlock` with a variant) sending power
     byte `127` instead of `0`, per `MOTOR_POWER_BRAKE` in the SDK. Keep `MotorOffBlock`
     as drift (`0`) since that's the current, tested behavior.

4. **Motor power offset compensation** (bug-fix-sized, no new block)
   - In `motorRun()` ([js/app.js:760](js/app.js#L760)), remap the 1–100 input range to
     35–100 before sending, exactly as `bluetooth_io.py::write_motor_power()` does:
     `actual = round(35 + (100 - 35) / 100 * power)` (sign preserved separately).

5. **Voltage / Current telemetry** (read-only, low risk)
   - These are hub-internal sensors (not port-attached), so no `configurePort()` /
     attach-detection needed — just an `inputFormat` write once per connect targeting
     the hub's fixed voltage/current connect IDs, then read notifications the same way
     `onSensorValue` already does for tilt/distance.
   - Start as hub-panel telemetry (like button/battery today) rather than new blocks,
     since there's no obvious "program" use case yet — a natural follow-up once it's
     wired up would be a `BatteryLowInput` condition block.

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

None of this has been implemented yet — this document is the inventory/proposal only,
per the request. Follow the project's TDD convention (`AGENTS.md`) when building any
of the above: write a failing test in `test/` first, since the BLE writes themselves
can't be exercised in jsdom (Web Bluetooth isn't available there) — test the
byte-encoding/state-management logic directly, and note plainly that the actual GATT
writes need manual verification against real hardware.
