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

export function makeHero(kind) {
  const B = kind === 'batman';
  const suit = B ? mat(0x3b3e46, 0.8, 0.1) : mat(0x1d4fd8, 0.45, 0.05);
  const dark = mat(0x141518, 0.55, 0.2);
  const red = mat(0xc21a1a, 0.5);
  const skin = mat(0xdfa98a, 0.7);
  const yellow = mat(0xf2c230, 0.35, 0.4);
  const glove = B ? dark : skin;
  const boot = B ? dark : red;
  const trunks = B ? suit : red;

  const root = new THREE.Group();
  const hips = joint(root, [0, 0, 0]);
  part(hips, new THREE.SphereGeometry(0.17, 20, 14), trunks, [0, 0, 0], [1.25, 0.85, 0.85]);
  part(hips, new THREE.CylinderGeometry(0.2, 0.19, 0.07, 20), yellow, [0, 0.09, 0], [1, 1, 0.78]);
  if (B) {
    for (const i of [-2, -1, 1, 2]) {
      const a = i * 0.42;
      part(hips, new THREE.BoxGeometry(0.05, 0.06, 0.035), yellow, [Math.sin(a) * 0.205, 0.085, Math.cos(a) * 0.16], [1, 1, 1], [0, a, 0]);
    }
  } else {
    part(hips, new THREE.BoxGeometry(0.07, 0.055, 0.02), yellow, [0, 0.09, 0.155]);
  }

  const spine = joint(hips, [0, 0.08, 0]);
  part(spine, new THREE.CapsuleGeometry(0.14, 0.1, 6, 14), suit, [0, 0.12, 0], [1.1, 1, 0.8]);
  // abs
  for (const y of [0.06, 0.13]) for (const s of [1, -1])
    part(spine, new THREE.SphereGeometry(0.045, 8, 6), suit, [s * 0.045, y, 0.1], [1, 0.8, 0.5]);

  const chest = joint(spine, [0, 0.28, 0]);
  const profile = [[0.001, -0.12], [0.16, -0.1], [0.18, 0], [0.21, 0.1], [0.245, 0.2], [0.25, 0.27], [0.21, 0.33], [0.1, 0.37], [0.001, 0.375]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  part(chest, new THREE.LatheGeometry(profile, 24), suit, [0, 0, 0], [1, 1, 0.62]);
  for (const s of [1, -1]) part(chest, new THREE.SphereGeometry(0.1, 14, 10), suit, [s * 0.088, 0.2, 0.095], [1.05, 0.75, 0.55]);
  const em = new THREE.Mesh(new THREE.PlaneGeometry(B ? 0.21 : 0.17, B ? 0.13 : 0.16),
    new THREE.MeshStandardMaterial({ map: emblemTexture(B ? 'bat' : 's'), alphaTest: 0.5, roughness: 0.5 }));
  em.position.set(0, 0.205, 0.163); em.rotation.x = -0.12;
  chest.add(em);
  // traps / neck
  part(chest, new THREE.SphereGeometry(0.09, 12, 8), suit, [0, 0.33, -0.01], [1.6, 0.6, 0.9]);
  part(chest, new THREE.CylinderGeometry(0.058, 0.066, 0.12, 12), B ? dark : skin, [0, 0.4, 0]);

  const head = joint(chest, [0, 0.44, 0]);
  const eyes = [];
  if (B) {
    part(head, new THREE.SphereGeometry(0.116, 24, 18), dark, [0, 0.115, -0.005], [0.93, 1.08, 1]);
    part(head, new THREE.SphereGeometry(0.095, 18, 12), skin, [0, 0.055, 0.03], [0.8, 0.6, 0.86]);
    for (const s of [1, -1]) {
      part(head, new THREE.ConeGeometry(0.026, 0.13, 8), dark, [s * 0.056, 0.26, -0.01], [1, 1, 1], [0, 0, -s * 0.08]);
      eyes.push(part(head, new THREE.BoxGeometry(0.038, 0.012, 0.01),
        new THREE.MeshBasicMaterial({ color: 0xf4f4ff }), [s * 0.04, 0.128, 0.104], [1, 1, 1], [0, 0, s * 0.25]));
    }
    part(head, new THREE.BoxGeometry(0.02, 0.05, 0.02), dark, [0, 0.105, 0.11], [1, 1, 1], [0.35, 0, 0]);
  } else {
    part(head, new THREE.SphereGeometry(0.112, 24, 18), skin, [0, 0.11, 0], [0.9, 1.08, 1]);
    const hair = mat(0x0c0c10, 0.5);
    part(head, new THREE.SphereGeometry(0.12, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, [0, 0.115, -0.012], [0.95, 1.08, 1.04], [-0.3, 0, 0]);
    part(head, new THREE.TorusGeometry(0.02, 0.007, 6, 12, Math.PI * 1.5), hair, [0.02, 0.2, 0.098], [1, 1, 1], [0, 0, 1]);
    part(head, new THREE.BoxGeometry(0.02, 0.04, 0.03), skin, [0, 0.1, 0.107], [1, 1, 1], [0.2, 0, 0]);
    for (const s of [1, -1]) {
      eyes.push(part(head, new THREE.SphereGeometry(0.013, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a4fa0, emissive: 0x000000 }), [s * 0.04, 0.128, 0.096]));
      part(head, new THREE.BoxGeometry(0.04, 0.008, 0.01), hair, [s * 0.04, 0.15, 0.1]);
      part(head, new THREE.SphereGeometry(0.02, 8, 6), skin, [s * 0.1, 0.11, 0], [0.5, 1, 0.8]);
    }
  }

  const arms = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint(chest, [s * 0.25, 0.24, 0]);
    part(sh, new THREE.SphereGeometry(0.09, 14, 10), suit, [0, -0.01, 0]);
    part(sh, new THREE.CapsuleGeometry(0.063, 0.2, 6, 12), suit, [0, -0.16, 0]);
    const el = joint(sh, [0, -0.32, 0]);
    part(el, new THREE.CapsuleGeometry(0.052, 0.19, 6, 12), suit, [0, -0.14, 0]);
    if (B) {
      part(el, new THREE.CylinderGeometry(0.062, 0.054, 0.18, 12), dark, [0, -0.19, 0]);
      for (let k = 0; k < 3; k++)
        part(el, new THREE.BoxGeometry(0.012, 0.055, 0.03), dark, [s * 0.064, -0.13 - k * 0.045, -0.01], [1, 1, 1], [0, 0, s * 0.6]);
    } else {
      part(el, new THREE.CylinderGeometry(0.055, 0.05, 0.03, 12), suit, [0, -0.27, 0]);
    }
    const hand = joint(el, [0, -0.3, 0]);
    part(hand, new THREE.SphereGeometry(0.056, 12, 10), glove, [0, -0.03, 0], [1, 1.15, 1.1]);
    arms[side] = { sh, el, hand, s };
  }

  const legs = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const th = joint(hips, [s * 0.1, -0.04, 0]);
    part(th, new THREE.CapsuleGeometry(0.088, 0.3, 6, 12), suit, [0, -0.22, 0]);
    const kn = joint(th, [0, -0.46, 0]);
    part(kn, new THREE.CapsuleGeometry(0.068, 0.3, 6, 12), suit, [0, -0.2, 0]);
    part(kn, new THREE.CylinderGeometry(0.08, 0.07, 0.27, 12), boot, [0, -0.33, 0]);
    if (!B) part(kn, new THREE.BoxGeometry(0.05, 0.05, 0.02), boot, [0, -0.19, 0.075], [1, 1, 1], [0, 0, Math.PI / 4]);
    const an = joint(kn, [0, -0.46, 0]);
    part(an, new THREE.BoxGeometry(0.1, 0.075, 0.25), boot, [0, -0.03, 0.05]);
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
