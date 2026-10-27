#!/usr/bin/env bash
# Renders icon/bvs.svg into the app icons: mac/AppIcon.icns, windows/BvS.ico, linux/bvs.png
# and icon/bvs.png (1024). Needs rsvg-convert (brew install librsvg), iconutil and python3 with Pillow.
# Usage: icon/build-icons.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/.."
SVG="$HERE/bvs.svg"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

png() { rsvg-convert -w "$1" -h "$1" "$SVG" -o "$2"; }
png 1024 "$HERE/bvs.png"
png 512 "$ROOT/linux/bvs.png"

SET="$TMP/AppIcon.iconset"; mkdir "$SET"
for s in 16 32 128 256 512; do
  png "$s" "$SET/icon_${s}x${s}.png"
  png $((s * 2)) "$SET/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$SET" -o "$ROOT/mac/AppIcon.icns"

png 256 "$TMP/ico.png"
python3 -c "from PIL import Image; Image.open('$TMP/ico.png').save('$ROOT/windows/BvS.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])"
ls -la "$HERE/bvs.png" "$ROOT/mac/AppIcon.icns" "$ROOT/windows/BvS.ico" "$ROOT/linux/bvs.png"
