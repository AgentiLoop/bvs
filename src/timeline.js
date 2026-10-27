// Choreography: hip-relative IK poses + keyframed tracks for both heroes and the camera.
const PI = Math.PI;
export const face = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);

// Limb targets are relative to the hips (root). +Z forward, +X = hero's left, +Y up.
export const POSES = {
  stand:   { h: 0.88, lean: 0.3, roll: 0, lh: [0.26, 0.14, 0.2], rh: [-0.26, 0.12, 0.18], lf: [0.17, -0.82, 0.1], rf: [-0.17, -0.82, -0.12] },
  brood:   { h: 0.9, lean: 0.24, roll: 0, lh: [0.12, 0.12, 0.3], rh: [-0.12, 0.1, 0.3], lf: [0.18, -0.82, 0.1], rf: [-0.18, -0.82, -0.1] },
  heroic:  { h: 0.88, lean: 0.26, roll: 0.05, lh: [0.22, 0.05, 0], rh: [-0.22, 0.05, 0], lf: [0.26, -0.84, 0.1], rf: [-0.24, -0.84, -0.1] },
  guard:   { h: 0.78, lean: 0.38, roll: 0, lh: [0.12, 0.5, 0.42], rh: [-0.12, 0.44, 0.34], lf: [0.2, -0.7, 0.3], rf: [-0.2, -0.7, -0.3] },
  charge:  { h: 0.76, lean: 0.62, roll: 0, lh: [0.15, 0.42, 0.4], rh: [-0.15, 0.3, 0.2], lf: [0.15, -0.68, 0.12], rf: [-0.15, -0.68, -0.12] },
  punchR:  { h: 0.76, lean: 0.5, roll: 0, lh: [0.14, 0.45, 0.3], rh: [-0.04, 0.55, 1.0], lf: [0.2, -0.68, 0.42], rf: [-0.18, -0.68, -0.42] },
  clash:   { h: 0.76, lean: 0.52, roll: 0, lh: [0.24, 0.32, 0.1], rh: [0, 0.56, 1.0], lf: [0.2, -0.68, 0.45], rf: [-0.18, -0.68, -0.46] },
  dodge:   { h: 0.84, lean: -0.42, roll: 0.1, lh: [0.14, 0.38, 0.18], rh: [-0.12, 0.36, 0.16], lf: [0.17, -0.8, 0.3], rf: [-0.17, -0.8, -0.2] },
  kickR:   { h: 0.95, lean: -0.38, roll: 0, lh: [0.36, 0.22, -0.12], rh: [-0.22, 0.34, 0.2], lf: [0.12, -0.88, -0.1], rf: [-0.3, 0.42, 0.74] },
  windup:  { h: 0.74, lean: 0.38, roll: -0.2, lh: [0.14, 0.44, 0.38], rh: [-0.3, -0.06, -0.25], lf: [0.18, -0.66, 0.26], rf: [-0.18, -0.66, -0.3] },
  upper:   { h: 0.9, lean: 0.22, roll: 0.12, lh: [0.22, 0.34, 0.25], rh: [-0.06, 1.02, 0.55], lf: [0.17, -0.83, 0.24], rf: [-0.17, -0.83, -0.22] },
  flinch:  { h: 0.9, lean: -0.28, roll: 0.25, lh: [0.15, 0.4, 0.2], rh: [-0.25, 0.2, 0.1], lf: [0.17, -0.83, 0.2], rf: [-0.17, -0.83, -0.25] },
  hit:     { h: 0.9, lean: -0.55, roll: 0, lh: [0.5, 0.62, -0.2], rh: [-0.48, 0.72, -0.1], lf: [0.15, -0.62, 0.42], rf: [-0.15, -0.5, 0.32] },
  down:    { h: 0.16, lean: 0.15, roll: 0, lh: [0.52, 0.3, 0], rh: [-0.5, 0.25, 0.05], lf: [0.2, -0.9, 0.05], rf: [-0.12, -0.88, 0.1] },
  kneel:   { h: 0.52, lean: 0.5, roll: 0, lh: [0.3, 0, 0.3], rh: [-0.14, -0.42, 0.42], lf: [0.18, -0.45, 0.38], rf: [-0.15, -0.4, -0.42] },
  land:    { h: 0.5, lean: 0.55, roll: 0, lh: [0.42, 0.08, 0.02], rh: [-0.12, -0.44, 0.44], lf: [0.2, -0.43, 0.38], rf: [-0.15, -0.38, -0.44] },
  tuck:    { h: 0.5, lean: 0.55, roll: 0, lh: [0.3, 0.0, 0.36], rh: [-0.3, 0.0, 0.36], lf: [0.22, -0.42, 0.24], rf: [-0.22, -0.42, 0.24] },
  fly:     { h: 0, lean: 0.15, roll: 0, lh: [0.4, 0.02, 0.1], rh: [-0.4, 0.02, 0.1], lf: [0.07, -0.9, -0.1], rf: [-0.07, -0.78, -0.32] },
  flykick: { h: 0, lean: -0.25, roll: 0, lh: [0.3, 0.4, -0.1], rh: [-0.25, 0.35, 0.1], lf: [0.12, -0.38, 0.25], rf: [-0.06, -0.15, 0.85] },
  heat:    { h: 0.86, lean: 0.34, roll: 0, lh: [0.3, 0.0, 0.12], rh: [-0.3, 0.0, 0.12], lf: [0.24, -0.8, 0.12], rf: [-0.22, -0.8, -0.12] },
};

const NUM = ['h', 'lean', 'roll', 'pitch', 'yaw', 'gait'];
const ARR = ['p', 'lh', 'rh', 'lf', 'rf'];

export function buildTrack(kfs) {
  const out = [];
  let prev = { h: 0.97, lean: 0, roll: 0, pitch: 0, yaw: 0, g: [0, 0, 0] };
  for (const k of kfs) {
    const f = { ...prev, ...(k.pose ? POSES[k.pose] : {}), ...k };
    f.gait = k.gait ?? 0;
    f.e = k.e || 'smooth';
    if (k.p) { f.p = k.p; f.g = null; }
    else {
      f.g = k.g ?? prev.g;
      f.p = f.g ? [f.g[0], f.g[1] + f.h, f.g[2]] : prev.p;
    }
    out.push(f);
    prev = f;
  }
  return out;
}

const EASE = { lin: (u) => u, in: (u) => u * u, out: (u) => 1 - (1 - u) * (1 - u), smooth: (u) => u * u * (3 - 2 * u) };

export function sampleTrack(tr, t) {
  let i = 0;
  while (i < tr.length - 1 && tr[i + 1].t <= t) i++;
  const a = tr[i], b = tr[Math.min(i + 1, tr.length - 1)];
  let u = b === a || t <= a.t ? 0 : Math.min(1, (t - a.t) / (b.t - a.t));
  u = EASE[b.e](u);
  const o = {};
  for (const k of NUM) o[k] = a[k] + (b[k] - a[k]) * u;
  for (const k of ARR) o[k] = a[k].map((v, j) => v + (b[k][j] - v) * u);
  if (t < a.t) o.gait = 0;
  return o;
}

// ---- key positions ----
const BY = PI / 2, SY = -PI / 2;
const S1 = [0.6, 0, 0.2];
const B1 = [-4.4, 0, -1.8];
const Bm = [-3.4, 0, 0.2];
const B2 = [-2.6, 0, 1.9];
const kd = [S1[0] - B2[0], S1[2] - B2[2]], kl = Math.hypot(...kd), KD = [kd[0] / kl, kd[1] / kl];
const along = (p, s, y = 0) => [p[0] + KD[0] * s, y, p[2] + KD[1] * s];
const S2 = along(S1, 2.2);
export const KEY = { S1, B1, Bm, B2, kick: along(S1, -0.72, 1.3) };

export const HEAT = { t0: 12.9, t1: 14.4 };
export const SLOWMO = 18.2;

export const BAT = buildTrack([
  { t: 0, pose: 'brood', g: [-2.2, 0, 0.3], yaw: BY + 0.25 },
  { t: 3.6, pose: 'brood', g: [-2.2, 0, 0.3] },
  { t: 4.4, pose: 'guard', g: [-2.3, 0, 0.2], yaw: BY },
  { t: 5.0, pose: 'guard', g: [-2.4, 0, 0.2] },
  { t: 5.25, pose: 'dodge', g: [-2.7, 0, 0.2], e: 'out' },
  { t: 5.9, pose: 'guard', g: [-2.5, 0, 0.2] },
  { t: 7.6, pose: 'guard', g: [-1.7, 0, 0.1], gait: 0.6 },
  { t: 8.05, pose: 'guard', g: [-0.6, 0, 0], gait: 1 },
  { t: 8.15, pose: 'guard', g: [-0.5, 0, 0] },
  { t: 8.3, pose: 'dodge', g: [-0.55, 0, 0], e: 'out' },
  { t: 8.6, pose: 'guard', g: [-0.38, 0, 0] },
  { t: 8.8, pose: 'guard', g: [-0.32, 0, 0] },
  { t: 9.0, pose: 'kickR', g: [0.05, 0, 0], e: 'out' },
  { t: 9.35, pose: 'kickR', g: [0.0, 0, 0] },
  { t: 9.7, pose: 'guard', g: [-0.3, 0, 0] },
  { t: 10.3, pose: 'guard', g: [-0.35, 0, 0] },
  { t: 10.55, pose: 'hit', p: [-0.42, 1.0, 0], pitch: 0 },
  { t: 11.35, pose: 'hit', p: [-4.95, 3.45, -2.55], pitch: -1.4, yaw: BY + 0.5, e: 'out' },
  { t: 11.9, pose: 'down', p: [-4.5, 0.16, -1.9], pitch: -1.5, e: 'in' },
  { t: 12.5, pose: 'down', p: [-4.5, 0.16, -1.9] },
  { t: 12.95, pose: 'kneel', g: B1, pitch: 0, yaw: face(B1, S1) },
  { t: 13.15, pose: 'tuck', g: B1, yaw: face(B1, Bm) },
  { t: 13.7, pose: 'tuck', g: Bm, pitch: PI * 2, e: 'lin' },
  { t: 13.95, pose: 'kneel', g: Bm, yaw: face(Bm, S1) },
  { t: 14.1, pose: 'guard', g: Bm },
  { t: 14.55, pose: 'charge', g: B2, yaw: face(Bm, B2), gait: 1 },
  { t: 14.8, pose: 'tuck', g: B2, yaw: face(B2, S1) },
  { t: 15.0, pose: 'tuck', g: B2 },
  { t: 15.4, pose: 'flykick', p: [(B2[0] + S1[0]) / 2 - KD[0] * 0.4, 1.9, (B2[2] + S1[2]) / 2 - KD[1] * 0.4], e: 'out' },
  { t: 15.75, pose: 'flykick', p: KEY.kick },
  { t: 16.1, pose: 'guard', g: along(S1, -1.5), e: 'in' },
  { t: 16.5, pose: 'guard', g: along(S1, -1.6) },
  { t: 16.95, pose: 'guard', g: [-3.0, 0, 0.1], yaw: BY, gait: 0.7 },
  { t: 17.2, pose: 'guard', g: [-3.1, 0, 0] },
  { t: 17.4, pose: 'charge', g: [-2.7, 0, 0], gait: 1 },
  { t: 18.0, pose: 'charge', g: [-1.0, 0, 0], gait: 1, e: 'lin' },
  { t: 18.2, pose: 'clash', g: [-0.8, 0, 0] },
  { t: 30, pose: 'clash', g: [-0.8, 0, 0] },
]);

export const SUP = buildTrack([
  { t: 0, pose: 'fly', p: [3.5, 40, -2], yaw: SY, pitch: 0.5, rh: [-0.12, 0.6, 0.45] },
  { t: 2.6, pose: 'fly', p: [3.5, 40, -2], pitch: 0.5, rh: [-0.12, 0.6, 0.45] },
  // Dives in chest-first with a fist leading, then swings feet-down for the landing.
  { t: 4.3, pose: 'fly', p: [2.6, 5, -0.2], pitch: 0.35, rh: [-0.12, 0.6, 0.45], e: 'in' },
  { t: 5.0, pose: 'land', g: [2.5, 0, 0], pitch: 0, e: 'in' },
  { t: 6.0, pose: 'land', g: [2.5, 0, 0] },
  { t: 6.8, pose: 'heroic', g: [2.5, 0, 0] },
  { t: 7.5, pose: 'heroic', g: [2.4, 0, 0] },
  { t: 7.75, pose: 'guard', g: [2.2, 0, 0] },
  { t: 8.0, pose: 'guard', g: [1.5, 0, 0], gait: 1 },
  { t: 8.3, pose: 'punchR', g: [0.95, 0, 0], e: 'out' },
  { t: 8.6, pose: 'guard', g: [0.95, 0, 0] },
  { t: 8.95, pose: 'guard', g: [0.9, 0, 0] },
  { t: 9.1, pose: 'flinch', g: [1.0, 0, 0], yaw: SY + 0.35, e: 'out' },
  { t: 9.7, pose: 'guard', g: [0.9, 0, 0], yaw: SY },
  { t: 10.1, pose: 'windup', g: [0.7, 0, 0] },
  { t: 10.55, pose: 'upper', g: [0.38, 0, 0], e: 'out' },
  { t: 11.2, pose: 'upper', g: [0.45, 0, 0] },
  { t: 11.8, pose: 'stand', g: [0.5, 0, 0.1], yaw: face([0.5, 0, 0.1], [-4.5, 0, -1.9]) },
  { t: 12.6, pose: 'heroic', g: S1 },
  { t: 12.9, pose: 'heat', g: S1 },
  { t: 14.4, pose: 'heat', g: S1 },
  { t: 14.7, pose: 'guard', g: S1, yaw: face(S1, B2) },
  { t: 15.7, pose: 'guard', g: S1 },
  { t: 15.8, pose: 'flinch', g: along(S1, 0.3), e: 'out' },
  { t: 16.4, pose: 'flinch', g: S2, e: 'out' },
  { t: 16.8, pose: 'guard', g: S2 },
  { t: 16.95, pose: 'guard', g: [3.0, 0, -0.1], yaw: SY, gait: 0.7 },
  { t: 17.2, pose: 'guard', g: [3.1, 0, 0] },
  { t: 17.4, pose: 'charge', g: [2.7, 0, 0], gait: 1 },
  { t: 18.0, pose: 'charge', g: [1.0, 0, 0], gait: 1, e: 'lin' },
  { t: 18.2, pose: 'clash', g: [0.8, 0, 0] },
  { t: 30, pose: 'clash', g: [0.8, 0, 0] },
]);

// camera: look = [x,y,z] | 'B' | 'S' | 'mid'. Near-zero-length segments act as hard cuts.
export const CAM = [
  { t: 0, pos: [-9, 2.2, 9], look: [-2.2, 1.3, 0.3] },
  { t: 3.0, pos: [-5.0, 1.6, 4.2], look: [-2.2, 1.5, 0.3] },
  { t: 3.001, pos: [4.5, 0.6, 5.5], look: 'S' },
  { t: 4.9, pos: [5.5, 0.9, 5.0], look: 'S' },
  { t: 4.901, pos: [-1, 2.5, 6.5], look: [0.5, 0.8, 0] },
  { t: 6.0, pos: [-0.5, 2.0, 5.5], look: [0.5, 1.0, 0] },
  { t: 6.001, pos: [-3.6, 1.7, 1.3], look: 'S' },
  { t: 7.6, pos: [-3.2, 1.6, 1.8], look: 'S' },
  { t: 7.601, pos: [0.3, 1.3, 5.2], look: [0.2, 1.2, 0] },
  { t: 10.4, pos: [0.4, 1.4, 4.0], look: [0.2, 1.3, 0] },
  { t: 11.4, pos: [-1.5, 2.6, 4.5], look: 'B' },
  { t: 12.6, pos: [-2.0, 1.8, 3.0], look: 'B' },
  { t: 12.601, pos: [2.4, 2.4, 2.6], look: [-3, 0.4, -1] },
  { t: 14.4, pos: [1.8, 2.2, 3.2], look: [-2.6, 0.6, 1.5] },
  { t: 14.401, pos: [-1.2, 0.8, 5.5], look: 'mid' },
  { t: 16.6, pos: [0.0, 1.2, 6.0], look: 'mid' },
  { t: 16.601, pos: [0, 1.1, 6.5], look: [0, 1.2, 0] },
  { t: 18.0, pos: [0, 1.2, 3.6], look: [0, 1.35, 0] },
  { t: 18.2, pos: [0, 1.3, 3.2], look: [0, 1.35, 0] },
];

export function sampleCam(t, resolve) {
  let i = 0;
  while (i < CAM.length - 1 && CAM[i + 1].t <= t) i++;
  const a = CAM[i], b = CAM[Math.min(i + 1, CAM.length - 1)];
  const u = b === a ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const la = resolve(a.look), lb = resolve(b.look);
  return {
    pos: a.pos.map((v, j) => v + (b.pos[j] - v) * u),
    look: la.map((v, j) => v + (lb[j] - v) * u),
  };
}
