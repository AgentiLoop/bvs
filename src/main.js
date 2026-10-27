// Batman v Superman — real-time three.js, every pixel from code. No video encoder: the browser IS the renderer.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeHero, applyPose } from './heroes.js';
import { Cape } from './cloth.js';
import { Debris, Particles, Shockwaves, Decals } from './fx.js';
import { buildWorld, groundAt } from './world.js';
import { BAT, SUP, HEAT, SLOWMO, KEY, sampleTrack, sampleCam, face } from './timeline.js';
import { mulberry32 } from './rng.js';
import { loadFanModel } from './modelrig.js';

const qs = new URLSearchParams(location.search);
const SEED = +(qs.get('seed') || 1337);
const DT = 1 / 60;
const LOOP_END = 21.5; // real seconds
let pixelMode = qs.get('pixel') === '1';
let PIX = +(qs.get('px') || 4);
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
    near: { value: camera.near }, far: { value: camera.far }, pixel: { value: 1 }, flash: { value: 0 }, levels: { value: 6 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float near, far, pixel, flash, levels;
    varying vec2 vUv;
    float lin(vec2 uv){ float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0*near*far/(far+near - z*(far-near)); }
    float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    void main(){
      vec3 c = texture2D(tColor, vUv).rgb;
      c = vec3(1.0) - exp(-c * 1.3);                 // filmic-ish tonemap
      c = pow(c, vec3(1.0 / 2.2));                    // to sRGB
      c *= vec3(0.96, 1.0, 1.07);                     // cool night grade
      if (pixel > 0.5) {
        vec2 px = 1.0 / res;
        float d0 = lin(vUv), e = 0.0;
        float d1 = lin(vUv + vec2(px.x, 0.)), d2 = lin(vUv - vec2(px.x, 0.)), d3 = lin(vUv + vec2(0., px.y)), d4 = lin(vUv - vec2(0., px.y));
        float th = 0.06 * d0 + 0.08;
        if (max(max(d1, d2), max(d3, d4)) - d0 > th) e = 1.0;
        c *= 1.0 - 0.65 * e;                           // pixel outlines on silhouettes
        float b = bayer4(gl_FragCoord.xy) - 0.5;
        c = floor(c * levels + b + 0.5) / levels;       // ordered dither + quantize
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
  const s = pixelMode ? PIX : 1;
  const w = Math.max(1, Math.floor(innerWidth / s)), h = Math.max(1, Math.floor(innerHeight / s));
  renderer.setSize(w, h, false);
  if (rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, samples: pixelMode ? 0 : 4 });
  rt.depthTexture = new THREE.DepthTexture(w, h);
  post.uniforms.tColor.value = rt.texture;
  post.uniforms.tDepth.value = rt.depthTexture;
  post.uniforms.res.value.set(w, h);
  post.uniforms.pixel.value = pixelMode ? 1 : 0;
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
document.getElementById('hud').textContent = 'Procedural Batman & Superman · P pixel-art · [ ] pixel size · C free camera · SPACE pause · R restart';
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

// ---------- sim state ----------
let rng, simT, realT, shake, postFlash, flashI, lightning, fired, acc = 0;
const CONCRETE = [0x6b6d73, 0x5a5c62, 0x7d7f85, 0x4a4b50, 0x8a7a6a];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const chestPos = (H, out = new THREE.Vector3()) => out.set(0, 0.15, 0).applyMatrix4(H.chest.matrixWorld);

function rubble(x, y, z, n, speed, sMin, sMax, up = 4) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, sp = speed * (0.25 + rng() * 0.75), s = sMin + rng() * (sMax - sMin);
    _q.setFromEuler(_e.set(rng() * 6, rng() * 6, rng() * 6));
    debris.spawn(V(x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2), V(Math.cos(a) * sp, up * (0.4 + rng()), Math.sin(a) * sp),
      [s, s * (0.4 + rng() * 0.6), s * (0.6 + rng() * 0.6)], CONCRETE[Math.floor(rng() * CONCRETE.length)], _q,
      V(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(18));
  }
}
function sparkBurst(x, y, z, n, speed, col = 0xffc060) {
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = speed * (0.3 + rng());
    sparks.spawn(x, y, z, Math.cos(a) * r * sp, u * sp + speed * 0.3, Math.sin(a) * r * sp, 0.25 + rng() * 0.45, col);
  }
}
function dustBurst(x, y, z, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, sp = speed * (0.3 + rng());
    dust.spawn(x, y + 0.1, z, Math.cos(a) * sp, rng() * 0.6, Math.sin(a) * sp, 1.2 + rng() * 1.2, 0x8a8478);
  }
}
function impact(x, y, z, power) {
  shake = Math.max(shake, power);
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
    impact(0, 1.4, 0, 0.7); postFlash = 1;
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
  applyPose(bat, sb, t);
  applyPose(sup, ss, t);
}

function reset() {
  rng = mulberry32(SEED);
  simT = 0; realT = 0; shake = 0; postFlash = 0; flashI = 0; lightning = 0; fired = new Set();
  debris.clear(); water.clear(); sparks.clear(); dust.clear(); waves.clear(); decals.clear();
  world.tower.reset();
  poseHeroes(0);
  batCape.reset(); supCape.reset();
}

let stepCount = 0;
function step() {
  const scale = simT < SLOWMO - 0.3 ? 1 : simT < SLOWMO ? 1 - 0.88 * (simT - (SLOWMO - 0.3)) / 0.3 : 0.12;
  const sdt = DT * scale;
  simT += sdt; realT += DT; stepCount++;
  poseHeroes(simT);
  EVENTS.forEach((ev, i) => { if (!fired.has(i) && simT >= ev.t) { fired.add(i); ev.fn(); } });
  for (const em of EMITTERS) if (simT >= em.t0 && simT < em.t1) em.fn(stepCount);
  debris.step(sdt, groundAt); water.step(sdt, groundAt); sparks.step(sdt, groundAt); dust.step(sdt, groundAt); waves.step(sdt);
  const wind = [1.6 + Math.sin(simT * 0.9) * 1.2, 0.3, 1.2 + Math.cos(simT * 0.6)];
  for (let s = 0; s < 2; s++) { batCape.step(sdt / 2, simT, wind, groundAt); supCape.step(sdt / 2, simT, wind, groundAt); }
  shake *= Math.exp(-DT * 6); postFlash *= Math.exp(-DT * (simT > SLOWMO ? 1.2 : 7)); flashI *= Math.exp(-DT * 6); lightning *= Math.exp(-DT * 5);
  chestPos(bat, _v); chestPos(sup, _w);
  world.update(simT, sdt, _v.lerp(_w, 0.5).setY(0.5));
  if (realT >= LOOP_END) reset();
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
  if (simT < SLOWMO) ({ pos, look } = sampleCam(simT, resolveLook));
  else {
    const a = (realT - SLOWMO) * 0.32;
    pos = [Math.sin(a) * 3.2, 1.3 + a * 0.35, Math.cos(a) * 3.2 + a * 0.4];
    look = [0, 1.35, 0];
  }
  const sh = shake * shake * 0.6, t = realT * 60;
  camera.position.set(pos[0] + Math.sin(t * 1.7) * sh, pos[1] + Math.sin(t * 2.3) * sh, pos[2] + Math.cos(t * 1.9) * sh);
  camera.lookAt(look[0], look[1], look[2]);
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

  const heat = inHeat(simT);
  for (const e of sup.eyes) { e.material.emissive.setHex(heat ? 0xff2000 : 0); e.material.emissiveIntensity = heat ? 6 : 0; }
  heatLight.intensity = heat ? 14 + Math.sin(simT * 60) * 4 : 0;
  if (heat) {
    const tg = heatTarget(simT);
    const target = new THREE.Vector3(tg[0], tg[1], tg[2]);
    heatLight.position.set(tg[0], 0.3, tg[2]);
    sup.eyes.forEach((e, i) => {
      e.getWorldPosition(_v);
      const d = _w.subVectors(target, _v);
      beams[i].position.copy(_v);
      beams[i].scale.set(1, d.length(), 1);
      beams[i].quaternion.setFromUnitVectors(UP, d.normalize());
      beams[i].visible = true;
    });
  } else beams.forEach((b) => (b.visible = false));

  title.style.opacity = Math.min(1, Math.max(0, (realT - 19.0) / 0.8)) * Math.min(1, Math.max(0, (LOOP_END - realT) / 0.4));
  const subText = realT < 3 ? 'GOTHAM · 2:14 AM' : '';
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
addEventListener('keydown', (e) => {
  if (e.code === 'Space') paused = !paused;
  else if (e.key === 'p' || e.key === 'P') { pixelMode = !pixelMode; resize(); }
  else if (e.key === '[') { PIX = Math.max(1, PIX - 1); resize(); }
  else if (e.key === ']') { PIX = Math.min(8, PIX + 1); resize(); }
  else if (e.key === 'r' || e.key === 'R') reset();
  else if (e.key === 'c' || e.key === 'C') { freeCam = !freeCam; controls.enabled = freeCam; }
});

// ---------- boot ----------
reset();
const seekT = +(qs.get('t') || 0);
while (simT < seekT) step();
if (qs.get('freeze')) paused = true;
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
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
