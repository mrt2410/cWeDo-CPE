# Bluetooth over LAN (Chrome)

The app uses the Web Bluetooth API (`navigator.bluetooth`) to connect to a Smarthub.
Two browser requirements apply:

- **Browser support**: Web Bluetooth only works in Chromium-based browsers (Chrome,
  Edge, Opera, Brave). **Firefox does not implement it at all** — no flag or setting
  enables it, on desktop or Android. If you're on Firefox, switch browsers for this
  feature.
- **Secure context**: the browser only allows `navigator.bluetooth` on `https://` or
  `http://localhost`/`127.0.0.1`. Opening the app via a LAN IP
  (e.g. `http://192.168.200.113:8000`) fails this check, and the app shows
  *"Serve this page over https:// or http://localhost."*

## Workaround for LAN access in Chrome

Needed on every device that will pair Bluetooth over the LAN (not just the machine
running the server):

1. Open Chrome on that device.
2. Go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
3. In the text box, enter the exact origin used to reach the app, e.g.
   `http://192.168.200.113:8000` (use whichever LAN IP that device actually reaches
   the server on).
4. Set the dropdown next to it to **Enabled**.
5. Click **Relaunch** at the bottom of the page.
6. Reopen `http://192.168.200.113:8000/` and try the Bluetooth search again.

This only affects that specific origin, on that specific device/browser, and persists
until the flag is changed back.

## Alternatives (not set up yet)

- **`http://localhost:8000/`** — already a secure context, no flag needed, but only
  works for pairing from the same machine running the server.
- **Real HTTPS with a local cert** (e.g. via `mkcert`) — works on any device without
  per-device flags, but requires generating and trusting a certificate for the LAN IP.
