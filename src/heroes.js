// Contoured, skinned Batman / Superman, posed with analytic two-bone IK.
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);

// Cool rim light (Fresnel) so the heroes' silhouettes pop off the night scene like comic-book art,
// which also keeps Batman's dark suit and cowl readable.
// rimAmt is set to 0 by main.js in comic mode, where the light rim reads as a glowing halo inside the ink line.
export const rimAmt = { value: 1 };
const rim = (m) => {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimAmt = rimAmt;
    sh.fragmentShader = 'uniform float rimAmt;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n  reflectedLight.directSpecular += rimAmt * vec3(0.22, 0.28, 0.4) * pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0);');
  };
  m.customProgramCacheKey = () => 'hero-rim';
  return m;
};
const mat = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  rim(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

// MK11-style battle damage: up to DMG_N bruise / scuff spots (world positions + strength, refreshed each
// frame by main.js from the game's bone-anchored scars), torn-in cuts inside the worst of them, and dusty
// grime over the whole suit as the match wears on. Noise runs in rest space so the marks stick to the body.
export const DMG_N = 12;
const DMG_GLSL = `uniform vec3 dmgP[${DMG_N}];
uniform float dmgS[${DMG_N}];
uniform float dmgWear;
varying vec3 vDmgW;
varying vec3 vDmgR;
float dmgHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dmgNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dmgHash(i), dmgHash(i + vec3(1, 0, 0)), f.x), mix(dmgHash(i + vec3(0, 1, 0)), dmgHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dmgHash(i + vec3(0, 0, 1)), dmgHash(i + vec3(1, 0, 1)), f.x), mix(dmgHash(i + vec3(0, 1, 1)), dmgHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;
const DMG_APPLY = `
  float dmgA = 0.0;
  float dmgN1 = dmgNoise(vDmgR * 31.0);
  for (int i = 0; i < ${DMG_N}; i++) {
    float r = 0.05 + 0.06 * dmgS[i];
    dmgA = max(dmgA, dmgS[i] * (1.0 - smoothstep(r * 0.25, r, distance(vDmgW, dmgP[i]) + (dmgN1 - 0.5) * 0.06))); // edges ascending: reversed smoothstep is undefined (black on Metal)
  }
  float dmgCut = smoothstep(0.35, 0.8, dmgA) * smoothstep(0.66, 0.74, dmgNoise(vDmgR * vec3(150.0, 18.0, 150.0)));
  float dmgGrime = dmgWear * smoothstep(0.45, 0.8, dmgNoise(vDmgR * 7.0 + 3.1));
  // skin and bright suits bruise (darker, red-purple); near-black suit and cowl scuff lighter (abraded fabric)
  float dmgLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 dmgBruise = diffuseColor.rgb * vec3(0.78, 0.5, 0.55) + vec3(0.035, 0.008, 0.012);
  vec3 dmgScuff = mix(diffuseColor.rgb, vec3(0.15, 0.14, 0.13), 0.35 + 0.5 * smoothstep(0.4, 0.7, dmgNoise(vDmgR * vec3(90.0, 25.0, 90.0))));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(dmgScuff, dmgBruise, smoothstep(0.03, 0.12, dmgLum)), dmgA * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.025, 0.02), dmgCut * 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.145, 0.13), dmgGrime * 0.35);
`;
function battleDamage(m, U) {
  const prev = m.onBeforeCompile, base = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vDmgW;\nvarying vec3 vDmgR;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vDmgW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vDmgR = position;');
    sh.fragmentShader = DMG_GLSL + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + DMG_APPLY)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(roughnessFactor, 0.3, dmgCut), 1.0, dmgGrime * 0.5);');
  };
  m.customProgramCacheKey = () => base + '|dmg';
}

function part(parent, geo, material, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, pos) {
  const o = new THREE.Bone();
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
    // Man of Steel style Kryptonian "hope" glyph: a very wide, shallow diamond shield and an angular,
    // Z-like S with a heavy diagonal centre stroke, thin top/bottom bars and a descending upper serif.
    c.width = 512; c.height = 384;
    const poly = (pts, k = 1, cx = 256, cy = 140) => {
      g.beginPath();
      pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](cx + (x - cx) * k, cy + (y - cy) * k));
      g.closePath(); g.fill();
    };
    const shield = [[4, 76], [100, 6], [412, 6], [508, 76], [256, 380]];
    g.fillStyle = '#6e0b12'; poly(shield);
    g.fillStyle = '#b3141f'; poly(shield, 0.94);
    g.fillStyle = '#e3ab2b'; poly(shield, 0.83);
    g.fillStyle = '#b3141f';
    g.beginPath();
    g.moveTo(402, 44);                                  // top-right tip of the upper bar
    g.lineTo(384, 98);                                  // descending serif point
    g.lineTo(358, 76);
    g.lineTo(178, 76);                                  // thin top bar, inner edge
    g.quadraticCurveTo(150, 78, 152, 100);
    g.lineTo(168, 118);
    g.lineTo(322, 160);                                 // heavy diagonal centre stroke, top edge
    g.quadraticCurveTo(372, 178, 344, 230);             // lower-right bowl, outer
    g.quadraticCurveTo(322, 270, 262, 272);
    g.lineTo(214, 272);                                 // thin bottom bar, tapering to a point
    g.lineTo(232, 248);
    g.lineTo(268, 248);
    g.quadraticCurveTo(298, 246, 298, 226);
    g.lineTo(284, 206);
    g.lineTo(126, 160);                                 // centre stroke, bottom edge
    g.quadraticCurveTo(84, 142, 92, 100);               // upper-left bowl, outer
    g.quadraticCurveTo(104, 46, 170, 44);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ring surfaces keep muscle contours in the skin instead of stacking separate solids.
function contour(rows, y) {
  let i = 0;
  while (i < rows.length - 2 && y > rows[i + 1][0]) i++;
  const a = rows[i], b = rows[i + 1], t = THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  return a.slice(1).map((v, k) => {
    const p = rows[Math.max(0, i - 1)][k + 1], q = b[k + 1], r = rows[Math.min(rows.length - 1, i + 2)][k + 1];
    return THREE.MathUtils.lerp(v, q, t) + t * (1 - t) * ((1 - t) * (v - p - (q - v)) + t * (q - v - (r - q))) * 0.5;
  });
}
const bump = (x, center, width) => Math.exp(-(((x - center) / width) ** 2));
const blend = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
// Hip-crease corrective: how deep (d) the thigh's root compresses around thigh-local height y (width w), fading in
// as the thigh swings a0..a1 rad away from hanging straight down in the hips' frame.
const CREASE = { d: 0.045, y: -0.17, w: 0.11, a0: 1.0, a1: 1.6, k: 1, ki: 1.6 };
// Hip fill (o, thigh) and trochanter (t, trunks) trimmed 0.022 -> 0.008 / 0.012: the hip-to-thigh join bulged out like saddlebags.
const HF = { o: 0.008, yo: -0.13, wo: 0.08, po: 1.2, t: 0.012, ty: -0.01, tw: 0.045, tp: 3 };
// Gluteus maximus cheek (hips space): depth a (x bulk) at |x| = x (width w), peak height y, rising over u, tucking
// under over l into the gluteal fold; one round dome (radial falloff, power p: full top, firm edge) rather than a
// box-shaped product of falloffs. Gluteal dimple: depth d (x bulk) at |x| = dx (width dw), height dy (dh).
// Peach: the peak sat low (y -0.1) on a 6 cm flat shelf that dropped off a cliff into the fold, so the seat read as
// a sagging slab. It is now lifted 1.5 cm, a little smaller and narrower, with a rounder dome (p) and a longer
// underside (l) that curves into the fold; the trunks' cheek fade moved up with it so the thigh's cheek doesn't
// surface through the middle of the trunks.
// Nightwing reference: the cheek projects well past a deeper lumbar curve (a 0.062, peak y -0.08) with a deeper side
// dimple; a shorter underside (l) would crisp the fold but folded the trunk hem in MP poses, so l stays 0.08.
const GL = { a: 0.062, x: 0.068, w: 0.072, y: -0.08, u: 0.095, l: 0.08, p: 2.3, d: 0.015, dx: 0.16, dw: 0.025, dy: -0.09, dh: 0.04 };
// Seat corrective: fades in as the thigh lifts forward a0..a1 rad. With it the cheek (k of GL's dome) and a band of
// the seat (depth d at hips height y, width w) flatten, so a crouch's backside is one smooth line into the hamstrings.
// k 0: the held cheek stays round (k 1 erased it in the guard, whose forward thigh is already 0.77 of the way in).
const SEAT = { a0: 0.5, a1: 1.5, k: 0, d: 0.02, y: -0.05, w: 0.04 };
// Seat hold: (y, z) delta, around the hip joint, that undoes a forward thigh flexion of SEAT.a1 for a vertex with
// thigh weight w (the rest on the hips), blended by m. A = (1 - w) I + w R(a1) is the skinning; the delta is
// m * (A^-1 v - v), so at a1 the backside sits where it hangs and the flexed leg's cheek mirrors the standing one.
const seatHold = (y, z, w, m) => {
  const c = Math.cos(SEAT.a1), s = Math.sin(SEAT.a1), p = 1 - w + w * c, q = w * s, det = p * p + q * q;
  return [m * ((p * y - q * z) / det - y), m * ((q * y + p * z) / det - z)];
};
const seatMask = (x, z) => blend(0.1, 0.5, -z / (Math.hypot(x, z) || 1)); // the back only: the front still folds with the thigh

function surface(rows, sculpt = (p) => p, rings = 64, sides = 48) {
  const positions = [], uv = [], indices = [];
  for (let j = 0; j <= rings; j++) {
    const y = THREE.MathUtils.lerp(rows[0][0], rows[rows.length - 1][0], j / rings);
    const [rx, rz, offset = 0] = contour(rows, y);
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2;
      const p = sculpt(new THREE.Vector3(Math.max(0.0001, rx) * Math.sin(a), y, Math.max(0.0001, rz) * Math.cos(a) + offset), a);
      positions.push(p.x, p.y, p.z); uv.push(i / sides, j / rings);
      if (j < rings && i < sides) {
        const n = j * (sides + 1) + i, next = n + sides + 1;
        indices.push(n, n + 1, next, next, n + 1, next + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  for (let j = 0; j <= rings; j++) {
    const a = j * (sides + 1), b = a + sides;
    const n = new THREE.Vector3().fromBufferAttribute(normals, a).add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
  }
  return geo;
}

export function makeHero(kind) {
  const B = kind === 'batman';
  const suit = mat(B ? 0x414751 : 0x174b9c, 0.82, 0.0);
  const dark = mat(0x10151e, 0.57, 0.06);
  const red = mat(0xa9152b, 0.8);
  const skin = mat(0xdca784, 0.84);
  const yellow = mat(0xd9ac38, 0.48, 0.24);
  const boot = B ? dark : red;
  const root = new THREE.Group();
  const hips = joint(root, [0, 0, 0]);
  const spine = joint(hips, [0, 0.08, 0]);
  const chest = joint(spine, [0, 0.28, 0]);
  // Head sits low on a short, thick neck (jaw overlaps the neck) at a heroic ~1:3 head-to-shoulder ratio.
  const head = joint(chest, [0, B ? 0.415 : 0.41, B ? 0.005 : 0.008]);
  head.scale.setScalar(1.24);
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const oval = (parent, material, pos, scale) => part(parent, sphere, material, pos, scale);
  const skins = [];
  const skinSurface = (parent, geometry, material, weights) => skins.push({ parent, geometry, material, weights });
  const line = (parent, points, radius, material) => part(parent,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 8, false), material);

  // The pecs, sternum, obliques and abdomen are sculpted into one continuous surface.
  // Heavyweight V-taper: wide lats/chest, trapezius slope into a thick neck, tight waist.
  const torsoRows = [[0.035, 0.155, 0.108], [0.13, 0.142, 0.104], [0.23, 0.14, 0.103],
    [0.34, 0.182, 0.12], [0.45, 0.245, 0.142], [0.56, 0.282, 0.154],
    [0.64, 0.272, 0.144], [0.69, 0.228, 0.122], [0.735, 0.122, 0.082],
    [0.78, B ? 0.07 : 0.08, B ? 0.066 : 0.072], [0.835, B ? 0.066 : 0.074, B ? 0.063 : 0.068]];
  const chestDepth = (x, y) => {
    const [rx, rz] = contour(torsoRows, y);
    const base = rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
    // Pecs are broad flat plates, not round domes: a plateau from the sternum out toward the armpit,
    // wedge-shaped in profile (thin under the clavicle, thickest at the bottom) with a squared lower
    // edge that slants up toward the armpit and undercuts sharply.
    const ax = Math.abs(x), edge = 0.505 + 0.3 * Math.max(0, ax - 0.08), top = 0.66 - ax * 0.1;
    const plate = blend(0.004, 0.028, ax) * (1 - blend(0.15, 0.225, ax)) * (0.85 + 0.15 * bump(ax, 0.09, 0.07));
    const wedge = 0.45 + 0.55 * (1 - blend(edge, top, y));
    const pec = 0.04 * plate * wedge * blend(edge - 0.012, edge + 0.004, y) * (1 - blend(top - 0.05, top, y));
    const lineaAlba = -0.007 * bump(x, 0, 0.01) * blend(0.15, 0.2, y) * (1 - blend(0.44, 0.5, y));
    const abs = [0.21, 0.285, 0.36, 0.427].reduce((v, cy) => v + 0.016 * bump(Math.abs(x), 0.047, 0.035) * bump(y, cy, 0.028), 0);
    const sternum = -0.007 * bump(x, 0, 0.017) * bump(y, 0.52, 0.12);
    const clavicle = 0.011 * bump(y, 0.663 - Math.abs(x) * 0.10, 0.013) * bump(Math.abs(x), 0.12, 0.10);
    return base + pec + abs + sternum + clavicle + lineaAlba;
  };
  // Back: the back was a plain ellipse behind a scapula bulge (deepest at the midline at every height). A hero's
  // back reads as two erector spinae columns either side of a sunken spine groove, rising out of the belt and
  // fading up between the shoulder blades; the lats thicken the back's outer corners from the armpit down and
  // in toward the lumbar; the mid / lower trapezius is a low diamond over the upper spine.
  // Shoulder blades: the scapula was one soft round bump that faded into the lats, so the upper back read as a
  // smooth shell. Each blade is now a flat-topped plate with a firm edge (tilted: the inferior angle points down and
  // in toward the spine), carrying the infraspinatus dome in its fossa and the teres major knot at its lower outer
  // corner where it runs up into the armpit, with the scapular spine as a ridge across its top and a rhomboid channel
  // along its inner border, so the blades stand off the back and the lats sweep out from under them.
  const SC = { x: 0.122, y: 0.548, t: 0.33, hw: 0.052, hh: 0.085, p: 5 };
  const blade = (ax, y) => {
    const dx = ax - SC.x, dy = y - SC.y, c = Math.cos(SC.t), s = Math.sin(SC.t);
    const u = (dx * c - dy * s) / SC.hw, v = (dx * s + dy * c) / SC.hh, r = Math.hypot(u, v);
    const plate = 0.010 * Math.exp(-(r ** SC.p));
    const infra = 0.007 * Math.exp(-(Math.hypot((ax - 0.118) / 0.038, (y - 0.548) / 0.045) ** 3));
    const teres = 0.010 * Math.exp(-(Math.hypot((ax - 0.162) / 0.026, (y - 0.488 - 0.6 * (ax - 0.162)) / 0.024) ** 2.5));
    const spineRidge = 0.0035 * bump(y, 0.618 + 0.12 * (ax - 0.07), 0.009) * bump(ax, 0.12, 0.05);
    const rhomboid = -0.005 * bump(ax, 0.06, 0.011) * bump(y, 0.54, 0.055);
    return plate + infra + teres + spineRidge + rhomboid;
  };
  const backDepth = (x, y, a) => {
    const ax = Math.abs(x), c = -Math.cos(a);
    const scap = blade(ax, y) * blend(0.3, 0.7, c);
    const erector = 0.012 * bump(ax, 0.034 + 0.03 * blend(0.2, 0.5, y), 0.021) * blend(0.08, 0.18, y) * (1 - blend(0.28, 0.52, y));
    // lumbar curve: the small of the back sinks in above the belt, so the columns stand in a hollow and the glutes
    // still swell out below it in profile (the columns alone filled the curve in by 1 cm)
    const lumbar = -0.016 * bump(y, 0.21, 0.08) * c;
    const groove = -0.005 * bump(ax, 0, 0.011) * blend(0.05, 0.12, y) * (1 - blend(0.62, 0.7, y));
    const trap = 0.005 * bump(ax, 0, 0.05 + 0.06 * blend(0.45, 0.62, y)) * bump(y, 0.56, 0.08);
    const xl = 0.08 + 0.13 * blend(0.1, 0.5, y); // the lat's outer edge sweeps out from the waist to the armpit
    const lat = 0.012 * bump(ax, xl - 0.035, 0.045) * bump(y, 0.38, 0.13) * blend(0.2, 0.6, c);
    return scap + lumbar + (erector + groove + trap) * blend(0.6, 0.9, c) + lat;
  };
  // 96 sides (was 48, ~3.7 cm apart across the upper back) so the blades, spine groove and columns resolve.
  const torsoGeo = surface(torsoRows, (p, a) => {
    if (Math.cos(a) > 0) p.z = chestDepth(p.x, p.y);
    else p.z -= backDepth(p.x, p.y, a);
    return p;
  }, 96, 96);
  const torsoWeights = (p) => {
    const upper = blend(0.30, 0.49, p.y), lower = blend(0.06, 0.22, p.y);
    return [[hips, (1 - lower) * (1 - upper)], [spine, lower * (1 - upper)], [chest, upper]];
  };
  // The neck shares topology with the torso, with a separate costume/skin material band.
  torsoGeo.clearGroups();
  const neckRing = Math.ceil((0.738 - 0.035) / 0.8 * 96);
  torsoGeo.addGroup(0, neckRing * 96 * 6, 0);
  torsoGeo.addGroup(neckRing * 96 * 6, (96 - neckRing) * 96 * 6, 1);
  skinSurface(hips, torsoGeo, [suit, B ? dark : skin], torsoWeights);
  // Chest emblem (Superman: big chest-spanning shield). It is a copy of the torso's own front triangles lifted 2.5 mm, not a
  // separate grid sampling chestDepth: a finer grid's chords dipped under the torso's coarser ones across the sternum
  // groove, so the suit cut a vertical scar down the middle of both insignias.
  const [ew, eh, ey] = B ? [0.29, 0.145, 0.565] : [0.4, 0.3, 0.545];
  const tp = torsoGeo.attributes.position, tn = torsoGeo.attributes.normal, ti = torsoGeo.index.array;
  const inRect = (i) => tp.getZ(i) > 0 && Math.abs(tp.getX(i)) < ew / 2 + 0.03 && Math.abs(tp.getY(i) - ey) < eh / 2 + 0.03;
  const remap = new Map(), epos = [], enor = [], euv = [], eidx = [];
  for (let k = 0; k < ti.length; k += 3) {
    if (!inRect(ti[k]) || !inRect(ti[k + 1]) || !inRect(ti[k + 2])) continue;
    for (let j = 0; j < 3; j++) {
      const i = ti[k + j];
      if (!remap.has(i)) {
        remap.set(i, epos.length / 3);
        epos.push(tp.getX(i), tp.getY(i), tp.getZ(i) + 0.0025); enor.push(tn.getX(i), tn.getY(i), tn.getZ(i));
        euv.push(tp.getX(i) / ew + 0.5, (tp.getY(i) - ey) / eh + 0.5); // outside 0..1 clamps to the canvas's empty border
      }
      eidx.push(remap.get(i));
    }
  }
  const emblemGeo = new THREE.BufferGeometry();
  emblemGeo.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3));
  emblemGeo.setAttribute('normal', new THREE.Float32BufferAttribute(enor, 3));
  emblemGeo.setAttribute('uv', new THREE.Float32BufferAttribute(euv, 2));
  emblemGeo.setIndex(eidx); emblemGeo.userData.decal = true;
  skinSurface(hips, emblemGeo, new THREE.MeshStandardMaterial({ map: emblemTexture(B ? 'bat' : 's'), alphaTest: 0.3, roughness: 0.75 }), torsoWeights);

  // Trunks are skinned: the leg openings follow the thighs (weights fade in below the belt), so a
  // lifted thigh carries the trunks with it instead of punching suit-coloured patches through them.
  const arms = {}, legs = {};
  // Superman is drawn as a powerhouse (full weight), Batman as a leaner athlete (80%) — legs and hips.
  const bulk = B ? 0.8 : 1;
  // Neo-hero hips: legs this strong need the glutes that drive them. The backside carries two gluteus maximus
  // cheeks, each its own dome centred GL.x out from the midline (so a real cleft runs down between them and each
  // cheek rounds off toward the hip's side), rising out of the lumbar hollow and filling out low, then tucking under
  // at the gluteal fold (a steeper underside, GL.p) into the hamstrings. The gluteus medius widens the hip so the
  // outer thigh sweep grows out of the pelvis instead of out of a narrow brief.
  // Hips-space x / height; the thigh mesh shares the shape below the trunks' hem.
  const cheek = (x, y) => bulk * GL.a * Math.exp(-(Math.hypot((Math.abs(x) - GL.x) / GL.w, (y - GL.y) / (y > GL.y ? GL.u : GL.l)) ** GL.p));
  const medius = y => bulk * 0.008 * bump(y, -0.05, y > -0.05 ? 0.05 : 0.03);
  // Gluteal dimple: the hollow on the side of the seat, behind the trochanter where the gluteus maximus, medius
  // and the top of the IT band meet, so each cheek reads as its own round mass from the side and the rear instead
  // of sloping straight into the hip. Inward along the surface's radial direction (hips space, metres).
  const dimple = (x, y) => bulk * GL.d * bump(Math.abs(x), GL.dx, GL.dw) * bump(y, GL.dy, GL.dh);
  const trunkRows = [[-0.095, 0.05, 0.05], [-0.06, 0.175, 0.106], [0.015, 0.168, 0.114], [0.085, 0.15, 0.106]];
  const trunkGeo = surface(trunkRows, (p, a) => {
    const dm = dimple(p.x, p.y) * blend(0, 0.4, -Math.cos(a));
    p.x -= dm * Math.sin(a); p.z -= dm * Math.cos(a);
    p.z -= cheek(p.x, p.y) * blend(-0.1, 0.5, -Math.cos(a)) * blend(-0.06, 0.01, p.y); // the trunks' hem tucks under the leg's cheek: no ledge at the hem
    p.x += Math.sign(p.x) * medius(p.y) * Math.sin(a) ** 2;
    p.x += Math.sign(p.x) * bulk * HF.t * bump(p.y, HF.ty, HF.tw) * Math.abs(Math.sin(a)) ** HF.tp;
    return p;
  }, 32);
  // Glutes in deep hip flexion: the back of the trunks followed the thigh, so a tuck / crouch / guard dragged
  // the cheeks down under the seat and left the backside flat (radius from the hip joint 13 -> 9 cm). The
  // glutes now stay on the pelvis, and per-side seat correctives (driven by forward thigh lift in applyPose)
  // hold the backside where it hangs (seatHold), minus the cheek's bulge (SEAT.k / d: trimmed flat over the seat).
  const seatBack = p => blend(0.1, 0.7, -p.z / Math.hypot(p.x, p.z)); // how much of the trunks rides the pelvis, not the thigh
  // Thigh weight on the trunks. At the rear-outer side (the upper outer corner of the seat) it now fades out by the
  // hip joint's height (-2 cm) instead of up under the belt (5 cm): above the joint a lifted / swung-out thigh rotates
  // those vertices down and in, and a 50/50 hips/thigh blend there collapsed the trunks into folded, flipped
  // triangles (a jagged scar at the top of the cheek on the kicking side). Front and inner thigh unchanged.
  const trunkLower = p => {
    const r = Math.hypot(p.x, p.z), sf = blend(0.5, 0.9, Math.abs(p.x) / r) * blend(-0.3, 0.3, -p.z / r);
    return (1 - blend(-0.075 - 0.025 * sf, 0.05 - 0.07 * sf, p.y)) * (1 - seatBack(p));
  };
  {
    const P0 = trunkGeo.attributes.position, n = P0.count, dL = new Float32Array(n * 3), dR = new Float32Array(n * 3), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(P0, i);
      const m = seatMask(p.x, p.z), lw = trunkLower(p), l = blend(-0.06, 0.06, p.x);
      if (!m) continue;
      for (const [D, w, sh] of [[dL, lw * l, l], [dR, lw * (1 - l), 1 - l]]) {
        const e = sh * (SEAT.k * cheek(p.x, p.y) + SEAT.d * bump(p.y, SEAT.y, SEAT.w)) * blend(-0.1, 0.5, -p.z / Math.hypot(p.x, p.z));
        const [dy, dz] = seatHold(p.y + 0.04, p.z + e, w, m); // around the hip joint line
        D[i * 3 + 1] = dy; D[i * 3 + 2] = dz + m * e;
      }
    }
    const nrm = d => { // normal deltas so the held seat shades round
      const g = trunkGeo.clone(), p = g.attributes.position.array, N0 = trunkGeo.attributes.normal.array;
      for (let k = 0; k < p.length; k++) p[k] += d[k];
      g.computeVertexNormals();
      return new THREE.Float32BufferAttribute(g.attributes.normal.array.map((x, k) => x - N0[k]), 3);
    };
    trunkGeo.morphAttributes.normal = [dL, dR].map(nrm);
    trunkGeo.morphAttributes.position = [dL, dR].map(d => new THREE.Float32BufferAttribute(d, 3));
    trunkGeo.morphTargetsRelative = true;
    trunkGeo.userData.seat = true;
  }
  skinSurface(hips, trunkGeo,
    B ? dark : red, p => {
      const lower = trunkLower(p), l = blend(-0.06, 0.06, p.x);
      return [[hips, 1 - lower], [legs.L.th, lower * l], [legs.R.th, lower * (1 - l)]];
    });
  part(hips, surface([[0.063, 0.153, 0.108], [0.071, 0.158, 0.113], [0.103, 0.153, 0.11], [0.11, 0.148, 0.105]], p => p, 12), yellow);
  {
    // Belt buckle: a flat bevelled rounded-rectangle plate (Superman's gold oval-cornered buckle,
    // Batman's centre plate) instead of a squashed sphere.
    const bk = new THREE.Shape(), w = 0.03, h = 0.022, r = 0.009;
    bk.moveTo(-w + r, -h); bk.lineTo(w - r, -h); bk.quadraticCurveTo(w, -h, w, -h + r); bk.lineTo(w, h - r);
    bk.quadraticCurveTo(w, h, w - r, h); bk.lineTo(-w + r, h); bk.quadraticCurveTo(-w, h, -w, h - r);
    bk.lineTo(-w, -h + r); bk.quadraticCurveTo(-w, -h, -w + r, -h);
    const buckleGeo = new THREE.ExtrudeGeometry(bk, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003,
      bevelSize: 0.003, bevelSegments: 3, curveSegments: 6 });
    buckleGeo.center();
    part(hips, buckleGeo, yellow, [0, 0.087, 0.117]);
  }
  if (B) {
    // Utility-belt pouches: bevelled capsule-cornered boxes sitting flush on the belt, instead of blobs.
    const pr = new THREE.Shape(), w = 0.021, h = 0.025, r = 0.008;
    pr.moveTo(-w + r, -h); pr.lineTo(w - r, -h); pr.quadraticCurveTo(w, -h, w, -h + r); pr.lineTo(w, h - r);
    pr.quadraticCurveTo(w, h, w - r, h); pr.lineTo(-w + r, h); pr.quadraticCurveTo(-w, h, -w, h - r);
    pr.lineTo(-w, -h + r); pr.quadraticCurveTo(-w, -h, -w + r, -h);
    const pouchGeo = new THREE.ExtrudeGeometry(pr, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004,
      bevelSize: 0.004, bevelSegments: 3, curveSegments: 6 });
    pouchGeo.center();
    for (const s of [-1, 1]) for (const a of [0.55, 0.95, 1.35]) {
      const x = s * Math.sin(a) * 0.158, z = Math.cos(a) * 0.112;
      const n = new THREE.Vector2(x / 0.158 ** 2, z / 0.112 ** 2).normalize();
      part(hips, pouchGeo, yellow, [x + n.x * 0.009, 0.084, z + n.y * 0.009], [1, 1, 1], [0, Math.atan2(n.x, n.y), 0]);
    }
  }

  // Planar jaw, cheekbones, recessed temples and an integrated nose replace the egg head.
  // Superman's face has a broad, square jaw rather than an egg-shaped head.
  const faceRows = B ? [[0.002, 0.024, 0.026, 0.032], [0.019, 0.052, 0.052, 0.023],
    [0.047, 0.071, 0.066, 0.01], [0.082, 0.079, 0.071, 0.003],
    [0.115, 0.087, 0.077, 0], [0.149, 0.083, 0.077, -0.002],
    [0.182, 0.084, 0.077, -0.006], [0.214, 0.071, 0.065, -0.009],
    [0.237, 0.037, 0.036, -0.009], [0.245, 0.0001, 0.0001, -0.009]]
    : [[0.004, 0.036, 0.03, 0.03], [0.02, 0.063, 0.056, 0.02],
      [0.047, 0.08, 0.068, 0.008], [0.082, 0.084, 0.072, 0.002],
      [0.115, 0.085, 0.076, 0], [0.149, 0.081, 0.077, -0.002],
      [0.182, 0.079, 0.076, -0.006], [0.214, 0.068, 0.064, -0.009],
      [0.237, 0.036, 0.035, -0.009], [0.245, 0.0001, 0.0001, -0.009]];
  const hairMask = [];
  const faceSculpt = (p, a) => {
    const front = Math.max(0, Math.cos(a)), f5 = front ** 5;
    p.x = Math.sign(p.x) * Math.pow(Math.abs(Math.sin(a)), 0.83) * contour(faceRows, p.y)[0];
    if (B) {
      p.z += f5 * (0.025 * bump(p.x, 0, 0.014) * bump(p.y, 0.112, 0.032)
        + 0.012 * bump(p.y, 0.032, 0.023) - 0.008 * bump(p.y, 0.068, 0.012));
      p.z -= 0.008 * bump(Math.abs(p.x), 0.034, 0.021) * bump(p.y, 0.144, 0.014) * front;
      return p;
    }
    // Superman: everything on the face projects forward (no dents). Strong brow ridge, straight
    // nose bridge, high cheekbones, full lips and a jutting square chin with a cleft.
    const c = Math.cos(a), line = c > 0 ? 0.122 + 0.08 * c ** 2 - 0.006 * c ** 8 : 0.122 + 0.045 * c; // high forehead, slight widow-peak-free arch
    const hairT = blend(line - 0.004, line + 0.004, p.y), isHair = hairT > 0;
    hairMask.push(hairT); // soft 0..1 weight so the hairline is a clean gradient, not a stair-stepped edge
    const ax = Math.abs(p.x);
    p.z += f5 * (
      0.024 * bump(p.x, 0, 0.012) * bump(p.y, 0.118, 0.03)                 // nose
      + 0.009 * bump(p.y, 0.157, 0.012) * bump(ax, 0.03, 0.045)            // brow ridge
      + 0.016 * bump(p.y, 0.028, 0.02) * bump(p.x, 0, 0.04)                 // jutting chin
      - 0.003 * bump(p.x, 0, 0.005) * bump(p.y, 0.022, 0.012)               // chin cleft
      + 0.004 * bump(p.y, 0.062, 0.012) * bump(p.x, 0, 0.022));             // lips
    p.z += front ** 2 * 0.007 * bump(ax, 0.052, 0.018) * bump(p.y, 0.112, 0.016); // cheekbones
    p.z -= front ** 3 * 0.0035 * bump(ax, 0.034, 0.016) * bump(p.y, 0.141, 0.01); // shallow eye sockets
    if (isHair) {
      // Real hair volume instead of a painted cap: fuller on top, a swept-up pompadour at the front,
      // a side part, and fine combed ridges so it catches light like slicked hair.
      const up = blend(line, line + 0.05, p.y);
      const comb = 0.0025 * Math.sin(a * 22 + p.y * 40) * up;
      const k = 1 + hairT * (0.02 + 0.045 * up) + comb;
      p.x *= k; p.z *= k;
      p.z += 0.016 * front ** 2 * bump(p.y, 0.228, 0.018);                 // pompadour pushed forward
      p.y += 0.014 * front ** 1.5 * bump(p.y, 0.232, 0.025) * hairT;        // ...and lifted
      p.y += 0.008 * up;                                                     // fuller crown
      p.y -= 0.004 * bump(p.x, -0.032, 0.005) * up;                          // side part groove
    }
    return p;
    return p;
  };
  const faceGeo = surface(faceRows, faceSculpt, 72);
  // Front-surface depth of the sculpted face at (x, y): facial features are seated on it rather than
  // placed at fixed depths that leave them floating in front of (or buried in) the face.
  const fp = faceGeo.attributes.position;
  const faceZ = (x, y) => {
    let z = -1, r = 0.004;
    while (z < 0 && r < 0.02) {
      for (let i = 0; i < fp.count; i++) if (Math.hypot(fp.getX(i) - x, fp.getY(i) - y) < r) z = Math.max(z, fp.getZ(i));
      r *= 1.6;
    }
    return z;
  };
  const onFace = (lift) => ([x, y]) => [x, y, faceZ(x, y) + lift];
  if (B) {
    // Color the exposed jaw on the cowl surface; there is no overlapping mouth patch.
    const colors = [], pos = faceGeo.attributes.position;
    const cowlColor = dark.color, skinColor = skin.color;
    for (let i = 0; i < pos.count; i++) {
      // Soft-edged jaw opening (smooth 0..1 mask) so the cowl edge is a clean line, not stair-stepped facets.
      const x = Math.abs(pos.getX(i)), y = pos.getY(i), z = pos.getZ(i);
      const jaw = (1 - blend(0.077, 0.087, y)) * blend(0.04, 0.05, z) * (1 - blend(0.056, 0.068, x));
      const c = cowlColor.clone().lerp(skinColor, jaw); colors.push(c.r, c.g, c.b);
    }
    faceGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    part(head, faceGeo, mat(0xffffff, 0.7, 0, { vertexColors: true }));
    for (const s of [-1, 1]) {
      // Short, sharp modern cowl ears (~7 cm above the crown), not tall devil horns.
      const ear = surface([[0.19, 0.025, 0.022], [0.225, 0.017, 0.013], [0.27, 0.008, 0.006], [0.305, 0.0001, 0.0001]], p => { p.x += s * (0.064 + (p.y - 0.19) * 0.045); return p; }, 32, 24);
      part(head, ear, dark, [0, 0, -0.017]);
    }
  } else {
    const hair = mat(0x0c1018, 0.5);
    const colors = [];
    const hc = new THREE.Color();
    for (const h of hairMask) { hc.copy(skin.color).lerp(hair.color, h); colors.push(hc.r, hc.g, hc.b); }
    faceGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    part(head, faceGeo, mat(0xffffff, 0.75, 0, { vertexColors: true }));
    // Spit curl: each control point is dropped onto the sculpted forehead/pompadour surface (it used to
    // float ~1 cm in front of the head after the hair gained volume).
    line(head, [[-0.027, 0.21], [0.003, 0.2], [0.017, 0.184], [0.008, 0.169], [-0.002, 0.174]].map(onFace(0.0025)), 0.004, hair);
    for (const s of [-1, 1]) oval(head, skin, [s * 0.079, 0.126, -0.006], [0.008, 0.024, 0.015]); // ears tucked to the skull
  }
  // Expressive face rig (driven by setFace): each eye (white + iris + pupil) sits in a lid group that
  // squeezes shut vertically, each brow pivots about its middle (inner end down = scowl, up = pain), and
  // the mouth is a dark cavity + upper teeth behind the lip line that the jaw drops open.
  const eyes = [], lids = [], brows = [];
  const brow = B ? dark : mat(0x241c1a, 0.9);
  for (const s of [-1, 1]) {
    const lid = new THREE.Group(); lid.position.set(s * 0.034, 0.143, faceZ(s * 0.034, 0.143) - 0.002); head.add(lid); lids.push(lid);
    eyes.push(oval(lid, new THREE.MeshStandardMaterial({ color: B ? 0xe4ecf2 : 0xe1ddd4, roughness: 0.6, emissive: 0 }),
      [0, 0, 0], [0.018, 0.006, 0.006])); // seated in the socket
    if (!B) {
      oval(lid, mat(0x416b88), [0, 0, 0.0045], [0.0045, 0.005, 0.002]);
      oval(lid, dark, [0, 0, 0.0062], [0.002, 0.003, 0.001]);
    }
    const bp = [s * 0.033, 0.159, faceZ(s * 0.033, 0.159)];
    const bg = new THREE.Group(); bg.position.set(...bp); head.add(bg); brows.push({ g: bg, s, y: bp[1] });
    line(bg, [[s * 0.014, 0.156], [s * 0.032, 0.16], [s * 0.053, 0.157]].map(onFace(B ? 0.002 : 0.0015)).map(p => [p[0] - bp[0], p[1] - bp[1], p[2] - bp[2]]), B ? 0.006 : 0.005, brow);
  }
  const mz = faceZ(0, 0.056);
  const cavity = oval(head, mat(0x1a0807, 0.95), [0, 0.06, mz - 0.0012], [0.012, 0.0004, 0.0024]);
  const teeth = oval(head, mat(0xe6e0d2, 0.5), [0, 0.0598, mz - 0.0006], [0.0095, 0.0004, 0.0022]);
  cavity.visible = teeth.visible = false;
  // Closed, firm mouth: a thin line close to the lip colour so it reads as set lips, not an open shout.
  line(head, [[-0.016, 0.0605], [0, 0.0615], [0.016, 0.0605]].map(onFace(0.0004)),
    B ? 0.0016 : 0.0011, mat(B ? 0x754b43 : 0x9a5f52, 0.9));
  const faceRig = { lids, brows, cavity, teeth, blinks: !B };

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint(chest, [s * 0.262, 0.232, 0]);
    const el = joint(sh, [0, -0.32, 0]);
    const hand = joint(el, [0, -0.3, 0]);
    hand.scale.setScalar(1.18); // big readable fists
    const armRows = [[-0.63, 0.038, 0.036], [-0.57, 0.046, 0.042], [-0.49, 0.068, 0.057],
      [-0.41, 0.082, 0.066], [-0.32, 0.058, 0.057], [-0.25, 0.075, 0.077],
      [-0.16, 0.092, 0.09], [-0.075, 0.09, 0.088], [0.0, 0.112, 0.1],
      [0.045, 0.092, 0.08], [0.075, 0.001, 0.001]]; // deltoid cap tucked under the trapezius slope, not a ball on top
    const armGeo = surface(armRows, (p, a) => {
      p.z += 0.02 * bump(p.y, -0.17, 0.065) * Math.cos(a) ** 3; // biceps peak
      p.x += s * 0.022 * bump(p.y, 0.0, 0.06);                                  // deltoid cap
      p.z -= 0.016 * bump(p.y, -0.17, 0.07) * Math.max(0, -Math.cos(a)) ** 2; // triceps horseshoe
      p.x += s * 0.045 * bump(p.y, -0.12, 0.05) * Math.max(0, -s * Math.sin(a)) ** 2; // armpit: inner arm tapers into the lats
      const r = Math.hypot(p.x, p.z), dip = 1 - 0.07 * bump(p.y, -0.075, 0.016);    // deltoid insertion groove
      if (r > 1e-6) { p.x *= dip; p.z *= dip; }
      return p;
    }, 80, 40);
    armGeo.userData.limb = true;
    armGeo.clearGroups();
    const cuffRing = Math.floor((-0.40 + 0.63) / 0.731 * 80);
    armGeo.addGroup(0, cuffRing * 40 * 6, B ? 1 : 0);
    armGeo.addGroup(cuffRing * 40 * 6, (80 - cuffRing) * 40 * 6, 0);
    skinSurface(sh, armGeo, [suit, dark], p => {
      const lower = 1 - blend(-0.38, -0.26, p.y), shoulder = blend(-0.04, 0.06, p.y) * 0.8; // deltoid top rides with the chest (no hump when the arm lifts)
      return [[el, lower], [sh, (1 - lower) * (1 - shoulder)], [chest, (1 - lower) * shoulder]];
    });
    if (B) {
      // Gauntlet fins: thin swept-back blades (base on the forearm, tip raked toward the elbow).
      const fin = new THREE.Shape();
      fin.moveTo(0, 0); fin.lineTo(0, -0.05); fin.quadraticCurveTo(0.016, -0.026, 0.034, 0.012);
      fin.quadraticCurveTo(0.014, 0.004, 0, 0);
      const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0012,
        bevelSize: 0.0012, bevelSegments: 2, curveSegments: 10 });
      finGeo.translate(0, 0, -0.0015);
      for (let k = 0; k < 3; k++)
        part(el, finGeo, dark, [s * 0.058, -0.1 - k * 0.045, -0.012], [1, 1, 1], [0, s > 0 ? 0 : Math.PI, 0]);
    }
    const handMat = B ? dark : skin;
    // One continuous, squarish fist instead of a palm with eight loose capsules (which read as a bunch of
    // grapes). Palm side is +z, the punching face is -y. The curled fingers are carved into the skin:
    // grooves between them, a crease where the fingertips tuck into the palm, and four knuckle ridges
    // along the back edge. The thumb is one tapered digit lying across the index and middle fingers.
    const fistRows = [[-0.118, 0.001, 0.001, 0.02], [-0.113, 0.034, 0.03, 0.021], [-0.104, 0.045, 0.042, 0.022],
      [-0.085, 0.047, 0.044, 0.022], [-0.06, 0.046, 0.04, 0.016], [-0.035, 0.044, 0.031, 0.006],
      [0.005, 0.035, 0.03, 0], [0.016, 0.001, 0.001, 0]];
    const knuckleX = [-1.5, -0.5, 0.5, 1.5].map(k => k * 0.0215);
    const fistGeo = surface(fistRows, (p, a) => {
      const [rx, rz, off] = contour(fistRows, p.y), sn = Math.sin(a), cs = Math.cos(a);
      const sq = (v) => Math.sign(v) * Math.abs(v) ** 0.55; // superellipse: boxy fist, rounded corners
      p.x = rx * sq(sn); p.z = off + rz * sq(cs);
      const fingers = 1 - blend(-0.068, -0.056, p.y);
      const groove = [-0.0215, 0, 0.0215].reduce((v, b) => v + bump(p.x, b, 0.004), 0);
      p.z -= 0.005 * groove * fingers * Math.max(0, cs);                       // gaps between curled fingers
      p.y += 0.004 * groove * blend(-0.1, -0.114, p.y);                          // ...continuing over the punch face
      p.z -= 0.007 * bump(p.y, -0.062, 0.005) * Math.max(0, cs) ** 2;            // fingertips tucked into the palm
      const ridge = knuckleX.reduce((v, b) => v + bump(p.x, b, 0.008), 0);
      p.z -= 0.006 * ridge * bump(p.y, -0.1, 0.011) * Math.max(0, -cs);          // knuckles on the back edge
      // Second knuckle row: the middle-finger joints (PIP) bulge at the corner where the flat punch face turns
      // into the palm side, one rounded knob per finger between the grooves.
      const pip = knuckleX.reduce((v, b) => v + bump(p.x, b, 0.0075), 0) * bump(p.y, -0.107, 0.008) * Math.max(0, cs) ** 2;
      p.z += 0.0025 * pip; p.y -= 0.0025 * pip;
      // Clenched extensor tendons fanning from the wrist to each back knuckle (pinky's the faintest).
      const ten = knuckleX.reduce((v, b) => { const u = THREE.MathUtils.clamp(p.y / -0.088, 0, 1);
        return v + (s * b < -0.03 ? 0.7 : 1) * bump(p.x, b * (0.35 + 0.65 * u), 0.0042) * bump(u, 0.6, 0.32); }, 0);
      p.z -= 0.0016 * ten * Math.max(0, -cs) ** 2;
      // First dorsal interosseous: the web muscle between the thumb and index metacarpals bunches into a mound
      // on the back / thumb-side corner of a clenched fist.
      const fdi = bump(p.y, -0.048, 0.016) * Math.max(0, s * sn) ** 2 * (1 - blend(-0.3, 0.4, cs));
      p.x += s * 0.0035 * fdi; p.z -= 0.001 * fdi;
      p.y += 0.006 * blend(0.0, 0.045, -s * p.x) * fingers;                      // pinky side shorter than the index side
      return p;
    }, 48, 72);
    // The sculpted fist and an articulated open hand share the hand bone; shapeHand shows one or the other.
    const fistG = new THREE.Group(), openG = new THREE.Group();
    hand.add(fistG, openG); openG.visible = false;
    part(fistG, fistGeo, handMat);
    // Thumb on the lateral (+s) side: with the palm at +z it used to sit medially, a mirror-image hand on each arm.
    oval(fistG, handMat, [s * 0.036, -0.045, 0.026], [0.015, 0.026, 0.02]);    // thenar pad at the thumb base
    line(fistG, [[s * 0.044, -0.045, 0.03], [s * 0.04, -0.072, 0.058], [s * 0.016, -0.084, 0.07],
      [-s * 0.008, -0.086, 0.068]], 0.0105, handMat);                         // thumb across the fingers
    oval(fistG, handMat, [s * 0.0433, -0.072, 0.0603], [0.009, 0.009, 0.009]); // thumb MCP knuckle (~3 mm proud, out of the fist)
    oval(fistG, handMat, [-s * 0.008, -0.086, 0.068], [0.0105, 0.0105, 0.0105]); // rounded thumb tip
    // Superman's bare hands get fingernails (Batman's are gloved): thin, slightly glossy plates proud of the skin by ~1 mm.
    const nail = B ? null : mat(0xe9c2ab, 0.42);
    if (nail) part(fistG, sphere, nail, [-s * 0.001, -0.0889, 0.0781], [0.0075, 0.0068, 0.0017], [0.357, 0, 0]); // thumbnail, facing out of the fist
    // Open hand for palm strikes, grips, claps and limp KO hands: a flat, boxy palm (thicker at the heel,
    // knuckle line slanting up to the pinky) with four three-jointed fingers and a three-segment thumb.
    const palmRows = [[-0.093, 0.001, 0.001, 0], [-0.089, 0.03, 0.011, 0], [-0.08, 0.042, 0.015, 0], [-0.045, 0.043, 0.017, 0.001],
      [-0.012, 0.04, 0.019, 0.002], [0.008, 0.033, 0.016, 0], [0.016, 0.001, 0.001, 0]];
    // index (thumb side) .. pinky: x, knuckle height, length scale, radius
    const FINGERS = [[0.0315, -0.084, 0.93, 0.0098], [0.0105, -0.087, 1, 0.0098], [-0.0105, -0.084, 0.96, 0.0092], [-0.0315, -0.077, 0.78, 0.0082]];
    const palmGeo = surface(palmRows, (p, a) => {
      const [rx, rz, off] = contour(palmRows, p.y), sq = (v) => Math.sign(v) * Math.abs(v) ** 0.6;
      p.x = rx * sq(Math.sin(a)); p.z = off + rz * sq(Math.cos(a));
      // Wrist: the flat palm met the round forearm end (7.6 x 7.2 cm) at 4.4 cm deep, leaving the forearm's rim
      // 1-1.6 cm proud of the open hand's front and back. The heel now rounds into the wrist (just over the rim,
      // just inside the forearm above it; round, so wrist twist doesn't matter) and flattens into the palm below.
      const wr = blend(-0.024, -0.009, p.y), wk = Math.min(1, rx / 0.033), wy = 0.08 * (p.y + 0.002);
      p.x += wr * (wk * (0.0335 - wy) * Math.sin(a) - p.x); p.z += wr * (wk * (0.0315 - wy) * Math.cos(a) - p.z);
      p.y += 0.008 * blend(0.0, 0.04, -s * p.x) * blend(-0.05, -0.08, p.y);  // pinky side of the knuckle line sits higher
      // Knuckles: the four metacarpal heads stand out on the back of the hand just above each finger, along the
      // slanted knuckle line; the smooth back of the open hand read as a mitten.
      const kn = FINGERS.reduce((v, [x, y]) => v + bump(p.x, s * x, 0.0062) * bump(p.y, y + 0.007, 0.009), 0);
      p.z -= 0.005 * kn * Math.max(0, -Math.cos(a));
      // Extensor tendons: four cords fan out from the middle of the wrist to the knuckles across the back of the
      // hand (pinky's the faintest), fading in above the wrist and merging into each knuckle.
      const ten = FINGERS.reduce((v, [x, y], k) => { const u = THREE.MathUtils.clamp(p.y / (y + 0.012), 0, 1);
        return v + (k === 3 ? 0.7 : 1) * bump(p.x, s * x * (0.35 + 0.65 * u), 0.0042) * bump(u, 0.6, 0.32); }, 0);
      p.z -= 0.0013 * ten * Math.max(0, -Math.cos(a)) ** 2;
      const fdi = bump(p.y, -0.045, 0.016) * Math.max(0, s * Math.sin(a)) ** 2 * (1 - blend(-0.3, 0.4, Math.cos(a)));
      p.x += s * 0.003 * fdi; p.z -= 0.0008 * fdi;                          // first dorsal interosseous (thumb web)
      p.z += 0.004 * bump(p.y, -0.02, 0.02) * Math.max(0, Math.cos(a)) * (1 - blend(-0.01, 0.03, s * p.x)); // hypothenar heel
      p.z -= 0.002 * bump(p.y, -0.05, 0.016) * bump(p.x, 0, 0.014) * Math.max(0, Math.cos(a)) ** 2; // palm hollow between the pads
      // Palmar pads: a fleshy mound under each finger base on the palm side, lobed (dipping at the finger webs)
      // and falling off into the palm hollow below them.
      const pad = FINGERS.reduce((v, [x, y]) => v + bump(p.x, s * x, 0.0085) * bump(p.y, y + 0.011, 0.0075), 0);
      p.z += 0.0022 * pad * Math.max(0, Math.cos(a)) ** 2;
      return p;
    }, 64, 72);
    // Near closed, shapeHand stretches the open hand to the fist's size (FIST_FIT); this morph target (driven
    // with the stretch) undoes it at the wrist, so the heel stays the forearm's size instead of bulging out of it.
    const wp = palmGeo.attributes.position, wd = new Float32Array(wp.count * 3);
    for (let i = 0; i < wp.count * 3; i++) wd[i] = blend(-0.024, -0.009, wp.getY(Math.floor(i / 3))) * wp.array[i] * (1 / (1 + FIST_FIT[i % 3]) - 1);
    palmGeo.morphAttributes.position = [new THREE.Float32BufferAttribute(wd, 3)]; palmGeo.morphTargetsRelative = true;
    part(openG, palmGeo, handMat);
    oval(openG, handMat, [s * 0.028, -0.03, 0.012], [0.017, 0.03, 0.014]); // thenar pad
    // Finger segments were plain capsules (sausages). Each phalanx now has a slimmer shaft, a knuckle on the back
    // of its head (kn: the PIP / DIP joints stand proud when the finger bends), a little sideways flare at the
    // joint condyles, and a fleshy pad on the palm side (pad; the fingertip pulp is the fullest). n = back dir.
    const seg = (r, L, kn = 0, pad = 0.08, n = { x: 0, z: -1 }) => {
      const pts = [], q = 6;
      for (let k = 0; k <= q; k++) { const t = (k / q - 1) * Math.PI / 2; pts.push(new THREE.Vector2(r * Math.cos(t), -L + r * Math.sin(t))); }
      for (let k = 1; k < 6; k++) pts.push(new THREE.Vector2(r, -L + k / 6 * L));
      for (let k = 0; k <= q; k++) { const t = k / q * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-5, r * Math.cos(t)), r * Math.sin(t))); }
      const geo = new THREE.LatheGeometry(pts, 14), P = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const rad = Math.hypot(v.x, v.z); if (rad < 1e-6) continue;
        const palm = -(v.x * n.x + v.z * n.z) / rad, head = bump(v.y, -L, 0.5 * r); // +1 palm side, -1 back
        const sc = 1 - 0.06 * bump(v.y, -L / 2, 0.3 * L) * (kn > 0) + 0.05 * head * (kn > 0) * (1 - palm * palm)
          + kn * head * Math.max(0, -palm) ** 1.5 + pad * bump(v.y, -L * (kn > 0 ? 0.5 : 0.55), 0.4 * L) * Math.max(0, palm) ** 2;
        P.setXYZ(i, v.x * sc, v.y, v.z * sc);
      }
      geo.computeVertexNormals();
      const N = geo.attributes.normal, m = pts.length, a = new THREE.Vector3(), b = new THREE.Vector3();
      for (let j = 0; j < m; j++) {                                            // weld the lathe seam's normals
        a.fromBufferAttribute(N, j).add(b.fromBufferAttribute(N, 14 * m + j)).normalize();
        N.setXYZ(j, a.x, a.y, a.z); N.setXYZ(14 * m + j, a.x, a.y, a.z);
      }
      return geo;
    };
    // nails on the backs of the fingertips and the thumb: over the distal half of the last segment
    const addNail = (parent, r, L, n) => nail && part(parent, sphere, nail, [n.x * r * 0.93, -L * 0.6, n.z * r * 0.93],
      [r * 0.72, L * 0.42, 0.0017], [0, Math.atan2(n.x, n.z), 0]);
    const fingers = [];
    for (const [fx, fy, fl, fr] of FINGERS) {
      const L = [0.042, 0.027, 0.02].map(v => v * fl);
      const mcp = new THREE.Group(); mcp.position.set(s * fx, fy, 0); openG.add(mcp);
      part(mcp, seg(fr, L[0], 0.14), handMat);
      const pip = new THREE.Group(); pip.position.y = -L[0]; mcp.add(pip);
      part(pip, seg(fr * 0.93, L[1], 0.1), handMat);
      const dip = new THREE.Group(); dip.position.y = -L[1]; pip.add(dip);
      part(dip, seg(fr * 0.86, L[2], 0, 0.14), handMat);
      addNail(dip, fr * 0.86, L[2], { x: 0, z: -1 });                      // back of the hand is -z
      const tip = new THREE.Object3D(); tip.position.y = -L[2]; dip.add(tip);
      fingers.push({ mcp, pip, dip, tip, spread: s * fx * 3.2 });
    }
    const thumbL = [0.036, 0.032, 0.026], thumb = [0.0118, 0.0106, 0.0096].map((r, k) =>
      part(openG, seg(r, thumbL[k], 0, k === 2 ? 0.12 : 0.05, { x: s * 0.6, z: -0.8 }), handMat));
    addNail(thumb[2], 0.0096, thumbL[2], { x: s * 0.6, z: -0.8 });        // thumbnail faces out to the side and back
    const thumbTip = new THREE.Object3D(); openG.add(thumbTip);
    arms[side] = { sh, el, hand, s, swd: null, grip: { fistG, openG, fingers, thumb, thumbL, thumbTip, tips: [thumbTip, ...fingers.map(f => f.tip)], o: -1 } };

    const th = joint(hips, [s * 0.1, -0.04, 0]);
    const kn = joint(th, [0, -0.46, 0]);
    const an = joint(kn, [0, -0.46, 0]);
    // Athletic leg: thick thigh tapering hard into a narrow knee, a high calf peak set to the back,
    // and a slim ankle. The [y, rx, rz, zOffset] offset pushes the calf behind the shin.
    // Hero legs: the mid-thigh and calf get extra mass on top of the athletic base. Superman is
    // drawn as a powerhouse (full weight), Batman as a leaner athlete (80%). The hip line (trunks)
    // and the knee / ankle stay as they were so the joints keep reading narrow.
    const legRows = [[-0.94, 0.033, 0.036, 0.004], [-0.87, 0.036, 0.04, 0.0], [-0.78, 0.05, 0.056, -0.01],
      [-0.68, 0.063, 0.068, -0.016], [-0.59, 0.06, 0.06, -0.01], [-0.5, 0.05, 0.05, 0.002],
      [-0.44, 0.054, 0.056, 0.006], [-0.34, 0.074, 0.078, 0.006], [-0.2, 0.092, 0.094, 0.002],
      [-0.06, 0.102, 0.1, 0], [0.04, 0.09, 0.09, 0], [0.09, 0.001, 0.001, 0]].map(([y, rx, rz, o]) => {
      const thigh = 0.012 * bump(y, -0.27, 0.1), calf = 0.008 * bump(y, -0.68, 0.06);
      return [y, rx + bulk * (thigh + calf), rz + bulk * (thigh + calf * 1.2), o - bulk * calf * 0.6];
    });
    const adductor = (y, a) => bulk * 0.009 * bump(y, -0.19, 0.08) * bump(Math.atan2(Math.sin(a + s * 0.8), Math.cos(a + s * 0.8)), 0, 0.5) * Math.max(0, Math.cos(a));
    // Tensor fasciae latae: the hip flexor's knot on the front-outer hip, between the sartorius' start and the top
    // of the IT band, that rounds the corner from the hip line into the quads (normal displacement, metres).
    const tfl = (y, a) => bulk * 0.005 * bump(y, -0.13, 0.05) * bump(Math.atan2(Math.sin(a - s * 1.15), Math.cos(a - s * 1.15)), 0, 0.35);
    const hipFill = (y, a) => bulk * HF.o * bump(y, HF.yo, HF.wo) * Math.max(0, s * Math.sin(a)) ** HF.po;
    const legGeo = surface(legRows, (p, a) => {
      p.x += s * 0.008 * bump(p.y, -0.2, 0.15);
      p.x += s * 0.014 * bump(p.y, -0.26, 0.09) * Math.max(0, s * Math.sin(a)) ** 1.5; // outer-quad sweep below the hip
      p.z += 0.014 * bump(p.y, -0.27, 0.1) * Math.max(0, Math.cos(a)); // quad sweep
      p.z += bulk * 0.008 * bump(p.y, -0.24, 0.08) * Math.max(0, Math.cos(a)) ** 3; // rectus femoris ridge down the front
      p.x -= s * 0.01 * bump(p.y, -0.42, 0.04) * Math.max(0, Math.cos(a)); // teardrop vastus
      p.x -= s * bulk * 0.008 * bump(p.y, -0.4, 0.05) * Math.max(0, -s * Math.sin(a)) ** 1.5; // vastus medialis bulge, inner side above the knee
      p.z -= 0.007 * bump(p.y, -0.3, 0.1) * Math.max(0, -Math.cos(a)) ** 2; // hamstrings round out the back of the thigh
      // Calf diamond: the inner (medial) gastrocnemius head sits lower and fuller than the outer one.
      const back = Math.max(0, -Math.cos(a)) ** 1.5;
      p.z -= bulk * 0.006 * back * (bump(p.y, -0.66, 0.05) * Math.max(0, -s * Math.sin(a)) + bump(p.y, -0.63, 0.04) * Math.max(0, s * Math.sin(a)));
      p.z += 0.005 * bump(p.y, -0.49, 0.02) * Math.max(0, Math.cos(a)) ** 4; // kneecap
      // Neo-hero legs carry the upper body: thighs ~1.25x and calves ~0.9x the biceps' girth (were 1.0x / 0.75x,
      // "skipped leg day"). The inner thighs already meet at the midline, so the mass goes where real legs carry
      // it: the vastus lateralis sweeps out past the hip line, the quads push forward, the hamstrings round out
      // the back, and both gastrocnemius heads flare out of the boot.
      const out = Math.max(0, s * Math.sin(a)), inn = Math.max(0, -s * Math.sin(a)), fr = Math.max(0, Math.cos(a)), bk = Math.max(0, -Math.cos(a));
      p.x += s * bulk * 0.036 * bump(p.y, -0.27, 0.085) * out ** 1.2;     // outer quad sweep
      p.z += bulk * 0.032 * bump(p.y, -0.25, 0.09) * fr ** 1.5;         // quads
      p.z -= bulk * 0.028 * bump(p.y, -0.28, 0.09) * bk ** 1.5;         // hamstrings
      p.x -= s * bulk * 0.007 * bump(p.y, -0.34, 0.04) * inn ** 1.5;    // adductors / vastus medialis, where the thighs part
      p.x += s * bulk * 0.017 * bump(p.y, -0.67, 0.06) * out ** 1.5;    // outer calf head
      p.x -= s * bulk * 0.018 * bump(p.y, -0.7, 0.06) * inn ** 1.5;     // inner calf head, lower and fuller
      p.z -= bulk * 0.018 * bump(p.y, -0.68, 0.06) * bk ** 1.5;         // calf peak
      p.z += bulk * 0.004 * bump(p.y, -0.68, 0.08) * fr ** 2;           // tibialis
      p.z -= cheek(p.x + s * 0.1, p.y - 0.04) * blend(-0.1, 0.5, -Math.cos(a)) + bulk * 0.01 * bump(p.y, 0.01, 0.035) * bk ** 2;  // gluteus maximus below the trunks' hem, down to the fold (plus a fill at the thigh's back-top that bridges up to the trunks)
      p.x += s * medius(p.y - 0.04) * out ** 2;                         // gluteus medius / trochanter carries the hip line down
      const dm = dimple(p.x + s * 0.1, p.y - 0.04) * blend(0, 0.4, bk);  // gluteal dimple on the side of the seat
      p.x -= dm * Math.sin(a); p.z -= dm * Math.cos(a);
      const hf = hipFill(p.y, a);
      p.x += hf * Math.sin(a); p.z += hf * Math.cos(a);
      // Adductors: the inner thigh's mass sits front-inner, high, medial to the sartorius. Forward only, so the
      // inner edge stays at the midline (thighs already meet there).
      p.z += adductor(p.y, a);
      const tf = tfl(p.y, a);
      p.x += tf * Math.sin(a); p.z += tf * Math.cos(a);
      // Sartorius: the long strap from the front of the hip bone to the inside of the knee. Its edge is the
      // diagonal line that splits the quads from the inner thigh (the comic-book "teardrop" frame).
      const t = (-0.08 - p.y) / 0.36;
      if (t > 0 && t < 1) {
        const as = s * (0.6 - 2.2 * t), d = Math.atan2(Math.sin(a - as), Math.cos(a - as));
        const g = bulk * 0.004 * Math.sin(Math.PI * t) ** 0.7 * bump(d, 0, 0.2);
        p.x -= g * Math.sin(a); p.z -= g * Math.cos(a);
      }
      // Iliotibial band: the flat strip down the outside of the thigh, from the trochanter to just behind the
      // outer knee, splits the vastus lateralis sweep from the hamstrings (frames the quads from the outside).
      const ti = (-0.12 - p.y) / 0.34;
      if (ti > 0 && ti < 1) {
        const as = s * (1.7 + 0.25 * ti), d = Math.atan2(Math.sin(a - as), Math.cos(a - as));
        const g = bulk * 0.0035 * Math.sin(Math.PI * ti) ** 0.7 * bump(d, 0, 0.2);
        p.x -= g * Math.sin(a); p.z -= g * Math.cos(a);
      }
      // Ankle bones (the ankle was a plain round post): the inner malleolus sits higher and a little forward,
      // the outer one lower and further back, with the Achilles tendon standing off the back between hollows.
      for (const [y0, a0, h] of [[-0.905, -s * 1.4, 0.006], [-0.917, s * 1.85, 0.005], [-0.885, s * 2.55, -0.004], [-0.885, -s * 2.55, -0.004]]) {
        const g = h * bump(p.y, y0, h > 0 ? 0.011 : 0.025) * bump(Math.atan2(Math.sin(a - a0), Math.cos(a - a0)), 0, h > 0 ? 0.5 : 0.3);
        p.x += g * Math.sin(a); p.z += g * Math.cos(a);
      }
      // Boot cuff: a slight flared lip just below the boot top so the boot reads as a real boot, not paint.
      const cuff = 1 + 0.07 * bump(p.y, -0.612, 0.011);
      p.x *= cuff; p.z *= cuff;
      // Superman's classic boot top dips into a V at the front of the shin. Rings near the boot line are
      // pulled down at the front (smooth falloff, slope < 1 so rings never cross), moving the colour edge.
      if (!B) p.y -= 0.03 * bump(p.y, -0.6, 0.04) * Math.max(0, Math.cos(a)) ** 3;
      return p;
    }, 112, 40);
    legGeo.userData.limb = true;
    const legW = p => {
      // Front of the upper thigh shares weight with the hips so a raised knee folds the hip crease instead
      // of pushing suit out through the front of the trunks.
      const lower = 1 - blend(-0.52, -0.40, p.y), pelvis = Math.max(blend(-0.015, 0.10, p.y) * 0.7, 0.6 * blend(-0.34, -0.04, p.y) * (Math.max(0, p.z) / Math.hypot(p.x, p.z)) ** 3); // front only, gentle falloff: no groin pinch
      return [[kn, lower], [th, (1 - lower) * (1 - pelvis)], [hips, (1 - lower) * pelvis]];
    };
    // Hip-crease correctives: lifting the knee (front kicks, chambers, knees) or swinging it out (roundhouse)
    // rolled the bulked thigh's root up through the front / side of the trunks (blue suit up to 4 cm over the
    // red, as far up as the belt). Morph targets compress the thigh's root on the side that folds against the
    // body (front, outer, inner), the way the quads bunch into the crease; applyPose drives them from the
    // thigh's angle to the hips (0 while the leg hangs or walks, so the standing sculpt is unchanged).
    {
      const P0 = legGeo.attributes.position, U = legGeo.attributes.uv, n = P0.count;
      const dF = new Float32Array(n * 3), dO = new Float32Array(n * 3), dI = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = U.getX(i) * Math.PI * 2, c = CREASE.d * bump(P0.getY(i), CREASE.y, CREASE.w);
        dF[i * 3 + 2] = -c * Math.max(0, Math.cos(a)) - adductor(P0.getY(i), a); // the whole front half folds (cos^2 left the front-inner / outer quadrants poking through in the roundhouse); the adductors flatten into the fold
        dO[i * 3] = -s * c * Math.max(0, s * Math.sin(a)) ** 2;
        const tf = tfl(P0.getY(i), a); // the TFL folds into the crease too: its front part with the front fold, all of it with the outer one
        dF[i * 3 + 2] -= tf * Math.cos(a); dO[i * 3] -= tf * Math.sin(a); dO[i * 3 + 2] -= tf * Math.cos(a);
        dI[i * 3] = s * c * Math.max(0, -s * Math.sin(a)) ** 2;
      }
      // Seat: in a tuck / crouch the thigh's back-top (above the joint, hidden in the trunks while standing) swings
      // down under the seat and left a 4 cm step below the pelvis-riding glute (radius from the hip joint 11.4 ->
      // 7.3 cm). With the thigh lifted SEAT.a1 forward its back-top, fading out down the hamstrings, is held where
      // it hangs (seatHold, driven with the trunks' seat morph), its cheek trimmed off so the seat runs on in one line.
      const dS = new Float32Array(n * 3), p = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        p.fromBufferAttribute(P0, i);
        const m = blend(-0.26, -0.1, p.y) * seatMask(p.x, p.z);
        if (!m) continue;
        const e = SEAT.k * cheek(p.x + s * 0.1, p.y - 0.04) * blend(-0.1, 0.5, -Math.cos(U.getX(i) * Math.PI * 2));
        const [dy, dz] = seatHold(p.y, p.z + e, legW(p)[1][1], m);
        dS[i * 3 + 1] = dy; dS[i * 3 + 2] = dz + m * e;
      }
      const nrm = d => { // normal deltas so the compressed crease shades as a fold
        const g = legGeo.clone(), p = g.attributes.position.array;
        for (let k = 0; k < p.length; k++) p[k] += d[k];
        g.computeVertexNormals();
        const N0 = legGeo.attributes.normal.array;
        return new THREE.Float32BufferAttribute(g.attributes.normal.array.map((x, k) => x - N0[k]), 3);
      };
      legGeo.morphAttributes.position = [dF, dO, dI, dS].map(d => new THREE.Float32BufferAttribute(d, 3));
      legGeo.morphAttributes.normal = [dF, dO, dI, dS].map(nrm);
      legGeo.morphTargetsRelative = true;
      legGeo.userData.leg = side;
    }
    legGeo.clearGroups();
    const bootRing = Math.floor((-0.6 + 0.94) / 1.03 * 112);
    legGeo.addGroup(0, bootRing * 40 * 6, 1);
    // The top of the thigh bulges up to ~5 cm out through the sides of the trunks (blue/grey patches
    // poking through them). Colouring it as the trunks' leg band turns that into a clean brief line.
    const briefRing = Math.floor((-0.12 + 0.94) / 1.03 * 112);
    legGeo.addGroup(bootRing * 40 * 6, (briefRing - bootRing) * 40 * 6, 0);
    legGeo.addGroup(briefRing * 40 * 6, (112 - briefRing) * 40 * 6, 2);
    skinSurface(th, legGeo, [suit, boot, B ? dark : red], legW);
    // Boot foot: heel, high instep and a tapered toe on a flat sole, built along its length
    // ([length, halfWidth, halfHeight, -centreY]) and turned to point forward.
    // Before the turn: p.y runs heel -> toe, the sole is p.z = 0.074 (up is -z), the inside is -s * x.
    // A real (and comic-book) foot isn't a symmetric flat wedge: the inner sole arches up between heel and
    // ball (the outer edge barely), the big toe leads on the inside so the toe line slants back to the little
    // toe, and the ball of the foot swells out on the inside.
    const footGeo = surface([[-0.058, 0.001, 0.001, 0.04], [-0.05, 0.03, 0.03, 0.04], [-0.03, 0.038, 0.042, 0.03],
      [0.0, 0.04, 0.046, 0.026], [0.04, 0.042, 0.036, 0.04], [0.09, 0.041, 0.024, 0.052],
      [0.135, 0.033, 0.017, 0.058], [0.165, 0.019, 0.012, 0.061], [0.178, 0.001, 0.001, 0.063]],
    p => {
      p.z = Math.min(p.z, 0.074);
      const L = p.y, inn = blend(0, 0.035, -s * p.x), out = blend(0, 0.035, s * p.x), low = blend(0.035, 0.074, p.z);
      p.z -= (0.013 * inn + 0.003 * out) * bump(L, 0.035, 0.042) * low;           // medial (high) / lateral (low) arches
      p.x -= s * 0.004 * bump(L, 0.115, 0.03) * inn;                              // ball of the big toe
      p.y -= 0.016 * blend(0.1, 0.178, L) * blend(-0.01, 0.03, s * p.x);           // toe line slants back to the little toe
      p.x -= s * 0.009 * blend(0.07, 0.178, L);                                   // big toe leads on the inside
      return p;
    }, 48, 32);
    footGeo.rotateX(Math.PI / 2);
    footGeo.computeVertexNormals(); part(an, footGeo, boot);
    legs[side] = { th, kn, an, s, crease: [] };
  }
  root.updateMatrixWorld(true);
  const bones = [];
  root.traverse(o => { if (o.isBone) bones.push(o); });
  const skeleton = new THREE.Skeleton(bones);
  const seat = []; // trunks + their outline: seat correctives [L, R]
  for (const { parent, geometry, material, weights } of skins) {
    const indices = [], values = [], pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i), ws = weights(p);
      for (let k = 0; k < 4; k++) { indices.push(ws[k] ? bones.indexOf(ws[k][0]) : 0); values.push(ws[k] ? ws[k][1] : 0); }
    }
    geometry.applyMatrix4(parent.matrixWorld);
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(values, 4));
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh); mesh.bind(skeleton);
    if (geometry.userData.leg) legs[geometry.userData.leg].crease.push(mesh);
    if (geometry.userData.seat) seat.push(mesh);
  }
  // Comic-book ink outline: an inverted hull pushed out along the (skinned) normal, so it bends with
  // the body. Tiny details (eyes, mouth, brows) are skipped so they don't turn into black blobs.
  const ink = new THREE.MeshBasicMaterial({ color: 0x050608, side: THREE.BackSide });
  ink.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>',
      '#include <skinning_vertex>\n#ifdef USE_SKINNING\n  transformed += normalize(objectNormal) * 0.0055 * inkW;\n#else\n  transformed += normalize(normal) * 0.0055 * inkW;\n#endif');
    sh.vertexShader = 'attribute float inkW;\n' + sh.vertexShader;
  };
  ink.customProgramCacheKey = () => 'hero-ink';
  const inked = [];
  root.traverse(o => { if (o.isMesh) inked.push(o); });
  for (const m of inked) {
    const g = m.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.attributes.normal || g.type === 'PlaneGeometry' || g.userData.decal || g.boundingSphere.radius * Math.max(...m.scale.toArray()) < 0.05) continue;
    // Average normals over coincident vertices (UV seams, poles) so the pushed-out hull stays closed
    // instead of tearing open into cracks along seams.
    const og = g.clone(), P = og.attributes.position, N = og.attributes.normal, acc = new Map();
    const key = i => `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
    for (let i = 0; i < P.count; i++) {
      const k = key(i), v = acc.get(k) || acc.set(k, new THREE.Vector3()).get(k);
      v.x += N.getX(i); v.y += N.getY(i); v.z += N.getZ(i);
    }
    for (let i = 0; i < P.count; i++) {
      const v = acc.get(key(i)); if (v.lengthSq() < 1e-12) continue;
      const u = v.clone().normalize(); N.setXYZ(i, u.x, u.y, u.z);
    }
    // Where an arm or leg joins the body, its own outline used to draw a black ring around the joint
    // (doll-like seams at the shoulders and hips). Fade the limb's ink to zero where it meets the
    // torso/trunks so deltoids and thighs flow into the body like drawn anatomy.
    const w = new Float32Array(P.count).fill(1);
    if (g.userData.limb) for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (y < -0.2 || y > 0.8) continue;
      const [rx, rz] = y < 0.06 ? contour(trunkRows, y) : contour(torsoRows, y);
      w[i] = blend(1.02, 1.22, Math.hypot(x / rx, z / (y < 0.06 && z < 0 ? rz + cheek(x, y) : rz))); // trunks include the glutes
    }
    og.setAttribute('inkW', new THREE.BufferAttribute(w, 1));
    const o = m.isSkinnedMesh ? new THREE.SkinnedMesh(og, ink) : new THREE.Mesh(og, ink);
    o.frustumCulled = false;
    if (m.isSkinnedMesh) { root.add(o); o.bind(m.skeleton, m.bindMatrix); }
    else { o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale); m.parent.add(o); }
    if (g.userData.leg) legs[g.userData.leg].crease.push(o); // the outline follows the crease too
    if (g.userData.seat) seat.push(o);
  }
  // Torso cross-section [halfWidth, halfDepth] at a hips-space height, for cloth collision.
  const torsoSection = (y) => contour(torsoRows, y);
  const dmg = { dmgP: { value: Array.from({ length: DMG_N }, () => new THREE.Vector3(0, -99, 0)) }, dmgS: { value: new Float32Array(DMG_N) }, dmgWear: { value: 0 } };
  // The palm's wrist morph target gives its two meshes extra fields; giving every mesh the same fields keeps them
  // one V8 object shape (two shapes made applyPose's scene-graph walks ~50% slower).
  root.traverse(o => { if (o.isMesh && !o.morphTargetInfluences) { o.morphTargetInfluences = undefined; o.morphTargetDictionary = undefined; } });
  const patched = new Set();
  root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial && !patched.has(m)) { patched.add(m); battleDamage(m, dmg); } });
  return { kind, root, hips, spine, chest, head, arms, legs, seat, eyes, face: faceRig, torsoSection, chestDepth, dmg };
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
  updateBones(bone);
}
// World matrices of a bone and the bones below it only: the hands carry ~40 finger / mesh nodes that the IK
// iterations don't need (the renderer refreshes them every frame).
function updateBones(b) {
  b.updateMatrix(); b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix);
  for (const c of b.children) if (c.isBone) updateBones(c);
}

// hinge: roll the upper bone about its own axis so its local +z (the arm's biceps side) faces the inside of the
// bend. setFromUnitVectors alone takes the shortest arc from hanging, so with the arm raised and the forearm
// coming forward (uppercut, overhead fist) the biceps ended up on the back of the arm and the triceps in front.
// The elbow (hinge) also stops at ELBOW_MAX flexion: a fist pulled in to the shoulder (guards on a deep lean, the
// spinning-elbow and liver-shot strings) folded the forearm 160 deg into the biceps; past the cap the fist stays
// further out along the same line.
const _qh = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), ELBOW_MAX = 145 * Math.PI / 180;
const reachMin = (L1, L2, hinge) => hinge ? Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(ELBOW_MAX)) : Math.abs(L1 - L2) + 0.01;
function solveIK(upper, lower, L1, L2, target, pole, hinge) {
  upper.getWorldPosition(_A);
  _D.subVectors(target, _A);
  let d = _D.length();
  if (d < 1e-5) _D.set(0, -1, 0); else _D.multiplyScalar(1 / d);
  d = Math.min(Math.max(d, reachMin(L1, L2, hinge)), L1 + L2 - 0.001);
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _B.subVectors(pole, _A).addScaledVector(_D, -_B.dot(_D));
  if (_B.lengthSq() < 1e-8) _B.set(0, 0, 1);
  _B.normalize();
  _E.copy(_A).addScaledVector(_D, L1 * cosA).addScaledVector(_B, L1 * sinA);
  setBoneDir(upper, _F.subVectors(_E, _A));
  if (hinge) {
    upper.getWorldQuaternion(_qh).invert();
    _F.copy(_B).negate().applyQuaternion(_qh); // inside of the bend in the bone's frame (its axis is local y)
    upper.quaternion.multiply(_qh.setFromAxisAngle(_Y, Math.atan2(_F.x, _F.z)));
    updateBones(upper);
  }
  _G.copy(_A).addScaledVector(_D, d);
  setBoneDir(lower, _F.subVectors(_G, _E));
}

// Elbow swivel kept inside the shoulder's range. The fixed pole (out, down and back) let the target drag the elbow
// anywhere on its circle: reaching across to the far shoulder (batarang wind-up, hip toss, spinning elbow) the upper
// arm pointed back behind the neck, low fists held out behind for balance (kicks) cocked the elbow up and back at
// shoulder height, and wide fists (hook / haymaker wind-ups) rolled the humerus 90-140 deg out. Sample the circle
// about the shoulder->fist line and keep the swivel nearest the pole whose upper arm stays out of the horizontal
// zone behind the shoulder (az: lateral 0, forward 90, across 180) and whose humerus rotation (forearm about the
// upper arm, measured from the arm swung up from hanging with the forearm forward; + = external) is in range.
// Poses that were already inside the limits keep their elbow exactly.
const SWIVEL = { n: 36, az: [-55, 150], rot: [-80, 95], w: 12, wl: 4, rate: 0.25, esc: 1.5 }, _qs = new THREE.Quaternion(), _sw = new THREE.Quaternion(),
  _su = new THREE.Vector3(), _sf = new THREE.Vector3(), _sr = new THREE.Vector3(), _sx = new THREE.Vector3(), _sZ = new THREE.Vector3(0, 0, 1);
function swivelPole(H, a, target, pole, L1, L2, local) {
  a.sh.getWorldPosition(_A);
  _D.subVectors(target, _A);
  let d = _D.length();
  if (d < 1e-5) return;
  _D.multiplyScalar(1 / d);
  d = Math.min(Math.max(d, reachMin(L1, L2, true)), L1 + L2 - 0.001);
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))), sinA = Math.sqrt(1 - cosA * cosA);
  if (sinA < 0.05) return; // arm (nearly) straight: the swivel only rolls it
  _B.subVectors(pole, _A).addScaledVector(_D, -_B.dot(_D));
  if (_B.lengthSq() < 1e-8) return;
  _B.normalize(); _G.crossVectors(_D, _B);
  H.chest.getWorldQuaternion(_qs).invert();
  const D2R = Math.PI / 180, flexW = Math.sin(Math.acos(Math.min(1, Math.max(-1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)))));
  const cost = (th) => {
    const c = Math.cos(th), sn = Math.sin(th);
    _su.copy(_D).multiplyScalar(cosA).addScaledVector(_B, sinA * c).addScaledVector(_G, sinA * sn); // upper arm dir
    _sf.copy(_D).multiplyScalar(d).addScaledVector(_su, -L1).normalize(); // forearm dir
    _su.applyQuaternion(_qs); _su.x *= a.s; _sf.applyQuaternion(_qs); _sf.x *= a.s;
    let pen = 0;
    const h2 = 1 - _su.y * _su.y, az = Math.atan2(_su.z, _su.x) / D2R;
    const ex = az < SWIVEL.az[0] ? SWIVEL.az[0] - az : az > SWIVEL.az[1] ? az - SWIVEL.az[1] : 0;
    pen += (h2 * ex * D2R) ** 2;
    if (_su.y < 0.9) {
      _sr.copy(_sZ).applyQuaternion(_sw.setFromUnitVectors(DOWN, _su));
      _sf.addScaledVector(_su, -_sf.dot(_su)).normalize();
      const rot = -Math.atan2(_su.dot(_sx.crossVectors(_sr, _sf)), _sr.dot(_sf)) / D2R;
      const rx = rot < SWIVEL.rot[0] ? SWIVEL.rot[0] - rot : rot > SWIVEL.rot[1] ? rot - SWIVEL.rot[1] : 0;
      pen += (rx * D2R * flexW * (1 - blend(0.6, 0.9, _su.y))) ** 2;
    }
    return th * th + SWIVEL.w * (local ? SWIVEL.wl : 1) * pen;
  };
  // Global minimum on the first pose; after that the elbow tracks its own minimum from the last pose (a.swd, in the
  // chest's frame), at most SWIVEL.rate per solve: with no good swivel for the fist (both sides of the circle equally
  // bad) a fresh global search flipped the elbow across the arm in one frame, and the pole itself swings through the
  // shoulder->fist line for fists raised overhead (60 cm elbow pops in the old rising uppercut / hammer wind-up).
  const st0 = 2 * Math.PI / SWIVEL.n;
  let best = 0, bc = Infinity, lo = -Math.PI, hi = Math.PI;
  if (local) { // (fist push-out re-solve, bendPole) only walk downhill from the pole given, no tracking state
    bc = cost(0);
    const dir = cost(-0.01) < cost(0.01) ? -1 : 1, st = Math.min(st0, SWIVEL.rate);
    for (let th = dir * st, c = cost(th); c < bc && Math.abs(th) <= Math.PI; th += dir * st, c = cost(th)) { bc = c; best = th; }
    for (let s2 = st / 2; s2 > 0.004; s2 /= 2) for (const th of [best - s2, best + s2]) { const c = cost(th); if (c < bc) { bc = c; best = th; } }
    pole.copy(_A).addScaledVector(_B, Math.cos(best)).addScaledVector(_G, Math.sin(best));
    return;
  }
  if (a.swd) {
    _sx.copy(a.swd).applyQuaternion(_sw.copy(_qs).invert());
    const x = _sx.dot(_B), y = _sx.dot(_G);
    if (x * x + y * y > 0.04) { best = Math.atan2(y, x); bc = cost(best); lo = best - SWIVEL.rate; hi = best + SWIVEL.rate; }
  }
  let gb = 0, gc = Infinity;
  for (let i = 0; i < SWIVEL.n; i++) {
    const th = (i < SWIVEL.n / 2 ? i : i - SWIVEL.n) * st0, c = cost(th);
    if (c < gc) { gc = c; gb = th; }
  }
  if (bc === Infinity) { bc = gc; best = gb; } else {
    const b0 = best;
    const dir = cost(best - 0.01) < cost(best + 0.01) ? -1 : 1, st = Math.min(st0, SWIVEL.rate);
    for (let th = best + dir * st, c = cost(th); c < bc && th >= lo && th <= hi; th += dir * st, c = cost(th)) { bc = c; best = th; }
    // Tracking only goes downhill, so a fist that jumps (the guard snapping back at a round reset, a shot's aim) could
    // leave the elbow in a poor valley behind a penalty wall: Batman's guard held the elbow straight up over the
    // shoulder, fist hanging under it, for seconds. Far worse than the best swivel, it now swings over at SWIVEL.rate.
    if (a.swE || bc > gc + SWIVEL.esc) {
      const dg = Math.atan2(Math.sin(gb - b0), Math.cos(gb - b0));
      a.swE = Math.abs(dg) > SWIVEL.rate;
      if (a.swE) { best = b0 + Math.sign(dg) * SWIVEL.rate; bc = cost(best); lo = hi = best; } else { best = b0 + dg; bc = cost(best); }
    }
  }
  for (let st = st0 / 2; st > 0.004; st /= 2) for (const th of [best - st, best + st]) { // refine between the steps
    if (th < lo || th > hi) continue;
    const c = cost(th);
    if (c < bc) { bc = c; best = th; }
  }
  (a.swd ||= new THREE.Vector3()).copy(_B).multiplyScalar(Math.cos(best)).addScaledVector(_G, Math.sin(best)).applyQuaternion(_qs);
  pole.copy(_A).addScaledVector(_B, Math.cos(best)).addScaledVector(_G, Math.sin(best));
}
// Pole for re-solving an arm after its fist target was moved (out of the own torso / the foe's body, off the held
// body). Through the elbow itself, the elbow's reach along the old shoulder->wrist line swung the bend round once the
// fist moved far (a guard fist pushed 20-30 cm out of the foe in a clinch): the elbow flipped 30-38 cm in one frame
// while walking, the fist all but still. Only the bend direction off that line is kept.
const _bpE = new THREE.Vector3(), _bpW = new THREE.Vector3();
function bendPole(a, out) {
  a.sh.getWorldPosition(out); a.el.getWorldPosition(_bpE).sub(out); a.hand.getWorldPosition(_bpW).sub(out).normalize();
  return out.addScaledVector(_bpE.addScaledVector(_bpW, -_bpE.dot(_bpW)), 4);
}

const _C = new THREE.Vector3(), _C4 = new THREE.Vector3(), _C5 = new THREE.Vector3();
// Push a world point radially out of the torso's elliptical cross-section (plus margin), measured in the
// chest's frame so it follows the lean. Returns true if it moved.
const UPPER_R = 0.06; // clearance for the upper-arm midpoint against the torso
// m (the foe's torso, game: world point between the pushed arm's shoulder and its chest): walking chest to chest
// (~0.55 m, both leaning in) a guard fist sat deep in the foe, and the radial way out flipped between his two sides
// (and his back) from one frame to the next: the fist jumped 40-58 cm a frame (144 fps). A deep point now leaves
// straight toward m (across his section); only within FOE_OUT of his surface does it turn to the radial way out.
function pushOutOfTorso(H, w, margin, m) {
  _C2.copy(w); H.chest.worldToLocal(_C2);
  const y = _C2.y + H.spine.position.y + H.chest.position.y;
  if (y < 0.1 || y > 0.72) return false;
  const [rx, rz] = H.torsoSection(y), e = (_C2.x / (rx + margin)) ** 2 + (_C2.z / (rz + margin)) ** 2;
  // The front has sculpted pecs/abs up to 6 cm proud of the ellipse; forearms in a guard sank into them.
  // Inside the ellipse the pecs' pull fades in over the 4 cm behind the side line (fw): a point just in front of it
  // was thrown onto the chest while one just behind went out sideways, a 10-20 cm swing for a fist crossing it.
  const fw = Math.abs(_C2.x) < rx ? (e < 1 ? blend(-0.04, 0, _C2.z) : +(_C2.z > 0)) : 0;
  const front = fw > 0 ? H.chestDepth(_C2.x, y) + margin : 0;
  if (e >= 1 && !(front && _C2.z < front)) return false;
  if (e < 1 && m) {
    H.chest.worldToLocal(_C3.copy(m)); _C3.y = 0; if (_C3.lengthSq() < 1e-8) _C3.set(0, 0, 1); _C3.normalize();
    const rw = blend(FOE_OUT[0], FOE_OUT[1], Math.sqrt(e)), rl = Math.hypot(_C2.x, _C2.z);
    if (rw > 0 && rl > 1e-6) { _C3.multiplyScalar(1 - rw); _C3.x += rw * _C2.x / rl; _C3.z += rw * _C2.z / rl; if (_C3.lengthSq() < 1e-8) _C3.set(0, 0, 1); _C3.normalize(); }
    const A = (rx + margin) ** -2, B = (rz + margin) ** -2, qa = _C3.x * _C3.x * A + _C3.z * _C3.z * B, qb = 2 * (_C2.x * _C3.x * A + _C2.z * _C3.z * B);
    _C2.addScaledVector(_C3, (-qb + Math.sqrt(qb * qb - 4 * qa * (e - 1))) / (2 * qa));
    if (_C2.z > 0 && Math.abs(_C2.x) < rx) _C2.z = Math.max(_C2.z, H.chestDepth(_C2.x, y) + margin);
    w.copy(H.chest.localToWorld(_C2));
    return true;
  }
  if (e < 1) { if (e < 1e-6) _C2.z = rz + margin; else { const k = 1 / Math.sqrt(e); _C2.x *= k; _C2.z *= k; } }
  if (front) _C2.z += fw * Math.max(0, front - _C2.z);
  w.copy(H.chest.localToWorld(_C2));
  return true;
}
const FOE_OUT = [0.75, 1], _C2 = new THREE.Vector3(), _C3 = new THREE.Vector3(), _fs = new THREE.Vector3(), _fv = new THREE.Vector3(), _fq = new THREE.Quaternion(), FOLD_R = 0.24;
// Same for the head (an ellipsoid round the skull in the head's frame; the elbow strike folded the fist 3 cm into the face).
const HEAD_C = new THREE.Vector3(0, 0.12, 0), HEAD_R = [0.085, 0.125, 0.08];
function pushOutOfHead(H, w, margin) {
  H.head.worldToLocal(_C2.copy(w)).sub(HEAD_C);
  const m = margin / H.head.scale.x, e = Math.hypot(_C2.x / (HEAD_R[0] + m), _C2.y / (HEAD_R[1] + m), _C2.z / (HEAD_R[2] + m));
  if (e >= 1 || e < 1e-6) return false;
  w.copy(H.head.localToWorld(_C2.multiplyScalar(1 / e).add(HEAD_C)));
  return true;
}
// pose: { p:[x,y,z] hips world, yaw, pitch, roll, lean, gait, lh, rh, lf, rf (hip-relative targets) }
const SOLE = 0.076;
const BOOT_CORNERS = [[0, -0.074, -0.058], [0, -0.074, 0.178], [0.042, -0.074, 0.06], [-0.042, -0.074, 0.06], [0, 0.021, 0.178], [0, 0.021, -0.058]]
  .map(p => new THREE.Vector3(...p));
// Contact radii of the joints that touch the roof in kneels, landings and lying poses.
const CONTACT = [['legs', 'kn', 0.062], ['arms', 'el', 0.055], ['arms', 'hand', 0.07]];
// Facial expression: e.eye = lid openness (1 open .. 0 shut; Batman's white lenses only narrow to a slit),
// e.ang = scowl (brows drop and knit), e.pain = pain / effort brows (inner ends lift), e.mouth = jaw drop 0..1.
export function setFace(H, e) {
  const F = H.face; if (!F) return;
  const eye = Math.max(F.blinks ? 0.06 : 0.3, Math.min(1, e.eye));
  for (const l of F.lids) l.scale.set(1, eye, 1);
  for (const b of F.brows) {
    b.g.rotation.z = b.s * (0.22 * e.ang - 0.3 * e.pain);
    b.g.position.y = b.y - 0.004 * e.ang + 0.0025 * e.pain;
  }
  const m = Math.max(0, Math.min(1, e.mouth)), open = m > 0.03;
  F.cavity.visible = F.teeth.visible = open;
  if (open) {
    F.cavity.scale.y = 0.0015 + m * 0.0075; F.cavity.position.y = 0.0605 - m * 0.0068;
    F.teeth.scale.y = 0.0012 + Math.min(m, 0.4) * 0.004; F.teeth.position.y = 0.0596 - Math.min(m, 0.4) * 0.002;
  }
}
// Distance-driven gait: stride half-amplitude (m), swing lift (m), sideways strides shortened so the feet never cross.
// GAIT_D: the part of the cycle a foot is planted. At 0.5 one foot lifted the instant the other landed (no double
// support, as in a run), so a walker's rear foot was still dragging behind when the front foot swung; a walk has
// both feet down for a moment at each step (0.6: 10% of the cycle twice).
export const GAIT_A = 0.3, GAIT_LIFT = 0.15, GAIT_SIDE = 0.55, GAIT_D = 0.6;
// One foot's cycle (p in cycles): planted for GAIT_D, sliding back under the hips at constant speed (no skating
// against the ground), then lifted on an arc and swung forward with an ease-in-out. -> [offset -1..1, lift 0..1]
function gaitStep(p) {
  p -= Math.floor(p);
  if (p < GAIT_D) return [1 - 2 * p / GAIT_D, 0];
  const u = (p - GAIT_D) / (1 - GAIT_D);
  return [-1 + 2 * u * u * (3 - 2 * u), Math.sin(Math.PI * u)];
}
// Standing on one leg (front / round / crouch kick, sweep: the other foot off the floor in a strike) the hips stayed
// where the stance had them, between the feet, so the body's centre of mass hung 11-22 cm off the standing boot (the
// crouch kick sat back 15-20 cm behind and beside its lead foot for 0.35 s). Weight shift (game, s.lock 2): with one
// foot held on the floor and the other off it, the root eases (WS.k /s) over the standing boot, by last frame's centre
// of mass against it (at most WS.max), and back once both feet are down. Held feet keep their targets; the kick goes along.
const WS = { k: 14, max: 0.25, air: [0.02, 0.06] }, _wsP = new THREE.Vector3(), _wsQ = new THREE.Vector3(), _wsC = new THREE.Vector3();
let _wsx = 0, _wsz = 0;
const WS_M = [['head', 0.081], ['hips', 0.142], ['chest', 0.216]];
function weightShift(H, s) {
  const o = H.ws ||= { x: 0, z: 0 };
  if (s.again) return;
  let tx = 0, tz = 0;
  // (wsk: a foot lifted by the strike itself, a kick, and still on its way back down: its return is a foot-lock step)
  for (const side of ['L', 'R']) { const l = H.legs[side], k = l.lk; if (s.lock !== 2 || k && k.st < 0 && k.w >= 1) l.wsk = false; else if ((!k || k.w < 1) && l.gy > WS.air[0]) l.wsk = true; }
  if (s.lock === 2 && s.dt) {
    for (const side of ['L', 'R']) {
      const l = H.legs[side], f = H.legs[side === 'L' ? 'R' : 'L'], k = l.lk;
      if (!k || k.st >= 0 || k.w < 1 || f.lk && f.lk.w >= 1 && !(f.wsk && f.lk.st >= 0) || f.gk || f.gy == null) continue;
      const w = blend(WS.air[0], WS.air[1], f.gy);
      if (w <= 0) continue;
      // last frame's centre of mass (segment masses as a share of the body) and the standing boot's middle
      _wsC.set(0, 0, 0); let m = 0;
      const add = (p, q) => { _wsC.addScaledVector(p, q); m += q; };
      for (const [j, q] of WS_M) add(H[j].getWorldPosition(_wsP), q);
      add(H.hips.getWorldPosition(_wsP).add(H.chest.getWorldPosition(_wsQ)).multiplyScalar(0.5), 0.139);
      for (const sd of ['L', 'R']) {
        const a = H.arms[sd], g = H.legs[sd];
        add(a.sh.getWorldPosition(_wsP).add(a.el.getWorldPosition(_wsQ)).multiplyScalar(0.5), 0.028);
        add(a.el.getWorldPosition(_wsP).add(a.hand.getWorldPosition(_wsQ)).multiplyScalar(0.5), 0.022);
        add(g.th.getWorldPosition(_wsP).add(g.kn.getWorldPosition(_wsQ)).multiplyScalar(0.5), 0.1);
        add(g.kn.getWorldPosition(_wsP).add(g.an.getWorldPosition(_wsQ)).multiplyScalar(0.5), 0.061);
      }
      _wsC.multiplyScalar(1 / m);
      _wsP.copy(BALL); l.an.localToWorld(_wsP); _wsQ.copy(HEEL); l.an.localToWorld(_wsQ); _wsP.add(_wsQ).multiplyScalar(0.5);
      tx = (o.x + _wsP.x - _wsC.x) * w; tz = (o.z + _wsP.z - _wsC.z) * w;
      const n = Math.hypot(tx, tz); if (n > WS.max) { tx *= WS.max / n; tz *= WS.max / n; }
      break;
    }
  }
  const e = s.dt ? 1 - Math.exp(-s.dt * WS.k) : 1;
  o.x += (tx - o.x) * e; o.z += (tz - o.z) * e;
}
export function applyPose(H, s, t, ground = 0) {
  // last frame's grip curls (relaxFingers eases from them once the grip lets go)
  // (s.again: the game re-poses a fighter in the same frame; keep this frame's starting curls)
  if (!s.again) for (const side of ['L', 'R']) { const g = H.arms[side].grip; if (g) { g.pk = g.wk ? g.wk.slice() : null; g.ph = g.hw; g.hw = 0; } }
  _limp = Math.max(0, Math.min(1, s.limp || 0)); _floor = ground;
  if (s.lock != null) { weightShift(H, s); _wsx = H.ws.x; _wsz = H.ws.z; } else _wsx = _wsz = 0;
  posePass(H, s, t, ground, 0);
  // Knees, elbows and fists used to go up to 5 cm through the roof (Superman's landing kneel, Batman lying
  // down). Lift the body by the deepest contact deficit and re-solve with the feet held where they were.
  let deficit = 0;
  for (const [group, j, r] of CONTACT) for (const side of ['L', 'R']) {
    H[group][side][j].getWorldPosition(_P);
    if (_P.y > ground - 0.6) deficit = Math.max(deficit, ground + r - _P.y);
  }
  if (deficit > 0.002) posePass(H, s, t, ground, deficit);
  // Hip-crease correctives, from each thigh's direction in the hips' frame: lifted forward -> front (deeper past
  // 90 deg, where the thigh folds onto the belly, which also folds the inner side), out -> outer, across -> inner.
  H.hips.getWorldQuaternion(_qa).invert();
  for (const side of ['L', 'R']) {
    const l = H.legs[side];
    l.kn.getWorldPosition(_A); l.th.getWorldPosition(_B); _A.sub(_B).applyQuaternion(_qa).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, -_A.y))), lift = blend(CREASE.a0, CREASE.a1, ang), r = Math.hypot(_A.x, _A.z) || 1;
    const deep = blend(CREASE.a1, 2.4, ang), f = lift * (1 + CREASE.k * deep) * Math.max(0, _A.z) / r, o = lift * Math.max(0, l.s * _A.x) / r;
    const inn = lift * Math.max(deep * CREASE.ki, Math.max(0, -l.s * _A.x) / r);
    const st = blend(SEAT.a0, SEAT.a1, ang) * Math.max(0, _A.z) / r; // seat: forward lift holds the glute where it hangs
    for (const m of l.crease) { const w = m.morphTargetInfluences; w[0] = f; w[1] = o; w[2] = inn; w[3] = st; }
    for (const m of H.seat) m.morphTargetInfluences[side === 'L' ? 0 : 1] = st;
  }
}
// Knee pole into _P (world), from the root-local hip->foot direction in the sagittal plane: (vy, vz) -> (vz, -vy)
// maps straight down to straight forward, a horizontal forward leg to straight up, a high kick to up-and-back.
// The sideways pull (knees over spread feet) fades as the foot rises toward hip height (KNEE_LAT: share of the
// hip->foot line pointing down): a foot kicked out wide rolled the knee 55 deg out (front kick, sweep, knee lift).
const KNEE_LAT = [0.3, 0.7], TW_PLANT = [-0.8, 0.45], TW_SPINE = 0.7, LEAN_PELVIS = 0.54, HIP_RHYTHM = [1.6, 0.5], HIP_EXT = 0.8, SPINE_EXT = 0.5, NECK_EXT = [0.8, 0.94];
const _qs1 = new THREE.Quaternion(), _qs2 = new THREE.Quaternion(), _qs3 = new THREE.Quaternion();
// (tg and the pole are in the pelvis' frame: the root turned back by a, the twist the waist takes; posePass)
const yawXZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a), x = v.x; v.x = x * c + v.z * s; v.z = v.z * c - x * s; return v; };
// Game strikes lunge the body forward (f.x moves up to 0.36 m before the hit) and twist it, and hip-relative feet
// went along: both planted feet skated through every cross, uppercut and front kick, and a kick's standing foot slid
// 20-46 cm. Foot lock (game sets s.lock: 2 = in a strike, 1 = standing, let go; 0 / film = off): a planted foot keeps
// its spot on the floor while the body moves over it, and once its pose target has drifted LOCK.d away it takes a
// step there (lifted, LOCK.t s, one foot at a time; past LOCK.max it is dragged). Out of the strike the feet step
// back under the stance. A foot rising off the floor (a kick) or reaching out (sweep) eases out of the lock.
// l.lk = { x, z (world), y (step lift), st (step progress, -1 planted), fx, fz, len (step start / length), bx, bz (ball
// of the foot, world: a planted foot up on its toes pivots on it as the body turns, instead of on the ankle), ax, az
// (where the ankle really ended up last frame: a step starts from there), w (1 held .. 0 let go) }.
const LOCK = { d: 0.15, rest: 0.015, max: 0.35, t: 0.16, tq: 0.08, h: 0.07, up: 0.12, ease: 0.08, air: 0.03 };
const _LK = new THREE.Vector3(), BALL = new THREE.Vector3(0, -0.074, 0.15), HEEL = new THREE.Vector3(0, -0.074, -0.058);
function footLock(l, o, T, up, r, mode, dt, far) {
  const k = l.lk, planted = up < LOCK.up && r < 0.575;
  if (!mode) { l.lk = null; return; }
  if (!k) { if (mode === 2 && planted) l.lk = { x: T.x, z: T.z, y: 0, st: -1, fx: 0, fz: 0, len: 0, bx: null, bz: 0, ax: T.x, az: T.z, w: 1 }; return; }
  // lifting off (a kick) or reaching out (sweep): the foot lets go of its spot over LOCK.ease s, then the lock ends
  if (k.w < 1 || !planted) { k.w = Math.max(0, k.w - dt / LOCK.ease); k.y *= k.w; if (k.w <= 0) l.lk = null; return; }
  // (busy: the other foot is mid-step, swinging in the gait, off the floor in a strike or off the floor at all (o.gy:
  // its sole's height last pose): a kick's standing foot stepping after the lunge, or a walker's rear foot stepping
  // while the front one swung, left both feet 3-9 cm up)
  // A step taken while the other foot is planted in the walk ends before the gait lifts that one (og: seconds left), at
  // most LOCK.t long and no shorter than LOCK.tq: a step started late in the other's stance left both feet up 3-9 cm.
  const og = o.gk && !o.gk.sw && o.gk.pr > 0 ? (GAIT_D - o.gk.p) / o.gk.pr * dt : Infinity;
  const d = Math.hypot(T.x - k.x, T.z - k.z), busy = (o.lk ? o.lk.st >= 0 || o.lk.w < 1 : mode === 2) || !!o.gk && o.gk.sw || o.gy > LOCK.air || og < LOCK.tq;
  if (k.st < 0) {
    if (mode === 1 && d < LOCK.rest) { l.lk = null; return; }
    if ((d > (mode === 2 ? LOCK.d : LOCK.rest) || far && d > 0.03) && !busy) { k.fx = k.x = k.ax; k.fz = k.z = k.az; k.len = Math.hypot(T.x - k.x, T.z - k.z); k.st = 0; k.bx = null; k.dur = Math.min(LOCK.t, og); }
    else if (d > LOCK.max) {
      const m = (d - LOCK.max) / d, dx = (T.x - k.x) * m, dz = (T.z - k.z) * m;
      k.x += dx; k.z += dz; if (k.bx != null) { k.bx += dx; k.bz += dz; }
    }
  }
  if (k.st >= 0) {
    k.st = Math.min(1, k.st + dt / (k.dur || LOCK.t));
    const e = k.st * k.st * (3 - 2 * k.st);
    k.x = k.fx + (T.x - k.fx) * e; k.z = k.fz + (T.z - k.fz) * e;
    k.y = Math.min(LOCK.h, k.len * 0.4) * Math.sin(Math.PI * k.st);
    if (k.st >= 1) { if (mode === 1) { l.lk = null; return; } k.st = -1; k.y = 0; }
  }
}
// Walking slid the planted feet 2200-2400 cm per 90 s CPU fight: the gait slides a planted foot back under the hips
// at the speed the step cycle assumes, but the body turns to face the foe as it walks, the travel direction is
// smoothed, the cycle is capped at 4.5 strides/s and its stride follows the eased gait amount. Gait lock (game,
// walking, no foot lock): a foot holds its floor spot for its whole planted half of the cycle, and its swing runs
// from where it lifted off to where the gait puts it at touchdown. Left GLOCK.max behind (the walker turned or
// reversed) or once the walk is over, it is handed to the foot lock, which steps it.
// It lifts the whole boot (at least GLOCK.h, or 0.4 x the swing: a slow walk's gait lift alone left the swinging boot
// shuffling along the roof), and the planted boot keeps its heading (it turned with the body about the ankle, so its
// toe and heel swept the floor as the fighter turned to face the foe) until it swings, turning to the body's on the way.
// l.gk = { x, z (held spot), sw (swinging), sx, sz (lift-off spot), y, sy (held / lift-off heading), len (swing), bx, bz (ball),
// ox, oz, oy, dy (this frame's output: spot, boot lift, heading offset), w }.
const _ruQ = new THREE.Quaternion(), _ruV = new THREE.Vector3();
const GLOCK = { g: [0.01, 0.05], max: 0.3, h: 0.06, yaw: 0.6 };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// (from the spot the gait last put the foot (ox / oz), not its held spot: with the gait fading out those differ and
// the foot snapped back 10-15 cm when the walk stopped)
const toStep = (l, k) => {
  if (k && !l.lk) l.lk = { x: k.ox, z: k.oz, y: 0, st: -1, fx: 0, fz: 0, len: 0, bx: null, bz: 0, ax: l.ga ? l.ga.x : k.ox, az: l.ga ? l.ga.z : k.oz, w: 1 };
  l.gk = null;
};
// A 90 s CPU fight held a planted foot 60-75 cm behind the hips on a straight knee: the thigh 40-62 deg behind the
// pelvis (a real hip extends ~20-30) in hit reactions (the jolt leans the body further back than the pose, tipping
// the pelvis) and at the end of long walking strides. thighBack: the thigh's angle behind the pelvis for an ankle at
// T (hip->ankle line, less the knee's share when bent: it bends forward of that line). A planted foot's target is
// pulled forward under the body to HIP_BACK[0]; a held foot (foot lock / gait lock) past HIP_BACK[1] steps, and one
// that can't step yet (the other foot is mid-step) slides forward rather than past HIP_BACK[2].
const HIP_BACK = [0.47, 0.52, 0.56], _hbv = new THREE.Vector3(), _hbH = new THREE.Vector3(), _hbQ = new THREE.Quaternion(), _hbF = new THREE.Vector3();
function thighBack(l, x, y, z, qh) {
  l.th.getWorldPosition(_hbH); _hbv.set(x - _hbH.x, y - _hbH.y, z - _hbH.z).applyQuaternion(qh);
  return Math.atan2(-_hbv.z, -_hbv.y) - Math.acos(Math.min(1, _hbv.length() / 0.92));
}
function clampBack(l, T, qh, fwd, lim = HIP_BACK[0]) {
  if (thighBack(l, T.x, T.y, T.z, qh) <= lim) return;
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (thighBack(l, T.x + fwd.x * m, T.y, T.z + fwd.z * m, qh) > lim) lo = m; else hi = m; }
  T.x += fwd.x * hi; T.z += fwd.z * hi;
}
function gaitLock(l, T, p, w, keep, yaw, far, o) {
  let k = l.gk;
  if (!keep) {
    // walk over (gait faded): the foot is handed to the foot lock, which steps it back under the stance
    if (w <= 0) { toStep(l, k); return; }
    p -= Math.floor(p);
    // (a swing waits while the other foot is mid-step in the foot lock, then runs over the rest of the swing phase
    // (u0): a walk starting as an idle foot stepped lifted the other foot at once, both 5-12 cm up)
    const sw = p >= GAIT_D && !(!(k && k.sw) && o.lk && o.lk.st >= 0);
    if (k) { k.pr = p - k.p; k.pr -= Math.floor(k.pr); } // (phase advance last frame: when the planted foot lifts, footLock)
    if (!k) { const x = l.ga ? l.ga.x : T.x, z = l.ga ? l.ga.z : T.z; k = l.gk = { x, z, sw: false, sx: x, sz: z, y: yaw, sy: yaw, len: 0, bx: null, bz: 0, ox: x, oz: z, oy: 0, dy: 0, w }; }
    k.w = w; k.oy = 0; k.p = p;
    if (sw) {
      // (lifting off from the ankle: a foot rolled onto its ball has moved off the held spot)
      const u1 = (p - GAIT_D) / (1 - GAIT_D);
      if (!k.sw) { k.sx = l.ga ? l.ga.x : k.x; k.sz = l.ga ? l.ga.z : k.z; k.sy = k.y; k.len = 0; k.sw = true; k.bx = null; k.u0 = Math.min(u1, 0.9); }
      const u = k.u = Math.max(0, (u1 - k.u0) / (1 - k.u0)), e = u * u * (3 - 2 * u);
      k.x = k.sx + (T.x - k.sx) * e; k.z = k.sz + (T.z - k.sz) * e; k.y = k.sy + wrapA(yaw - k.sy) * e;
      k.len = Math.max(k.len, Math.hypot(T.x - k.sx, T.z - k.sz));
      k.oy = Math.min(GLOCK.h, k.len * 0.4) * Math.sin(Math.PI * u);
    } else {
      k.sw = false; // (touches down where the swing's last frame left it)
      const d = Math.hypot(T.x - k.x, T.z - k.z);
      // left far behind (the walker turned or reversed, or past the hip's reach): a real step (past GLOCK.max not while
      // held for the other foot's step: it swings as soon as that lands)
      if (p < GAIT_D && d > GLOCK.max || far && d > 0.03) { toStep(l, k); return; }
      const a = wrapA(k.y - yaw);
      if (Math.abs(a) > GLOCK.yaw) k.y = yaw + Math.sign(a) * GLOCK.yaw;
    }
    k.ox = T.x + (k.x - T.x) * w; k.oz = T.z + (k.z - T.z) * w; k.oy *= w; k.dy = wrapA(k.y - yaw) * w;
  }
  if (k) { T.x = k.ox; T.z = k.oz; }
}
function kneePole(H, l, tg, a = 0) {
  l.th.getWorldPosition(_P); yawXZ(H.root.worldToLocal(_P), a);
  let vy = tg[1] - _P.y, vz = tg[2] - _P.z;
  const down = -vy / (Math.hypot(tg[0] - _P.x, vy, vz) || 1);
  const n = Math.hypot(vy, vz) || 1; vy /= n; vz /= n;
  const lat = Math.max(0.15, Math.abs(tg[0]) * 1.5 * blend(KNEE_LAT[0], KNEE_LAT[1], down));
  H.root.localToWorld(yawXZ(_P.set(l.s * lat, _P.y + vz, _P.z - vy), -a));
}
// Foot keeps the body's orientation (flat on the roof when planted), but never bends past the ankle's
// plantarflex limit relative to the shin: with the leg kicked up, the root-aligned foot folded back
// against the calf and the boot looked upside down. Now the sole turns toward the target instead.
// In the air (air 0..1, the ankle's height above the roof) a free foot is not held flat to the body: flying
// in pitched forward with the trailing knee bent, the root-aligned boot was cranked 65 deg up toward the shin
// (a real ankle dorsiflexes ~20 deg). Airborne feet relax into a point along the shin line instead.
// Dorsiflexion is capped at MAX_DF too: the rear boot of the guard was held flat with the shin 61 deg past
// square (crouch 87, landing kneel 82; a loaded ankle manages ~35-40). Past the cap the heel lifts and the
// boot pivots onto its toes; posePass then raises the ankle until the toes rest on the roof.
const MAX_PF = 0.9, MAX_DF = 0.65, AIR_PF = 0.8, _toe = new THREE.Vector3(), _qf = new THREE.Quaternion(), _XA = new THREE.Vector3(1, 0, 0),
  _DN = new THREE.Vector3(0, -1, 0), _ax = new THREE.Vector3(), _YA = new THREE.Vector3(0, 1, 0),
  KNEE_TOE = 35 * Math.PI / 180, _kA = new THREE.Vector3(), _kB = new THREE.Vector3(), _kC = new THREE.Vector3();
function orientFoot(l, qRoot, air = 0) {
  l.kn.getWorldQuaternion(_qa).invert();
  l.an.quaternion.copy(_qa).multiply(qRoot);
  _toe.set(0, 0, 1).applyQuaternion(l.an.quaternion); // toes in the shin's frame
  const pf = Math.atan2(-_toe.y, _toe.z);
  if (pf > MAX_PF) l.an.quaternion.premultiply(_qf.setFromAxisAngle(_XA, MAX_PF - pf));
  else {
    if (pf < -MAX_DF) {
      l.an.quaternion.premultiply(_qf.setFromAxisAngle(_XA, -MAX_DF - pf));
      _toe.set(0, 0, 1).applyQuaternion(l.an.quaternion);
    }
    if (air > 0 && _ax.crossVectors(_toe, _DN).lengthSq() > 1e-8) {
      // Swing the toes toward the shin's long axis (no twist about it, so the sole never rolls in or out).
      const cur = Math.asin(Math.max(-1, Math.min(1, -_toe.y)));
      l.an.quaternion.premultiply(_qf.setFromAxisAngle(_ax.normalize(), air * (AIR_PF - cur)));
    }
  }
  // Toes follow the knee: the root-aligned boot kept pointing at the opponent while the knee turned out (front kick
  // knee 81 deg off the toes, sweep 63); a real shin can only twist the foot ~35 deg off the knee's line (tibial
  // rotation). Measured about the shin in its own frame (local -y), once the knee is bent enough to point somewhere.
  l.th.getWorldPosition(_kA); l.an.getWorldPosition(_kB); l.kn.getWorldPosition(_kC);
  _kA.lerp(_kB, 0.5); _kC.sub(_kA).applyQuaternion(_qa); // knee forward, in the shin's frame
  _toe.set(0, 0, 1).applyQuaternion(l.an.quaternion);
  const kh = Math.hypot(_kC.x, _kC.z), th = Math.hypot(_toe.x, _toe.z), kw = blend(0.02, 0.06, kh) * blend(0.2, 0.5, th);
  if (kw > 0) {
    let dt = Math.atan2(_kC.x, _kC.z) - Math.atan2(_toe.x, _toe.z);
    dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    if (Math.abs(dt) > KNEE_TOE) l.an.quaternion.premultiply(_qf.setFromAxisAngle(_YA, kw * (dt - Math.sign(dt) * KNEE_TOE)));
  }
  l.an.updateMatrixWorld(true);
}
// Wrist: the fist used to keep whatever twist the IK's shortest-arc rotation left it, so jabs and crosses
// landed palm-up and the guard's palms faced out. Now the fist lines up with the forearm (straight wrist) and
// is turned like a real forearm turns it: palm toward the body's midline at rest and in the guard (thumb up /
// toward the face), rolling palm-down as the arm extends forward into a straight punch, and angled back
// toward the face as the forearm rises.
const _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3(), _hf = new THREE.Vector3(),
  _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hr = new THREE.Quaternion();
// Fist sample points in the hand frame ([x * side, y, z], before the 1.18 hand scale) with their clearance:
// the middle of the fist, the thumb across its palm side, then the corners of the fist.
const FIST_PTS = [[0, -0.055, 0.015, 0.05], [0.03, -0.07, 0.06, 0.012], [-0.008, -0.086, 0.068, 0.012]];
for (const x of [-0.035, 0.035]) for (const y of [-0.015, -0.1]) for (const z of [-0.03, 0.04]) FIST_PTS.push([x, y, z, 0.012]);
// against the opponent (s.foe) the knuckle face counts too: it's what lands on him
const FOE_NEAR = [0.4, 0.5], _fp = new THREE.Vector3();
const FOE_PTS = [...FIST_PTS, [0.028, -0.1, 0.015, 0.028], [-0.028, -0.1, 0.015, 0.028]];
// w = wrist extension 0..1 (palm strikes): the hand bends back up to 66 deg so the heel of the palm leads
// and the fingers point up (a palm-down extended arm turns into a palm-forward strike).
const WRIST_EXT = 1.15, GRIP_WRIST = [0.9, 1.1], _XH = new THREE.Vector3(1, 0, 0);
// s.limp 0..1 (knocked out / knocked down): the wrist goes slack and the hand hangs toward the floor, up to
// LIMP_WRIST flexion / extension (an unconscious hand used to stay rigid along the forearm, fingers pointing up
// off the floor). The droop stops before a fingertip or the thumb tip (or the fist's end) reaches the floor.
const LIMP_WRIST = [1.2, 0.9], _hY = new THREE.Vector3(), _hZ = new THREE.Vector3(), _hT = new THREE.Vector3(), _hb = new THREE.Quaternion();
let _limp = 0, _floor = 0;
function lowestTip(a) {
  const g = a.grip;
  a.hand.updateMatrix(); a.hand.matrixWorld.multiplyMatrices(a.el.matrixWorld, a.hand.matrix);
  if (!g || !g.openG.visible) return _hT.set(0, -0.12, 0).applyMatrix4(a.hand.matrixWorld).y;
  g.openG.updateMatrix(); g.openG.matrixWorld.multiplyMatrices(a.hand.matrixWorld, g.openG.matrix);
  let y = _hT.copy(g.thumbTip.position).applyMatrix4(g.openG.matrixWorld).y;
  for (const f of g.fingers) y = Math.min(y, fingerPoint(g, f, 3, _hT).y);
  return y;
}
// Forearm twist kept inside pronation / supination: the palm direction above is picked in the body's frame, blind
// to where the elbow is, so wide wind-ups (hook, haymaker), arms flung back (hit, burst, splat) and the hoisted
// victim's raised arms turned the fist 105-170 deg past thumb-up, i.e. the forearm wrung backwards. Measured about
// the forearm from thumb-up (palm toward the midline across the bend; + supinated: palm toward the biceps), it is
// held within FOREARM_TWIST; a near-straight arm can also roll at the shoulder, so its range opens up to 180.
const FOREARM_TWIST = 90 * Math.PI / 180, _fu = new THREE.Vector3(), _fb = new THREE.Vector3(), _fm = new THREE.Vector3();
function forearmTwist(a) {
  a.sh.getWorldPosition(_fu); a.el.getWorldPosition(_fb); _fu.subVectors(_fb, _fu).normalize(); // upper arm
  const c = -_fu.dot(_hy), lim = FOREARM_TWIST + (Math.PI - FOREARM_TWIST) * (1 - blend(0.35, 0.7, Math.acos(Math.max(-1, Math.min(1, c))))); // _hy = -forearm
  if (lim >= Math.PI) return;
  _fb.copy(_fu).negate().addScaledVector(_hy, _fu.dot(_hy)).normalize(); // inside of the bend, across the forearm
  _fm.crossVectors(_fu, _hy).multiplyScalar(-a.s).normalize(); // medial side of the forearm (thumb-up palm)
  const t = Math.atan2(_hz.dot(_fb), _hz.dot(_fm));
  if (Math.abs(t) <= lim) return;
  const tc = Math.sign(t) * lim;
  _hz.copy(_fm).multiplyScalar(Math.cos(tc)).addScaledVector(_fb, Math.sin(tc));
}
function orientHand(a, qRoot, w = 0, palm = null, pw = 0) {
  a.el.getWorldPosition(_hy); a.hand.getWorldPosition(_hf); a.sh.getWorldPosition(_hx);
  const ext = _hx.distanceTo(_hf) / 0.62;
  _hy.sub(_hf).normalize(); // hand +y runs back up the forearm
  _hr.copy(qRoot).invert();
  _hf.copy(_hy).negate().applyQuaternion(_hr); // forearm direction in the body frame
  // uppercuts stay palm-in; w < 0 keeps the palm turned in too (Superman's thunderclap to the ears)
  const k = blend(0.8, 0.97, ext) * blend(0.2, 0.7, _hf.z) * (1 - blend(0.25, 0.6, _hf.y)) * (w < 0 ? 1 + Math.max(-1, w) : 1);
  _hz.set(-a.s * (1 - k), -k, -(0.25 + 0.6 * Math.max(0, _hf.y))).applyQuaternion(qRoot);
  if (palm) _hz.normalize().lerp(palm, pw); // gripping: the palm turns onto the body it holds
  _hz.addScaledVector(_hy, -_hz.dot(_hy));
  if (_hz.lengthSq() < 1e-6) { _hz.set(0, -1, 0).applyQuaternion(qRoot); _hz.addScaledVector(_hy, -_hz.dot(_hy)); } // forearm along the preferred palm line
  _hz.normalize();
  // (a gripping palm too: turned onto the held body it wrung the forearm 160-180 deg in the hip toss and supers;
  // only the palm-placement passes (_gLoop) aim it freely, so the reach target doesn't jump)
  if (!palm || !_gLoop) forearmTwist(a);
  _hx.crossVectors(_hy, _hz);
  _hq.setFromRotationMatrix(_hm.makeBasis(_hx, _hy, _hz));
  a.el.getWorldQuaternion(_hr).invert();
  a.hand.quaternion.copy(_hr).multiply(_hq);
  // Gripping, the wrist bends (up to GRIP_WRIST flexion / extension) to lay the palm on the body. Without it the
  // fingers carried straight on along a forearm coming up from below and stabbed into the held body, so the
  // whole hand backed off 5-10 cm (Superman's fatality lift).
  if (palm) a.hand.quaternion.multiply(_hq.setFromAxisAngle(_XH, pw * Math.max(-GRIP_WRIST[0], Math.min(GRIP_WRIST[1],
    Math.atan2(-palm.dot(_hy), palm.dot(_hz))))));
  if (w > 0) a.hand.quaternion.multiply(_hq.setFromAxisAngle(_XH, Math.min(1, w) * WRIST_EXT));
  const lk = _limp * (1 - pw);
  if (lk > 0.01) {
    a.el.getWorldQuaternion(_hq).multiply(a.hand.quaternion);
    _hY.set(0, 1, 0).applyQuaternion(_hq); _hZ.set(0, 0, 1).applyQuaternion(_hq);
    // fingers (hand -y) bent by b about hand x point along -(Y cos b + Z sin b): lowest at b = atan2(Z.y, Y.y)
    const b0 = lk * Math.max(-LIMP_WRIST[0], Math.min(LIMP_WRIST[1], Math.atan2(_hZ.y, _hY.y)));
    const floor = Math.min(_floor + 0.012, lowestTip(a)); // (never below where the straight hand already reaches)
    _hb.copy(a.hand.quaternion);
    for (let i = 0; i <= 8; i++) {
      a.hand.quaternion.copy(_hb).multiply(_hq.setFromAxisAngle(_XH, b0 * (1 - i / 8)));
      if (i === 8 || lowestTip(a) >= floor) break;
    }
  }
  a.hand.updateMatrix(); a.hand.matrixWorld.multiplyMatrices(a.el.matrixWorld, a.hand.matrix); // the fingers update with the next full pass
}
// Hand shape: o = 0 is the sculpted fist; above OPEN_MIN the articulated hand replaces it, its fingers curling
// less as o rises (0.4-0.5 = a hooked grip / limp KO hand, 1 = flat with the fingers slightly spread). Each
// finger flexes at all three joints together (MCP 86, PIP 97, DIP 60 deg fully curled), the ring and pinky a
// little more than the index in a half-closed hand (the natural cascade), and the thumb swings from beside
// the index (open) to across the curled fingers (closed).
const OPEN_MIN = 0.06, MORPH_O = 0.35, FIST_FIT = [0.058, 0.177, 0.266, -0.002], CURL = [1.5, 1.7, 1.05], CASCADE = [0, 0.15, 0.35, 0.6], _DNH = new THREE.Vector3(0, -1, 0);
const THUMB_OPEN = [[0.55, -0.8, 0.22], [0.35, -0.93, 0.08], [0.25, -0.97, 0]].map(v => new THREE.Vector3(...v).normalize());
const THUMB_SHUT = [[0.35, -0.6, 0.45], [-0.3, -0.45, 0.72], [-0.95, -0.24, 0.18]].map(v => new THREE.Vector3(...v).normalize());
const _tp = new THREE.Vector3(), _td = new THREE.Vector3();
function bendFinger(f, k, o) {
  f.mcp.rotation.set(-CURL[0] * k, 0, f.spread * o);
  f.pip.rotation.x = -CURL[1] * k; f.dip.rotation.x = -CURL[2] * k;
}
function shapeHand(a, o) {
  const g = a.grip; if (!g) return;
  o = Math.max(0, Math.min(1, o || 0));
  if (Math.abs(o - g.o) < 1e-4) return;
  g.o = o;
  g.fistG.visible = o < OPEN_MIN; g.openG.visible = !g.fistG.visible;
  if (!g.openG.visible) return;
  // The sculpted fist is bigger than the curled articulated hand (punch face 1.8 cm, knuckle edge 2.2 cm, back
  // 1.3 cm), so every fist <-> open swap shrank / grew the hand in one frame. Near closed the open hand is
  // stretched to the fist's silhouette (fitted: max 1 cm off, mean 0.4) and relaxes to its own size by MORPH_O.
  const m = 1 - blend(OPEN_MIN, MORPH_O, o);
  g.openG.scale.set(1 + FIST_FIT[0] * m, 1 + FIST_FIT[1] * m, 1 + FIST_FIT[2] * m); g.openG.position.z = FIST_FIT[3] * m;
  for (const c of g.openG.children) if (c.morphTargetInfluences) c.morphTargetInfluences[0] = m; // wrist keeps its size
  const c = 1 - o;
  g.fingers.forEach((f, i) => bendFinger(f, Math.min(1, c + CASCADE[i] * c * (1 - c)), o));
  bendThumb(a, c);
}
function bendThumb(a, c) {
  const g = a.grip;
  _tp.set(a.s * 0.032, -0.018, 0.01);
  g.thumb.forEach((m, k) => {
    _td.copy(THUMB_OPEN[k]).lerp(THUMB_SHUT[k], c); _td.x *= a.s; _td.normalize();
    m.position.copy(_tp); m.quaternion.setFromUnitVectors(_DNH, _td);
    _tp.addScaledVector(_td, g.thumbL[k]);
  });
  g.thumbTip.position.copy(_tp);
}
// Grip contact (game throws): the hands used to hang 16-56 cm off the opponent they were holding, palms turned
// away from him. Now each hand reaches the nearest point of the held body's torso (his chest frame ellipse
// plus the sculpted pecs, the same shape the self-collision uses), the palm turns onto it and sits on the
// surface, and every finger curls on its own until it wraps the body: a flat palm on the chest, fingers hooked
// round the flank or over the shoulder. The palm lands no higher than GRIP_Y[1] so the fingers above it still lie
// on the chest (below GRIP_TOP); PALM_PTS' last point is the heel, which the wrist bend presses toward the body.
const GRIP_Y = [0.28, 0.6], GRIP_TOP = 0.66, PALM_C = new THREE.Vector3(0, -0.05, 0.018), PALM_GAP = 0.01, FINGER_GAP = 0.016, THUMB_GAP = 0.018, HYPER = -0.2, GRIP_REACH = [0.68, 0.85], GRIP_EASE = 0.35, GRIP_LIGHT = 0.35,
  PALM_PTS = [[0.04, -0.082, 0.018], [-0.04, -0.075, 0.018], [0, -0.085, 0.02], [0.03, -0.01, 0.014], [-0.03, -0.01, 0.014], [0, -0.01, 0.03]].map(p => new THREE.Vector3(...p));
// s.holdAt picks the grip surface: torso (throws), 'neck' (Superman's throat hold: the throat band under the jaw) or
// 'head' (Batman's clinch: both palms clasp the back of the skull behind the ears, the fingers wrapping it).
// Neck and head grips test fingers against the neck section above the torso, not the shoulders extended upward.
const NECK_Y = [0.745, 0.8], NECK_TOP = 0.835, HEAD_GRIP = new THREE.Vector3(0.8, 0.15, -0.55).normalize();
let _gBand = GRIP_Y, _gTop = GRIP_TOP, _gHead = false, _gLoop = false;
const GRIP_ACROSS = [0.05, 0.15], GRIP_FRONT = [0.15, 0.28], REL_V = 3;
const _gS = new THREE.Vector3(), _gN = new THREE.Vector3(), _gL = new THREE.Vector3(), _gW = new THREE.Vector3(), _gP = new THREE.Vector3(), _gT = new THREE.Vector3(), _gm = new THREE.Matrix4();
function torsoSurface(O, w, S, N, sh) {
  if (_gHead) { // back of the head, on the side of the holder's shoulder (so the hand never flips across)
    _gL.copy(sh); O.head.worldToLocal(_gL);
    const u = HEAD_GRIP, x = _gL.x < 0 ? -u.x : u.x;
    S.set(x * HEAD_R[0], u.y * HEAD_R[1], u.z * HEAD_R[2]).add(HEAD_C);
    N.set(x / HEAD_R[0], u.y / HEAD_R[1], u.z / HEAD_R[2]);
    O.head.localToWorld(S); N.transformDirection(O.head.matrixWorld);
    return;
  }
  _gL.copy(w); O.chest.worldToLocal(_gL);
  const oy = O.spine.position.y + O.chest.position.y, y = Math.min(_gBand[1], Math.max(_gBand[0], _gL.y + oy));
  const [rx, rz] = O.torsoSection(y), ang = Math.atan2(_gL.x / rx, _gL.z / rz);
  S.set(rx * Math.sin(ang), y - oy, rz * Math.cos(ang));
  if (S.z > 0 && Math.abs(S.x) < rx) S.z = Math.max(S.z, O.chestDepth(S.x, y));
  N.set(Math.sin(ang) / rx, 0, Math.cos(ang) / rz);
  O.chest.localToWorld(S); N.transformDirection(O.chest.matrixWorld);
}
// Inside the held body (torso + margin m, or head)? Above / below the torso band the section is extended
// straight up / down (the waist and hips go on below the chest frame's band; fingers hooked under the ribs
// slipped into them).
function touches(O, p, m) { // -> how deep (m) the point is inside, 0 = clear
  _gW.copy(p); O.chest.worldToLocal(_gW);
  // (the shoulders taper into the neck above GRIP_TOP; the held body's deltoids and traps fill that out)
  const y = Math.min(_gTop, Math.max(0.1, _gW.y + O.spine.position.y + O.chest.position.y)), [rx, rz] = O.torsoSection(y);
  let d = 0;
  const e = Math.hypot(_gW.x / (rx + m), _gW.z / (rz + m));
  if (e < 1) d = (1 - e) * Math.min(rx, rz) + m * (1 - e);
  if (_gW.z > 0 && Math.abs(_gW.x) < rx) d = Math.max(d, O.chestDepth(_gW.x, y) + m - _gW.z);
  if (pushOutOfHead(O, _gW.copy(p), m)) d = Math.max(d, _gW.distanceTo(p));
  return d;
}
// World position of a finger's tip (j = 3), DIP (2) or PIP (1) joint without touching the rest of the scene graph.
function fingerPoint(g, f, j, out) {
  _gm.multiplyMatrices(g.openG.matrixWorld, f.mcp.updateMatrix() ?? f.mcp.matrix);
  if (j > 1) _gm.multiply(f.pip.updateMatrix() ?? f.pip.matrix);
  if (j > 2) _gm.multiply(f.dip.updateMatrix() ?? f.dip.matrix);
  return out.copy(j === 1 ? f.pip.position : j === 2 ? f.dip.position : f.tip.position).applyMatrix4(_gm);
}
// Grip let go: the fingers used to snap from their wrapped curl straight back to the pose's in one frame.
// They return at RELAX per frame instead (g.wk stays set until they get there).
const RELAX = 0.1;
function relaxFingers(a, o) {
  const g = a.grip; if (!g.openG.visible) return;
  const c = 1 - o, wk = [], go = (pk, k) => pk + Math.max(-RELAX, Math.min(RELAX, k - pk));
  let left = false;
  g.fingers.forEach((f, i) => {
    const k0 = Math.min(1, c + CASCADE[i] * c * (1 - c)), k = go(g.pk[i] ?? k0, k0);
    if (Math.abs(k - k0) > 1e-3) left = true;
    wk[i] = k; bendFinger(f, k, o);
  });
  wk[4] = go(g.pk[4] ?? c, c); if (Math.abs(wk[4] - c) > 1e-3) left = true;
  bendThumb(a, wk[4]);
  g.wk = left ? wk : null;
  g.o = -1;
}
function wrapFingers(a, O, o, hw) {
  const g = a.grip; if (!g || !g.openG.visible) return 0;
  g.openG.updateMatrix(); g.openG.matrixWorld.multiplyMatrices(a.hand.matrixWorld, g.openG.matrix);
  // joints, tip and the middle of each segment (a segment can cut a curved body between two joints outside it)
  const hit = (f, k) => {
    bendFinger(f, k, o);
    for (let j = 1; j <= 3; j++) {
      fingerPoint(g, f, j, _C);
      if (touches(O, _C, FINGER_GAP) || (j > 1 && touches(O, _gL.copy(_C).add(_E).multiplyScalar(0.5), FINGER_GAP))) return true;
      _E.copy(_C);
    }
    return false;
  };
  // Letting go (the grip weight falling: released, thrown, pulled out of reach) or only just reaching in (below
  // GRIP_LIGHT) the hand isn't holding on: its fingers change curl at the relax rate instead of jumping to
  // wherever the moving body leaves room (8-15 cm fingertip pops in one frame).
  const c = 1 - o, rel = hw < (g.ph ?? 0) - 1e-3 || hw < GRIP_LIGHT;
  g.hw = hw;
  g.fingers.forEach((f, i) => {
    const k0 = Math.min(1, c + CASCADE[i] * c * (1 - c));
    // curl until the finger meets the body (stepping up from flat: a half-curled finger points into the body
    // while a fully curled one tucks back under the palm); already pressed flat against it: bend back a little
    let k = k0, lo = 0, hi = -1;
    if (hit(f, 0)) { lo = HYPER; hi = 0; }
    else for (let m = 0.125; m <= 1; m += 0.125) { if (hit(f, m)) { hi = m; break; } lo = m; }
    if (hi === 0 && hit(f, HYPER)) k = HYPER;
    else if (hi >= 0) {
      for (let it = 0; it < 4; it++) { const m = (lo + hi) / 2; if (hit(f, m)) hi = m; else lo = m; }
      k = lo;
    }
    if (hw < 1 && !hit(f, k0 + (k - k0) * hw)) k = k0 + (k - k0) * hw; // easing in, but never into the body
    // the contact search flips between neighbouring solutions as the bodies move (curled under / laid flat):
    // ease each finger toward its new curl (from last frame's) unless that would push it into the body
    const pk = g.pk?.[i] ?? k0, ek = pk + (k - pk) * GRIP_EASE;
    if (!hit(f, ek)) k = ek;
    if (rel) k = pk + Math.max(-RELAX, Math.min(RELAX, k - pk));
    g.wk[i] = k;
    bendFinger(f, k, o);
  });
  // The thumb closes across the palm side, i.e. into the body: open it until its joints and tip stay outside.
  const thit = (k) => {
    bendThumb(a, k);
    for (let j = 1; j <= 3; j++) {
      _C.copy(j < 3 ? g.thumb[j].position : g.thumbTip.position).applyMatrix4(g.openG.matrixWorld);
      if (touches(O, _C, THUMB_GAP) || (j > 1 && touches(O, _gL.copy(_C).add(_E).multiplyScalar(0.5), THUMB_GAP))) return true;
      _E.copy(_C);
    }
    return false;
  };
  let tc = c;
  if (thit(c)) {
    let lo = 0, hi = c;
    for (let it = 0; it < 6; it++) { const m = (lo + hi) / 2; if (thit(m)) hi = m; else lo = m; }
    tc = lo;
  }
  if (hw < 1 && !thit(c + (tc - c) * hw)) tc = c + (tc - c) * hw;
  const pt = g.pk?.[4] ?? c, et = pt + (tc - pt) * GRIP_EASE;
  if (!thit(et)) tc = et;
  if (rel) tc = pt + Math.max(-RELAX, Math.min(RELAX, tc - pt));
  g.wk[4] = tc;
  bendThumb(a, tc);
  g.o = -1; // shapeHand must re-apply its own curl next frame
  if (hw < 0.1) return 0;
  // Still in the body however the fingers bend (a torso widening toward the chest sinks the knuckles of a
  // palm laid on the waist): report the deepest finger, thumb or palm point so the hand can back off.
  let d = 0;
  for (const f of g.fingers) for (let j = 1; j <= 3; j++) {
    d = Math.max(d, touches(O, fingerPoint(g, f, j, _C), FINGER_GAP));
    if (j > 1) d = Math.max(d, touches(O, _gL.copy(_C).add(_E).multiplyScalar(0.5), FINGER_GAP));
    _E.copy(_C);
  }
  for (let j = 1; j <= 3; j++) d = Math.max(d, touches(O, _C.copy(j < 3 ? g.thumb[j].position : g.thumbTip.position).applyMatrix4(g.openG.matrixWorld), THUMB_GAP));
  for (const p of PALM_PTS) d = Math.max(d, touches(O, _C.set(p.x * a.s, p.y, p.z).applyMatrix4(g.openG.matrixWorld), 0.006));
  return d;
}

function posePass(H, s, t, ground, raise) {
  H.root.position.set(s.p[0] + _wsx, s.p[1] + raise, s.p[2] + _wsz);
  H.root.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ');
  // Athletic, coiled posture: the lean is spread through spine and chest at 1.35x (hunched shoulders,
  // chest driving forward) and the head counters most of it so the eyes stay on the opponent.
  // The pelvis tips forward too (anterior tilt) so the hinge starts at the hips, not just the back.
  // Only in standing/fighting stances: in tucks and kneels the thighs are already folded up to the belly.
  const tilt = Math.min(0.45, Math.max(0, s.lean)) * 0.3 * blend(0.5, 0.65, -Math.max(s.lf[1], s.rf[1]));
  const plant = (f) => (1 - blend(0.12, 0.3, s.p[1] + f[1] - ground)) * (1 - blend(0.5, 0.65, Math.hypot(f[0], f[2])));
  // Leaning back (kicks, hit reactions, dodges) was all spine: the chest bent up to 43 deg back over an upright
  // pelvis (a real lumbar + thoracic spine extends ~25-30), and a kick's straight leg rose 132-136 deg in the hip
  // socket (hamstrings stop a straight leg near 90-110). The pelvis now tips back (posterior tilt) by LEAN_PELVIS of
  // a backward lean, plus HIP_RHYTHM of a raised foot's swing past ~90 deg over a planted one (lumbopelvic rhythm);
  // the spine takes it back, so the chest, arms and head end up where they were.
  let pb = Math.min(0, s.lean) * LEAN_PELVIS;
  for (const [f, o] of [[s.lf, s.rf], [s.rf, s.lf]]) pb -= Math.max(0, Math.atan2(f[2], -f[1]) - HIP_RHYTHM[0]) * HIP_RHYTHM[1] * plant(o) * (1 - plant(f));
  // In-game leans go past the poses (a heavy hit adds -0.6, launches and stuns reach -0.9..-1.0), and the spine
  // (1.35x lean less the tilt) still arched 41-48 deg back: the rest beyond SPINE_EXT now tips the pelvis too.
  pb = Math.min(pb, s.lean * 1.35 + SPINE_EXT);
  // (a planted foot far behind, e.g. the rear leg of the head-hit reaction, stops the tilt short of over-extending its hip)
  for (const f of [s.lf, s.rf]) { const lim = Math.min(0, -HIP_EXT - Math.atan2(f[2], -f[1])); if (lim > pb) pb += (lim - pb) * plant(f); }
  const pt = tilt + pb;
  // (with a planted rear foot the tilt stops at HIP_EXT, and stuns bent the spine 46-49 deg back over it: the chest
  // and head then lean back only as far as SPINE_EXT allows)
  const lb = Math.max(s.lean, (pb - SPINE_EXT) / 1.35);
  H.hips.rotation.set(pt, 0, 0);
  H.spine.rotation.set(lb * 0.6 - pb, 0, s.roll * 0.3);
  H.chest.rotation.set(lb * 0.75 + Math.sin(t * 2.1) * 0.012, 0, 0);
  // Planted twist (see the feet below): the pelvis turns over planted feet only within TW_PLANT. A bigger wind-up
  // (hip toss, spinning elbow, haymaker, drive impact) still slid both feet 13-33 cm, because past that the whole body
  // turned as one block. Up to TW_SPINE more is now taken by the waist and ribcage (lumbar + thoracic rotation,
  // half each) over a pelvis that stays put: the chest, arms and head end up exactly where they were.
  const tq = s.tw ? Math.max(TW_PLANT[0] - TW_SPINE, Math.min(TW_PLANT[1] + TW_SPINE, s.tw)) * plant(s.lf) * plant(s.rf) : 0;
  const ex = tq > TW_PLANT[1] ? tq - TW_PLANT[1] : tq < TW_PLANT[0] ? tq - TW_PLANT[0] : 0;
  if (ex) {
    H.hips.quaternion.premultiply(_qs1.setFromAxisAngle(_Y, -ex));
    _qs2.setFromAxisAngle(_XA, -pt).multiply(_qs1.setFromAxisAngle(_Y, ex / 2)).multiply(_qs3.setFromAxisAngle(_XA, pt));
    _qs3.copy(H.spine.quaternion);
    H.spine.quaternion.premultiply(_qs2);
    H.chest.quaternion.premultiply(_qs1.copy(_qs3).invert().multiply(_qs2).multiply(_qs3));
  }
  // Chin tucked slightly in fighting stances (a glare from under the brow, not a raised chin).
  // hx / hy: optional extra head pitch / yaw (game mode: eyes track the opponent, snap back on hits).
  // Countering a deep lean while also looking up at the foe (getting up, crouched walks, throws) tipped the head
  // 56-65 deg back on the neck (a real neck extends ~50-60, the chin juts at the end of it): past NECK_EXT[0] the
  // extension eases into NECK_EXT[1], so the eyes look up from under the brow instead.
  let hx = -lb * 0.95 - tilt + Math.min(0.5, Math.max(0, s.lean)) * 0.25 + (s.hx || 0);
  if (hx < -NECK_EXT[0]) { const r = NECK_EXT[1] - NECK_EXT[0]; hx = -NECK_EXT[0] - r * Math.tanh((-hx - NECK_EXT[0]) / r); }
  H.head.rotation.set(hx, s.hy || 0, 0);
  H.root.updateMatrixWorld(true);

  // Game mode passes gph (gait phase driven by distance travelled) and gdx/gdz (hip-local travel direction):
  // each foot stays planted while the body passes over it, then lifts and swings ahead in the direction of
  // travel, so walking backwards or sideways no longer moonwalks. Film keyframes keep the timed sine gait.
  const g = s.gait || 0, ph = s.gph ?? t * Math.PI * 2 * 1.7, sw = Math.sin(ph), cw = Math.cos(ph);
  // (gdx/gdz is an eased average of the travel direction and is not renormalised: through a reversal it shrinks to
  // nothing and grows again the other way, so the feet come in under the hips and out the other side over the turn.
  // Renormalised, it flipped in one frame and threw every foot's target 2 x its stride offset: up to 23 cm a frame.)
  const gn = Math.max(1, Math.hypot(s.gdx || 0, s.gdz ?? 1)), gx = (s.gdx || 0) / gn * GAIT_SIDE, gz = (s.gdz ?? 1) / gn;
  const limbs = [
    ['L', s.lh, 0, 0, -sw * 0.22 * g],
    ['R', s.rh, 0, 0, sw * 0.22 * g],
  ];
  H.root.getWorldQuaternion(_qb);
  for (const [side, tg, , , dz] of limbs) {
    const a = H.arms[side];
    _T.set(tg[0], tg[1] + Math.min(0, dz), tg[2] + dz); H.root.localToWorld(_T);
    if (_T.y > ground - 0.6) _T.y = Math.max(_T.y, ground + 0.07); // fists rest on the roof, not in it
    pushOutOfTorso(H, _T, 0.065); // fists stay in front of / beside the chest, not sunk inside it
    // A fist pulled in onto its own shoulder (spinning elbow, drive impact's rear hand, the rush on a deep lean) left
    // the shoulder->fist direction undefined: a few cm of travel swung it round and the elbow jumped 20-29 cm in one
    // frame. Inside FOLD_R the target is eased out along a fixed forward-down-inward line, where a folded fist sits.
    a.sh.getWorldPosition(_fs); const fd = _fs.distanceTo(_T);
    if (fd < FOLD_R) _T.addScaledVector(_fv.set(-0.5 * a.s, -0.2, 0.9).normalize().applyQuaternion(H.chest.getWorldQuaternion(_fq)), FOLD_R - fd);
    const up = blend(0.6, 1.0, tg[1]); // fist raised above the shoulder: the elbow drops under it instead of flaring up and back
    _P.set(a.s * (0.5 + 0.1 * up), 0.2 - 0.7 * up, -0.6 + 0.7 * up); H.root.localToWorld(_P);
    swivelPole(H, a, _T, _P, 0.32, 0.30);
    // s.hold = the opponent held in this hand (s.holdW 0..1 eases the grip in and out): reach for his body,
    // palm centre onto the nearest surface point, palm turned onto it.
    // A body out of reach (Superman's overhead lift, the slam) is let go rather than stretched for.
    const O = s.hold, open = side === 'L' ? s.lo : s.ro;
    let hw = O && (!s.holdSide || s.holdSide === side) ? Math.min(1, s.holdW ?? 1) : 0;
    _gHead = s.holdAt === 'head'; _gBand = s.holdAt === 'neck' ? NECK_Y : GRIP_Y; _gTop = s.holdAt ? NECK_TOP : GRIP_TOP;
    // (eased per hand: the nearest surface point jumps about as both bodies move, and the hand flicked on and off)
    if (hw > 0.01 && a.grip) {
      a.sh.getWorldPosition(_A); torsoSurface(O, _T, _gS, _gN, _A);
      // (a spot across the midline and not out in front of the chest is reached only through the own torso)
      _gL.copy(_gS); H.chest.worldToLocal(_gL);
      const r = (1 - blend(GRIP_REACH[0], GRIP_REACH[1], _A.distanceTo(_gS))) * (1 - blend(GRIP_ACROSS[0], GRIP_ACROSS[1], -_gL.x * a.s) * (1 - blend(GRIP_FRONT[0], GRIP_FRONT[1], _gL.z)));
      a.grip.rw = a.grip.rw == null ? r : a.grip.rw + (r - a.grip.rw) * GRIP_EASE;
      hw *= a.grip.rw;
    } else if (a.grip) a.grip.rw = null;
    if (hw > 0.01) {
      _gP.copy(_gN).negate(); _gT.copy(_T);
      _T.copy(_gS).addScaledVector(_gN, 0.04);
      shapeHand(a, open);
      _gLoop = true;
      for (let it = 0; it < 3; it++) {
        solveIK(a.sh, a.el, 0.32, 0.30, _T, _P, true); orientHand(a, _qb, 0, _gP, 1);
        _C.copy(PALM_C); a.hand.localToWorld(_C);
        _T.add(_F.copy(_gS).addScaledVector(_gN, PALM_GAP).sub(_C));
      }
      _gLoop = false;
      _T.lerp(_gT, 1 - hw);
    }
    // Letting go (the hip toss turns the held spot away across the chest): the hand flew back to its pose 16-26 cm
    // a frame (10-15 m/s) and wrung the upper arm 100-175 deg on the way. A releasing hand now travels back in the
    // chest frame at most REL_V m/s.
    const gr = a.grip;
    if (gr && s.dt) {
      _F.copy(_T); H.chest.worldToLocal(_F);
      if (hw > 0.01 && hw >= (gr.rh ?? 0) - 1e-3) gr.rl = false; else if (gr.rp && hw < (gr.rh ?? 0)) gr.rl = true;
      if (gr.rl) {
        const d = _F.distanceTo(gr.rp), m = REL_V * s.dt;
        if (d > m) { _F.lerp(gr.rp, 1 - m / d); _T.copy(_F); H.chest.localToWorld(_T); } else if (hw <= 0.01) gr.rl = false;
      }
      if (!raise && !s.again) { (gr.rp ||= new THREE.Vector3()).copy(_F); gr.rh = hw; }
    }
    solveIK(a.sh, a.el, 0.32, 0.30, _T, _P, true);
    // Elbows tucked across the body used to sink into the ribs: swing the elbow out past the torso.
    a.el.getWorldPosition(_C);
    if (pushOutOfTorso(H, _C, 0.06)) {
      a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A), true); // pole through the pushed elbow
    }
    // Upper arm hugging the lats used to sink up to 4 cm into the side of the back (the arm looked thin and
    // glued into the torso): swing the elbow out until the middle of the upper arm clears the body.
    for (let it = 0; it < 2; it++) {
      a.sh.getWorldPosition(_A); a.el.getWorldPosition(_C); _C.lerp(_A, 0.5); _F.copy(_C);
      if (!pushOutOfTorso(H, _C, UPPER_R)) break;
      a.el.getWorldPosition(_E); _E.add(_C.sub(_F).multiplyScalar(2));
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _E.sub(_A).multiplyScalar(4).add(_A), true);
    }
    // Forearm resting across the chest: if its middle is inside the torso, move the fist out by the same amount.
    for (let it = 0; it < 2; it++) for (const u of [0.35, 0.7]) {
    a.el.getWorldPosition(_C); a.hand.getWorldPosition(_F); _C.lerp(_F, u); _F.copy(_C);
    if (pushOutOfTorso(H, _C, 0.07 /* forearm radius + gap */)) {
      _T.add(_C.sub(_F).multiplyScalar(1 / u));
      a.el.getWorldPosition(_C); a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A), true);
    }
    }
    const w = side === 'L' ? s.lw : s.rw, gp = a.grip;
    shapeHand(a, open);
    const gP = hw > 0.01 ? _gP : null;
    orientHand(a, _qb, w, gP, hw);
    // The torso checks above only see the wrist; the fist reaches 14 cm past it, and with the palm turned in
    // toward the body (guard, tucked jumps) its palm side and thumb sank up to 5 cm into the chest.
    // An open hand also checks its fingertips and thumb tip.
    // s.foe = the opponent (game): standing close (0.75 m) the guard fists sank up to 18 cm into his chest and
    // punches went through him, so a hand that isn't gripping also stays out of his torso and head (the fist's
    // knuckle face too, FOE_PTS).
    // (bodies overlapping, chests closer than FOE_NEAR: the uppercut lifting the foe off his feet at 0.40 m, his
    // torso already inside the fighter's own chest. The two push-outs threw the fist back and forth between the two
    // bodies, 35-50 cm a frame (144 fps), and left it inside the own chest with the elbow behind the back. There the
    // foe's push fades out (kf) and only the own body holds the fist.)
    const X = !s.hold && s.foe, kf = X ? blend(FOE_NEAR[0], FOE_NEAR[1], H.chest.getWorldPosition(_C4).distanceTo(X.chest.getWorldPosition(_C5))) : 0;
    const foe = (p, r) => { _fp.copy(p); if (!(pushOutOfTorso(X, p, r, a.sh.getWorldPosition(_C4).lerp(H.chest.getWorldPosition(_C5), 0.5)) || pushOutOfHead(X, p, r))) return false; p.lerp(_fp, 1 - kf); return true; };
    const out = (p, r) => pushOutOfTorso(H, p, r) || pushOutOfHead(H, p, r) || kf > 0.01 && foe(p, r);
    for (let it = 0; it < 3; it++) {
      let moved = false;
      _gW.set(0, 0, 0);
      for (const [x, y, z, r] of X ? FOE_PTS : FIST_PTS) {
        _C.set(a.s * x, y, z); a.hand.localToWorld(_C); _F.copy(_C);
        if (out(_C, r) && _C.sub(_F).lengthSq() > _gW.lengthSq()) { _gW.copy(_C); moved = true; }
      }
      if (moved) _T.add(_gW);
      if (!moved && gp && gp.openG.visible) for (const tip of gp.tips) {
        tip.getWorldPosition(_C); _F.copy(_C);
        if (out(_C, 0.012)) { _T.add(_C.sub(_F)); moved = true; break; }
      }
      if (!moved) break;
      // (the bend kept from before the push, turned only as far as the shoulder's range needs (SWIVEL.wl x the
      // penalty): a hook landing chest to chest on the foe (0.45 m) had its fist pushed back by the shoulder, and the
      // kept bend left the elbow out to the side with the forearm wrung up and back, humerus rot 110-132)
      bendPole(a, _C); swivelPole(H, a, _T, _C, 0.32, 0.30, true);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C, true);
      orientHand(a, _qb, w, gP, hw);
    }
    if (gp) gp.wk = gP ? gp.wk || [] : null; // per-finger eased grip curls (wrapFingers)
    if (gp && !gP && gp.pk) relaxFingers(a, Math.max(0, Math.min(1, open || 0)));
    // fingers wrap the held body; backed off it while a finger, the thumb or the palm still cannot clear it
    for (let it = 0, d; gP && it < 3 && (d = wrapFingers(a, O, Math.max(0, Math.min(1, open || 0)), hw)) > 0.002; it++) {
      _T.addScaledVector(_gN, d + 0.002);
      a.el.getWorldPosition(_C); a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A), true);
      orientHand(a, _qb, w, gP, hw);
    }
  }
  // Game strikes twist the whole body (s.tw is part of the root yaw), and the hip-relative feet swung round with
  // it: a planted foot skated 20-38 cm through an arc into a cross, hook, hip toss or spinning elbow. With both
  // feet on the ground in a stance (not a kick or sweep) they now keep their spot (up to TW_PLANT of twist) and the
  // hips turn over them, the boots pivoting with the body. (Wind-ups turning the back to the foe stop at 0.45:
  // further over a guard stance the thighs cross into each other; the waist takes the rest, above.)
  // Knees and boots aim from the pelvis (root turned back by ex), not the root: from the root they twisted the
  // thighs ex in the hip sockets.
  const q = -tq, qp = q + ex, qP = ex ? _qs1.copy(_qb).multiply(_qs2.setFromAxisAngle(_Y, -ex)) : _qb;
  H.hips.getWorldQuaternion(_hbQ); _hbF.set(0, 0, 1).applyQuaternion(_hbQ).setY(0).normalize(); _hbQ.invert(); // (HIP_BACK)
  for (const [side, tg0, lift, dz, p] of [['L', s.lf, Math.max(0, cw), sw, 0], ['R', s.rf, Math.max(0, -cw), -sw, 0.5]]) {
    const l = H.legs[side];
    let tg = q ? [tg0[0] * Math.cos(q) + tg0[2] * Math.sin(q), tg0[1], tg0[2] * Math.cos(q) - tg0[0] * Math.sin(q)] : tg0;
    let tgP = ex ? [tg0[0] * Math.cos(qp) + tg0[2] * Math.sin(qp), tg0[1], tg0[2] * Math.cos(qp) - tg0[0] * Math.sin(qp)] : tg;
    if (s.gph != null) {
      const [off, up] = gaitStep(s.gph / (Math.PI * 2) + p);
      _T.set(tg[0] + off * GAIT_A * g * gx, tg[1] + up * GAIT_LIFT * g, tg[2] + off * GAIT_A * g * gz);
    } else _T.set(tg[0], tg[1] + lift * 0.18 * g, tg[2] + dz * 0.32 * g);
    H.root.localToWorld(_T); if (l.lk) { _T.x -= _wsx; _T.z -= _wsz; } // (weightShift moves the body, not the held feet: a kick goes with it)
    if (_T.y - raise - ground < SOLE + LOCK.up) clampBack(l, _T, _hbQ, _hbF); // a planted foot no further behind than the hip extends
    const fy = ground + SOLE + raise, gk0 = l.gk;
    if (s.gph != null && s.lock != null) gaitLock(l, _T, s.gph / (Math.PI * 2) + p, s.lock === 1 && !l.lk ? blend(GLOCK.g[0], GLOCK.g[1], g) : 0, raise || s.again, s.yaw - ex,
      gk0 && !gk0.sw && thighBack(l, gk0.x, fy, gk0.z, _hbQ) > HIP_BACK[1], H.legs[side === 'L' ? 'R' : 'L']);
    // (a gait-locked foot's swing lift follows its own swing (u): held down for the other foot's step it kept the
    // phase's lift and hovered up to 12 cm over its planted spot)
    if (s.gph != null && s.lock != null) {
      const up0 = gaitStep(s.gph / (Math.PI * 2) + p)[1], up1 = !l.gk ? up0 : l.gk.sw ? Math.sin(Math.PI * l.gk.u) : 0;
      if (up1 !== up0) _T.addScaledVector(_ruV.set(0, 1, 0).applyQuaternion(H.root.getWorldQuaternion(_ruQ)), (up1 - up0) * GAIT_LIFT * g);
    }
    if (l.gk && l.gk.sw) clampBack(l, _T, _hbQ, _hbF, HIP_BACK[1]); // (a foot swinging off from behind trailed further back as the body went on)
    const gk = s.lock != null && l.gk, qF = gk && gk.dy ? _qs3.setFromAxisAngle(_Y, gk.dy).multiply(qP) : qP;
    // foot lock (see LOCK): the planted foot stays on its floor spot, easing out of it as the foot rises; a step
    // lifts the whole boot (sl: the boot-corner pass below keeps it that far off the roof, toes included)
    let sl = gk ? gk.oy : 0, lw = 0;
    if (s.lock != null) {
      const up = Math.max(0, _T.y - raise - ground - SOLE);
      if (!raise && !s.again) footLock(l, H.legs[side === 'L' ? 'R' : 'L'], _T, up, Math.hypot(tg0[0], tg0[2]), s.lock, s.dt || 0,
        !!l.lk && l.lk.st < 0 && thighBack(l, l.lk.ax, fy, l.lk.az, _hbQ) > HIP_BACK[1]);
      const k = l.lk;
      if (k && k.st < 0 && k.w >= 1 && !raise && !s.again) {
        _LK.set(k.ax, fy, k.az); clampBack(l, _LK, _hbQ, _hbF, HIP_BACK[2]); // (from where the ankle is: up on the ball it sits behind k)
        const dx = _LK.x - k.ax, dz = _LK.z - k.az;
        if (dx || dz) { k.x += dx; k.z += dz; if (k.bx != null) { k.bx += dx; k.bz += dz; } }
      }
      if (k) {
        const w = k.w;
        _T.x += (k.x - _T.x) * w; _T.z += (k.z - _T.z) * w; sl = k.y * w; lw = w;
        _LK.copy(_T); _LK.y -= raise; H.root.worldToLocal(_LK);
        tg = [_LK.x, _LK.y, _LK.z]; tgP = ex ? [...yawXZ(_LK, ex).toArray()] : tg;
      }
    }
    _T.y -= raise; // body-lift pass: feet stay planted where the first pass put them
    // Keep the boot sole on top of the roof (ankle sits 7.4 cm above the sole) instead of sinking into it;
    // targets far below (falling off the roof) are left alone.
    if (_T.y < ground + SOLE && _T.y > ground - 0.6) _T.y = ground + SOLE;
    // Knee pole tracks the foot's spread so knees track over the toes and never knock together.
    // It also rotates with the hip->foot direction (forward when the foot hangs below the hip, up and back
    // when it is kicked up past hip height): a fixed low-forward pole bent high kicks backwards at the knee.
    // Airborne = hips well above standing height (flying, jumps) and this ankle clear of the roof; ground
    // kicks, stances and landings keep the old flat foot.
    const air = blend(1.15, 1.5, s.p[1] + raise - ground) * blend(0.1, 0.35, _T.y - ground - SOLE);
    kneePole(H, l, tgP, ex);
    solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
    orientFoot(l, qF, air);
    // When the body is pitched (rolls, tumbles) the boot's toe/heel can still dip through the roof even
    // with the ankle above it: lift the ankle by the deficit of the lowest boot corner and re-solve.
    // Repeated: a heel lifted by the dorsiflexion cap changes the shin angle as the ankle rises.
    for (let it = 0; it < 4 && _T.y > ground - 0.6; it++) {
      let low = Infinity;
      for (const c of BOOT_CORNERS) { _P.copy(c); l.an.localToWorld(_P); low = Math.min(low, _P.y); }
      if (low >= ground + sl - 0.002) break;
      _T.y += ground + sl - low;
      kneePole(H, l, tgP, ex);
      solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
      orientFoot(l, qF);
    }
    const k = l.lk, pk = lw > 0 && k.st < 0 ? k : gk && !gk.sw ? gk : null; // (a planted walking foot rolls onto its ball too)
    if (pk) {
      _P.copy(BALL); l.an.localToWorld(_P); _LK.copy(HEEL); l.an.localToWorld(_LK);
      if (pk.bx == null) { if (!raise && !s.again) { pk.bx = _P.x; pk.bz = _P.z; } }
      else {
        const on = (pk === k ? lw : gk.w) * blend(0.01, 0.03, _LK.y - _P.y); // heel up: the ball holds its spot
        if (on > 0) {
          _T.x += (pk.bx - _P.x) * on; _T.z += (pk.bz - _P.z) * on;
          kneePole(H, l, tgP, ex);
          solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
          orientFoot(l, qF);
        }
      }
    }
    if (k && !s.again) { l.an.getWorldPosition(_P); k.ax = _P.x; k.az = _P.z; }
    if (!s.again) { _P.copy(BALL); l.an.localToWorld(_P); _LK.copy(HEEL); l.an.localToWorld(_LK); l.gy = Math.min(_P.y, _LK.y) - ground; } // (footLock: busy)
    if (!s.again) l.an.getWorldPosition(l.ga ||= new THREE.Vector3()); // (gait lock: where a newly held foot starts)
  }
}
