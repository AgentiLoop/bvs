// Night city, rooftop, breakable water tower, searchlight helicopter, rain — all procedural.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

export const ROOF = { x: 8, z: 6 };
export const groundAt = (x, z) => (Math.abs(x) < ROOF.x && Math.abs(z) < ROOF.z ? 0 : -60);
// Solid roof props the fight camera must not sit in or look through (world AABBs [x0, y0, z0, x1, y1, z1], matching
// buildWorld / buildTower below).
export const OCCLUDERS = [
  [3.0, 0, -5.7, 6.2, 2.75, -3.1], // stairwell housing + roof cap
  [-2.35, 0, -5.25, -0.85, 1.0, -4.15], [-0.35, 0, -5.25, 1.15, 1.0, -4.15], // AC units
  [-3.4, 2.7, -5.73, 3.0, 4.3, -5.57], [-3.06, 0, -5.76, -2.94, 2.8, -5.64], [2.54, 0, -5.76, 2.66, 2.8, -5.64], // GOTHAM sign + posts
  [-7.5, 2.55, -5.1, -4.5, 5.8, -2.1], [-7.0, 0, -4.6, -5.0, 2.6, -2.6], // water tank + cone, legs / braces
  [6.9, 0, 4.9, 7.1, 5.3, 5.1], // antenna mast
  [-8.3, 0, 6, 8.3, 0.45, 6.3], [-8.3, 0, -6.3, 8.3, 0.45, -6], [8, 0, -6, 8.3, 0.45, 6], [-8.3, 0, -6, -8, 0.45, 6], // ledges
];
// Fraction 0..1 along a -> b where the segment first enters an occluder grown by pad (1 = clear). Boxes that already
// contain a are ignored (a fighter brushing a prop must not collapse the camera onto him).
export function camHit(a, b, pad = 0.35) {
  let best = 1;
  const A = [a.x, a.y, a.z], D = [b.x - a.x, b.y - a.y, b.z - a.z];
  for (const B of OCCLUDERS) {
    let t0 = -Infinity, t1 = Infinity;
    for (let i = 0; i < 3 && t0 <= t1; i++) {
      const lo = B[i] - pad, hi = B[i + 3] + pad;
      if (Math.abs(D[i]) < 1e-9) { if (A[i] < lo || A[i] > hi) t0 = Infinity; continue; }
      let u = (lo - A[i]) / D[i], v = (hi - A[i]) / D[i];
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    }
    if (t0 <= t1 && t0 >= 0 && t0 < best) best = t0;
  }
  return best;
}

const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
function box(parent, w, h, d, material, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, material, x, y, z, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function windowTextures(rng) {
  const lit = [];
  const draw = (emissiveOnly) => (g, w, h) => {
    g.fillStyle = emissiveOnly ? '#000' : '#1c2029'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = y * 16 + x;
      if (lit[k] === undefined) lit[k] = rng() < 0.32 ? ['#ffd28a', '#ffe9b8', '#9fd2ff', '#ffb36b'][Math.floor(rng() * 4)] : null;
      g.fillStyle = lit[k] || (emissiveOnly ? '#000' : '#0b0d12');
      g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
    }
  };
  return { map: canvasTex(256, 256, draw(false)), emissive: canvasTex(256, 256, draw(true)) };
}

function uvScaleBox(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const fw = f < 2 ? d : f < 4 ? w : w, fh = f === 2 || f === 3 ? d : h;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * fw / tile, uv.getY(i) * fh / tile);
    }
  }
}

export function buildWorld(scene) {
  const rng = mulberry32(77);
  const W = { lights: {} };

  // ---- sky ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { flash: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float flash; varying vec3 vP;
      void main(){ float h = normalize(vP).y;
        vec3 top = vec3(0.004,0.006,0.02), mid = vec3(0.02,0.03,0.07), glow = vec3(0.16,0.07,0.04);
        vec3 c = mix(mid, top, smoothstep(0.0, 0.6, h));
        c += glow * exp(-abs(h) * 9.0);
        c += vec3(0.5,0.55,0.8) * flash * smoothstep(-0.1, 0.5, h);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  W.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  scene.add(W.sky);
  const starGeo = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 700; i++) {
    const a = rng() * Math.PI * 2, y = 0.15 + rng() * 0.85, r = Math.sqrt(1 - y * y);
    sp.push(Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9aa4c8, size: 1.5, sizeAttenuation: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
  moon.position.set(-120, 150, -260);
  scene.add(moon);

  scene.fog = new THREE.FogExp2(0x0b1020, 0.016);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0x6a7fb0, 0x1a1410, 0.35);
  scene.add(hemi); W.lights.hemi = hemi;
  const moonL = new THREE.DirectionalLight(0xbcd0ff, 1.0);
  moonL.position.set(-10, 18, -9);
  moonL.castShadow = true;
  moonL.shadow.mapSize.set(1024, 1024);
  Object.assign(moonL.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  moonL.shadow.bias = -0.0008;
  scene.add(moonL, moonL.target);
  const cityL = new THREE.DirectionalLight(0xff9a50, 0.45);
  cityL.position.set(8, -2, 10);
  scene.add(cityL);

  // ---- city ----
  const wt = windowTextures(rng);
  const roofTop = std(0x15171c, 0.9);
  const sideMats = [0x2a2f3a, 0x30343c, 0x262a33].map((c) => std(c, 0.85, 0, {
    map: wt.map, emissiveMap: wt.emissive, emissive: 0xffffff, emissiveIntensity: 1.4,
  }));
  for (let i = 0; i < 150; i++) {
    const ang = rng() * Math.PI * 2, dist = 24 + rng() * 85;
    const w = 5 + rng() * 9, d = 5 + rng() * 9, top = -28 + rng() * 48 + (rng() < 0.12 ? 25 : 0);
    const h = top + 90;
    const geo = new THREE.BoxGeometry(w, h, d);
    uvScaleBox(geo, w, h, d, 20);
    const sm = sideMats[i % 3];
    const m = new THREE.Mesh(geo, [sm, sm, roofTop, roofTop, sm, sm]);
    m.position.set(Math.cos(ang) * dist, top - h / 2, Math.sin(ang) * dist);
    scene.add(m);
  }
  // Daily Planet-style globe on a tall tower
  const globeT = new THREE.Group(); globeT.position.set(-34, 0, -62); scene.add(globeT);
  box(globeT, 9, 120, 9, sideMats[0], 0, -42, 0);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 14), std(0xd8a638, 0.35, 0.8, { emissive: 0x6a4a10, emissiveIntensity: 0.6 }));
  globe.position.y = 22.5; globeT.add(globe);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.18, 6, 32), std(0xd8a638, 0.3, 0.8, { emissive: 0x6a4a10 }));
  ring.position.y = 22.5; ring.rotation.set(1.2, 0, 0.3); globeT.add(ring);
  W.globe = globe;

  // ---- our building ----
  {
    const h = 60, geo = new THREE.BoxGeometry(ROOF.x * 2, h, ROOF.z * 2);
    uvScaleBox(geo, ROOF.x * 2, h, ROOF.z * 2, 20);
    const gravel = canvasTex(128, 128, (g) => {
      g.fillStyle = '#5a5c62'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 2600; i++) { const v = 60 + rng() * 60; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(rng() * 128, rng() * 128, 1 + rng() * 2, 1 + rng() * 2); }
      g.strokeStyle = '#3a3b40'; g.lineWidth = 2;
      for (let i = 0; i <= 128; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    });
    gravel.repeat.set(1, 1);
    const top = std(0xffffff, 0.92, 0, { map: gravel });
    const guv = geo.attributes.uv;
    for (let k = 8; k < 12; k++) guv.setXY(k, guv.getX(k) * 4, guv.getY(k) * 3);
    const b = new THREE.Mesh(geo, [sideMats[1], sideMats[1], top, top, sideMats[1], sideMats[1]]);
    b.position.y = -h / 2; b.receiveShadow = true;
    scene.add(b);
    const ledgeM = std(0x6b6d73, 0.85);
    box(scene, ROOF.x * 2 + 0.6, 0.45, 0.3, ledgeM, 0, 0.22, ROOF.z + 0.15);
    box(scene, ROOF.x * 2 + 0.6, 0.45, 0.3, ledgeM, 0, 0.22, -ROOF.z - 0.15);
    box(scene, 0.3, 0.45, ROOF.z * 2, ledgeM, ROOF.x + 0.15, 0.22, 0);
    box(scene, 0.3, 0.45, ROOF.z * 2, ledgeM, -ROOF.x - 0.15, 0.22, 0);
  }

  // ---- roof props ----
  const metal = std(0x7a7f88, 0.5, 0.6), darkMetal = std(0x34373d, 0.6, 0.5), brick = std(0x6a3b2c, 0.9);
  box(scene, 3, 2.6, 2.4, brick, 4.6, 1.3, -4.4);
  box(scene, 3.2, 0.15, 2.6, darkMetal, 4.6, 2.67, -4.4);
  box(scene, 0.9, 1.9, 0.08, std(0x2a2420, 0.7), 4.6, 0.95, -3.17);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.15), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
  lamp.position.set(4.6, 2.1, -3.12); scene.add(lamp);
  const lampL = new THREE.PointLight(0xffa050, 6, 9, 2); lampL.position.set(4.6, 1.9, -2.8); scene.add(lampL);
  for (const [x, z] of [[-1.6, -4.7], [0.4, -4.7]]) {
    box(scene, 1.5, 0.95, 1.1, metal, x, 0.48, z);
    cyl(scene, 0.4, 0.4, 0.06, darkMetal, x, 0.98, z, 12);
    for (let k = -2; k <= 2; k++) box(scene, 1.3, 0.06, 0.02, darkMetal, x, 0.3 + (k + 2) * 0.12, z + 0.56);
  }
  for (const [x, z] of [[2.4, 4.6], [-3.4, 5.0], [6.6, 0.5], [-7.2, 2.6]]) {
    cyl(scene, 0.15, 0.15, 0.7, metal, x, 0.35, z, 10);
    cyl(scene, 0.26, 0.2, 0.08, metal, x, 0.74, z, 10);
  }
  box(scene, 2.2, 0.35, 1.5, darkMetal, 5.3, 0.17, 3.6);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 1.3), std(0x8fb8ff, 0.1, 0.2, { emissive: 0x23406a, emissiveIntensity: 1.2 }));
  glass.position.set(5.3, 0.37, 3.6); scene.add(glass);
  cyl(scene, 0.05, 0.08, 5.2, metal, 7.0, 2.6, 5.0, 8);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  beacon.position.set(7.0, 5.25, 5.0); scene.add(beacon); W.beacon = beacon;
  // puddles
  for (const [x, z, r] of [[1.6, 2.4, 1.1], [-3.2, 3.5, 0.8], [3.5, -1.6, 0.7], [-1.2, -2.6, 0.9]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), std(0x0a0d14, 0.05, 0.9));
    p.position.set(x, 0.004, z); p.scale.z = 0.7; p.receiveShadow = true; scene.add(p);
  }
  // neon sign
  {
    const tex = canvasTex(512, 128, (g) => {
      g.fillStyle = '#05060a'; g.fillRect(0, 0, 512, 128);
      g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff3a6a'; g.shadowBlur = 18; g.fillStyle = '#ff7aa0';
      g.fillText('GOTHAM', 256, 66);
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.6, 0.15),
      [darkMetal, darkMetal, darkMetal, darkMetal, std(0xffffff, 0.6, 0, { map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 2.2 }), darkMetal]);
    sign.position.set(-0.2, 3.5, -5.65); scene.add(sign);
    for (const x of [-3, 2.6]) box(scene, 0.12, 2.8, 0.12, darkMetal, x, 1.4, -5.7);
    const signL = new THREE.PointLight(0xff4a80, 5, 8, 2); signL.position.set(-0.2, 3.2, -4.6); scene.add(signL);
  }

  // ---- water tower ----
  W.tower = buildTower(scene, metal, darkMetal);

  // ---- helicopter ----
  W.heli = buildHeli(scene);

  // ---- rain ----
  const RAIN = 1800, rp = new Float32Array(RAIN * 6);
  W.rainData = { n: RAIN, p: rp, rng: mulberry32(5) };
  for (let i = 0; i < RAIN; i++) resetDrop(W.rainData, i, true);
  const rg = new THREE.BufferGeometry();
  W.rainAttr = new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage);
  rg.setAttribute('position', W.rainAttr);
  W.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0.45 }));
  W.rain.frustumCulled = false;
  scene.add(W.rain);

  W.update = (simT, sdt, focus) => {
    W.beacon.visible = Math.floor(simT * 1.2) % 2 === 0;
    W.globe.rotation.y = simT * 0.2;
    updateHeli(W.heli, simT, focus);
    const d = W.rainData;
    for (let i = 0; i < d.n; i++) {
      const o = i * 6;
      for (const k of [0, 3]) { d.p[o + k] -= 2.5 * sdt; d.p[o + k + 1] -= 20 * sdt; }
      if (d.p[o + 4] < groundAt(d.p[o + 3], d.p[o + 5])) resetDrop(d, i, false);
    }
    W.rainAttr.needsUpdate = true;
    W.tower.update(sdt);
  };
  return W;
}

function resetDrop(d, i, anyY) {
  const x = (d.rng() - 0.5) * 36, z = (d.rng() - 0.5) * 30, y = anyY ? d.rng() * 22 : 18 + d.rng() * 4;
  d.p.set([x, y, z, x - 0.06, y - 0.5, z], i * 6);
}

function buildTower(scene, metal, darkMetal) {
  const T = { group: new THREE.Group(), staves: [], hoops: [], center: new THREE.Vector3(-6, 3.7, -3.6), broken: false };
  T.group.position.set(-6, 0, -3.6);
  scene.add(T.group);
  const legM = std(0x3d3f44, 0.6, 0.6);
  for (const [x, z] of [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]) cyl(T.group, 0.08, 0.1, 2.6, legM, x, 1.3, z, 8);
  for (const [a, b, c, d] of [[0.9, 0.9, -0.9, 0.9], [0.9, -0.9, -0.9, -0.9]]) {
    const brace = box(T.group, 2.5, 0.04, 0.04, legM, 0, 1.3, (b + d) / 2);
    brace.rotation.z = 0.8;
    const brace2 = box(T.group, 2.5, 0.04, 0.04, legM, 0, 1.3, (b + d) / 2);
    brace2.rotation.z = -0.8;
  }
  cyl(T.group, 1.45, 1.45, 0.1, darkMetal, 0, 2.62, 0, 24);
  // ladder
  for (const x of [-0.18, 0.18]) box(T.group, 0.04, 4.4, 0.04, legM, x, 2.6, 1.42);
  for (let k = 0; k < 14; k++) box(T.group, 0.36, 0.03, 0.03, legM, 0, 0.5 + k * 0.32, 1.42);
  const N = 28, R = 1.3, H = 2.2;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const v = 0.75 + 0.25 * Math.sin(i * 12.9898);
    const m = box(T.group, (2 * Math.PI * R) / N * 1.04, H, 0.09,
      std(new THREE.Color(0x7a5434).multiplyScalar(v), 0.9), Math.sin(a) * R, 2.67 + H / 2, Math.cos(a) * R, a);
    T.staves.push(m);
  }
  for (const y of [3.0, 3.7, 4.4]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.03, 6, 32), darkMetal);
    h.rotation.x = Math.PI / 2; h.position.y = y; T.group.add(h); T.hoops.push(h);
  }
  T.cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 24), std(0x4a4d55, 0.6, 0.5));
  T.cone.castShadow = true;
  T.group.add(T.cone);
  T.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), std(0x0f1a2a, 0.05, 0.8, { transparent: true, opacity: 0.85 }));
  T.puddle.position.y = 0.008;
  T.group.add(T.puddle);
  T.reset = () => {
    T.broken = false; T.coneV = 0; T.puddleR = 0.01;
    T.staves.forEach((s) => (s.visible = true));
    T.hoops.forEach((h) => (h.visible = true));
    T.cone.position.set(0, 2.67 + H + 0.45, 0); T.cone.rotation.set(0, 0, 0);
    T.puddle.scale.setScalar(0.01); T.puddle.visible = false;
  };
  T.update = (dt) => {
    if (!T.broken) return;
    const floor = 2.67 + 0.4;
    if (T.cone.position.y > floor) {
      T.coneV -= 9.8 * dt; T.cone.position.y += T.coneV * dt;
      T.cone.rotation.z += dt * 0.5; T.cone.position.x += dt * 0.3;
      if (T.cone.position.y <= floor) { T.cone.position.y = floor; T.cone.rotation.z = 0.3; }
    }
    T.puddleR = Math.min(3.4, T.puddleR + dt * 2.2);
    T.puddle.scale.set(T.puddleR, 1, T.puddleR * 0.8);
  };
  T.reset();
  return T;
}

function buildHeli(scene) {
  const g = new THREE.Group();
  const body = std(0x1d2733, 0.45, 0.6), dark = std(0x0d1014, 0.5, 0.5);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), body);
  hull.scale.set(0.9, 0.85, 1.6); hull.castShadow = true; g.add(hull);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), std(0x99c8ff, 0.1, 0.3, { emissive: 0x18304a }));
  glass.position.set(0, 0.15, 0.9); glass.scale.set(0.95, 0.75, 0.9); g.add(glass);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 3.2, 10), body);
  boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.25, -2.6); g.add(boom);
  box(g, 0.08, 0.9, 0.6, body, 0, 0.6, -4.1);
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.12, 0.6, -4.1); g.add(tailRotor);
  box(tailRotor, 0.02, 1.0, 0.08, dark, 0, 0, 0);
  for (const x of [-0.6, 0.6]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), dark);
    skid.rotation.x = Math.PI / 2; skid.position.set(x, -1.05, 0.1); g.add(skid);
    for (const z of [-0.5, 0.7]) box(g, 0.04, 0.4, 0.04, dark, x * 0.85, -0.85, z);
  }
  cyl(g, 0.12, 0.16, 0.3, dark, 0, 0.95, 0, 10);
  const rotor = new THREE.Group(); rotor.position.y = 1.12; g.add(rotor);
  box(rotor, 7.5, 0.03, 0.22, dark, 0, 0, 0);
  box(rotor, 0.22, 0.03, 7.5, dark, 0, 0, 0);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  navR.position.set(-0.85, 0, 0); g.add(navR);
  const navG = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
  navG.position.set(0.85, 0, 0); g.add(navG);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(0, -0.8, -0.4); g.add(strobe);
  g.scale.setScalar(0.85);
  scene.add(g);

  const spot = new THREE.SpotLight(0xfff0d0, 260, 70, 0.17, 0.45, 2);
  scene.add(spot, spot.target);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 1, 1, 24, 1, true).translate(0, -0.5, 0),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.025, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }));
  scene.add(beam);
  return { g, rotor, tailRotor, strobe, spot, beam, aim: new THREE.Vector3() };
}

const _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function updateHeli(H, t, focus) {
  const a = 2.2 + t * 0.2, r = 15;
  H.g.position.set(Math.cos(a) * r, 9.5 + Math.sin(t * 0.7) * 0.4, Math.sin(a) * r - 2);
  _t.set(-Math.sin(a), 0, Math.cos(a)).add(H.g.position);
  H.g.lookAt(_t);
  H.g.rotateZ(-0.18); H.g.rotateX(0.08);
  H.rotor.rotation.y = t * 38;
  H.tailRotor.rotation.x = t * 60;
  H.strobe.visible = Math.floor(t * 3) % 3 === 0;
  H.aim.lerp(focus, 0.08);
  H.spot.position.copy(H.g.position).y -= 0.8;
  H.spot.target.position.copy(H.aim);
  const len = H.spot.position.distanceTo(H.aim) + 1.5, rad = Math.tan(0.17) * len;
  H.beam.position.copy(H.spot.position);
  H.beam.scale.set(rad, len, rad);
  _d.subVectors(H.spot.position, H.aim).normalize();
  H.beam.quaternion.setFromUnitVectors(_up, _d);
}
