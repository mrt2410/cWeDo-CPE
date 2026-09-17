# Changelog

## 2026-09-17 (25)

- **Added a Play button to the Tone block's note/octave picker**, so you can
  hear the selected note before closing the dialog. `#tnplay` sits next to
  the octave field in `#tones` ([cWeDo CPE v1.0.html](cWeDo%20CPE%20v1.0.html)),
  using the same triangle icon as the Sounds picker's "listen" button.
  [js/blocks/piezo-tone-player.js](js/blocks/piezo-tone-player.js) gained
  `PiezoTonePlayer.preview(note,octave)`, which reuses the existing
  `playToneAudio()` Web Audio synth (the same oscillator an executed
  `PlayToneBlock` plays through) but skips `sendOut()` — previewing a sound
  while building a program shouldn't send any BLE command to the hub. Also
  bumped that oscillator's peak gain from `0.2` to `0.22` to exactly match
  `sound.js`'s `playPlaceholder()` gain, so the tone block and the Sounds
  block's placeholder tone are equally loud. See
  [docs/io-inventory-vs-wedo2-sdk.md](docs/io-inventory-vs-wedo2-sdk.md).

## 2026-09-17 (24)

- **Two-finger pinch now zooms the canvas on touch devices.** `#stage` uses
  `touch-action:pan-x pan-y` so a one-finger drag pans instead of scrolling,
  but that also tells the browser not to handle pinch itself, and the
  `user-scalable=no` viewport meta blocks page zoom too — so a second finger
  had nothing to do and pinch-to-zoom silently didn't work on tablets.
  [js/app.js](js/app.js) now tracks touch pointers on `#stage` directly: a
  second finger landing safely drops anything mid-drag, baselines the
  distance between the two touches, and every subsequent move rescales zoom
  continuously by that ratio, sharing the same `70`–`190` clamp as the +/-
  buttons and wheel via a new shared `applyZoom()` helper. See
  [docs/canvas-panning.md](docs/canvas-panning.md).

## 2026-09-17 (22)

- **Mouse wheel now zooms the canvas, and Save/Open moved top-left with
  classic icons.** Follow-up to the canvas panning cleanup above: (1) the
  mouse wheel over `#stage` used to just scroll the oversized sheet, which
  fought with the dedicated zoom (+/-) rail — a `wheel` listener in
  [js/app.js](js/app.js) now calls `preventDefault()` and drives the same
  `setZoom()` step the buttons use (scroll up zooms in, down zooms out).
  (2) The Save As / Open buttons moved out of the right-side zoom rail into
  their own `#filerail` group at the top-left of the canvas
  ([cWeDo CPE v1.0.html](cWeDo%20CPE%20v1.0.html), styled in
  [css/style.css](css/style.css)), and got recognisable "old-school" icons —
  a floppy disk for Save As, a folder for Open — replacing the previous
  download-arrow/box glyphs. See [docs/canvas-panning.md](docs/canvas-panning.md).

## 2026-09-17 (21)

- **Hid the canvas's native scrollbar and added mouse drag-to-pan.** The
  program canvas (`#stage`) is a fixed 3200×1800px sheet that's larger than
  the viewport, so it always needed scrolling/panning — but that meant a
  visible browser scrollbar sat across the whiteboard-style canvas even
  though it already has dedicated zoom (+/-) controls, and a mouse press on
  blank canvas did nothing (only touch got native pan-scrolling). Added
  `#stage::-webkit-scrollbar{display:none}` in
  [css/style.css](css/style.css), plus a `panDrag` mouse-drag handler in
  [js/app.js](js/app.js) that pans by adjusting `scrollLeft`/`scrollTop`
  directly when the press starts on blank canvas (not on a `.blk` block),
  with a `grab`/`grabbing` cursor to match. Touch panning is unchanged. See
  [docs/canvas-panning.md](docs/canvas-panning.md).

## 2026-09-17 (19)

- **Piezo tone now audible on real hardware.** A user reported `PlayToneBlock` produced
  no sound even at frequencies near the hub's 1500Hz cap. Debugging against a real
  Smarthub's "Attached I/O" broadcast confirmed the previously "unverified guess" port
  numbers were all correct all along — connect ID `5`/IO type `22` (piezo), `4`/`20`
  (voltage), `3`/`21` (current) — and the BLE command bytes matched the reference SDK's
  `output_command.py` exactly, byte for byte. The real cause: **the retail WeDo 2.0
  Smarthub has no physical speaker** — its firmware accepts the piezo command harmlessly
  but there's nothing to make sound with, which is also why LEGO's own app never shipped
  a hub-tone block. Fixed by having `playTone()`/`stopTone()` in
  [js/blocks/piezo-tone-player.js](js/blocks/piezo-tone-player.js) also synthesise the
  tone locally via Web Audio (an oscillator through `ac()`, reused from
  [js/blocks/sound.js](js/blocks/sound.js)), the same mechanism `PlaySoundBlock` uses —
  the BLE command is still sent unchanged, both because it's harmless and to keep the
  block working on other LEGO hubs that do have a piezo (e.g. BOOST/Powered Up). Updated
  [docs/io-inventory-vs-wedo2-sdk.md](docs/io-inventory-vs-wedo2-sdk.md) to mark the
  piezo/voltage/current port numbers as hardware-confirmed instead of unverified guesses,
  and to record the no-speaker finding. Not covered by the automated test suite — jsdom
  has no Web Audio, the same limitation already noted for `sound.js`'s mic/recording
  code — so the tablet-audio path needs manual verification in a real browser; the
  existing BLE-bytes tests in `test/blocks/piezo-tone-player.test.js` still pass
  unchanged (60/60 overall).

## 2026-09-17 (17)

- Final whole-branch review fixes for the 16-task block-file split + I/O feature plan.
  Eight findings, no new features.
  - **Stale `customRGB` survived socket changes.** `RgbLight.execLight` checks `it.customRGB`
    before the socket's attached input, so a custom colour left on a `LightBlock` kept
    overriding whatever number was plugged in afterwards. `chooseColour()` already deleted it
    when a discrete colour was picked; the two drag/drop sites did not. Added
    `delete ref.item.customRGB` in `beginDrag()` (input pulled out of a socket) and
    `delete a.item.customRGB` in `finishDrag()` (a new input dropped into one), both in
    [js/app.js](js/app.js). Two regression tests in `test/blocks/rgb-light.test.js` drive the
    app's real pointer handlers rather than poking the fields, so they cover the actual
    editor paths. They need `--cu`/`--pu` set inline on the root element first: jsdom's
    `getComputedStyle` doesn't resolve custom properties from a stylesheet, so `scale()`
    returns `NaN` and every anchor lands at `NaN`.
  - **RGB Light mode-switch write, reinstated.** The design spec and Task 14's plan both
    called for an input-format write putting the LED into the right mode before the payload;
    the shipped code dropped it and the docs asserted, as fact, that payload length alone was
    enough — a claim nobody can check without hardware, and out of step with how carefully
    every other unverified port/behaviour in this project is caveated. Added `DEV_RGB_LIGHT=23`,
    `LED_PORT=6` and `ledSetMode(mode)` to [js/blocks/rgb-light.js](js/blocks/rgb-light.js),
    reusing core.js's `inputFormat()` and following `configurePort()`'s
    `writeValueWithResponse`/`writeValue` + try/catch/`log()` pattern. `ledSet()` now declares
    mode 0 and `ledSetRGB()` mode 1 before their `sendOut()` payload, so neither depends on
    what mode the other left the hub in. The code comment,
    `docs/io-inventory-vs-wedo2-sdk.md` and this entry all state plainly that the write is
    **unverified against real hardware** — same caveat category as the piezo port and the
    voltage/current ports. Three tests assert the exact mode bytes land on `h.inp` before the
    payload lands on `h.out`, for both commands, and that a hub without an input
    characteristic still gets its payload.
  - **Voltage/current notifications could corrupt tilt/distance parsing.** Task 15 added a
    second listener on the sensor characteristic, so voltage/current notifications now also
    reach `onSensorValue()` in [js/blocks/core.js](js/blocks/core.js). Their ports (4/3) match
    no attached sensor, so they fell through to the `v[0]` port guess — and if `v[0]` happened
    to equal a real tilt/motion port, a raw millivolt float was read as a tilt direction code
    or a distance. `onSensorValue` now returns early for `v[1]===VOLTAGE_PORT||v[1]===CURRENT_PORT`.
    Those constants live in `js/telemetry/voltage-current.js`, which loads *after* core.js —
    fine, since the function body is only evaluated at call time, exactly like the existing
    `Tilt`/`Motion` forward references in the same function. Test in `test/blocks/core.test.js`
    feeds voltage- and current-shaped events whose byte 0 collides with the attached tilt and
    distance ports and asserts neither reaches `Tilt.onValue`/`Motion.onValue`, plus a
    positive control that a genuine tilt notification still does.
  - **Stale `js/app.js:NNN` references in `docs/io-inventory-vs-wedo2-sdk.md`.** Seven prose
    citations still pointed at pre-split locations. Repointed to the current files (and
    re-checked line numbers): the `execBlock` switch and the block roster to
    `js/blocks/core.js`, `playSound()`/`getUserMedia` to `js/blocks/sound.js`, the tilt sensor
    to `js/blocks/tilt-sensor.js`, the distance sensor to `js/blocks/motion-sensor.js`,
    `sendOut`/`writeOut`/`configurePort` to `js/blocks/core.js`, and the hub button state to
    `js/telemetry/button-battery.js`. The two remaining `js/app.js` references (the colour
    dialog's `buildColourList()`/`openRgbSliders()`/`openColourDialog()`) are still correct.
  - **Resolved-but-open-looking note in the Task 11 entry.** Its "`io-inventory-vs-wedo2-sdk.md`
    does not exist anywhere in this repository's git history … flagged for a follow-up"
    paragraph was fixed two commits later by `91332e0`. Struck through and annotated as
    resolved instead of left reading as a live problem.
  - **Tone-picker octave changes weren't persisted.** The `#tnoctave` stepper's `oninput`
    mutated `toneTarget.octave` but never called `render()`, which is what schedules
    `persistProgram()` — so a program whose only edit was an octave change was never
    autosaved. Picking a note always persisted, via the tile's own `render()`. Fixed in
    [js/app.js](js/app.js); test in `test/persistence.test.js`.
  - **Dead branch in `js/telemetry/voltage-current.js`.** `const port=v[1]!=null?v[1]:v[0]`
    sits after a `if(v.length<6) return;` guard on a `Uint8Array`, so `v[1]` is always a
    number and the fallback was unreachable. Simplified to `const port=v[1];`.
  - **`h.voltageMv`/`h.currentMa` now cleared on disconnect**, next to the existing
    `h.battery=null`, in both the `gattserverdisconnected` handler and `disconnect()` in
    [js/app.js](js/app.js) — otherwise the hub panel kept showing the last reading from a hub
    that is no longer connected.
  - **Stale task-number breadcrumbs removed.** The "moved to … in Tasks 2/3" / "which Tasks
    4-8 create" comments in [js/app.js](js/app.js) referenced internal plan task numbers that
    mean nothing now the restructuring has landed. Replaced with one short map of what each
    directory owns. Same for the header comment of `test/blocks/core.test.js`, which claimed
    `onSensorValue` was untested.
  - Suite: 60 tests passing (53 before this wave, +7 new).

## 2026-09-17 (16)

- Task 16: Hub button as a programmable block (`StartOnButtonPressBlock`). The final task
  in the 16-task block-file split and I/O feature plan. Adds `triggerButtonPress()` to
  [js/blocks/messaging.js](js/blocks/messaging.js) alongside `broadcast()` and `triggerKey()`,
  wired to fire when the hub's physical button is pressed (already tracked by Task 9's
  `js/telemetry/button-battery.js`). The function iterates `stacks`, finds all programs
  whose head is a `StartOnButtonPressBlock`, and runs each via `runStack()`, just like
  `triggerKey()` does for keyboard presses. Logs `"hub button pressed — N program(s) started"`
  for telemetry. Updated `STARTS` set in [js/blocks/core.js](js/blocks/core.js) to include
  `'StartOnButtonPressBlock'` and registered the block via
  `registerCustomBlock('StartOnButtonPressBlock', {label:'Hub Button', group:'Flow'})` with
  CSS-fallback rendering (no sprite art). Wired tap-to-test into `handleTap()` in
  [js/app.js](js/app.js) alongside the existing `StartBlock`/`StartOnKeyPressBlock` cases.
  New tests in `test/blocks/messaging.test.js` use the corrected test-mocking pattern from
  earlier tasks: `probe: "window.__stacks = stacks;"` to expose the real `stacks` array
  reference (avoiding the lexical-environment bug with separate `eval()` calls), then mutate
  it in place with `window.__stacks.length = 0; window.__stacks.push(...)` rather than
  reassigning. `runStack` is mocked directly via `window.runStack = (st) => ...` since it's
  a function declaration. Tests verify both that `StartOnButtonPressBlock`-headed stacks run
  and that other block types are ignored. Updated `docs/io-inventory-vs-wedo2-sdk.md` to mark
  item 7 (Hub Button as a programmable input) and item 3 (RGB Light Absolute mode) as
  implemented, and updated the summary to reflect all 5 proposed I/O features now shipped
  (Piezo Tone Player, Motor brake, RGB Light Absolute, Motor power offset compensation,
  Voltage/Current telemetry, plus this new Hub Button). Added the button to the Inputs
  table. The test suite passes cleanly (53/53 tests: 51 existing + 2 new), confirming Task
  9's forward reference in `js/telemetry/button-battery.js` now resolves cleanly.

## 2026-09-17 (15)

- Task 15: Voltage/current telemetry. New `js/telemetry/voltage-current.js` extends the
  `Telemetry` namespace (from Task 9's `js/telemetry/button-battery.js`) via `Object.assign`
  with `wireVoltageCurrent(h,io)`, adding read-only hub-panel readouts for the hub's built-in
  Voltage (type 20) and Current (type 21) sensors — per the design doc, shipped as telemetry
  rather than a new block, since there's no clear "program" use case yet (unlike tilt/distance,
  which drive program logic). Both are hub-internal, not port-attached devices, so unlike
  Tilt/Motion there's no attach-notification flow to hook: `wireVoltageCurrent` just writes an
  `inputFormat()` configure command directly against each sensor's own fixed connect ID once
  per connect (mode 0, SI units), then adds a second `characteristicvaluechanged` listener on
  the existing sensor-value characteristic (`h.val`) alongside `js/app.js`'s own listener —
  supported directly by the EventTarget API, no need to replace the existing listener. On a
  matching-port notification it stores `h.voltageMv`/`h.currentMa` and calls `renderHubs()`.
  **Ports 4 (voltage) and 3 (current) are unverified guesses** by analogy with the piezo's port
  5 and the LED's port 6 — needs confirming against real hardware. Wired into `connect()` in
  `js/app.js` right after the existing I/O-service block. `renderHubs()` gained a `.voltcur`
  readout row next to the battery badge (`V` from mV/1000, `mA` as-is, `--` when unset); added
  the matching CSS rule to `css/style.css` and the new script's `<script>` tag (after
  `button-battery.js`, before `app.js`) to `WeDo CPE v1.0.html`. New
  `test/telemetry/voltage-current.test.js` calls `wireVoltageCurrent` directly off
  `dom.window.Telemetry` with fake I/O characteristics and asserts both configure writes
  happen — this required the same `probe: "window.Telemetry = Telemetry;"` treatment as
  other top-level `const` objects in this suite (`Telemetry` is invisible on `window` without
  it, since jsdom's indirect `eval()` never assigns `const`/`let` bindings to the global
  object — confirmed empirically), even though the task brief's own test snippet omitted it.
  Added `js/telemetry/voltage-current.js` to `test/helpers.js`'s `SCRIPTS` list. Updated
  `docs/io-inventory-vs-wedo2-sdk.md` to mark the Voltage/Current sensor rows and proposal
  item 5 as implemented. The test suite passes cleanly (51/51 tests: 50 existing + 1 new).

## 2026-09-17 (14)

- Task 14: RGB Light absolute (full-colour) mode. Extends the existing `LightBlock`'s
  colour-picker dialog with a 12th "Custom…" tile rather than adding a new block (there's
  no sprite art for a second light block). Adds `ledSetRGB(r,g,b)` to
  [js/blocks/rgb-light.js](js/blocks/rgb-light.js), sending `[6, 0x04, 3, r, g, b]` — same
  port (6) and command (`0x04`) as the existing discrete-index write, just a 3-byte RGB
  payload instead of 1 byte. ~~The hub tells the two modes apart by payload length alone, so
  no separate mode-switch write is needed.~~ **Superseded by the 2026-09-17 (17) review-fix
  entry above:** that claim could not be checked without real hardware and should never have
  been stated as fact. The input-format mode-switch write the design spec and this task's
  plan both called for is now implemented (`ledSetMode()`), and is itself documented as
  unverified. `RgbLight.execLight(it,r)` now checks
  `it.customRGB` first, falling back to the discrete-index path when it's absent. The
  chosen RGB triple is stored directly on the block item as `it.customRGB={r,g,b}` — the
  same pattern already used for `StartOnKeyPressBlock.letter` — leaving `it.input`/
  `it.inputValue` as a display-only `'RGB'` placeholder so `execBlock`'s existing "no input
  attached" check still works unchanged. In `js/app.js`, `buildColourList()` gained the
  "Custom…" tile (showing the last-picked RGB as its swatch, or a cyan placeholder),
  `openRgbSliders()` populates and reveals the new `#rgbsliders` panel, `rgbapply`'s click
  handler writes `customRGB`/the `'RGB'` placeholder onto the target item, `chooseColour()`
  now clears any previous `customRGB` when a discrete swatch is picked instead, and
  `openColourDialog()` hides the slider panel whenever the dialog (re)opens. Added the
  `#rgbsliders` markup (three `type="range" min="0" max="255"` inputs with R/G/B labels and
  live numeric readouts, plus an `#rgbapply` button) inside `#colcard` in
  `WeDo CPE v1.0.html`, and matching CSS in `css/style.css` styled to fit the existing
  `.srow`/`#colcard`/`#colgrid` dialog family (accent-coloured sliders on a light grey
  panel, a green "Apply custom colour" button matching `#colclose`'s style). New tests in
  `test/blocks/rgb-light.test.js` cover `ledSetRGB()`'s byte payload and
  `RgbLight.execLight`'s `customRGB`-over-discrete-index precedence, using the corrected
  hub-mocking pattern from prior tasks (`probe` option + direct `hubs` Map mutation); the
  `RgbLight` object itself needed the same `probe`-exposure treatment as `hubs`, since it's
  also a top-level `const` invisible to a later separate `eval()` call, so it's read
  directly off `window.__RgbLight` rather than referenced from inside `window.eval(...)`.
  The dialog/slider UI itself is manual-verification territory (jsdom doesn't exercise it
  interactively), same as the rest of this app's UI. The test suite passes cleanly
  (50/50 tests: 48 existing + 2 new).

## 2026-09-17 (13)

- Task 13: Motor power offset compensation. Remaps input power 1–100 onto output 35–100
  (hardware stall floor ~35%) so low-power settings still move the motor, matching the
  LEGO-WeDo-2.0-Python-SDK's `write_motor_power()` behavior. Modified `motorRun()` in
  [js/blocks/motor.js](js/blocks/motor.js) to apply the formula
  `compensated = round(35 + (65/100)*|power|)` for non-zero power, preserving sign via a
  separate `signed` variable before byte encoding. Zero power remains 0 (genuine stop, not
  minimum speed). No new block — this changes what `MotorPowerBlock`/`MotorOnForBlock` already
  send. Updated the existing Task 12 test `motorRun(-50)` to expect the new compensated byte
  value (188, computed as `round(35+65/100*50)=68; 256-68=188` for negative encoding) instead of
  the old uncompensated value (206). Added 3 new tests covering positive low power, negative
  low power with sign preservation, and zero (no floor). All tests use the corrected hub-mocking
  pattern from Task 12 (probe option + direct hubs Map mutation). Updated
  `docs/io-inventory-vs-wedo2-sdk.md` to mark motor power offset compensation as implemented
  and removed it from the "what's missing" gaps list. The test suite passes cleanly (47/47 tests:
  44 existing + 3 new).

## 2026-09-17 (12)

- Task 12: Motor brake (`MotorBrakeBlock`). New instant-stop capability (power byte 127)
  distinct from `MotorOffBlock`'s drift behavior (power byte 0), per `MOTOR_POWER_BRAKE` in
  the LEGO-WeDo-2.0-Python-SDK. Adds `motorBrake()` function and `Motor.execBrake(it,r)`
  method to [js/blocks/motor.js](js/blocks/motor.js), `MotorBrakeBlock` case in
  [js/blocks/core.js](js/blocks/core.js)'s `execBlock` dispatcher, and `MotorBrakeBlock`
  registration via `registerCustomBlock` (CSS-fallback rendering). New tests in
  `test/blocks/motor.test.js` cover both `motorRun()` with negative power (encoding check)
  and `motorBrake()` with the brake power byte, using the corrected hub-mocking pattern from
  Task 11's tests (probe option + direct hubs Map mutation). Updated
  `docs/io-inventory-vs-wedo2-sdk.md` to mark motor brake as implemented and remove it from
  the "what's missing" gaps list. The test suite passes cleanly (44/44 tests).

## 2026-09-17

- Task 11: Piezo Tone Player (`PlayToneBlock`). New `js/blocks/piezo-tone-player.js`
  implements the hub's built-in buzzer, a capability the real WeDo 2.0 commercial app
  never exposed as a block but which the LEGO-WeDo-2.0-Python-SDK exposes via
  `play_note()`/`play_frequency()`/`stop_playing()`. Adds `PIEZO_NOTES` (semitone offset
  from A), `noteToFrequency(note,octave)` (equal-temperament, A4=440Hz), `playTone(note,
  octave,durationMs)` and `stopTone()` (writing the SDK's little-endian u16 frequency/
  duration payload, command IDs `0x02`/`0x03`), and `PiezoTonePlayer.execPlay(it,r)` for
  `execBlock`'s dispatcher. The hub port (5) is an **unverified guess** by analogy with the
  LED's port 6 — needs confirming against real hardware. New `PlayToneBlock` registered via
  `registerCustomBlock` (CSS-fallback rendering from Task 10, since there's no sprite art),
  with a tap-to-open `#tones` note-picker dialog in `js/app.js`/`WeDo CPE v1.0.html` mirroring
  the existing `#speeds` motor-speed dialog (a 4-column grid of the 12 note names plus an
  octave 1–6 number input), wired into `handleTap`/`openInputUI` alongside the other
  block-specific dialogs. New tests in `test/blocks/piezo-tone-player.test.js` cover frequency
  conversion and the exact output byte payloads for play/stop.
  - ~~Known gap: `docs/io-inventory-vs-wedo2-sdk.md`, which several earlier tasks' plans call
    for updating, does not exist anywhere in this repository's git history (confirmed via
    `git log --all -- docs/io-inventory-vs-wedo2-sdk.md`) and isn't present in this worktree
    either — it appears to have been created only in a since-discarded, untracked local copy
    by an earlier task and never committed. Left uncreated here rather than fabricated from
    scratch without visibility into what it documented for other tasks; flagged for a
    follow-up to reconstruct it if still wanted.~~
    **Resolved** two commits later (`91332e0`): the doc was reconstructed and committed, and
    every task from Task 12 onward updates it. No longer an open problem.

## 2026-09-16 (17)

- Task 10: Custom-block rendering fallback. Modified `blockEl()` in `js/app.js` to detect blocks
  registered via `registerCustomBlock()` (which set `S[key].custom = true`) and render them as
  CSS-styled fallback blocks instead of sprite images. Custom blocks render with a colored
  background (from `m.colour`), white centered text (from `m.label`), rounded corners (18px
  scaled), and scaled font size (22% of block height). The implementation adds `.custom-blk`
  and `.custom-label` CSS rules. This provides rendering infrastructure for Tasks 11 (Piezo
  Tone Player), 12 (Motor brake), and 16 (hub-button), none of which have pre-drawn sprite art
  in the original commercial app. Existing sprite-based blocks remain unchanged. New tests
  verify custom block rendering and backward compatibility with sprite blocks.

## 2026-09-16 (16)

- Task 9 of the block-file split: extracted hub button and battery GATT wiring logic into
  a new `js/telemetry/button-battery.js`, loaded after `js/blocks/messaging.js` and before
  `js/app.js`. Moved the button characteristic notification handler and battery level reading
  and notification listener from `js/app.js`'s `connect()` function into the new module's
  `Telemetry.wireButtonBattery(h, svc, server)` async function. The module declares the
  `C_BUTTON` GATT UUID constant (now removed from `js/app.js`'s Bluetooth-stage constants).
  The handler calls `renderHubs()` on button press and battery changes, and calls the
  (as-yet-undefined) `triggerButtonPress()` function when the button is pressed — a forward
  reference that will be defined in Task 16 (Phase 2) but never executes in test (no real
  hardware button presses in jsdom). **This completes Phase 1 restructuring (Tasks 1-9):**
  all core block handlers, I/O wiring, UI logic, and telemetry are now extracted into their
  own modules. The test suite passes cleanly (36 tests including new tests for wireButtonBattery).
  The split is now behavior-preserving and fully verified.

## 2026-09-16 (15)

- Task 8 of the block-file split: extracted keyboard and message-based program triggering
  logic into a new `js/blocks/messaging.js`, loaded after `js/blocks/display.js` and before
  `js/app.js`. Moved the entire messaging and key press handling section from `js/app.js`
  (including `sameMsg()`, `broadcast()`, `triggerKey()`, and the global `keydown` event
  listener) into the new module. The module provides message-based inter-program triggering
  (`broadcast(msg)`) and keyboard-based program launching via `StartOnMessageBlock` and
  `StartOnKeyPressBlock` block types. It reads from app state (`stacks`, `letterTarget`,
  `editing`) and calls core functions (`runStack()`, `keyPressAnim()`, `log()`). The 31 tests
  all pass cleanly — messaging and key press blocks are now fully functional and isolated from
  the core app logic.

## 2026-09-16 (14)

- Task 7 of the block-file split: extracted virtual display widget logic into a new
  `js/blocks/display.js`, loaded after `js/blocks/sound.js` and before `js/app.js`. Moved
  the entire "display area" section from `js/app.js` (including background image data,
  display state, rendering, text fitting, dragging, and math operations) into the new module.
  The module exports display state (`displayContent`, `displaySize`, `displayBg`, `dispPos`,
  `displayNumber()`, `BG_RATIO`), background handling (`BGB`, `BG_COUNT`, `BG_THUMBS`,
  `BG_FULL`, `bgUrl()`), rendering functions (`paintDisplay()`, `fitDisplayText()`),
  interaction wiring (`wireDisplayChrome()`, `dispDrag`), user-facing functions
  (`openDisplay()`), math operations (`applyMath()`), and the `Display` namespace
  (with `execDisplay()`, `execMath()`, `execClosed()`, `execMedium()`, `execFull()`,
  `execBackground()` methods). The boot-time `wireDisplayChrome()` call remains in
  `js/app.js` at its original position in the boot sequence since it wires DOM elements
  at load time. The 31 tests all pass cleanly — display blocks are now fully functional
  and isolated from the core app logic.

## 2026-09-16 (13)

- Task 6 of the block-file split: extracted tablet microphone and speaker logic into a new
  `js/blocks/sound.js`, loaded after `js/blocks/rgb-light.js` and before `js/app.js`. Moved
  the entire "Stage 11: sound" section from `js/app.js` (including sound playback, recording,
  microphone management, and custom sound persistence) into the new module. The module exports
  audio context management (`ac()`, `audioCtx`, `micOn`, `micLevel`, etc.), sound bank loading
  (`loadSound()`, `SOUND_NAMES`, `SOUND_DATA`), playback (`playSound()`, `playBuffer()`,
  `stopSound()`, `playPlaceholder()`), recording (`startRecording()`, `stopRecording()`,
  `mediaRec`, `recState`), mic management (`ensureMic()`, `releaseMic()`, `hasSoundSensor()`,
  `syncSensorMic()`), and persistence (`blobToBase64()`, `base64ToBlob()`, `persistCustomSound()`,
  `restoreCustomSound()`). The 31 tests all pass cleanly — sound blocks and microphone-based
  sensor input are now fully functional and isolated from the core app logic.

## 2026-09-16 (12)

- Task 5 of the block-file split: extracted RGB Light state, constants, and control logic
  into a new `js/blocks/rgb-light.js`, loaded after `js/blocks/motor.js` and before
  `js/app.js`. Removed `LED_NAMES`, `LED_IDLE`, `DEFAULT_COLOUR`, and `ledSet` from
  `js/app.js`, keeping `LED_HEX` (which is colour-dialog rendering data per the spec's
  boundary rule). The `RgbLight` namespace (with `execLight(it, r)` method) is now fully
  defined and working alongside `Motor` and `Tilt`. The 31 tests all pass cleanly — RGB Light
  blocks are now available for the execution engine to call, and the colour-picker dialog
  continues to work via the global `ledSet()` function and `LED_NAMES` array.

## 2026-09-16 (11)

- Task 4 of the block-file split: extracted Motor state, power constants, and control logic
  into a new `js/blocks/motor.js`, loaded after `js/blocks/motion-sensor.js` and before
  `js/app.js`. Removed `motorState`, `DEFAULT_LEVEL`, `POWER_FLOOR`, `levelToPower`, and
  `motorRun` from `js/app.js`. The `Motor` namespace (with `execPower()`, `execThisWay()`,
  `execThatWay()`, `execOff()`, and `execOnFor()` methods) is now fully defined and working
  alongside `Tilt` and `Motion`. The 31 tests all pass cleanly — Motor blocks are now available
  for the execution engine to call, and `chooseSpeed()` correctly calls the motor's
  `levelToPower()` function from the global scope.

## 2026-09-16 (10)

- Task 3 of the block-file split: extracted Motion/Distance Sensor state, constants, and event logic
  into a new `js/blocks/motion-sensor.js`, loaded after `js/blocks/tilt-sensor.js` and before
  `js/app.js`. The `Motion` namespace (with `state`, `reset()`, `onAttach()`, `onDetach()`,
  `onValue()`, `attached()`, and `describe()` methods) is now fully defined and working alongside
  `Tilt`. The 31 tests all pass cleanly with no ReferenceError noise in the log — both Tilt and
  Motion sensors are now available for the sensor-bus code to call. Note: `Motion` has no
  `condition()` method (distance sensor has no per-key conditions), only the event-timestamp
  fallback in `core.js`'s `sensorCondition` applies to distance events.

## 2026-09-16 (9)

- Task 2 of the block-file split: extracted Tilt Sensor state, constants, and condition logic
  into a new `js/blocks/tilt-sensor.js`, loaded after `js/blocks/core.js` and before `js/app.js`.
  Moved `STATE_KEYS` from `js/app.js` (where it was temporarily defined) into `tilt-sensor.js`,
  eliminating the `ReferenceError: Tilt is not defined` that was recurring in console/logs. The
  `Tilt` namespace (with `state`, `reset()`, `onAttach()`, `onDetach()`, `onValue()`, `condition()`,
  `attached()`, and `describe()` methods) is now fully defined and working; tests expect and
  correctly encounter the next error (`Motion is not defined`) which will be fixed by Task 3.

## 2026-09-16 (8)

- Began splitting the monolithic `js/app.js` (1966 lines) into per-device files under
  `js/blocks/` and `js/telemetry/`, plus five new hub I/O features — see
  [docs/superpowers/plans/2026-09-16-wedo2-io-blocks.md](docs/superpowers/plans/2026-09-16-wedo2-io-blocks.md)
  for the full 16-task plan. First step: extracted the shared block classification
  data (`STARTS`/`SOCKETED`/`INPUTS`/`canAccept`/etc.), the shared sensor port-dispatch
  bus (device-type detection on attach, port configuration, the tilt/distance event
  bus), and the execution engine (`execBlock`'s dispatcher, `runStack`/`execSeq`/
  `execRepeat`, the wait/loop/random helpers) out of `js/app.js` and into a new
  `js/blocks/core.js`, loaded via a new `<script>` tag between the `data/*.js` bundles
  and `js/app.js`. This is an intentionally incomplete, interim state: `core.js`'s new
  `execBlock` dispatcher and sensor bus call into `Tilt`/`Motion`/`Motor`/`RgbLight`/
  `Display`/`broadcast` namespaces that don't exist until the next several tasks create
  them, so a recurring (but harmless — no current test exercises sensor features)
  `ReferenceError: Tilt is not defined` shows up in the console/logs from `core.js`'s
  250ms port-status poll until then.
- Fixed a latent bug in `test/helpers.js` surfaced by the split above: `loadApp()`
  evaluated each script file with its own `dom.window.eval()` call, but separate
  indirect-`eval()` calls each get their own throwaway lexical environment, so a
  top-level `const`/`let` declared in one file was invisible to a later one — unlike
  real `<script>` tags, which all share one global lexical environment (verified with a
  minimal repro: `vm.runInContext` against a persistent context preserves top-level
  bindings across calls the way script tags do, indirect `eval()` does not). This broke
  every test the moment `js/app.js` needed something from the new `js/blocks/core.js`
  (e.g. `ORDER`, read by the always-run `drawTray()` call at boot) — a different,
  unrelated failure that was easy to miss under the also-present (and expected)
  Tilt/Motion noise from the same run. Fixed by concatenating all `SCRIPTS` sources
  into a single `eval()` call instead of one per file, restoring script-tag-like
  sharing. This is a permanent fix to the test harness, not specific to this one step —
  every later stage of the block-file split depends on it working correctly.
- Note for anyone running tests during this interim state: a bare `npm test`/
  `node --test` will hang and never exit on its own, because the recurring interval
  error above keeps Node's event loop alive — wrap with `timeout` (e.g.
  `timeout 20 node --test`) until the `Tilt`/`Motion`/etc. namespaces land.

## 2026-09-16 (7)

- Documented a full inventory of this app's Input/Output blocks (motor, hub LED,
  tilt/distance sensors, tablet-based sound in/out, software-only display &
  messaging blocks) and compared them against every hub I/O device exposed by the
  [LEGO-WeDo-2.0-Python-SDK](https://github.com/jannopet/LEGO-WeDo-2.0-Python-SDK)
  reference implementation. Identified missing hub capabilities — Piezo Tone Player
  (unused entirely), RGB Light Absolute (full-color) mode, motor brake vs. drift,
  motor power offset compensation, Tilt Angle mode, Motion Count mode, and
  Voltage/Current sensors — and proposed an implementation approach for each, ordered
  by value vs. effort. No code changed; see
  [docs/io-inventory-vs-wedo2-sdk.md](docs/io-inventory-vs-wedo2-sdk.md) for the full
  writeup.

## 2026-09-16 (6)

- Fixed auto-reconnect doing nothing after a hard refresh, with no visible error.
  Root cause: the `autoReconnect()` call was placed before the Bluetooth section of
  `js/app.js` that declares `connectedHub`, `logLines`, `capabilities`, etc. — a real
  temporal-dead-zone bug that reproduces in an actual browser, not just in tests, and
  failed silently as an unhandled promise rejection since it's called without `await`.
  Fixed by moving the call to the true end of the file. Added `test/boot.test.js` to
  catch this class of bug (any unhandled rejection during startup) going forward, and
  added diagnostic `log()` calls throughout `autoReconnect()` so its decisions are
  visible in the in-app diagnostics panel instead of only in the browser console.

## 2026-09-16 (5)

- Added auto-reconnect to the last-used Smarthub on page load: remembers the hub's id
  after a successful connect (`localStorage['wedo:lastHub']`), and on the next load
  retries connecting to it for up to ~30 seconds (via Chrome's `getDevices()`, since
  neither the device picker nor a live scan can run without a click) before falling
  back to the normal manual "Choose Smarthub" flow. See
  [docs/auto-reconnect.md](docs/auto-reconnect.md) for why this can't be a real
  background scan, and what happens on browsers without `getDevices()`.
- Added `test/auto-reconnect.test.js` covering the device-selection and retry/timeout
  logic with fakes (the real GATT connect still needs manual verification with real
  hardware, same as the rest of Web Bluetooth here).

## 2026-09-16 (4)

- Added autosave: the block program persists to `localStorage` on every change and
  restores on page load, so a reload no longer loses your work. The custom recorded
  sound ("sound 0") persists the same way, separately.
- Added **Save As** and **Open** for the block program, as two new icon buttons next
  to the zoom controls. Files save as `.wedo.json` — plain JSON with a small envelope
  (`format`/`version`) so future versions can detect and migrate older saves. The
  custom recorded sound is intentionally excluded from these files (it's device-local,
  not something you'd share as a program). See
  [docs/save-open-and-autosave.md](docs/save-open-and-autosave.md) for the full design
  and reasoning (including why JSON over YAML, and why not the File System Access API).
- Added a real test suite (`npm test`, Node's built-in test runner + jsdom as a
  dev-only dependency) covering autosave, restore-on-load, Save As, Open (valid and
  invalid files), the custom-sound persistence round trip, and a regression test for
  the earlier mouse-drag fix. The app itself remains dependency-free at runtime.

## 2026-09-16 (3)

- Fixed a bug where dragging a block from the tray (palette) onto the board with a
  mouse often failed to start, requiring several retries that felt like "holding the
  mouse down for seconds" before the drag finally took. Root cause: the tray's drag
  gesture required the very first pointer movement to be dominantly vertical/upward
  (to disambiguate from a horizontal touch-swipe that scrolls the tray) — a rule that
  only makes sense for touch, but was being applied to mouse input too, where any
  natural diagonal movement got the drag attempt cancelled outright. Fixed in
  `js/app.js` (`pointermove` handler) to only apply that directional gate when
  `pointerType === 'touch'`; mouse/pen now use the same simple radial-distance
  threshold already used when dragging blocks around on the board itself. Touch
  behavior (swipe up to lift, swipe sideways to scroll the tray) is unchanged.

## 2026-09-16 (2)

- Confirmed Firefox has no Web Bluetooth support at all (unlike Chrome, which just
  gates it behind a secure-context check) — recommended switching to Chrome for
  Bluetooth pairing.
- Wrote up the LAN + Bluetooth setup in [docs/bluetooth-lan-setup.md](docs/bluetooth-lan-setup.md):
  the `chrome://flags/#unsafely-treat-insecure-origin-as-secure` workaround, needed
  per-device, to allow Bluetooth pairing when accessing the app over
  `http://<LAN-IP>:8000` instead of `https://` or `http://localhost`.

## 2026-09-16

- Backed up the original single-file app (`WeDo CPE v1.0.html`) as the first git commit.
- Split the monolithic HTML file into modules:
  - `css/style.css` — all styles
  - `js/app.js` — all application logic
  - `data/bundle.js`, `data/soundbank.js`, `data/bgbank.js` — embedded sprite/sound/background
    asset blobs, each exposed via `window.WEDO_DATA` so they can still be loaded with a plain
    `<script src="...">` (keeps the app working when opened directly via `file://`, with no
    server required).
  - The root HTML file is now a slim shell that wires these together.
- Added a local dev server workflow: `python3 -m http.server 8000 --bind 0.0.0.0`, listening on
  all network interfaces so the app can be opened from other devices on the LAN, not just
  `localhost`.
- Added an `index.html` symlink to `WeDo CPE v1.0.html` so the app loads from the server root
  (`http://localhost:8000/`) without typing the full filename.
- Added [AGENTS.md](AGENTS.md) documenting that all future work must be recorded here and in a
  relevant Markdown doc.
