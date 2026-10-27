#!/bin/sh
# One-step install of Batman v Superman for Linux (x64 and arm64):
#   1. installs a browser if no Chrome / Chromium / Edge / Brave is found:
#      Google Chrome on x64 (apt / dnf), Chromium on arm64 and other distros
#   2. copies the app to ~/.local/share/bvs-web/app
#   3. adds "Batman v Superman" to the Games menu and a `bvs-web` command in ~/.local/bin
#   4. starts the game
# ./install.sh --no-launch skips step 4; ./install.sh --uninstall removes everything (settings included).
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
HOME_DIR="$DATA/bvs-web"
APP="$HOME_DIR/app"
DESK="$DATA/applications/bvs-web.desktop"
BIN="$HOME/.local/bin/bvs-web"

if [ "${1:-}" = --uninstall ]; then
  rm -rf "$HOME_DIR" "$HOME/snap/chromium/common/bvs-web" "$DESK" "$BIN"
  echo "Batman v Superman removed"
  exit 0
fi

has_browser() {
  for b in google-chrome-stable google-chrome chromium chromium-browser microsoft-edge-stable microsoft-edge \
           brave-browser; do
    command -v "$b" >/dev/null 2>&1 && return 0
  done
  command -v flatpak >/dev/null 2>&1 && { flatpak info org.chromium.Chromium || flatpak info com.google.Chrome; } \
    >/dev/null 2>&1 && return 0
  return 1
}

if ! has_browser; then
  SUDO=; [ "$(id -u)" = 0 ] || SUDO=sudo
  ARCH="$(uname -m)"
  TMP="$(mktemp -d)"
  echo "No Chrome or Chromium found, installing one (asks for your password)"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update
    if [ "$ARCH" = x86_64 ]; then
      DEB=https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
      curl -fsSL -o "$TMP/chrome.deb" "$DEB" 2>/dev/null || wget -qO "$TMP/chrome.deb" "$DEB"
      $SUDO apt-get install -y "$TMP/chrome.deb"
    else
      $SUDO apt-get install -y chromium || $SUDO apt-get install -y chromium-browser
    fi
  elif command -v dnf >/dev/null 2>&1; then
    if [ "$ARCH" = x86_64 ]; then
      $SUDO dnf install -y https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
    else
      $SUDO dnf install -y chromium
    fi
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -S --needed --noconfirm chromium
  elif command -v zypper >/dev/null 2>&1; then
    $SUDO zypper --non-interactive install chromium
  else
    echo "Install Google Chrome or Chromium with your package manager, then run ./install.sh again" >&2
    exit 1
  fi
  rm -rf "$TMP"
fi

if [ "$SRC" != "$APP" ]; then
  rm -rf "$APP"; mkdir -p "$APP"
  cp -R "$SRC/." "$APP/"
fi
mkdir -p "$(dirname "$DESK")" "$(dirname "$BIN")"
ln -sf "$APP/BvS" "$BIN"
cat > "$DESK" <<EOF
[Desktop Entry]
Type=Application
Name=Batman v Superman
Comment=Batman v Superman in your browser (bvs.agentiloop.ai)
Exec="$APP/BvS"
Icon=$APP/bvs.png
Categories=Game;
StartupWMClass=BvS-Web
EOF
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$(dirname "$DESK")" 2>/dev/null || true
echo "Batman v Superman installed: Games menu entry added, or run: bvs-web"

if [ "${1:-}" != --no-launch ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  nohup "$APP/BvS" >/dev/null 2>&1 &
fi
