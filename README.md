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
| Move | WASD | Left stick |
| Punch (×4 chain) · Kick | J · K | X · Y |
| Block | Shift | LB / RB / LT / RT |
| Crouch | C | Left stick down |
| Jump | Space | A |
| Special | L | B |
| Super (full meter) | Block + Special · I | Block + B |
| Drive impact · Fatal blow | H · F | LB + RB · LT + RT |
| Pause (shows every move) · Quit | Enter · Esc | Start · Back |

Press Pause during a fight to see the full move list: throws, projectiles, the rising uppercut, parries, dashes,
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

URL params: `?play=bat` or `?play=sup` (skip the title) · `?t=9.5&freeze=1` (seek and pause) · `?seed=42` · `?px=3` · `?pixel=0`

## Deploy

`deploy/publish.sh` publishes the repository root, as-is, to https://bvs.agentiloop.ai/ as a Cloudflare static-asset
Worker.
