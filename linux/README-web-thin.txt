Batman v Superman web-thin for Linux (x64 and arm64, Raspberry Pi included)

Plays the hosted game at https://bvs.agentiloop.ai/ in a Chrome or Chromium app window: no tabs or
address bar, 1280x720, its own profile. No game files are bundled, so it needs an internet connection
and always runs the latest deployed version.

1. Unpack:
     tar -xzf BvS-web-thin-*-linux.tar.gz
2. Install (one step):
     ./BvS-web-thin/install.sh
   If no Chrome, Chromium, Edge or Brave is installed, it installs Google Chrome on x64 (apt / dnf) or
   Chromium on arm64 and other distros. Then it adds "Batman v Superman" to the Games menu, adds a
   `bvs-web` command and starts the game.

Other ways:
  ./BvS-web-thin/BvS     play without installing
  ./install.sh --uninstall            removes the app, menu entry and saved settings

Pick a browser:  BVS_BROWSER=chromium ./BvS
Other URL (e.g. a local server):  BVS_WEB_URL=http://192.168.1.10:5173/ ./BvS
F11 toggles full screen.
