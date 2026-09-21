# Autosave, Save As, and Open

## Autosave (localStorage)

The block program (the stacks of blocks on the board) is saved automatically to
`localStorage['wedo:program']` on every change, debounced ~250ms. On page load, it's
restored before the first render, so reloading the page — or losing the tab — doesn't
lose your program.

The custom recorded sound ("sound 0" in Play Sound blocks) persists the same way, but
under its own key, `localStorage['wedo:customSound']` (base64-encoded, since it's only
ever held in memory as a decoded audio buffer otherwise). It restores automatically on
load too, decoded back into a playable sound.

Both are wrapped in try/catch: if storage is unavailable (private browsing, quota, no
Web Audio support to decode the sound back), the app just behaves as it always did,
rather than crashing.

## Save As / Open (file-based, program only)

The custom sound is **not** included in Save As / Open — it's a device-local asset, not
part of what you'd want to share as a program file. Only the block program is
saved/loaded this way.

**Format: JSON**, not YAML — this file is only ever written and read by code, never
hand-edited, so JSON needs no extra parser (the app has zero runtime dependencies) and
matches the data's existing shape one-to-one. Saved with a `.wedo.json` extension and a
small envelope for forward compatibility:

```json
{ "format": "wedo-cpe-program", "version": 1, "stacks": [ /* ... */ ] }
```

Opening a file that doesn't match this shape (wrong format tag, invalid JSON, missing
`stacks`) shows an error in the banner strip below the tray tabs and leaves the current
board untouched.

Save As and Open use a plain Blob-download and `<input type="file">`, not the newer
File System Access API — that API requires a secure context (`https://` or
`localhost`), which would break the same way [Web Bluetooth does over a LAN IP](bluetooth-lan-setup.md).

## Testing

Covered by `test/persistence.test.js`, `test/save-open.test.js`, and
`test/custom-sound.test.js`, run via `npm test` (uses jsdom to load the real app files,
no browser needed). The mic recording itself (MediaRecorder/AudioContext) isn't
available in jsdom, so the encode/decode round trip is tested directly instead of
through a real recording — the actual "record → reload → still there" path needs a
manual check in a real browser.
