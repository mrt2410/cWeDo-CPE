# Building the Android APK

cWeDo CPE is a plain static site (`index.html`, `css/`, `js/`, `data/`) with no
build step. To get an installable Android app, it's wrapped in a
[Capacitor](https://capacitorjs.com/) WebView shell and compiled inside Docker,
so nobody needs the Android SDK or a JDK installed on their machine.

## Usage

```sh
docker compose build android-build
docker compose run --rm android-build
```

The APK is written to `release/cwedo-cpe-debug.apk` on the host. Install it
with `adb install release/cwedo-cpe-debug.apk`, or copy it to a device and
allow installs from unknown sources.

This is an **unsigned debug build** — fine for sideloading, not for
distribution through an app store. There's no keystore involved.

If your host UID/GID aren't 1000:1000 (the default), pass them explicitly so
generated files under `mobile/`/`release/` are host-writable instead of
root-owned:

```sh
UID=$(id -u) GID=$(id -g) docker compose build android-build
```

## Bluetooth: why this needed more than just packaging

Android's WebView has **no Web Bluetooth implementation at all** — this is
true regardless of Capacitor/Cordova/any other wrapper, and is also true of
iOS's WKWebView (see below). The app's hub-control code
(`js/app.js`, `js/blocks/core.js`, `js/telemetry/*.js`) is written entirely
against `navigator.bluetooth`, so a bare packaged APK would load the UI but
never be able to talk to a Smarthub.

`js/ble/capacitor-ble-shim.js` fixes this: when running inside the packaged
app (`window.Capacitor.isNativePlatform()` — false in every normal browser,
so this is a no-op everywhere else, including the desktop/Android Chrome tabs
used for regular web development), it defines `navigator.bluetooth` itself,
faking just enough of the real object shape (`device.gatt.connect()` →
`getPrimaryService()` → `getCharacteristic()`, characteristics with
`.readValue()`/`.writeValue()`/`.startNotifications()`/
`characteristicvaluechanged`) that none of the existing BLE code had to
change. The real work is delegated to
[@capacitor-community/bluetooth-le](https://github.com/capacitor-community/bluetooth-le)'s
`BleClient`, which talks to Android's native BLE stack.

This app has no bundler, so rather than `import`ing the plugin, `build-android.sh`
vendors two browser-ready bundles straight from `node_modules` — the
`@capacitor/core` runtime and the plugin's own bundle (each package's
`"unpkg"` field points at exactly these files, i.e. this is their supported
no-bundler usage path) — into `mobile/www/vendor/`, and injects two
`<script>` tags for them into the copied `www/index.html`, right before the
shim's own tag. The real `index.html` at the repo root is never touched.

`mobile/capacitor.config.json`/`package.json` pin the whole stack to
Capacitor 8.5.2 + `@capacitor-community/bluetooth-le` 8.3.0 (the plugin's
current major requires Capacitor ≥8). Android permissions
(`ACCESS_FINE_LOCATION`/`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`) come from the
plugin's own bundled manifest via Gradle's manifest merger — nothing to add
by hand. `minSdkVersion` is Capacitor's default of 24 (Android 7.0), well
below Android 8.1/9 devices like a Galaxy Tab A (2018).

**Unverified against real hardware.** The shim is unit-tested against a fake
`BleClient` (`test/ble/capacitor-ble-shim.test.js`) covering every call it
makes and the object shapes it hands back, but the actual native GATT round
trip — permission prompts, real characteristic discovery, notification
timing on a real Smarthub — can only be confirmed on a device.

## Save / Open: why "Save As" needed the same treatment

"Save As" downloads the program as a `.wedo.json` file via a `<a download>` +
Blob URL click — this works in any real browser, but plain Android WebView
has **no handler for downloads at all**. The click silently does nothing, no
file is ever written, and "Open" (which does work, via the OS file picker)
naturally has nothing new to find.

`js/native/capacitor-file-shim.js` fixes this the same way the BLE shim
does — active only inside the packaged app — using `@capacitor/filesystem`
to write into the app's own **private storage** (`Directory.Data`): no
permission prompt on any Android version, and it survives app *updates*
(only wiped on uninstall, or if the user clears app data in Settings).

The trade-off: private storage isn't visible to a file manager or the OS
file picker, so "Open" becomes a small in-app list (`#openlist` in the HTML,
styled like the existing sound picker) instead of the system file browser,
only on native — the website's `<input type=file>` flow is untouched.
`@capacitor/filesystem`'s browser bundle depends on a separate
`@capacitor/synapse` package for a cross-plugin-proxy feature this app
never uses; rather than also vendoring that package,
`docker/build-android.sh` prepends a one-line no-op stub
(`var synapse={exposeSynapse:function(){}}`) ahead of the vendored bundle.

Covered by 11 new unit/UI tests (`test/native/capacitor-file-shim.test.js`,
`test/native/save-open-native.test.js`) against a fake `Filesystem` plugin —
**unverified against real device storage**, same caveat as the BLE shim.

## iOS: not the same process

See [docs/ios-build.md](ios-build.md) for the CI workflow that now builds an
unsigned iOS Simulator app to validate the pipeline. Two independent
blockers remain before a real device/App Store build is possible, not just
a packaging difference:

1. **No Docker/Linux path exists for iOS builds.** Apple only licenses Xcode
   to run on macOS. Building an iOS app needs an actual Mac (local, or a
   cloud Mac CI runner), running `xcodebuild` against Capacitor's iOS
   project, and a signed `.ipa` (not `.apk`) needs an Apple Developer account
   and provisioning profile even for a personal device install.
2. **Web Bluetooth doesn't exist on iOS at all**, in Safari or in any
   WKWebView-based app — Apple/WebKit has never implemented it. The same
   `navigator.bluetooth`-shim trick used here for Android would need a
   different native BLE plugin bridge (still `@capacitor-community/bluetooth-le`,
   which also supports iOS) and its own manifest/`Info.plist` permission
   entries (`NSBluetoothAlwaysUsageDescription`), built and tested on a Mac.

## How the Android build works

- `docker/Dockerfile` builds an image with JDK 21, Node 22, and the Android
  command-line tools (platform 36, build-tools 36.0.0) — Capacitor 8's
  template requires all three. It creates a non-root user matching the
  host's UID/GID (build args, default 1000:1000) so files written into the
  bind-mounted `mobile/`/`release/` stay host-writable instead of
  root-owned.
- `docker/build-android.sh` (the container's entrypoint):
  1. copies `index.html` (following the symlink to `cWeDo CPE v1.0.html`),
     `css/`, `js/`, `data/` into `mobile/www/` — this is the web content
     Capacitor bundles into the app, fully offline (no server needed at
     runtime).
  2. installs the Capacitor CLI + the BLE and Filesystem plugins, then
     vendors the three browser bundles described above into
     `mobile/www/vendor/` and inserts their `<script>` tags into the copied
     `www/index.html`.
  3. runs `npx cap add android` the first time (generates the native Android
     project under `mobile/android/`) or `npx cap sync android` on later runs.
  4. runs `./gradlew assembleDebug` to produce the APK.
  5. copies it to `/output`, which `docker-compose.yml` mounts to `release/`.
- `mobile/capacitor.config.json` sets the app id (`org.wedocpe.app`) and
  display name (`cWeDo CPE`) — chosen brand-free since this is a community
  project.
- `mobile/www/`, `mobile/android/`, `mobile/node_modules/`, and `release/*`
  are generated build output and gitignored — only `mobile/capacitor.config.json`
  and `mobile/package.json` are committed.

## Updating the app content

Nothing to do — every run re-copies `index.html`/`css/`/`js`/`data/` from the
repo root before syncing, so the APK always reflects the current source.

## Changing the app id or name

Edit `mobile/capacitor.config.json` and delete `mobile/android/` (or run
`docker compose run --rm android-build` after removing it) so Capacitor
regenerates the native project with the new id/name.
