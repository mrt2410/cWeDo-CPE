# Browser support and the "Browser Not Supported" page

Connecting to a Smarthub needs the Web Bluetooth API (`navigator.bluetooth`). When the
app starts in a browser that doesn't have it, it shows a **Browser Not Supported** page
instead of the app, with a small **Still Try** button.

## How it works

- The check is feature detection: the page is shown when `navigator.bluetooth` or
  `navigator.bluetooth.requestDevice` is missing. There is no user-agent sniffing, so
  the check doesn't need updating when browser version numbers change.
- **Still Try** hides the page for the current load only. Reloading shows it again.
- The packaged Android app is never gated: its Capacitor shim
  ([capacitor-ble-shim.js](../js/ble/capacitor-ble-shim.js)) provides `navigator.bluetooth`
  and the app detects it as a native platform.
- It works the same in all three builds, since the check runs in the browser and makes
  no network request:
  - **Web** (`http://localhost`, GitHub Pages, LAN with the flag): checked as normal.
  - **Offline standalone `.html`** (`file://`): the same HTML and JS are inlined by
    `scripts/build-standalone.js`, so the page works the same way.
  - **Android APK**: never gated (see above).

Code: the `#unsupported` block in `cWeDo CPE v1.0.html`, its styles in `css/style.css`,
and the check at the end of the splash code in `js/app.js`. Tests:
`test/browser-support.test.js`.

## Which browsers have Web Bluetooth

Research, checked against MDN and the Chromium implementation-status document. Version
numbers come from secondary tables and vary between sources, so treat them as a guide
and not a guarantee.

| Browser | Web Bluetooth | Notes |
| --- | --- | --- |
| Chrome (desktop: Windows, macOS, ChromeOS) | Yes, from Chrome 56 | Chrome 56 is the first release where it's on without a flag. |
| Chrome (Android) | Yes, from Chrome 56 | Needs Android 6.0 (Marshmallow) or later. |
| Chrome (Linux) | Listed as partial | Implementation-status page says Linux is partial. In practice the picker works on Chrome Linux (see [known-bugs.md](known-bugs.md)), so the app doesn't block it. |
| Edge (Chromium) | Yes, from Edge 79 | The old EdgeHTML Edge never had it. |
| Opera | Yes, from Opera 43 | Chromium-based. |
| Brave | Yes | Chromium-based, same as Chrome. Not listed separately in the MDN tables, so verify on a real install. |
| Samsung Internet (Android) | Yes, from 6.2 (some sources say 6.0, or 6.4 for default-on) | Sources disagree on the first version. Feature detection covers whichever version it is. |
| Firefox (desktop and Android) | No | Mozilla has no plan to implement it. No flag. |
| Safari (macOS, iPhone, iPad) | No | WebKit has no plan to implement it (anti-fingerprinting policy). |
| Chrome / Edge / Firefox on iOS | No | On iOS every browser uses the WebKit engine, so they inherit Safari's lack of support. |
| Bluefy (iOS, third-party browser) | Yes | Adds Web Bluetooth on iPhone/iPad. The app isn't tested with it, and it isn't a supported target. |

Sources:
- [Web Bluetooth implementation status (WebBluetoothCG)](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)
- [MDN: Bluetooth API](https://caniuse.com/mdn-api_bluetooth) via caniuse
- [Browser Support for Web Bluetooth (beaconzone)](https://www.beaconzone.co.uk/blog/browser-support-for-web-bluetooth/)
- [Chrome 56 Web Bluetooth (Android Police)](https://www.androidpolice.com/2016/12/14/chrome-56-beta-adds-official-web-bluetooth-api-support-experiential-webvr-apk-download/)
- [Samsung Internet (Wikipedia)](https://en.wikipedia.org/wiki/Samsung_Internet)
- [Bluefy – Web BLE Browser (App Store)](https://apps.apple.com/app/id1492822055)

## Still to verify

- Run each supported browser on real hardware. The page is only checked by unit tests in
  jsdom, which can't test the real API.
- Confirm Brave and Samsung Internet connect to a real hub. Neither is covered by the
  tests.
- Decide whether non-Bluetooth features (building and editing programs, which work in any
  browser) should stay behind the page. Right now they do, because the page covers the whole app.
