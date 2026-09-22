# Building for iOS (simulator, unsigned)

Unlike the [Android APK build](android-apk-build.md), there's no Docker path
here: Apple only licenses Xcode to run on macOS, so this runs on a GitHub
Actions `macos-14` runner instead of locally.

## Usage

From the repo's Actions tab, select **Build iOS (simulator, unsigned)**, then
**Run workflow** and pick the branch to build from — `workflow_dispatch` runs
can target any branch, including a throwaway one, without touching `main`.
Since this repo is public, GitHub Actions minutes — including macOS runners
— are free and unlimited.

For a `workflow_dispatch` run, the zipped `.app` is attached to the run as a
downloadable artifact (`cwedo-cpe-ios-simulator`) — requires being logged
into GitHub, and expires after 90 days (GitHub's default artifact
retention).

Pushing a `v*` tag (the same trigger [build-standalone.yml](../.github/workflows/build-standalone.yml)
uses) instead **attaches `cwedo-cpe-ios-simulator.app.zip` to that GitHub
Release** as a permanent, public asset — same mechanism as the Android APK
and standalone bundle, no login needed to download. It's still the same
Simulator-only unsigned build either way; see below.

## What this does and doesn't prove

The workflow mirrors `docker/build-android.sh`: copies `index.html`/`css`/
`js`/`data` into `mobile/www`, vendors the same platform-agnostic
`@capacitor/core` + `@capacitor-community/bluetooth-le` +
`@capacitor/filesystem` browser bundles, adds the
`NSBluetoothAlwaysUsageDescription` Info.plist entry the BLE plugin needs
(iOS has no manifest-merger equivalent to Android's automatic permission
merging), then builds with `xcodebuild` against the `iphonesimulator` SDK
with code signing disabled.

The project is created with `--packagemanager Cocoapods` rather than
Capacitor 8's default Swift Package Manager integration:
`@capacitor-community/bluetooth-le@8.3.0`'s bundled Swift source doesn't
compile against the newer Swift API surface SPM resolves
(`capacitor-swift-pm`) — it's missing `CAPPluginCall.reject` and a few
other methods the plugin calls. CocoaPods installs the older, stable
Objective-C-bridged Capacitor runtime the plugin was actually written
against, which doesn't have this gap.

This proves the Capacitor iOS project compiles and links against the
plugins. It does **not** prove:

- **Bluetooth works.** The iOS Simulator has no Bluetooth hardware at all,
  so `js/ble/capacitor-ble-shim.js` (same shim used for Android) is
  completely unverified here — only a real device can test it, same caveat
  the Android build already carries for its own BLE/filesystem shims.
- **It's installable on a real iPad.** A simulator `.app` isn't the same
  format as a device-installable `.ipa`, and unsigned builds can't run on
  physical hardware. A device build additionally needs an Apple Developer
  account, a signing certificate, and a provisioning profile — none of
  which this workflow has.

## Changing scope later

If/when a signed device build is needed, the additional pieces are: an
Apple Developer account, a `.p12` signing certificate and `.mobileprovision`
profile stored as GitHub Actions secrets (imported into a temporary keychain
in the workflow), and swapping `-sdk iphonesimulator`/`CODE_SIGNING_ALLOWED=NO`
for a signed `-sdk iphoneos` archive/export step. None of that is wired up
yet — this workflow only validates the pipeline.
