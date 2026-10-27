# Fan models (optional)

Put `batman.glb` and `superman.glb` here and the scene uses them in place of the procedural heroes.
If a file is missing, that hero falls back to the procedural body.

- Use **static humanoid meshes** standing upright and facing +Z, in a T-pose, A-pose or arms-down pose. They don't need a rig.
  `src/modelrig.js` scales each model to the hero's height and cuts it into rigid pieces. It assigns every triangle to the nearest bone capsule, rotates the arms down to the skeleton's rest pose, and attaches the pieces to the IK skeleton. The existing choreography then animates them.
- Sources: CC0 fan models from https://www.meshy.ai/tags/batman and https://www.meshy.ai/tags/superman (download GLB, free account required), or CC-BY models from Sketchfab.
  Batman and Superman remain DC's characters, so fan models are for personal / non-commercial use only. Keep the author credit for CC-BY models.
- URL options: `?bat=url&sup=url` to load other files, `?bat=0` to force the procedural hero,
  `?byaw=180` / `?syaw=180` if a model faces backwards, `?cape=0` (or `bcape=0` / `scape=0`) to hide the cloth cape when the model has its own.

## Included models (CC-BY-4.0, attribution required)
- `batman.glb`: "Batman" by Salstar123, https://sketchfab.com/3d-models/batman-5a99c05a56ff4bb9b045581444590d34
- `superman.glb`: "Superman" by shreyhaldkar0, https://sketchfab.com/3d-models/superman-ebc5bf9fa17e40ccb35edd774d8f0cfe
  Slimmed for the web. The 180 animations and the skin/rig were removed, along with the 8 extra UV sets.
  Textures were downscaled from 2048 to 1024 px (79 MB → 3.5 MB).
Both are fan art of DC characters, so they're for non-commercial use only.
