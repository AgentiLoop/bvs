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
  const suit = B ? mat(0x4b4f58, 0.75, 0.15) : mat(0x1f56e0, 0.38, 0.08);
  const dark = mat(0x0c0d10, 0.45, 0.3);
  const red = mat(0xc4161c, 0.42, 0.05);
  const skin = mat(0xe0a888, 0.65);
  const yellow = mat(0xf2c230, 0.3, 0.5);
  const glove = B ? dark : suit;
  const boot = B ? dark : red;
  const trunks = B ? dark : red;

  const root = new THREE.Group();
  const hips = joint(root, [0, 0, 0]);
  // pelvis + trunks
  part(hips, new THREE.SphereGeometry(0.16, 22, 14), trunks, [0, -0.01, 0], [1.15, 0.8, 0.85]);
  // belt
  part(hips, new THREE.CylinderGeometry(0.168, 0.172, 0.06, 24), yellow, [0, 0.085, 0], [1, 1, 0.8]);
  if (B) {
    for (const i of [-3, -2, -1, 1, 2, 3]) {
      const a = i * 0.36;
      part(hips, new THREE.BoxGeometry(0.045, 0.06, 0.035), yellow, [Math.sin(a) * 0.17, 0.08, Math.cos(a) * 0.14], [1, 1, 1], [0, a, 0]);
    }
    part(hips, new THREE.BoxGeometry(0.06, 0.045, 0.02), yellow, [0, 0.085, 0.142]);
  } else {
    part(hips, new THREE.BoxGeometry(0.07, 0.05, 0.02), yellow, [0, 0.085, 0.142]);
  }

  // abdomen: narrow waist, obliques
  const spine = joint(hips, [0, 0.08, 0]);
  muscle(spine, [[0.001, -0.06], [0.15, -0.05], [0.142, 0.03], [0.14, 0.12], [0.155, 0.22], [0.17, 0.3], [0.001, 0.32]], suit, [0, 0, 0], [1, 1, 0.74], [0, 0, 0], 24);
  // six-pack
  for (const [y, w] of [[0.03, 0.04], [0.1, 0.042], [0.17, 0.044]]) for (const s of [1, -1])
    part(spine, new THREE.SphereGeometry(0.036, 10, 8), suit, [s * w, y, 0.094], [1.05, 0.85, 0.45]);

  // chest: big V-taper ribcage, pecs, lats, traps
  const chest = joint(spine, [0, 0.28, 0]);
  muscle(chest, [[0.001, -0.09], [0.17, -0.07], [0.2, 0.0], [0.25, 0.09], [0.285, 0.18], [0.29, 0.25], [0.25, 0.32], [0.14, 0.37], [0.001, 0.385]],
    suit, [0, 0, 0], [1, 1, 0.6], [0, 0, 0], 28);
  for (const s of [1, -1]) {
    part(chest, new THREE.SphereGeometry(0.12, 18, 12), suit, [s * 0.098, 0.2, 0.095], [1.12, 0.72, 0.52], [0, 0, -s * 0.12]); // pecs
    part(chest, new THREE.SphereGeometry(0.12, 14, 10), suit, [s * 0.17, 0.1, -0.03], [0.62, 1.35, 0.85], [0, 0, s * 0.35]);    // lats
  }
  part(chest, new THREE.SphereGeometry(0.12, 16, 10), suit, [0, 0.33, -0.03], [1.85, 0.55, 0.85]); // traps
  const em = new THREE.Mesh(new THREE.PlaneGeometry(B ? 0.26 : 0.2, B ? 0.15 : 0.19),
    new THREE.MeshStandardMaterial({ map: emblemTexture(B ? 'bat' : 's'), alphaTest: 0.5, roughness: 0.45 }));
  em.position.set(0, B ? 0.21 : 0.2, 0.158); em.rotation.x = -0.1;
  chest.add(em);
  // thick neck
  part(chest, new THREE.CylinderGeometry(0.068, 0.085, 0.12, 14), B ? dark : skin, [0, 0.4, 0.005]);

  const head = joint(chest, [0, 0.44, 0]);
  const eyes = [];
  if (B) {
    // cowl: dark skull down to the nose, open mouth/jaw, tall straight ears, scowling brow
    part(head, new THREE.SphereGeometry(0.108, 24, 18), dark, [0, 0.125, -0.005], [0.92, 1.05, 1]);
    part(head, new THREE.BoxGeometry(0.15, 0.08, 0.13), skin, [0, 0.045, 0.025]);                // square jaw
    part(head, new THREE.BoxGeometry(0.11, 0.035, 0.11), skin, [0, 0.01, 0.035]);               // chin
    part(head, new THREE.BoxGeometry(0.17, 0.06, 0.15), dark, [0, 0.1, 0.01]);                   // cowl cheeks
    part(head, new THREE.BoxGeometry(0.05, 0.012, 0.012), dark, [0, 0.03, 0.105]);               // grim mouth line
    part(head, new THREE.CylinderGeometry(0.1, 0.12, 0.08, 16), dark, [0, 0.0, -0.01]);          // cowl flares to neck
    for (const s of [1, -1]) {
      part(head, new THREE.ConeGeometry(0.024, 0.15, 6), dark, [s * 0.055, 0.29, -0.01], [1, 1, 0.8], [0, 0, -s * 0.05]);
      part(head, new THREE.BoxGeometry(0.07, 0.022, 0.03), dark, [s * 0.036, 0.15, 0.092], [1, 1, 1], [0, 0, s * 0.3]); // brow
      eyes.push(part(head, new THREE.BoxGeometry(0.04, 0.011, 0.01),
        new THREE.MeshBasicMaterial({ color: 0xf4f4ff }), [s * 0.038, 0.132, 0.1], [1, 1, 1], [0, 0, s * 0.22]));
    }
    part(head, new THREE.BoxGeometry(0.024, 0.055, 0.03), dark, [0, 0.1, 0.098], [1, 1, 1], [0.3, 0, 0]); // cowl nose
  } else {
    part(head, new THREE.SphereGeometry(0.1, 24, 18), skin, [0, 0.13, -0.005], [0.9, 1.05, 1]);
    part(head, new THREE.BoxGeometry(0.14, 0.085, 0.13), skin, [0, 0.055, 0.02]);                // square jaw
    part(head, new THREE.BoxGeometry(0.075, 0.04, 0.05), skin, [0, 0.022, 0.07]);                // chin
    const hair = mat(0x08080c, 0.35, 0.1);
    part(head, new THREE.SphereGeometry(0.108, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0, 0.14, -0.012], [0.95, 1.0, 1.04], [-0.35, 0, 0]);
    part(head, new THREE.SphereGeometry(0.06, 12, 8), hair, [0.03, 0.215, 0.05], [1.4, 0.6, 1]); // swept quiff
    part(head, new THREE.TorusGeometry(0.016, 0.006, 6, 12, Math.PI * 1.5), hair, [0.012, 0.188, 0.098], [1, 1, 1], [0, 0, 1]); // spit curl
    part(head, new THREE.BoxGeometry(0.022, 0.045, 0.03), skin, [0, 0.11, 0.098], [1, 1, 1], [0.2, 0, 0]);
    part(head, new THREE.BoxGeometry(0.04, 0.007, 0.01), mat(0x8a4a40, 0.6), [0, 0.06, 0.087]);   // mouth
    for (const s of [1, -1]) {
      eyes.push(part(head, new THREE.SphereGeometry(0.012, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a4fa0, emissive: 0x000000 }), [s * 0.036, 0.13, 0.085]));
      part(head, new THREE.BoxGeometry(0.042, 0.011, 0.015), hair, [s * 0.037, 0.152, 0.088], [1, 1, 1], [0, 0, s * 0.12]);
      part(head, new THREE.SphereGeometry(0.02, 8, 6), skin, [s * 0.088, 0.12, 0], [0.5, 1, 0.8]);
    }
  }

  const arms = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint(chest, [s * 0.25, 0.24, 0]);
    part(sh, new THREE.SphereGeometry(0.105, 16, 12), suit, [s * 0.025, -0.015, 0], [1, 1.12, 1.02]);           // deltoid cap
    muscle(sh, [[0.001, -0.33], [0.055, -0.32], [0.065, -0.28], [0.078, -0.2], [0.084, -0.13], [0.08, -0.06], [0.075, 0], [0.001, 0.02]], suit);
    part(sh, new THREE.SphereGeometry(0.06, 12, 8), suit, [0, -0.17, 0.035], [0.95, 1.5, 0.8]);                 // bicep
    part(sh, new THREE.SphereGeometry(0.06, 12, 8), suit, [0, -0.15, -0.035], [0.95, 1.6, 0.8]);                // tricep
    const el = joint(sh, [0, -0.32, 0]);
    muscle(el, [[0.001, -0.31], [0.042, -0.3], [0.046, -0.26], [0.062, -0.17], [0.074, -0.08], [0.068, -0.01], [0.055, 0.025], [0.001, 0.035]], suit);
    if (B) {
      muscle(el, [[0.001, -0.31], [0.05, -0.3], [0.055, -0.26], [0.07, -0.15], [0.077, -0.09], [0.001, -0.088]], dark); // gauntlet
      for (let k = 0; k < 3; k++)
        part(el, new THREE.ConeGeometry(0.016, 0.07, 4), dark, [s * 0.072, -0.13 - k * 0.045, -0.02], [0.5, 1, 1], [0, 0, s * 1.0]);
    } else {
      part(el, new THREE.CylinderGeometry(0.05, 0.046, 0.025, 14), red, [0, -0.29, 0]); // cuff
    }
    const hand = joint(el, [0, -0.3, 0]);
    part(hand, new THREE.BoxGeometry(0.085, 0.1, 0.095), glove, [0, -0.045, 0.005]);              // fist
    part(hand, new THREE.SphereGeometry(0.05, 10, 8), glove, [0, -0.04, 0.005], [0.95, 1.1, 1.05]);
    part(hand, new THREE.CapsuleGeometry(0.016, 0.04, 4, 6), glove, [s * 0.04, -0.03, 0.035], [1, 1, 1], [0.5, 0, 0]); // thumb
    arms[side] = { sh, el, hand, s };
  }

  const legs = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const th = joint(hips, [s * 0.1, -0.04, 0]);
    muscle(th, [[0.001, -0.47], [0.062, -0.46], [0.072, -0.4], [0.095, -0.28], [0.108, -0.16], [0.11, -0.06], [0.1, 0.03], [0.001, 0.06]], suit);
    part(th, new THREE.SphereGeometry(0.065, 12, 8), suit, [s * 0.02, -0.3, 0.04], [1, 1.8, 0.8]);       // quad sweep
    const kn = joint(th, [0, -0.46, 0]);
    muscle(kn, [[0.001, -0.47], [0.048, -0.46], [0.052, -0.38], [0.066, -0.25], [0.078, -0.14], [0.07, -0.04], [0.064, 0.02], [0.001, 0.04]], suit);
    part(kn, new THREE.SphereGeometry(0.055, 12, 8), suit, [0, -0.15, -0.035], [1, 1.9, 0.9]);           // calf
    // boots
    muscle(kn, [[0.001, -0.475], [0.06, -0.47], [0.062, -0.38], [0.077, -0.25], [0.083, -0.19], [B ? 0.085 : 0.086, B ? -0.17 : -0.18], [0.001, B ? -0.168 : -0.178]], boot);
    if (!B) part(kn, new THREE.ConeGeometry(0.05, 0.06, 3), boot, [0, -0.15, 0.075], [1, 1, 0.3], [Math.PI, 0, 0]); // boot V notch
    const an = joint(kn, [0, -0.46, 0]);
    part(an, new THREE.BoxGeometry(0.11, 0.08, 0.26), boot, [0, -0.035, 0.055]);
    part(an, new THREE.SphereGeometry(0.055, 10, 8), boot, [0, -0.03, 0.17], [1, 0.7, 1]);
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
