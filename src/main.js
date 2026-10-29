// Batman v Superman — real-time three.js, every pixel from code. No video encoder: the browser IS the renderer.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeHero, applyPose, rimAmt } from './heroes.js';
import { Cape } from './cloth.js';
import { Debris, Particles, Shockwaves, Decals } from './fx.js';
import { buildWorld, groundAt } from './world.js';
import { BAT, SUP, HEAT, SLOWMO, KEY, sampleTrack, sampleCam, face } from './timeline.js';
import { mulberry32 } from './rng.js';
import { loadFanModel } from './modelrig.js';
import { Game } from './game.js';
import { Sound } from './audio.js';

const sound = new Sound();
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => sound.on && sound.start());
// HUD speaker button (bottom right): always on screen, click it or press M to mute / unmute.
// Browsers keep audio locked until a click / key, so while locked it reads SOUND OFF and the first click turns it on.
const sndUI = document.getElementById('snd');
sndUI.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (sound.on && !(sound.ctx && sound.ctx.state === 'running') && !paused) sound.start(); // still locked: unlock
  else { sound.toggle(); if (sound.on) { sound.start(); if (paused) sound.pause(true); } }
});
let sndShown = '';
function soundPrompt() {
  const live = sound.on && !!sound.ctx && (paused || sound.ctx.state === 'running');
  const txt = live ? '\u{1F50A} SOUND ON' : '\u{1F507} SOUND OFF';
  if (txt !== sndShown) { sndShown = txt; sndUI.textContent = txt; sndUI.classList.toggle('off', !live); }
}

const qs = new URLSearchParams(location.search);
const SEED = +(qs.get('seed') || 1337);
const DEMO = qs.get('demo') === '1'; // ?demo=1 attract mode: the title film, then a CPU v CPU auto-pilot match, then the film again
const DT = 1 / 60;
const LOOP_END = 21.5; // real seconds
// Screen settings (mode + pixel sizes) are remembered in localStorage; URL params still override.
const saved = (() => { try { return JSON.parse(localStorage.getItem('bvs.screen')) || {}; } catch { return {}; } })();
const mode = qs.has('pixel') ? qs.get('pixel') : saved.mode != null ? String(saved.mode) : '2';
let pixelMode = mode === '1', comicMode = mode === '2'; // comic by default; ?pixel=0 smooth 3D. P cycles: smooth 3D → pixel-art → comic → smooth 3D
const CSTEPS = [1, 1.25, 1.5, 2, 3, 4, 5, 6, 7, 8]; // pixel size for pixel-art / comic modes (- / + keys); comic gets fine steps after 1
let PIX = +(qs.get('px') || saved.px || 2), CPIX = CSTEPS.includes(saved.cpx) ? saved.cpx : 1;
function saveScreen() { localStorage.setItem('bvs.screen', JSON.stringify({ mode: pixelMode ? 1 : comicMode ? 2 : 0, px: PIX, cpx: CPIX })); }
function cycleMode() { if (pixelMode) { pixelMode = false; comicMode = true; } else if (comicMode) comicMode = false; else pixelMode = true; saveScreen(); resize(); }
function pixStep(d) {
  if (comicMode) CPIX = CSTEPS[Math.max(0, Math.min(CSTEPS.length - 1, CSTEPS.indexOf(CPIX) + d))];
  else PIX = Math.max(1, Math.min(8, PIX + d));
  saveScreen(); resize();
}
let ditherIGN = qs.get("dither") !== "bayer"; // pixel-art dither: interleaved gradient noise (default) or Bayer 4x4 (?dither=bayer); N toggles
let paused = false, freeCam = false;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; controls.target.set(0, 1.2, 0);

let rt;
const post = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() },
    near: { value: camera.near }, far: { value: camera.far }, pixel: { value: 1 }, comic: { value: 0 }, flash: { value: 0 }, levels: { value: 6 }, ign: { value: 1 },
    xray: { value: 0 }, xc: { value: new THREE.Vector2(0.5, 0.5) }, xg: { value: 0 }, // Krushing Blow: amount, impact (screen uv), crack length
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth; uniform vec2 res, xc; uniform float near, far, pixel, comic, flash, levels, ign, xray, xg;
    varying vec2 vUv;
    float lin(vec2 uv){ float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0*near*far/(far+near - z*(far-near)); }
    float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    float ignoise(vec2 p){ return fract(52.9829189 * fract(dot(floor(p), vec2(0.06711056, 0.00583715)))); } // Jimenez interleaved gradient noise: blue-noise-like, no grid
    vec3 grade(vec2 uv){ vec3 c = texture2D(tColor, uv).rgb; c = vec3(1.0) - exp(-c * 1.3); return pow(c, vec3(1.0 / 2.2)); }
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    // halftone: dot grid rotated by ang, dot radius grows with ink amount (Ben-Day / CMYK print screens)
    float dots(vec2 p, float ang, float cell, float ink){
      mat2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      vec2 q = r * p / cell; vec2 f = fract(q) - 0.5;
      return 1.0 - smoothstep(-0.08, 0.08, length(f) - sqrt(clamp(ink, 0.0, 1.0)) * 0.62);
    }
    void main(){
      vec3 c = grade(vUv);
      if (comic > 0.5) {
        vec2 px = 1.6 / res, fc = gl_FragCoord.xy;
        // ink lines: silhouettes from depth + only strong colour edges (Sobel on luma), ~1.6px, soft
        float d0 = lin(vUv), e = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 o = (i == 0 ? vec2(1.,0.) : i == 1 ? vec2(-1.,0.) : i == 2 ? vec2(0.,1.) : vec2(0.,-1.)) * px;
          e = max(e, smoothstep(0.05 * d0 + 0.08, 0.08 * d0 + 0.2, lin(vUv + o) - d0));
        }
        float l00 = lum(grade(vUv + vec2(-px.x, -px.y))), l10 = lum(grade(vUv + vec2(0., -px.y))), l20 = lum(grade(vUv + vec2(px.x, -px.y)));
        float l01 = lum(grade(vUv + vec2(-px.x, 0.))), l21 = lum(grade(vUv + vec2(px.x, 0.)));
        float l02 = lum(grade(vUv + vec2(-px.x, px.y))), l12 = lum(grade(vUv + vec2(0., px.y))), l22 = lum(grade(vUv + vec2(px.x, px.y)));
        float gx = (l20 + 2.*l21 + l22) - (l00 + 2.*l01 + l02), gy = (l02 + 2.*l12 + l22) - (l00 + 2.*l10 + l20);
        e = max(e, 0.7 * smoothstep(0.27, 0.5, length(vec2(gx, gy))));
        // cel shading: keep the scene's hues, gently lift + saturate, then snap brightness into soft bands
        c = pow(c, vec3(0.82)) * 1.12;
        float L = lum(c);
        c = clamp(mix(vec3(L), c, 1.5), 0.0, 1.0);
        float b = L * 4.0, Lq = (floor(b) + smoothstep(0.38, 0.62, fract(b))) / 4.0;
        c *= (Lq + 0.04) / (L + 0.04);
        // Ben-Day dots only in the shadows/midtones, as a light overlay rather than replacing the colour
        float ink = smoothstep(0.6, 0.08, Lq) * 0.75;
        c *= 1.0 - 0.42 * dots(fc, 0.7854, 5.0, ink);
        // paper: faint warm tint + grain, then soft ink outline
        float grain = fract(sin(dot(floor(fc), vec2(12.9898, 78.233))) * 43758.5453);
        c = mix(c, c * vec3(1.0, 0.97, 0.9) + 0.03, 0.55) * (0.96 + 0.04 * grain);
        c = mix(c, vec3(0.05, 0.04, 0.06), e * 0.9);
      } else {
        c *= vec3(0.96, 1.0, 1.07);                     // cool night grade
      }
      if (pixel > 0.5) {
        vec2 px = 1.0 / res;
        float d0 = lin(vUv), e = 0.0;
        float d1 = lin(vUv + vec2(px.x, 0.)), d2 = lin(vUv - vec2(px.x, 0.)), d3 = lin(vUv + vec2(0., px.y)), d4 = lin(vUv - vec2(0., px.y));
        float th = 0.06 * d0 + 0.08;
        if (max(max(d1, d2), max(d3, d4)) - d0 > th) e = 1.0;
        c *= 1.0 - 0.65 * e;                           // pixel outlines on silhouettes
        float b = (ign > 0.5 ? ignoise(gl_FragCoord.xy) : bayer4(gl_FragCoord.xy)) - 0.5;
        c = floor(c * levels + b + 0.5) / levels;       // dither + quantize
      }
      if (xray > 0.001) {
        // MK x-ray: the frame turns to a cold inverted film, brightest round the impact, and white cracks
        // splinter outward from the struck point along jagged rays
        vec2 d = (vUv - xc) * vec2(res.x / res.y, 1.0);
        float r = length(d), a = atan(d.y, d.x);
        vec3 film = vec3(0.6, 0.88, 1.0) * pow(1.0 - lum(c), 1.8) * 1.15;
        float focus = smoothstep(0.6, 0.05, r);
        c = mix(c, film, xray * mix(0.6, 1.0, focus));
        float n = 11.0, sec = floor(a / 6.2832 * n + 0.5), ca = (sec + 0.35 * sin(sec * 12.9)) * 6.2832 / n;
        float off = r * sin(a - ca) + 0.012 * sin(r * 70.0 + sec * 5.0) * smoothstep(0.0, 0.1, r);
        float len = xg * (0.55 + 0.45 * fract(sin(sec * 78.2) * 437.5));
        float crack = (1.0 - smoothstep(0.0012, 0.0045, abs(off))) * step(r, len) * smoothstep(len, len * 0.6, r);
        c = mix(c, vec3(1.0), xray * clamp(crack + exp(-r * 22.0) * 0.8, 0.0, 1.0));
      }
      c = mix(c, vec3(1.0, 0.97, 0.92), flash);
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function resize() {
  const s = pixelMode ? PIX : comicMode ? CPIX : 1;
  const w = Math.max(1, Math.floor(innerWidth / s)), h = Math.max(1, Math.floor(innerHeight / s));
  renderer.setSize(w, h, false);
  if (rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, samples: pixelMode ? 0 : 4 });
  rt.depthTexture = new THREE.DepthTexture(w, h);
  post.uniforms.tColor.value = rt.texture;
  post.uniforms.tDepth.value = rt.depthTexture;
  post.uniforms.res.value.set(w, h);
  post.uniforms.pixel.value = pixelMode ? 1 : 0;
  post.uniforms.comic.value = comicMode ? 1 : 0;
  post.uniforms.ign.value = ditherIGN ? 1 : 0;
  rimAmt.value = comicMode ? 0 : 1;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- world & actors ----------
const world = buildWorld(scene);
for (const k of (qs.get('off') || '').split(',')) { // debug: ?off=rain,spot,fog,hemi
  if (k === 'rain') world.rain.visible = false;
  if (k === 'spot') { world.heli.spot.visible = false; world.heli.beam.visible = false; }
  if (k === 'fog') scene.fog = null;
  if (k === 'emis') scene.traverse((o) => o.material && [].concat(o.material).forEach((m) => m.emissiveMap && (m.emissiveIntensity = 0)));
}
const bat = makeHero('batman'), sup = makeHero('superman');
scene.add(bat.root, sup.root);
// Clean procedural heroes by default; imported models remain available through explicit URLs.
document.getElementById('hud').textContent = 'Procedural Batman & Superman · B / S play as Batman / Superman · P pixel-art / comic · - + pixel size · C free camera · SPACE pause · R restart · M sound';
window.__fan = {};
const DEFAULT_CAPE = { bat: 'Cube_2', sup: null }; // Batman's cape shares a shell with the cowl, so name it
const DEFAULT_YAW = { bat: 0, sup: -Math.PI / 2 }; // verified facing for the bundled models (auto-detect is fooled by capes)
for (const [H, key, file] of [[bat, 'bat', 'batman'], [sup, 'sup', 'superman']]) {
  if (!qs.get(key) || qs.get(key) === '0') continue;
  loadFanModel(H, qs.get(key) || `./models/${file}.glb`, { yaw: qs.has(key[0] + 'yaw') ? +qs.get(key[0] + 'yaw') * Math.PI / 180 : qs.get(key) ? null : DEFAULT_YAW[key], capeMesh: qs.get(key) ? null : DEFAULT_CAPE[key] })
    .then((n) => {
      window.__fan[key] = { n, yaw: Math.round(H.fanYaw * 180 / Math.PI) };
      const cape = key === 'bat' ? batCape : supCape; // fan models bring their own cape
      if (qs.get(key[0] + 'cape') !== '1') cape.mesh.visible = false;
    })
    .catch((e) => (window.__fan[key] = 'none: ' + String((e && e.message) || e).slice(0, 80)));
}
const batCape = new Cape(bat, { cols: 11, rows: 15, topW: 0.38, botW: 1.45, len: 1.45, color: 0x111216, scallop: true });
const supCape = new Cape(sup, { cols: 11, rows: 14, topW: 0.42, botW: 1.3, len: 1.4, color: 0xb3161a }); // full, sweeping cape, not a ribbon
scene.add(batCape.mesh, supCape.mesh);
for (const [cape, key] of [[batCape, 'bcape'], [supCape, 'scape']]) if (qs.get(key) === '0' || qs.get('cape') === '0') cape.mesh.visible = false;

const debris = new Debris(700);
const water = new Particles(2200, { size: 0.07, gravity: 9.8, bounce: 0.15, drag: 0.3, opacity: 0.85 });
const sparks = new Particles(900, { size: 0.06, additive: true, gravity: 5, bounce: 0.4, drag: 1.2 });
const dust = new Particles(900, { size: 0.16, additive: false, gravity: -0.3, bounce: 0, drag: 2.5, opacity: 0.35 });
const waves = new Shockwaves(scene, 10);
{ const spawn = waves.spawn.bind(waves); waves.spawn = (x, y, z, r, ...rest) => { sound.note('wave', r); return spawn(x, y, z, r, ...rest); }; }
const decals = new Decals(400);
scene.add(debris.mesh, water.points, sparks.points, dust.points, decals.mesh);

const flashLight = new THREE.PointLight(0xffe0b0, 0, 30, 2);
scene.add(flashLight);
const heatLight = new THREE.PointLight(0xff3010, 0, 8, 2);
scene.add(heatLight);
const beams = [0, 1].map(() => {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, blending: THREE.AdditiveBlending, depthWrite: false })));
  g.children[0].scale.set(0.03, 1, 0.03); g.children[1].scale.set(0.01, 1, 0.01);
  g.visible = false; scene.add(g);
  return g;
});
// Fist-to-chin impact blasts: additive radial-glow sprites that bloom at each contact point.
const blastTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,245,200,0.95)');
  gr.addColorStop(0.45, 'rgba(255,170,60,0.55)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = i % 2 ? 40 : 62; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); g.stroke(); }
  return new THREE.CanvasTexture(c);
})();
// Slots 0-1: the finale's fist blasts. 2+: playable-mode hit explosions (size / life / tint per blast).
const blasts = Array.from({ length: 12 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: blastTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  s.visible = false; s.renderOrder = 10; s.userData.age = 0; scene.add(s);
  return s;
});
// Playable-mode projectiles: Batman's spinning batarang (dark bat silhouette with a gold glow) and Superman's sonic clap
// (an upright blue shock ring rolling along the ground). An amplified throw fans three batarangs, so Batman gets three meshes.
const shotMesh = (() => {
  const s = new THREE.Shape([[0, 0.05], [0.07, 0.11], [0.1, 0.06], [0.2, 0.1], [0.17, 0.02], [0.13, -0.03], [0.07, -0.02], [0, -0.07],
    [-0.07, -0.02], [-0.13, -0.03], [-0.17, 0.02], [-0.2, 0.1], [-0.1, 0.06], [-0.07, 0.11]].map(([x, y]) => new THREE.Vector2(x * 1.4, y * 1.4)));
  const bat = new THREE.Group();
  bat.add(new THREE.Mesh(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x15161a, side: THREE.DoubleSide })));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: blastTex, color: 0xffc040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  glow.scale.setScalar(0.7); bat.add(glow);
  const sup = new THREE.Group();
  sup.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0x9fc8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 })));
  sup.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 })));
  const bats = [bat, bat.clone(), bat.clone()];
  for (const g of [...bats, sup]) { g.visible = false; scene.add(g); }
  return { bat: bats, sup: [sup] };
})();
// Playable mode: Batman's grapnel line (a green kryptonite laser with a white-hot core) and its glowing kryptonite hook head.
const grapMesh = (() => {
  const line = new THREE.Group(), geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
  line.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x39ff6a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })));
  line.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xeaffef, blending: THREE.AdditiveBlending, depthWrite: false })));
  const hook = new THREE.Group();
  hook.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.08).scale(1, 2, 1), new THREE.MeshBasicMaterial({ color: 0x8dffad })));
  for (let i = 0; i < 3; i++) { // three claw prongs swept back from the crystal tip
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 5), new THREE.MeshBasicMaterial({ color: 0x2a3a30 }));
    const a = i / 3 * Math.PI * 2; c.position.set(Math.cos(a) * 0.07, 0.06, Math.sin(a) * 0.07); c.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); hook.add(c);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: blastTex, color: 0x39ff6a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  const light = new THREE.PointLight(0x39ff6a, 0, 6, 2);
  hook.add(glow, light); line.visible = hook.visible = false; scene.add(line, hook);
  return { line, hook, glow, light };
})();
// Playable-mode power-up orb: a bright core inside a translucent shell with a halo, tinted per power-up type.
const orbMesh = (() => {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45, wireframe: true }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: blastTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  halo.scale.setScalar(1.1);
  g.add(core, shell, halo); g.visible = false; scene.add(g);
  return { g, core, shell, halo };
})();
// Playable-mode stage interactables: rusty red steel drums (body, rolled rims, lid), one mesh per game.props entry.
const propMesh = [0, 1].map(() => {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.55, metalness: 0.55 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.45, metalness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20), paint);
  body.castShadow = body.receiveShadow = true; g.add(body);
  for (const y of [-0.44, -0.15, 0.15, 0.44]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.018, 6, 24).rotateX(Math.PI / 2), rim); r.position.y = y; g.add(r); }
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.29, 20).rotateX(-Math.PI / 2), rim); lid.position.y = 0.451; g.add(lid);
  g.rotation.order = 'YXZ'; g.visible = false; scene.add(g);
  return g;
});
const ORB_COL = { rage: 0xff3a2a, meter: 0xffd23a, heal: 0x3aff7a }, _white = new THREE.Color(0xffffff);
const CLASH_T = 18.2, BLAST_LIFE = 0.9; // sim seconds (clash happens in slow-mo, so this plays out long)
let blastN = 2;
function blast(x, y, z, size = 1, life = 0.45, tint = 0xffffff) {
  const b = blasts[blastN]; blastN = blastN + 1 < blasts.length ? blastN + 1 : 2;
  b.position.set(x, y, z); b.material.color.set(tint); b.material.rotation = 0; sound.note('blast', size);
  // big special blasts (supers / fatalities, size 2-3.2) were filling the screen: past 1 they grow at 40%
  Object.assign(b.userData, { age: 0, size: size > 1 ? 1 + (size - 1) * 0.4 : size, life }); b.visible = true;
}

// ---------- sim state ----------
let rng, simT, realT, shake, postFlash, flashI, lightning, fired, acc = 0;
const CONCRETE = [0x6b6d73, 0x5a5c62, 0x7d7f85, 0x4a4b50, 0x8a7a6a];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const chestPos = (H, out = new THREE.Vector3()) => out.set(0, 0.15, 0).applyMatrix4(H.chest.matrixWorld);
// Where H's right fist meets T's chin: fist position pulled a bit toward the target's head.
const contactPos = (H, T, out = new THREE.Vector3()) => H.arms.R.hand.getWorldPosition(out).lerp(T.head.getWorldPosition(_w), 0.3);
function fistBlast() {
  [[bat, sup], [sup, bat]].forEach(([H, T], i) => {
    contactPos(H, T, _v);
    blasts[i].position.copy(_v); blasts[i].userData.age = 0; blasts[i].visible = true;
    sparkBurst(_v.x, _v.y, _v.z, 90, 7, i ? 0xbfd8ff : 0xfff0c0);
    waves.spawn(_v.x, _v.y, _v.z, 2.5, 0xffffff, 0.8);
  });
}

function rubble(x, y, z, n, speed, sMin, sMax, up = 4) {
  sound.note('rubble', n);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, sp = speed * (0.25 + rng() * 0.75), s = sMin + rng() * (sMax - sMin);
    _q.setFromEuler(_e.set(rng() * 6, rng() * 6, rng() * 6));
    debris.spawn(V(x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2), V(Math.cos(a) * sp, up * (0.4 + rng()), Math.sin(a) * sp),
      [s, s * (0.4 + rng() * 0.6), s * (0.6 + rng() * 0.6)], CONCRETE[Math.floor(rng() * CONCRETE.length)], _q,
      V(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(18));
  }
}
function sparkBurst(x, y, z, n, speed, col = 0xffc060) {
  sound.note('sparks', n); if (col === 0xffd23a) sound.note('metal', 1); // Batman's gold = gauntlet on steel
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = speed * (0.3 + rng());
    sparks.spawn(x, y, z, Math.cos(a) * r * sp, u * sp + speed * 0.3, Math.sin(a) * r * sp, 0.25 + rng() * 0.45, col);
  }
}
function dustBurst(x, y, z, n, speed) {
  sound.note('dust', n);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, sp = speed * (0.3 + rng());
    dust.spawn(x, y + 0.1, z, Math.cos(a) * sp, rng() * 0.6, Math.sin(a) * sp, 1.2 + rng() * 1.2, 0x8a8478);
  }
}
function impact(x, y, z, power) {
  shake = Math.max(shake, power); sound.note('impact', power);
  flashI = Math.max(flashI, 25 * power);
  flashLight.position.set(x, y + 0.5, z);
}

function burstTower() {
  const T = world.tower;
  T.broken = true;
  const c = T.center, from = V(-4.95, 3.45, -2.55);
  T.staves.forEach((s) => {
    s.visible = false;
    s.getWorldPosition(_v); s.getWorldQuaternion(_q);
    _w.subVectors(_v, c).setY(0).normalize();
    const push = Math.max(0, _w.dot(_v.clone().sub(from).setY(0).normalize())) * 3;
    for (const dy of [-0.55, 0.55]) {
      const p = _v.clone(); p.y += dy;
      const vel = _w.clone().multiplyScalar(2 + rng() * 3 + push).add(V(0, 1 + rng() * 3, 0));
      debris.spawn(p, vel, [0.3, 1.08, 0.09], s.material.color.getHex(), _q, V(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(10));
    }
  });
  T.hoops.forEach((h) => (h.visible = false));
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    debris.spawn(V(c.x + Math.cos(a), 3 + rng() * 1.4, c.z + Math.sin(a)), V(Math.cos(a) * 4, 2, Math.sin(a) * 4), [0.5, 0.04, 0.04], 0x34373d, null, V(rng(), rng(), rng()).multiplyScalar(12));
  }
  for (let i = 0; i < 1300; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 1.25, y = 2.75 + rng() * 2.1, sp = 1.5 + rng() * 4.5;
    water.spawn(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r, Math.cos(a) * sp, rng() * 2.5, Math.sin(a) * sp, 2.5 + rng() * 2.5, rng() < 0.5 ? 0x9fc8ff : 0xd8ecff);
  }
  T.puddle.visible = true;
  impact(c.x, 3, c.z, 0.45);
  sparkBurst(from.x, from.y, from.z, 30, 4, 0xffffff);
}

const EVENTS = [
  { t: 0.9, fn: () => (lightning = 1) },
  { t: 5.0, fn: () => {
    rubble(2.5, 0, 0, 70, 6, 0.06, 0.28, 5); dustBurst(2.5, 0, 0, 120, 3.5); sparkBurst(2.5, 0.1, 0, 40, 5);
    waves.spawn(2.5, 0.05, 0, 5, 0xfff2d0, 0.8); decals.add(2.5, 0, 1.3); decals.add(2.5, 0, 0.7);
    impact(2.5, 0, 0, 0.5); postFlash = 0.35;
  } },
  { t: 6.3, fn: () => (lightning = 0.8) },
  { t: 9.0, fn: () => { chestPos(sup, _v); sparkBurst(_v.x, _v.y + 0.35, _v.z, 25, 3, 0xffffff); impact(_v.x, _v.y, _v.z, 0.15); } },
  { t: 10.55, fn: () => { chestPos(bat, _v); sparkBurst(_v.x, _v.y, _v.z, 40, 5); impact(_v.x, _v.y, _v.z, 0.35); postFlash = 0.2;
    waves.spawn(0.1, 0.05, 0, 2.5, 0xbfd8ff, 0.5); } },
  { t: 11.35, fn: burstTower },
  { t: 11.9, fn: () => { rubble(-4.5, 0, -1.9, 18, 2.5, 0.05, 0.16, 3); dustBurst(-4.5, 0, -1.9, 60, 2); decals.add(-4.5, -1.9, 0.6); impact(-4.5, 0, -1.9, 0.25); } },
  { t: 15.75, fn: () => { const k = KEY.kick; sparkBurst(k[0] + 0.5, k[1] + 0.2, k[2], 50, 5, 0xffffff); waves.spawn(KEY.S1[0], 0.05, KEY.S1[2], 3, 0xffffff, 0.5);
    impact(k[0], k[1], k[2], 0.4); postFlash = 0.25; } },
  { t: 18.2, fn: () => {
    rubble(0, 0, 0, 180, 9, 0.06, 0.34, 7); dustBurst(0, 0, 0, 220, 6); sparkBurst(0, 1.5, 0, 160, 9, 0xfff0d0);
    waves.spawn(0, 0.05, 0, 9, 0xffffff, 1.6); waves.spawn(0, 1.4, 0, 4, 0xbfd8ff, 1.0);
    for (let i = 0; i < 10; i++) decals.add((rng() - 0.5) * 3, (rng() - 0.5) * 2, 0.4 + rng() * 0.8);
    impact(0, 1.4, 0, 0.7); postFlash = 1; fistBlast();
  } },
];
const EMITTERS = [
  { t0: 4.6, t1: 5.0, fn: () => { const p = sup.root.position; sparkBurst(p.x, p.y + 0.6, p.z, 2, 1.5, 0x9fc8ff); } },
  { t0: 11.35, t1: 12.6, fn: () => { const c = world.tower.center;
    for (let i = 0; i < 10; i++) { const a = rng() * 6.283; water.spawn(c.x + Math.cos(a) * 1.1, 2.8, c.z + Math.sin(a) * 1.1, Math.cos(a) * 1.5, -0.5, Math.sin(a) * 1.5, 2.5, 0xb8d8ff); } } },
  { t0: HEAT.t0, t1: HEAT.t1, fn: (k) => {
    const tg = heatTarget(simT);
    sparkBurst(tg[0], 0.05, tg[2], 4, 3, rng() < 0.5 ? 0xff8030 : 0xffe080);
    if (k % 3 === 0) rubble(tg[0], 0, tg[2], 1, 1.5, 0.04, 0.1, 2.5);
    if (k % 2 === 0) decals.add(tg[0], tg[2], 0.18 + rng() * 0.08, 0.007);
    if (k % 4 === 0) dust.spawn(tg[0], 0.1, tg[2], 0, 0.8, 0, 1.5, 0x403833);
  } },
  { t0: 15.8, t1: 16.4, fn: (k) => { const p = sup.root.position; if (k % 2 === 0) rubble(p.x, 0, p.z, 1, 2, 0.05, 0.14, 2); dustBurst(p.x, 0, p.z, 2, 1.2);
    if (k % 3 === 0) decals.add(p.x, p.z, 0.25); } },
  { t0: 17.4, t1: 18.2, fn: (k) => { if (k % 3) return; for (const H of [bat, sup]) dustBurst(H.root.position.x, 0, H.root.position.z, 1, 0.6); } },
  { t0: CLASH_T, t1: CLASH_T + 0.6, fn: () => { [[bat, sup], [sup, bat]].forEach(([H, T], i) => { contactPos(H, T, _v); sparkBurst(_v.x, _v.y, _v.z, 3, 4, i ? 0xbfd8ff : 0xffd080); }); } },
];

function heatTarget(t) {
  const lag = sampleTrack(BAT, t - 0.32).p;
  const start = [-1.3, 0, -1.6];
  const u = Math.min(1, Math.max(0, (t - HEAT.t0) / 0.45));
  const s = u * u * (3 - 2 * u);
  return [start[0] + (lag[0] - start[0]) * s, 0.02, start[2] + (lag[2] - start[2]) * s];
}
const inHeat = (t) => t >= HEAT.t0 && t < HEAT.t1;

function poseHeroes(t) {
  const sb = sampleTrack(BAT, t), ss = sampleTrack(SUP, t);
  if (inHeat(t)) ss.yaw = face(ss.p, heatTarget(t));
  applyPose(bat, sb, t, groundAt(sb.p[0], sb.p[2]));
  applyPose(sup, ss, t, groundAt(ss.p[0], ss.p[2]));
}

function reset() {
  rng = mulberry32(SEED);
  simT = 0; realT = 0; shake = 0; postFlash = 0; flashI = 0; lightning = 0; fired = new Set();
  debris.clear(); water.clear(); sparks.clear(); dust.clear(); waves.clear(); decals.clear();
  world.tower.reset(); blasts.forEach((b) => (b.visible = false));
  poseHeroes(0);
  batCape.reset(); supCape.reset();
}

// Playable mode (B / S on the title loop): the game drives the heroes; fx, capes and world keep running here.
const game = new Game({
  bat, sup, batCape, supCape, rng: () => rng(), restart: (c) => startGame(c), quit: () => quitGame(), pause: () => togglePause(),
  fx: { sparkBurst, dustBurst, rubble, impact, waves, decals, blast, flash: (v) => { sound.note('flash', v); postFlash = Math.max(postFlash, v); } },
});

// ---------- sound cues: what the fx feed can't see (swings, heat vision, announcer banners, lightning, score intensity) ----------
const SWING_LIGHT = new Set(['dash', 'side']), SWING_HEAVY = new Set(['super', 'blow', 'fatal', 'impact', 'flykick', 'throw', 'prop']);
const lastAct = { bat: null, sup: null };
let lastBanner = '', lastLightning = 0, lastPost = 0;
function soundCues(sdt) {
  const banner = game.active ? game.ui.banner.textContent : '';
  if (banner !== lastBanner) {
    const t = sound.ctx && sound.ctx.currentTime;
    if (t && sound.on) {
      if (banner.startsWith('FIGHT')) sound.braam(0.7, t);
      else if (banner.startsWith('ROUND')) sound.gong(t);
      else if (banner.startsWith('FINISH')) { sound.braam(0.8, t, 21, 3.5); sound.riser(1.2, t + 0.3); }
      else if (banner.includes('WINS')) sound.fanfare(t);
      else if (banner.startsWith('YOU ARE')) sound.taiko(1, t, sound.out(sound.sfx, 0.6));
    }
    lastBanner = banner;
  }
  if (game.active && game.F) for (const k of ['bat', 'sup']) {
    const a = game.F[k].act;
    if (a && a !== lastAct[k] && a.type !== 'rise') sound.note('swing', SWING_HEAVY.has(a.type) ? 2 : SWING_LIGHT.has(a.type) ? 1 : k === 'sup' ? 2 : 1);
    lastAct[k] = a;
  }
  if (sound.ctx && sound.on && lightning > lastLightning + 0.3) sound.thunder(Math.min(1, lightning)); lastLightning = lightning;
  if (!game.active && postFlash > lastPost + 0.15) sound.note('flash', postFlash); lastPost = postFlash; // title loop sets postFlash directly
  sound.heat(game.active ? !!game.heat : inHeat(simT));
  sound.setSlow(sdt / DT);
  let I;
  if (game.active) I = game.finish ? 1 : game.state === 'fight' ? 0.85 : game.state === 'over' ? 0.3 : 0.55;
  else I = simT < 4.5 ? 0.15 : simT < 12 ? 0.45 : simT < SLOWMO ? 0.8 : 0.35;
  sound.setIntensity(I);
  sound.flush();
  soundPrompt();
}

let stepCount = 0;
function step() {
  let sdt, t;
  if (game.active) {
    sdt = game.step(DT); t = game.t; realT += DT; stepCount++;
    if (game.demo && game.matchOver && game.overT > 6) { quitGame(); return; } // auto-pilot match over: back to the film
  } else {
    const pick = playUI.style.display !== 'none' && game.menuPad(); // gamepad on the title loop: X Batman, B Superman
    if (pick) { if (sound.on) sound.start(); startGame(pick); return; }
    const scale = simT < SLOWMO - 0.3 ? 1 : simT < SLOWMO ? 1 - 0.88 * (simT - (SLOWMO - 0.3)) / 0.3 : 0.12;
    sdt = DT * scale;
    simT += sdt; realT += DT; stepCount++; t = simT;
    poseHeroes(simT);
    EVENTS.forEach((ev, i) => { if (!fired.has(i) && simT >= ev.t) { fired.add(i); ev.fn(); } });
    for (const em of EMITTERS) if (simT >= em.t0 && simT < em.t1) em.fn(stepCount);
  }
  debris.step(sdt, groundAt); water.step(sdt, groundAt); sparks.step(sdt, groundAt); dust.step(sdt, groundAt); waves.step(sdt);
  const wind = [1.6 + Math.sin(t * 0.9) * 1.2, 0.3, 1.2 + Math.cos(t * 0.6)];
  for (let s = 0; s < 2; s++) { batCape.step(sdt / 2, t, wind, groundAt); supCape.step(sdt / 2, t, wind, groundAt); }
  shake *= Math.exp(-DT * 6); postFlash *= Math.exp(-DT * (!game.active && simT > SLOWMO ? 1.2 : 7)); flashI *= Math.exp(-DT * 6); lightning *= Math.exp(-DT * 5);
  blasts.forEach((b) => { if (!b.visible) return; const u = (b.userData.age += sdt) / (b.userData.life || BLAST_LIFE);
    if (u >= 1) { b.visible = false; return; }
    b.scale.setScalar((0.25 + 1.6 * Math.sqrt(u)) * (b.userData.size || 1)); b.material.opacity = 1 - u * u; b.material.rotation = u * 0.8; });
  chestPos(bat, _v); chestPos(sup, _w);
  world.update(t, sdt, _v.lerp(_w, 0.5).setY(0.5));
  soundCues(sdt);
  if (!game.active && realT >= LOOP_END) { if (DEMO) startGame(Math.random() < 0.5 ? 'bat' : 'sup', true); else reset(); }
}

// ---------- camera ----------
const resolveLook = (l) => {
  if (Array.isArray(l)) return l;
  if (l === 'B') return chestPos(bat).toArray();
  if (l === 'S') return chestPos(sup).toArray();
  return chestPos(bat).lerp(chestPos(sup), 0.5).toArray();
};
function updateCamera() {
  if (freeCam) { controls.update(); return; }
  if (qs.get('cam')) { const c = qs.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); return; }
  let pos, look;
  if (game.active) { pos = game.camPos.clone().add(game.camOff).toArray(); look = game.camLook.toArray(); }
  else if (simT < SLOWMO) ({ pos, look } = sampleCam(simT, resolveLook));
  else {
    const a = (realT - SLOWMO) * 0.32;
    pos = [Math.sin(a) * 3.2, 1.3 + a * 0.35, Math.cos(a) * 3.2 + a * 0.4];
    look = [0, 1.35, 0];
  }
  const sh = shake * shake * 0.6, t = realT * 60;
  camera.position.set(pos[0] + Math.sin(t * 1.7) * sh, pos[1] + Math.sin(t * 2.3) * sh, pos[2] + Math.cos(t * 1.9) * sh);
  camera.lookAt(look[0], look[1], look[2]);
  if (game.active && game.camRoll) camera.rotateZ(game.camRoll); // hit / KO dutch tilt
}

// ---------- visuals per frame ----------
const UP = new THREE.Vector3(0, 1, 0);
const title = document.getElementById('title'), sub = document.getElementById('sub');
function updateVisuals() {
  batCape.updateMesh(); supCape.updateMesh();
  debris.update(); water.update(); sparks.update(); dust.update();
  flashLight.intensity = flashI;
  world.lights.hemi.intensity = 0.35 + lightning * 5;
  world.sky.material.uniforms.flash.value = lightning;
  post.uniforms.flash.value = Math.min(1, postFlash * 0.8 + lightning * 0.15);
  // Krushing Blow x-ray: fades in fast, holds, fades out; cracks race out from the impact's screen position
  const X = game.active && game.xray, XD = 1.25;
  post.uniforms.xray.value = X ? Math.min(1, X.t / 0.08) * Math.min(1, (XD - X.t) / 0.25) : 0;
  if (X) {
    _v.copy(X.at).project(camera);
    post.uniforms.xc.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    post.uniforms.xg.value = 0.6 * Math.min(1, X.t / 0.45) ** 0.6;
  }

  const heat = game.active ? !!game.heat : inHeat(simT), ht = game.active ? game.t : simT;
  for (const e of sup.eyes) { e.material.emissive.setHex(heat ? 0xff2000 : 0); e.material.emissiveIntensity = heat ? 6 : 0; }
  heatLight.intensity = heat ? 14 + Math.sin(ht * 60) * 4 : 0;
  if (heat) {
    const tg = game.active ? game.heat : heatTarget(simT);
    const target = new THREE.Vector3(tg[0], tg[1], tg[2]);
    heatLight.position.set(tg[0], game.active ? tg[1] : 0.3, tg[2]);
    sup.eyes.forEach((e, i) => {
      e.getWorldPosition(_v);
      const d = _w.subVectors(target, _v);
      beams[i].position.copy(_v);
      beams[i].scale.set(1, d.length(), 1);
      beams[i].quaternion.setFromUnitVectors(UP, d.normalize());
      beams[i].visible = true;
    });
  } else beams.forEach((b) => (b.visible = false));
  for (const k of ['bat', 'sup']) {
    const list = game.active ? game.shots.filter((q) => q.key === k) : [];
    shotMesh[k].forEach((m, i) => {
      const s = list[i];
      m.visible = !!s;
      if (!s) return;
      m.position.set(s.x, s.y, s.z);
      if (k === 'bat') m.rotation.set(0, s.t * 28, 0); // spins flat as it flies
      else { m.rotation.set(0, Math.atan2(s.vx, s.vz), 0); m.scale.setScalar((0.85 + s.t * 0.35 + Math.sin(s.t * 40) * 0.04) * (s.amp ? 1.5 : 1)); } // sonic boom: bigger ring
    });
  }
  const gp = game.active && game.grap;
  grapMesh.line.visible = grapMesh.hook.visible = !!gp;
  grapMesh.light.intensity = 0;
  if (gp) {
    _v.set(gp.a[0], gp.a[1], gp.a[2]); _w.set(gp.b[0], gp.b[1], gp.b[2]).sub(_v);
    const len = _w.length(), w = (gp.mode === 'hook' ? 0.035 : 0.024) * (1 + Math.sin(game.t * 70) * 0.15);
    grapMesh.line.position.copy(_v); grapMesh.line.quaternion.setFromUnitVectors(UP, _w.normalize());
    grapMesh.line.children[0].scale.set(w, len, w); grapMesh.line.children[1].scale.set(w * 0.3, len, w * 0.3);
    grapMesh.hook.position.set(gp.b[0], gp.b[1], gp.b[2]); grapMesh.hook.quaternion.copy(grapMesh.line.quaternion);
    grapMesh.glow.scale.setScalar(gp.latch ? 1.1 + Math.sin(game.t * 40) * 0.2 : 0.6);
    grapMesh.light.intensity = gp.latch ? 10 : 5;
  }
  const orb = game.active && game.orb;
  orbMesh.g.visible = !!orb;
  if (orb) {
    const c = ORB_COL[orb.type];
    orbMesh.g.position.set(orb.x, orb.y, orb.z);
    orbMesh.shell.rotation.set(orb.t * 1.3, orb.t * 2.1, 0);
    orbMesh.shell.material.color.setHex(c); orbMesh.halo.material.color.setHex(c); orbMesh.core.material.color.setHex(c).lerp(_white, 0.55);
    orbMesh.halo.scale.setScalar(1.0 + Math.sin(orb.t * 6) * 0.15);
  }

  // battle damage: the game's bone-anchored scars -> world positions for the hero shaders (clean outside a fight)
  for (const [H, k] of [[bat, 'bat'], [sup, 'sup']]) {
    const f = game.active && game.F && game.F[k], sc = (f && f.scars) || [], U = H.dmg;
    if (sc.length) H.root.updateMatrixWorld(true);
    for (let i = 0; i < U.dmgS.value.length; i++) {
      const s = sc[i];
      U.dmgS.value[i] = s ? s.s : 0;
      if (s) U.dmgP.value[i].copy(s.lp).applyMatrix4(s.bone.matrixWorld);
    }
    U.dmgWear.value = f ? f.wear : 0;
  }
  propMesh.forEach((m, i) => {
    const p = game.active && game.props && game.props[i];
    m.visible = !!p && p.st !== 'gone';
    if (m.visible) { m.position.set(p.x, p.y, p.z); m.rotation.set(p.rx, p.ry, 0); }
  });

  title.style.opacity = game.active ? 0 : Math.min(1, Math.max(0, (realT - 19.0) / 0.8)) * Math.min(1, Math.max(0, (LOOP_END - realT) / 0.4));
  const subText = !game.active && realT < 3 ? 'GOTHAM · 2:14 AM' : '';
  sub.textContent = subText;
  sub.style.opacity = subText ? Math.min(1, realT / 0.6, (3 - realT) / 0.5) : 0;
}

function render() {
  updateCamera();
  updateVisuals();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

// ---------- input ----------
const playUI = document.getElementById('play');
if (qs.has('freeze') || qs.has('t') || qs.has('cam')) playUI.style.display = 'none'; // clean frames for stills
function startGame(choice, demo = false) { reset(); game.demo = demo; game.start(choice); playUI.style.display = 'none'; paused = false; }
function quitGame() { game.stop(); reset(); playUI.style.display = 'flex'; if (paused) { paused = false; sound.pause(false); } }
// In a match: SPACE / ENTER / Start (Menu) pauses (and resumes); the controls panel stays up while paused.
function togglePause() { paused = !paused; sound.pause(paused); game.help(paused || game.state === 'enter', paused); }
playUI.addEventListener('click', (e) => { const h = e.target.dataset && e.target.dataset.hero; if (h) { e.target.blur(); startGame(h); } });
addEventListener('keyup', (e) => game.keyup(e));
addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') { if (sound.toggle()) { sound.start(); if (paused) sound.pause(true); } return; }
  if (game.active) {
    if (e.key === 'Escape') { quitGame(); return; }
    if ((e.key === 'Enter' || e.code === 'Space') && !game.matchOver) { e.preventDefault(); if (!e.repeat) togglePause(); return; }
    if (paused) { // H hides / shows the controls panel while paused; - / + still change pixel size
      if ((e.key === 'h' || e.key === 'H') && !e.repeat) game.help(game.ui.help.style.display === 'none', true);
      else if (e.key === '-' || e.key === '_') pixStep(-1);
      else if (e.key === '=' || e.key === '+') pixStep(1);
      return;
    }
    if (e.code === 'Space' || e.key.startsWith('Arrow')) e.preventDefault();
    game.keydown(e);
    if (e.key === 'p' || e.key === 'P') cycleMode();
    if (e.key === "n" || e.key === "N") { ditherIGN = !ditherIGN; resize(); }
    return;
  }
  if (e.key === 'b' || e.key === 'B' || e.key === '1') startGame('bat');
  else if (e.key === 's' || e.key === 'S' || e.key === '2') startGame('sup');
  else if (e.code === 'Space') { paused = !paused; sound.pause(paused); }
  else if (e.key === 'p' || e.key === 'P') cycleMode();
  else if (e.key === '-' || e.key === '_') pixStep(-1);
  else if (e.key === '=' || e.key === '+') pixStep(1);
  else if (e.key === 'r' || e.key === 'R') reset();
  else if (e.key === "n" || e.key === "N") { ditherIGN = !ditherIGN; resize(); }
  else if (e.key === 'c' || e.key === 'C') { freeCam = !freeCam; controls.enabled = freeCam; }
});

// ---------- boot ----------
reset();
const seekT = +(qs.get('t') || 0);
while (simT < seekT) step();
if (qs.get('freeze')) paused = true;
if (qs.get('play') === 'bat' || qs.get('play') === 'sup') startGame(qs.get('play'), DEMO); // ?play=bat|sup skips the title loop (with &demo=1: straight into auto-pilot)
window.__game = game; window.__sound = sound;
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (paused && game.active && game.pausePad()) togglePause(); // Start resumes a paused match
  if (!paused) { acc += dt; while (acc >= DT) { step(); acc -= DT; } }
  render();
  requestAnimationFrame(loop);
}
render();
requestAnimationFrame(loop);
window.__bvs = { get t() { return simT; }, get real() { return realT; } };
if (qs.has('debug')) {
  updateCamera();
  const bad = [];
  scene.traverse((o) => { if (o.matrixWorld && o.matrixWorld.elements.some((v) => !Number.isFinite(v))) bad.push(o.type + ':' + (o.parent && o.parent.type)); });
  const wp = (o) => o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
  document.getElementById('err').textContent = JSON.stringify({ t: simT, cam: camera.position.toArray(), bat: bat.root.position.toArray(),
    batRF: wp(bat.legs.R.an), batRH: wp(bat.arms.R.hand), batHead: wp(bat.head), batChest: wp(bat.chest),
    supRH: wp(sup.arms.R.hand), supHead: wp(sup.head), supChest: wp(sup.chest), supLF: wp(sup.legs.L.an),
    sup: sup.root.position.toArray(), capeNaN: [...batCape.pos, ...supCape.pos].some((v) => !Number.isFinite(v)), bad: bad.slice(0, 10), nbad: bad.length });
  setTimeout(() => {
    const info = {};
    for (const [k, H] of [['bat', bat], ['sup', sup]]) {
      const b = new THREE.Box3(); let n = 0, vis = 0;
      H.root.updateMatrixWorld(true);
      (H.fanMeshes || []).forEach((o) => { n++; o.geometry.computeBoundingBox(); }); H.root.traverse((o) => { if (o.isMesh && o.visible) vis++; }); H.fanMeshes && H.fanMeshes.forEach((o) => { const p = new THREE.Vector3(); for (let i = 0; i < o.geometry.attributes.position.count; i += 50) { o.getVertexPosition(i, p); b.expandByPoint(p); } });
      const cv = H.capeVerts || [], q = new THREE.Vector3(); let front = 0;
      H.chest.updateMatrixWorld(true); const inv = H.chest.matrixWorld.clone().invert();
      for (let c = 0; c < cv.length; c += 7) { H.fanMeshes[cv[c][0]].getVertexPosition(cv[c][1], q); q.applyMatrix4(H.fanMeshes[cv[c][0]].matrixWorld).applyMatrix4(inv); if (q.z > 0.12) front++; }
      const zs = []; for (let c = 0; c < cv.length; c += 7) { H.fanMeshes[cv[c][0]].getVertexPosition(cv[c][1], q); q.applyMatrix4(H.fanMeshes[cv[c][0]].matrixWorld).applyMatrix4(inv); zs.push(q.z); } zs.sort((a, b) => a - b);
      info[k] = { comps: H.allComps, capeComps: H.capeComps, zq: [0.1, 0.5, 0.9, 1].map((f) => +(zs[Math.min(zs.length - 1, Math.floor(f * zs.length))] || 0).toFixed(2)), capeN: cv.length, capeFrontPct: cv.length ? +(100 * front / Math.ceil(cv.length / 7)).toFixed(1) : 0, n, procVisible: vis, min: b.min.toArray().map((v) => +v.toFixed(2)), max: b.max.toArray().map((v) => +v.toFixed(2)) };
    }
    document.getElementById('err').textContent += ' fan=' + JSON.stringify(window.__fan) + ' box=' + JSON.stringify(info);
  }, 6000);
}
