# Batman v Superman — every pixel from code

<img width="5128" height="2644" alt="image" src="https://github.com/user-attachments/assets/c78c775f-5e56-468e-a795-c1b6b33b6001" />

A real-time three.js 3D fighting game, Batman against Superman, where **every pixel is drawn from code**. It has no
model files, no image textures, no audio samples and no build step.

**Play it in your browser: https://bvs.agentiloop.ai/**. Press `B` to play as Batman or `S` to play as
Superman. A keyboard or a gamepad both work.

## Desktop apps

Each [release](https://github.com/AgentiLoop/bvs/releases) has small "web-thin" apps. Each one is a window around
the hosted game at https://bvs.agentiloop.ai/. They don't include any game files, so they need an internet
connection, and they always run the latest deployed version.

| Platform | Download | What it is |
|---|---|---|
| macOS 13+ (Apple silicon and Intel) | `BvS-web-thin-<version>-mac-universal.zip` | A WKWebView app, signed with Developer ID and notarized |
| Windows 10 / 11 (x64 and ARM64) | `BvS-web-thin-<version>-win.zip` | Opens the game in a Microsoft Edge app window. Run `Install.cmd`, or `BvS.cmd` to play without installing |
| Linux (x64 and arm64) | `BvS-web-thin-<version>-linux.tar.gz` | Opens the game in a Chrome / Chromium app window. Run `./BvS-web-thin/install.sh`, or `./BvS-web-thin/BvS` to play without installing |

To build the apps yourself, run `mac/build-web-thin.sh notarize`, `windows/build-web-thin.sh` and
`linux/build-web-thin.sh`. Each one writes its package to `release/`. `icon/build-icons.sh` regenerates the app icons
from `icon/bvs.svg`.

## Controls

| | Keyboard | Gamepad |
|---|---|---|
| Move | WASD or arrows | Left stick or d-pad |
| Punch (×4 chain) · Kick | J · K | X · Y |
| Block | Shift | LB / RB / LT / RT |
| Crouch | C | Left stick down or L3 |
| Jump | Y | A |
| Special | L | B |
| Super (full meter) | Block + Special · I | Block + B |
| Drive impact · Fatal blow | H · F | LB + RB · LT + RT |
| Throw | J + K close · U | X + Y close |
| Grapnel (Batman) · Stage prop | G · E | R3 |
| Pause (shows every move) · Quit | Space (or Enter) · Esc | Menu (Start) · View (Back) |
| Rematch (match over) | Space · Enter · R | Menu · A |
| Pick a hero (title) | B · S | X · B (or d-pad left / right) |

In a match `P` cycles the comic / pixel-art look and `M` toggles sound. Press Pause during a fight to see the full move list: throws, projectiles, the rising uppercut, parries, dashes,
sidesteps, breakers, amplified specials, cancels, power-up orbs, stage props, Batman's grapnel and the finisher.

## How it's made

- **Procedural 3D models**: both heroes, the rooftop, the GOTHAM sign, the water tower, the helicopter and the city are built from primitives (lathe torso, capsules, cones). The emblems, windows and gravel are canvas textures drawn in code.
- **Inverse kinematics**: an analytic two-bone IK solver places every hand and foot on a target.
- **Cloth simulation**: Verlet capes pinned to the shoulders. They collide with the body and the roof.
- **Physics**: rubble chunks, tank staves (planks), water, sparks and dust all run on simple physics. Shockwaves and scorch decals are included.
- **Comic / pixel-art pass**: depth outlines, halftone and Bayer-dithered quantization, with an optional low-resolution, hard-edged nearest-neighbour upscale.
- **Deterministic**: fixed 60 Hz timestep plus a seeded RNG.
- **Sound from code**: `src/audio.js` synthesizes every effect and the score live with Web Audio, with no sample files. Sound starts on the first key or click.

## Run locally

```
./serve.sh        # or: python3 -m http.server 8123
open http://localhost:8123
```

Title-screen keys: `B` / `S` play as Batman / Superman · `P` pixel-art on/off · `[` `]` pixel size · `C` free orbit camera · `Space` pause · `R` restart · `M` sound on/off

URL params: `?play=bat` or `?play=sup` (skip the title) · `?demo=1` (auto-pilot attract mode: the film, then a CPU v CPU match; add `&play=bat` to start the match right away) · `?t=9.5&freeze=1` (seek and pause) · `?seed=42` · `?px=3` · `?pixel=0`

## Build it by hand

The game itself has no build step. `index.html` loads `src/main.js` as an ES module, and three.js is already in
`vendor/` (the import map points `three` at `vendor/three.module.js`), so you don't need `npm install`. The only thing
you need is a local web server, because browsers won't load ES modules from `file://`.

1. Get the source: `git clone https://github.com/AgentiLoop/bvs.git && cd bvs`, or download and unzip the source
   code from a [release](https://github.com/AgentiLoop/bvs/releases).
2. Serve the folder: `./serve.sh`, or `python3 -m http.server 8123`, or any other static file server.
3. Open http://localhost:8123 in a browser with WebGL 2 (Chrome, Edge, Firefox or Safari).

To ship your own copy, upload the whole folder as-is to any static host.

The desktop apps are built by hand like this. Each script writes its package to `release/` and takes the version
from `package.json`.

| App | Needs | Command |
|---|---|---|
| macOS | Xcode command-line tools (Swift), node, a Developer ID signing identity (or set `MAC_SIGN_ID`), and a `notarytool` keychain profile named "App Store Connect Profile" to notarize | `mac/build-web-thin.sh` (signed) or `mac/build-web-thin.sh notarize` |
| Windows | bash, node and zip (runs on macOS or Linux, nothing is compiled) | `windows/build-web-thin.sh` |
| Linux | bash, node and tar | `linux/build-web-thin.sh` |
| Icons | rsvg-convert (`brew install librsvg`), iconutil and python3 with Pillow | `icon/build-icons.sh` |

Set `BVS_WEB_URL` to point the Windows and Linux packages at your own copy of the game. The macOS app's default URL
is `WEB_URL` in `mac/Sources/BvS/main.swift`; run it with `BVS_WEB_URL` set (or `--url URL`) to use another one.

## Deploy

`deploy/publish.sh` publishes the repository root, as-is, to https://bvs.agentiloop.ai/ as a Cloudflare static-asset
Worker.
