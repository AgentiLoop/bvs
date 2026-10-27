#!/usr/bin/env bash
# Builds the web-thin macOS app: a WKWebView window around the hosted game (WEB_URL in main.swift,
# https://bvs.agentiloop.ai/) with no game files in it. Universal (arm64 + x86_64), signed with the
# Developer ID, optionally notarized and stapled, zipped to release/.
# Usage: mac/build-web-thin.sh [notarize]      MAC_SIGN_ID=<identity> picks another signing identity.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(node -p "require('$HERE/../package.json').version")
APP="$HERE/build/web-thin/Batman v Superman.app"
ZIP="$HERE/../release/BvS-web-thin-$VERSION-mac-universal.zip"
IDENTITY="${MAC_SIGN_ID:-Developer ID Application}"

swift build --package-path "$HERE" -c release --arch arm64 --arch x86_64
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$(swift build --package-path "$HERE" -c release --arch arm64 --arch x86_64 --show-bin-path)/BvS" "$APP/Contents/MacOS/"
cp "$HERE/AppIcon.icns" "$APP/Contents/Resources/"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Batman v Superman</string>
  <key>CFBundleDisplayName</key><string>Batman v Superman</string>
  <key>CFBundleExecutable</key><string>BvS</string>
  <key>CFBundleIdentifier</key><string>ai.agentiloop.bvs.webthin</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.games</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
</dict>
</plist>
PLIST
printf 'APPL????' > "$APP/Contents/PkgInfo"
codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"
mkdir -p "$(dirname "$ZIP")"; rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
if [ "${1:-}" = notarize ]; then
  xcrun notarytool submit "$ZIP" -p "App Store Connect Profile" --wait
  xcrun stapler staple "$APP"
  rm -f "$ZIP"; ditto -c -k --keepParent "$APP" "$ZIP"
  spctl -a -vv "$APP"
fi
ls -la "$ZIP"
