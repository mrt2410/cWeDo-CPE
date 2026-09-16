# Changelog

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
