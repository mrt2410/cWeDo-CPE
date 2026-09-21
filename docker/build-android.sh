#!/usr/bin/env bash
set -euo pipefail

cd /workspace/mobile

echo "==> Copying web assets into mobile/www"
rm -rf www
mkdir -p www
cp -rL /workspace/index.html /workspace/css /workspace/js /workspace/data www/

echo "==> Installing Capacitor CLI"
npm install

# Android has no Web Bluetooth implementation at all, so
# js/ble/capacitor-ble-shim.js fakes it, backed by
# @capacitor-community/bluetooth-le's BleClient. This app has no bundler, so
# both the Capacitor core runtime and the plugin's browser bundle are
# vendored here as plain <script> tags (their own package.json "unpkg"
# fields point at exactly these files) instead of being imported — see
# docs/android-apk-build.md.
echo "==> Vendoring the Capacitor core + BluetoothLe + Filesystem plugin browser bundles"
mkdir -p www/vendor
cp node_modules/@capacitor/core/dist/capacitor.js www/vendor/capacitor-core.js
cp node_modules/@capacitor-community/bluetooth-le/dist/plugin.js www/vendor/bluetooth-le-plugin.js
# @capacitor/filesystem's browser bundle expects a global `synapse` (a
# separate @capacitor/synapse package it depends on for an unrelated
# cross-plugin-proxy feature this app never uses) already in scope — rather
# than also vendoring that package and bridging its different global name,
# a one-line no-op stub is enough: the bundle only ever calls
# synapse.exposeSynapse(), and nothing else here touches it.
{ echo 'var synapse={exposeSynapse:function(){}};'; cat node_modules/@capacitor/filesystem/dist/plugin.js; } \
  > www/vendor/filesystem-plugin.js
sed -i \
  's#<script src="js/ble/capacitor-ble-shim.js"></script>#<script src="vendor/capacitor-core.js"></script>\n<script src="vendor/bluetooth-le-plugin.js"></script>\n<script src="vendor/filesystem-plugin.js"></script>\n<script src="js/ble/capacitor-ble-shim.js"></script>#' \
  www/index.html

if [ ! -d android ]; then
  echo "==> Creating Android project (first run)"
  npx cap add android
fi

echo "==> Syncing web assets into the Android project"
npx cap sync android

echo "==> Building debug APK"
cd android
./gradlew assembleDebug --no-daemon

mkdir -p /output
cp app/build/outputs/apk/debug/app-debug.apk /output/cwedo-cpe-debug.apk

echo "==> Done: release/cwedo-cpe-debug.apk"
