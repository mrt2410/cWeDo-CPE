# Documentation

Developer-facing docs for cWeDo CPE — how it's built, how its features work, and how
to ship it. Start with [architecture.md](architecture.md) for the overall code layout.

## Architecture & protocol

- [architecture.md](architecture.md) — `js/blocks/`/`js/telemetry/`/`js/ble/`/`js/native/`
  module layout, the plain-`<script>` loading model, and the boundary rule for what
  goes in a device file vs. `app.js`.
- [io-inventory-vs-wedo2-sdk.md](io-inventory-vs-wedo2-sdk.md) — every block's BLE wire
  format (GATT characteristics, command bytes, port numbers), compared against the
  reference LEGO-WeDo-2.0-Python-SDK, with what's confirmed vs. unverified on real
  hardware.

## Features

- [auto-reconnect.md](auto-reconnect.md) — reconnecting to the last-used Smarthub on
  page load without a click.
- [save-open-and-autosave.md](save-open-and-autosave.md) — autosave, Save As, and Open.
- [canvas-panning.md](canvas-panning.md) — canvas panning, zoom, and scrollbars.
- [bluetooth-lan-setup.md](bluetooth-lan-setup.md) — using Web Bluetooth when the app
  is served from a LAN IP instead of `localhost`.

## Shipping

- [android-apk-build.md](android-apk-build.md) — building the Android APK (Docker +
  Capacitor), and the native BLE/file shims it needs.
- [github-pages-deployment.md](github-pages-deployment.md) — the tagged-release
  pipeline that publishes the live site on GitHub Pages.
- [standalone-build.md](standalone-build.md) — bundling the split app back into one
  offline-ready HTML file, and the CI workflow that attaches it to releases.
