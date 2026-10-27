// Procedural Batman / Superman built from primitives, posed with analytic two-bone IK.
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);

const mat = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

function part(parent, geo, material, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, pos) {
  const o = new THREE.Object3D();
  o.position.set(...pos);
  parent.add(o);
  return o;
}

function drawBat(g, cx, cy, sx, sy) {
  // right half of a bat silhouette, from head-top centre to tail-bottom centre
  const half = [[0, -0.2], [0.09, -0.48], [0.14, -0.2], [0.3, -0.3], [0.62, -0.34], [1.0, -0.55],
    [0.9, -0.12], [0.76, 0.06], [0.62, -0.02], [0.5, 0.22], [0.36, 0.1], [0.22, 0.32], [0.1, 0.2], [0, 0.5]];
  g.beginPath();
  half.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, cx + x * sx, cy + y * sy));
  for (let i = half.length - 2; i > 0; i--) g.lineTo(cx - half[i][0] * sx, cy + half[i][1] * sy);
  g.closePath();
  g.fill();
}

function emblemTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'bat') {
    g.fillStyle = '#f2c230';
    g.beginPath(); g.ellipse(64, 64, 62, 38, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0b0d';
    drawBat(g, 64, 66, 54, 50);
  } else {
    const shield = (s) => {
      g.beginPath();
      [[6, 34], [30, 8], [98, 8], [122, 34], [64, 122]].forEach(([x, y], i) => {
        const X = 64 + (x - 64) * s, Y = 58 + (y - 58) * s;
        i ? g.lineTo(X, Y) : g.moveTo(X, Y);
      });
      g.closePath(); g.fill();
    };
    g.fillStyle = '#c21a1a'; shield(1);
    g.fillStyle = '#f2c230'; shield(0.82);
    g.fillStyle = '#c21a1a';
    g.font = 'italic bold 74px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('S', 64, 54);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Lathe "muscle" from a [radius, y] profile (y increasing), so limbs taper and bulge instead of being tubes.
function muscle(parent, prof, material, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], seg = 16) {
  return part(parent, new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg), material, pos, scale, rot);
}

// Heroic proportions (~9 heads tall): small head, thick neck, broad delts + lats tapering to a narrow waist,
// heavy pecs, six-pack, big arms and long powerful legs, square jaw.
export function makeHero(kind) {
  const B = kind === 'batman';
  const suit = mat(B ? 0x454b56 : 0x174fa8, 0.72);
  const dark = mat(0x11151e, 0.68);
  const red = mat(0xb51d32, 0.7);
  const skin = mat(0xe0aa89, 0.8);
  const yellow = mat(0xe5b641, 0.55, 0.15);
  const boot = B ? dark : red;
  const root = new THREE.Group();
  const hips = joint(root, [0, 0, 0]);
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const oval = (parent, material, pos, scale) => part(parent, sphere, material, pos, scale);
  // Each limb has one surface, with rounded joints rather than layered muscle shells.
  const limb = (parent, length, radius, material) => {
    part(parent, new THREE.CapsuleGeometry(radius, length - 2 * radius, 10, 24), material, [0, -length / 2, 0]);
    oval(parent, material, [0, 0, 0], [radius, radius, radius]);
  };
  oval(hips, B ? dark : red, [0, -0.015, 0], [0.18, 0.135, 0.125]);
  part(hips, new THREE.CylinderGeometry(0.169, 0.175, 0.055, 48), yellow, [0, 0.075, 0], [1, 1, 0.78]);
  part(hips, new THREE.BoxGeometry(0.065, 0.045, 0.025), yellow, [0, 0.075, 0.143]);
  if (B) for (const s of [-1, 1]) for (const a of [0.55, 1.05]) {
    part(hips, new THREE.BoxGeometry(0.04, 0.05, 0.025), yellow,
      [s * Math.sin(a) * 0.177, 0.075, Math.cos(a) * 0.141], [1, 1, 1], [0, s * a, 0]);
  }
  const spine = joint(hips, [0, 0.08, 0]);
  oval(spine, suit, [0, 0.12, 0], [0.151, 0.21, 0.108]);
  const chest = joint(spine, [0, 0.28, 0]);
  // A single curved ribcage gives a continuous chest and a broad, tapered silhouette.
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0, -0.09), new THREE.Vector2(0.145, -0.06),
    new THREE.Vector2(0.2, 0.06), new THREE.Vector2(0.26, 0.19),
    new THREE.Vector2(0.255, 0.27), new THREE.Vector2(0.18, 0.34),
    new THREE.Vector2(0.075, 0.37), new THREE.Vector2(0, 0.375),
  ]).getPoints(48);
  part(chest, new THREE.LatheGeometry(profile, 48), suit, [0, 0, 0], [1, 1, 0.59]);
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(B ? 0.25 : 0.19, B ? 0.14 : 0.18),
    new THREE.MeshStandardMaterial({ map: emblemTexture(B ? 'bat' : 's'), alphaTest: 0.5, roughness: 0.8 }));
  emblem.position.set(0, 0.215, 0.162);
  chest.add(emblem);
  part(chest, new THREE.CylinderGeometry(0.061, 0.075, 0.13, 32), B ? dark : skin, [0, 0.39, 0]);
  const head = joint(chest, [0, 0.44, 0]);
  const eyes = [];
  oval(head, B ? dark : skin, [0, 0.115, 0], [0.094, 0.123, 0.095]);
  // The exposed jaw sits in front of the cowl, not on a coincident face.
  if (B) oval(head, skin, [0, 0.047, 0.06], [0.064, 0.044, 0.043]);
  const hair = mat(0x10131a, 0.8);
  if (B) {
    for (const s of [-1, 1])
      part(head, new THREE.ConeGeometry(0.023, 0.13, 16), dark, [s * 0.061, 0.264, -0.012]);
  } else {
    part(head, new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hair,
      [0, 0.165, -0.012], [0.096, 0.079, 0.09], [-0.16, 0, 0]);
    oval(head, hair, [0.018, 0.217, 0.039], [0.07, 0.029, 0.057]);
    for (const s of [-1, 1]) oval(head, skin, [s * 0.091, 0.118, 0], [0.015, 0.027, 0.02]);
  }
  oval(head, B ? dark : skin, [0, 0.108, 0.092], [0.015, 0.026, 0.022]);
  part(head, new THREE.BoxGeometry(0.037, 0.004, 0.004), mat(0x74483e), [0, 0.048, 0.102]);
  for (const s of [-1, 1]) {
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: B ? 0xe9f0ff : 0xe4e8ea, roughness: 0.65, emissive: 0x000000 });
    eyes.push(oval(head, eyeMaterial, [s * 0.036, 0.139, 0.087], [0.022, 0.009, 0.009]));
    if (!B) oval(head, mat(0x234c82), [s * 0.036, 0.139, 0.096], [0.006, 0.007, 0.003]);
    part(head, new THREE.BoxGeometry(0.044, 0.009, 0.012), B ? dark : hair,
      [s * 0.037, 0.154, 0.087], [1, 1, 1], [0, 0, s * 0.12]);
  }
  const arms = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint(chest, [s * 0.25, 0.24, 0]);
    limb(sh, 0.32, 0.081, suit);
    const el = joint(sh, [0, -0.32, 0]);
    limb(el, 0.3, 0.061, B ? dark : suit);
    if (B) for (let k = 0; k < 3; k++)
      part(el, new THREE.ConeGeometry(0.014, 0.055, 4), dark,
        [s * 0.067, -0.09 - k * 0.05, -0.012], [0.65, 1, 1], [0, 0, -s * 1.1]);
    const hand = joint(el, [0, -0.3, 0]);
    oval(hand, B ? dark : skin, [0, -0.035, 0.006], [0.049, 0.063, 0.046]);
    oval(hand, B ? dark : skin, [-s * 0.037, -0.024, 0.024], [0.02, 0.031, 0.023]);
    arms[side] = { sh, el, hand, s };
  }
  const legs = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const th = joint(hips, [s * 0.1, -0.04, 0]);
    limb(th, 0.46, 0.09, suit);
    const kn = joint(th, [0, -0.46, 0]);
    // Suit and boot occupy separate sections instead of overlapping shells.
    limb(kn, 0.18, 0.064, suit);
    part(kn, new THREE.CylinderGeometry(0.069, 0.051, 0.3, 32), boot, [0, -0.32, 0]);
    const an = joint(kn, [0, -0.46, 0]);
    oval(an, boot, [0, -0.026, 0.065], [0.061, 0.065, 0.135]);
    legs[side] = { th, kn, an, s };
  }
  return { kind, root, hips, spine, chest, head, arms, legs, eyes };
}

// ---------- IK ----------
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _D = new THREE.Vector3(),
  _E = new THREE.Vector3(), _F = new THREE.Vector3(), _G = new THREE.Vector3(),
  _T = new THREE.Vector3(), _P = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

function setBoneDir(bone, dirWorld) {
  bone.parent.getWorldQuaternion(_qa).invert();
  _tmp.copy(dirWorld).applyQuaternion(_qa).normalize();
  bone.quaternion.setFromUnitVectors(DOWN, _tmp);
  bone.updateMatrixWorld(true);
}

function solveIK(upper, lower, L1, L2, target, pole) {
  upper.getWorldPosition(_A);
  _D.subVectors(target, _A);
  let d = _D.length();
  if (d < 1e-5) _D.set(0, -1, 0); else _D.multiplyScalar(1 / d);
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.001);
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _B.subVectors(pole, _A).addScaledVector(_D, -_B.dot(_D));
  if (_B.lengthSq() < 1e-8) _B.set(0, 0, 1);
  _B.normalize();
  _E.copy(_A).addScaledVector(_D, L1 * cosA).addScaledVector(_B, L1 * sinA);
  setBoneDir(upper, _F.subVectors(_E, _A));
  _G.copy(_A).addScaledVector(_D, d);
  setBoneDir(lower, _F.subVectors(_G, _E));
}

// pose: { p:[x,y,z] hips world, yaw, pitch, roll, lean, gait, lh, rh, lf, rf (hip-relative targets) }
export function applyPose(H, s, t) {
  H.root.position.set(s.p[0], s.p[1], s.p[2]);
  H.root.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ');
  H.spine.rotation.set(s.lean * 0.45, 0, s.roll * 0.3);
  H.chest.rotation.set(s.lean * 0.55 + Math.sin(t * 2.1) * 0.012, 0, 0);
  H.head.rotation.set(-s.lean * 0.7, 0, 0);
  H.root.updateMatrixWorld(true);

  const g = s.gait || 0, ph = t * Math.PI * 2 * 1.7, sw = Math.sin(ph), cw = Math.cos(ph);
  const limbs = [
    ['L', s.lh, 0, 0, -sw * 0.22 * g],
    ['R', s.rh, 0, 0, sw * 0.22 * g],
  ];
  for (const [side, tg, , , dz] of limbs) {
    const a = H.arms[side];
    _T.set(tg[0], tg[1], tg[2] + dz); H.root.localToWorld(_T);
    _P.set(a.s * 0.5, 0.2, -0.6); H.root.localToWorld(_P);
    solveIK(a.sh, a.el, 0.32, 0.30, _T, _P);
  }
  H.root.getWorldQuaternion(_qb);
  for (const [side, tg, lift, dz] of [['L', s.lf, Math.max(0, cw), sw], ['R', s.rf, Math.max(0, -cw), -sw]]) {
    const l = H.legs[side];
    _T.set(tg[0], tg[1] + lift * 0.18 * g, tg[2] + dz * 0.32 * g); H.root.localToWorld(_T);
    _P.set(l.s * 0.15, -0.45, 1.0); H.root.localToWorld(_P);
    solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
    l.kn.getWorldQuaternion(_qa).invert();
    l.an.quaternion.copy(_qa).multiply(_qb);
    l.an.updateMatrixWorld(true);
  }
}
