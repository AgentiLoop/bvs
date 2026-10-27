# Batman v Superman — every pixel from code
A real-time three.js remake of the "Batman vs Superman, every pixel from code" idea, with **no video
encoder (no ffmpeg)**. The browser renders it live at 60 Hz.
- **Procedural 3D models**: both heroes, the rooftop, the GOTHAM sign, the water tower, the helicopter and the city are built from primitives (lathe torso, capsules, cones). The emblems, windows and gravel are canvas textures drawn in code. There are no model or image files.
- **Inverse kinematics**: an analytic two-bone IK solver places every hand and foot on a keyframed target.
- **Cloth simulation**: Verlet capes pinned to the shoulders. They collide with the body and the roof.
- **Physics**: rubble chunks, tank staves (planks), water, sparks and dust all run on simple physics. Shockwaves and scorch decals are included.
- **Pixel-art pass**: the scene renders at 1/4 resolution, then gets depth outlines, Bayer-dithered quantization and a hard-edged nearest-neighbour upscale.
- **Deterministic**: fixed 60 Hz timestep plus a seeded RNG, so the same seed gives the same fight every time.
- **Sound from code**: `src/audio.js` synthesizes every effect and the score live with Web Audio, no sample files. Punches, gauntlet clangs, spark crackle, blasts, shockwaves, crumbling concrete, thunder, swings, heat-vision hum, and stingers (braam, gong, fanfare). The suspense score is a D-minor step sequencer: drone, heartbeat, a high tremolo cluster, low string ostinato, taiko, braams and risers. Layers fade in as the fight heats up, and slow-mo muffles the mix. Sound starts on the first key or click.
## Run
```
./serve.sh        # or: python3 -m http.server 8123
open http://localhost:8123
```
Keys: `P` pixel-art on/off · `[` `]` pixel size · `C` free orbit camera · `Space` pause · `R` restart · `M` sound on/off
URL params: `?t=9.5&freeze=1` (seek and pause) · `?seed=42` · `?px=3` · `?pixel=0`
