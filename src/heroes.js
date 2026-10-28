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
  const torsoGeo = surface(torsoRows, (p, a) => {
    if (Math.cos(a) > 0) p.z = chestDepth(p.x, p.y);
    else p.z -= 0.017 * bump(Math.abs(p.x), 0.11, 0.06) * bump(p.y, 0.56, 0.12) * -Math.cos(a);
    return p;
  }, 96);
  const torsoWeights = (p) => {
    const upper = blend(0.30, 0.49, p.y), lower = blend(0.06, 0.22, p.y);
    return [[hips, (1 - lower) * (1 - upper)], [spine, lower * (1 - upper)], [chest, upper]];
  };
  // The neck shares topology with the torso, with a separate costume/skin material band.
  torsoGeo.clearGroups();
  const neckRing = Math.ceil((0.738 - 0.035) / 0.8 * 96);
  torsoGeo.addGroup(0, neckRing * 48 * 6, 0);
  torsoGeo.addGroup(neckRing * 48 * 6, (96 - neckRing) * 48 * 6, 1);
  skinSurface(hips, torsoGeo, [suit, B ? dark : skin], torsoWeights);
  const emblemGeo = new THREE.PlaneGeometry(B ? 0.29 : 0.4, B ? 0.145 : 0.3, 32, 24); // Superman: big chest-spanning shield
  const ep = emblemGeo.attributes.position;
  for (let i = 0; i < ep.count; i++) {
    const x = ep.getX(i), y = ep.getY(i) + (B ? 0.565 : 0.545);
    ep.setXYZ(i, x, y, chestDepth(x, y) + 0.0025);
  }
  emblemGeo.computeVertexNormals();
  skinSurface(hips, emblemGeo, new THREE.MeshStandardMaterial({ map: emblemTexture(B ? 'bat' : 's'), alphaTest: 0.3, roughness: 0.75 }), torsoWeights);

  // Trunks are skinned: the leg openings follow the thighs (weights fade in below the belt), so a
  // lifted thigh carries the trunks with it instead of punching suit-coloured patches through them.
  const arms = {}, legs = {};
  const trunkRows = [[-0.095, 0.05, 0.05], [-0.06, 0.175, 0.106], [0.015, 0.168, 0.114], [0.085, 0.15, 0.106]];
  skinSurface(hips, surface(trunkRows, p => p, 32),
    B ? dark : red, p => {
      const lower = (1 - blend(-0.075, 0.05, p.y)) * 1.0, l = blend(-0.06, 0.06, p.x);
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
      p.y += 0.006 * blend(0.0, 0.045, -s * p.x) * fingers;                      // pinky side shorter than the index side
      return p;
    }, 48, 48);
    // The sculpted fist and an articulated open hand share the hand bone; shapeHand shows one or the other.
    const fistG = new THREE.Group(), openG = new THREE.Group();
    hand.add(fistG, openG); openG.visible = false;
    part(fistG, fistGeo, handMat);
    // Thumb on the lateral (+s) side: with the palm at +z it used to sit medially, a mirror-image hand on each arm.
    oval(fistG, handMat, [s * 0.036, -0.045, 0.026], [0.015, 0.026, 0.02]);    // thenar pad at the thumb base
    line(fistG, [[s * 0.044, -0.045, 0.03], [s * 0.04, -0.072, 0.058], [s * 0.016, -0.084, 0.07],
      [-s * 0.008, -0.086, 0.068]], 0.0105, handMat);                         // thumb across the fingers
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
      p.y += 0.008 * blend(0.0, 0.04, -s * p.x) * blend(-0.05, -0.08, p.y);  // pinky side of the knuckle line sits higher
      // Knuckles: the four metacarpal heads stand out on the back of the hand just above each finger, along the
      // slanted knuckle line; the smooth back of the open hand read as a mitten.
      const kn = FINGERS.reduce((v, [x, y]) => v + bump(p.x, s * x, 0.0062) * bump(p.y, y + 0.007, 0.009), 0);
      p.z -= 0.005 * kn * Math.max(0, -Math.cos(a));
      p.z += 0.004 * bump(p.y, -0.02, 0.02) * Math.max(0, Math.cos(a)) * (1 - blend(-0.01, 0.03, s * p.x)); // hypothenar heel
      return p;
    }, 48, 64);
    part(openG, palmGeo, handMat);
    oval(openG, handMat, [s * 0.028, -0.03, 0.012], [0.017, 0.03, 0.014]); // thenar pad
    const seg = (r, L) => new THREE.CapsuleGeometry(r, L, 4, 10).translate(0, -L / 2, 0);
    // nails on the backs of the fingertips and the thumb: over the distal half of the last segment
    const addNail = (parent, r, L, n) => nail && part(parent, sphere, nail, [n.x * r * 0.93, -L * 0.6, n.z * r * 0.93],
      [r * 0.72, L * 0.42, 0.0017], [0, Math.atan2(n.x, n.z), 0]);
    const fingers = [];
    for (const [fx, fy, fl, fr] of FINGERS) {
      const L = [0.042, 0.027, 0.02].map(v => v * fl);
      const mcp = new THREE.Group(); mcp.position.set(s * fx, fy, 0); openG.add(mcp);
      part(mcp, seg(fr, L[0]), handMat);
      const pip = new THREE.Group(); pip.position.y = -L[0]; mcp.add(pip);
      part(pip, seg(fr * 0.93, L[1]), handMat);
      const dip = new THREE.Group(); dip.position.y = -L[1]; pip.add(dip);
      part(dip, seg(fr * 0.86, L[2]), handMat);
      addNail(dip, fr * 0.86, L[2], { x: 0, z: -1 });                      // back of the hand is -z
      const tip = new THREE.Object3D(); tip.position.y = -L[2]; dip.add(tip);
      fingers.push({ mcp, pip, dip, tip, spread: s * fx * 3.2 });
    }
    const thumbL = [0.036, 0.032, 0.026], thumb = [0.0118, 0.0106, 0.0096].map((r, k) => part(openG, seg(r, thumbL[k]), handMat));
    addNail(thumb[2], 0.0096, thumbL[2], { x: s * 0.6, z: -0.8 });        // thumbnail faces out to the side and back
    const thumbTip = new THREE.Object3D(); openG.add(thumbTip);
    arms[side] = { sh, el, hand, s, grip: { fistG, openG, fingers, thumb, thumbL, thumbTip, tips: [thumbTip, ...fingers.map(f => f.tip)], o: -1 } };

    const th = joint(hips, [s * 0.1, -0.04, 0]);
    const kn = joint(th, [0, -0.46, 0]);
    const an = joint(kn, [0, -0.46, 0]);
    // Athletic leg: thick thigh tapering hard into a narrow knee, a high calf peak set to the back,
    // and a slim ankle. The [y, rx, rz, zOffset] offset pushes the calf behind the shin.
    // Hero legs: the mid-thigh and calf get extra mass on top of the athletic base. Superman is
    // drawn as a powerhouse (full weight), Batman as a leaner athlete (80%). The hip line (trunks)
    // and the knee / ankle stay as they were so the joints keep reading narrow.
    const bulk = B ? 0.8 : 1;
    const legRows = [[-0.94, 0.033, 0.036, 0.004], [-0.87, 0.036, 0.04, 0.0], [-0.78, 0.05, 0.056, -0.01],
      [-0.68, 0.063, 0.068, -0.016], [-0.59, 0.06, 0.06, -0.01], [-0.5, 0.05, 0.05, 0.002],
      [-0.44, 0.054, 0.056, 0.006], [-0.34, 0.074, 0.078, 0.006], [-0.2, 0.092, 0.094, 0.002],
      [-0.06, 0.102, 0.1, 0], [0.04, 0.09, 0.09, 0], [0.09, 0.001, 0.001, 0]].map(([y, rx, rz, o]) => {
      const thigh = 0.012 * bump(y, -0.27, 0.1), calf = 0.008 * bump(y, -0.68, 0.06);
      return [y, rx + bulk * (thigh + calf), rz + bulk * (thigh + calf * 1.2), o - bulk * calf * 0.6];
    });
    const legGeo = surface(legRows, (p, a) => {
      p.x += s * 0.008 * bump(p.y, -0.2, 0.15);
      // The outer upper thigh flared 5 cm wider than the hips (legs looked bolted on). Slim it so the
      // hip line flows down into the thigh, which then tapers to the knee like a comic-book hero's.
      p.x -= s * 0.03 * bump(p.y, -0.09, 0.15) * Math.max(0, s * Math.sin(a)) ** 1.5;
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
      // Boot cuff: a slight flared lip just below the boot top so the boot reads as a real boot, not paint.
      const cuff = 1 + 0.07 * bump(p.y, -0.612, 0.011);
      p.x *= cuff; p.z *= cuff;
      // Superman's classic boot top dips into a V at the front of the shin. Rings near the boot line are
      // pulled down at the front (smooth falloff, slope < 1 so rings never cross), moving the colour edge.
      if (!B) p.y -= 0.03 * bump(p.y, -0.6, 0.04) * Math.max(0, Math.cos(a)) ** 3;
      return p;
    }, 112, 40);
    legGeo.userData.limb = true;
    legGeo.clearGroups();
    const bootRing = Math.floor((-0.6 + 0.94) / 1.03 * 112);
    legGeo.addGroup(0, bootRing * 40 * 6, 1);
    // The top of the thigh bulges up to ~5 cm out through the sides of the trunks (blue/grey patches
    // poking through them). Colouring it as the trunks' leg band turns that into a clean brief line.
    const briefRing = Math.floor((-0.12 + 0.94) / 1.03 * 112);
    legGeo.addGroup(bootRing * 40 * 6, (briefRing - bootRing) * 40 * 6, 0);
    legGeo.addGroup(briefRing * 40 * 6, (112 - briefRing) * 40 * 6, 2);
    skinSurface(th, legGeo, [suit, boot, B ? dark : red], p => {
      // Front of the upper thigh shares weight with the hips so a raised knee folds the hip crease instead
      // of pushing suit out through the front of the trunks.
      const lower = 1 - blend(-0.52, -0.40, p.y), pelvis = Math.max(blend(-0.015, 0.10, p.y) * 0.7, 0.6 * blend(-0.34, -0.04, p.y) * (Math.max(0, p.z) / Math.hypot(p.x, p.z)) ** 3); // front only, gentle falloff: no groin pinch
      return [[kn, lower], [th, (1 - lower) * (1 - pelvis)], [hips, (1 - lower) * pelvis]];
    });
    // Boot foot: heel, high instep and a tapered toe on a flat sole, built along its length
    // ([length, halfWidth, halfHeight, -centreY]) and turned to point forward.
    const footGeo = surface([[-0.058, 0.001, 0.001, 0.04], [-0.05, 0.03, 0.03, 0.04], [-0.03, 0.038, 0.042, 0.03],
      [0.0, 0.04, 0.046, 0.026], [0.04, 0.042, 0.036, 0.04], [0.09, 0.041, 0.024, 0.052],
      [0.135, 0.033, 0.017, 0.058], [0.165, 0.019, 0.012, 0.061], [0.178, 0.001, 0.001, 0.063]],
    p => { p.z = Math.min(p.z, 0.074); return p; }, 48, 32);
    footGeo.rotateX(Math.PI / 2);
    footGeo.computeVertexNormals(); part(an, footGeo, boot);
    legs[side] = { th, kn, an, s };
  }
  root.updateMatrixWorld(true);
  const bones = [];
  root.traverse(o => { if (o.isBone) bones.push(o); });
  const skeleton = new THREE.Skeleton(bones);
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
    if (!g.attributes.normal || g.type === 'PlaneGeometry' || g.boundingSphere.radius * Math.max(...m.scale.toArray()) < 0.05) continue;
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
      w[i] = blend(1.02, 1.22, Math.hypot(x / rx, z / rz));
    }
    og.setAttribute('inkW', new THREE.BufferAttribute(w, 1));
    const o = m.isSkinnedMesh ? new THREE.SkinnedMesh(og, ink) : new THREE.Mesh(og, ink);
    o.frustumCulled = false;
    if (m.isSkinnedMesh) { root.add(o); o.bind(m.skeleton, m.bindMatrix); }
    else { o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale); m.parent.add(o); }
  }
  // Torso cross-section [halfWidth, halfDepth] at a hips-space height, for cloth collision.
  const torsoSection = (y) => contour(torsoRows, y);
  const dmg = { dmgP: { value: Array.from({ length: DMG_N }, () => new THREE.Vector3(0, -99, 0)) }, dmgS: { value: new Float32Array(DMG_N) }, dmgWear: { value: 0 } };
  const patched = new Set();
  root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial && !patched.has(m)) { patched.add(m); battleDamage(m, dmg); } });
  return { kind, root, hips, spine, chest, head, arms, legs, eyes, face: faceRig, torsoSection, chestDepth, dmg };
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

const _C = new THREE.Vector3();
// Push a world point radially out of the torso's elliptical cross-section (plus margin), measured in the
// chest's frame so it follows the lean. Returns true if it moved.
const UPPER_R = 0.06; // clearance for the upper-arm midpoint against the torso
function pushOutOfTorso(H, w, margin) {
  _C2.copy(w); H.chest.worldToLocal(_C2);
  const y = _C2.y + H.spine.position.y + H.chest.position.y;
  if (y < 0.1 || y > 0.72) return false;
  const [rx, rz] = H.torsoSection(y), e = (_C2.x / (rx + margin)) ** 2 + (_C2.z / (rz + margin)) ** 2;
  // The front has sculpted pecs/abs up to 6 cm proud of the ellipse; forearms in a guard sank into them.
  const front = _C2.z > 0 && Math.abs(_C2.x) < rx ? H.chestDepth(_C2.x, y) + margin : 0;
  if (e >= 1 && !(front && _C2.z < front)) return false;
  if (e < 1) { if (e < 1e-6) _C2.z = rz + margin; else { const k = 1 / Math.sqrt(e); _C2.x *= k; _C2.z *= k; } }
  if (front) _C2.z = Math.max(_C2.z, front);
  w.copy(H.chest.localToWorld(_C2));
  return true;
}
const _C2 = new THREE.Vector3();
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
export const GAIT_A = 0.3, GAIT_LIFT = 0.15, GAIT_SIDE = 0.55;
// One foot's cycle (p in cycles): first half planted, sliding back under the hips at constant speed (no skating
// against the ground), second half lifted on an arc and swung forward with an ease-in-out. -> [offset -1..1, lift 0..1]
function gaitStep(p) {
  p -= Math.floor(p);
  if (p < 0.5) return [1 - 4 * p, 0];
  const u = (p - 0.5) * 2;
  return [-1 + 2 * u * u * (3 - 2 * u), Math.sin(Math.PI * u)];
}
export function applyPose(H, s, t, ground = 0) {
  // last frame's grip curls (relaxFingers eases from them once the grip lets go)
  for (const side of ['L', 'R']) { const g = H.arms[side].grip; if (g) g.pk = g.wk ? g.wk.slice() : null; }
  posePass(H, s, t, ground, 0);
  // Knees, elbows and fists used to go up to 5 cm through the roof (Superman's landing kneel, Batman lying
  // down). Lift the body by the deepest contact deficit and re-solve with the feet held where they were.
  let deficit = 0;
  for (const [group, j, r] of CONTACT) for (const side of ['L', 'R']) {
    H[group][side][j].getWorldPosition(_P);
    if (_P.y > ground - 0.6) deficit = Math.max(deficit, ground + r - _P.y);
  }
  if (deficit > 0.002) posePass(H, s, t, ground, deficit);
}
// Knee pole into _P (world), from the root-local hip->foot direction in the sagittal plane: (vy, vz) -> (vz, -vy)
// maps straight down to straight forward, a horizontal forward leg to straight up, a high kick to up-and-back.
function kneePole(H, l, tg) {
  l.th.getWorldPosition(_P); H.root.worldToLocal(_P);
  let vy = tg[1] - _P.y, vz = tg[2] - _P.z;
  const n = Math.hypot(vy, vz) || 1; vy /= n; vz /= n;
  _P.set(l.s * Math.max(0.15, Math.abs(tg[0]) * 1.5), _P.y + vz, _P.z - vy); H.root.localToWorld(_P);
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
  _DN = new THREE.Vector3(0, -1, 0), _ax = new THREE.Vector3();
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
// w = wrist extension 0..1 (palm strikes): the hand bends back up to 66 deg so the heel of the palm leads
// and the fingers point up (a palm-down extended arm turns into a palm-forward strike).
const WRIST_EXT = 1.15, _XH = new THREE.Vector3(1, 0, 0);
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
  _hx.crossVectors(_hy, _hz);
  _hq.setFromRotationMatrix(_hm.makeBasis(_hx, _hy, _hz));
  a.el.getWorldQuaternion(_hr).invert();
  a.hand.quaternion.copy(_hr).multiply(_hq);
  if (w > 0) a.hand.quaternion.multiply(_hq.setFromAxisAngle(_XH, Math.min(1, w) * WRIST_EXT));
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
// round the flank or over the shoulder.
const GRIP_Y = [0.28, 0.66], PALM_C = new THREE.Vector3(0, -0.05, 0.018), PALM_GAP = 0.01, FINGER_GAP = 0.016, THUMB_GAP = 0.018, HYPER = -0.2, GRIP_REACH = [0.68, 0.85], GRIP_EASE = 0.35,
  PALM_PTS = [[0.04, -0.082, 0.018], [-0.04, -0.075, 0.018], [0, -0.085, 0.02], [0.03, -0.01, 0.014], [-0.03, -0.01, 0.014]].map(p => new THREE.Vector3(...p));
// s.holdAt picks the grip surface: torso (throws), 'neck' (Superman's throat hold: the throat band under the jaw) or
// 'head' (Batman's clinch: both palms clasp the back of the skull behind the ears, the fingers wrapping it).
// Neck and head grips test fingers against the neck section above the torso, not the shoulders extended upward.
const NECK_Y = [0.745, 0.8], NECK_TOP = 0.835, HEAD_GRIP = new THREE.Vector3(0.8, 0.15, -0.55).normalize();
let _gBand = GRIP_Y, _gTop = GRIP_Y[1], _gHead = false;
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
  // (the shoulders taper into the neck above GRIP_Y[1]; the held body's deltoids and traps fill that out)
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
  const c = 1 - o;
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
    // ease each finger toward its new curl unless that would push it into the body
    const pk = g.wk[i] ?? k0, ek = pk + (k - pk) * GRIP_EASE;
    if (!hit(f, ek)) k = ek;
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
  const pt = g.wk[4] ?? c, et = pt + (tc - pt) * GRIP_EASE;
  if (!thit(et)) tc = et;
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
  H.root.position.set(s.p[0], s.p[1] + raise, s.p[2]);
  H.root.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ');
  // Athletic, coiled posture: the lean is spread through spine and chest at 1.35x (hunched shoulders,
  // chest driving forward) and the head counters most of it so the eyes stay on the opponent.
  // The pelvis tips forward too (anterior tilt) so the hinge starts at the hips, not just the back.
  // Only in standing/fighting stances: in tucks and kneels the thighs are already folded up to the belly.
  const tilt = Math.min(0.45, Math.max(0, s.lean)) * 0.3 * blend(0.5, 0.65, -Math.max(s.lf[1], s.rf[1]));
  H.hips.rotation.set(tilt, 0, 0);
  H.spine.rotation.set(s.lean * 0.6, 0, s.roll * 0.3);
  H.chest.rotation.set(s.lean * 0.75 + Math.sin(t * 2.1) * 0.012, 0, 0);
  // Chin tucked slightly in fighting stances (a glare from under the brow, not a raised chin).
  // hx / hy: optional extra head pitch / yaw (game mode: eyes track the opponent, snap back on hits).
  H.head.rotation.set(-s.lean * 0.95 - tilt + Math.min(0.5, Math.max(0, s.lean)) * 0.25 + (s.hx || 0), s.hy || 0, 0);
  H.root.updateMatrixWorld(true);

  // Game mode passes gph (gait phase driven by distance travelled) and gdx/gdz (hip-local travel direction):
  // each foot stays planted while the body passes over it, then lifts and swings ahead in the direction of
  // travel, so walking backwards or sideways no longer moonwalks. Film keyframes keep the timed sine gait.
  const g = s.gait || 0, ph = s.gph ?? t * Math.PI * 2 * 1.7, sw = Math.sin(ph), cw = Math.cos(ph);
  const gn = Math.hypot(s.gdx || 0, s.gdz ?? 1) || 1, gx = (s.gdx || 0) / gn * GAIT_SIDE, gz = (s.gdz ?? 1) / gn;
  const limbs = [
    ['L', s.lh, 0, 0, -sw * 0.22 * g],
    ['R', s.rh, 0, 0, sw * 0.22 * g],
  ];
  H.root.getWorldQuaternion(_qb);
  for (const [side, tg, , , dz] of limbs) {
    const a = H.arms[side];
    _T.set(tg[0], tg[1], tg[2] + dz); H.root.localToWorld(_T);
    if (_T.y > ground - 0.6) _T.y = Math.max(_T.y, ground + 0.07); // fists rest on the roof, not in it
    pushOutOfTorso(H, _T, 0.065); // fists stay in front of / beside the chest, not sunk inside it
    _P.set(a.s * 0.5, 0.2, -0.6); H.root.localToWorld(_P);
    // s.hold = the opponent held in this hand (s.holdW 0..1 eases the grip in and out): reach for his body,
    // palm centre onto the nearest surface point, palm turned onto it.
    // A body out of reach (Superman's overhead lift, the slam) is let go rather than stretched for.
    const O = s.hold, open = side === 'L' ? s.lo : s.ro;
    let hw = O && (!s.holdSide || s.holdSide === side) ? Math.min(1, s.holdW ?? 1) : 0;
    _gHead = s.holdAt === 'head'; _gBand = s.holdAt === 'neck' ? NECK_Y : GRIP_Y; _gTop = s.holdAt ? NECK_TOP : GRIP_Y[1];
    // (eased per hand: the nearest surface point jumps about as both bodies move, and the hand flicked on and off)
    if (hw > 0.01 && a.grip) {
      a.sh.getWorldPosition(_A); torsoSurface(O, _T, _gS, _gN, _A);
      const r = 1 - blend(GRIP_REACH[0], GRIP_REACH[1], _A.distanceTo(_gS));
      a.grip.rw = a.grip.rw == null ? r : a.grip.rw + (r - a.grip.rw) * GRIP_EASE;
      hw *= a.grip.rw;
    } else if (a.grip) a.grip.rw = null;
    if (hw > 0.01) {
      _gP.copy(_gN).negate(); _gT.copy(_T);
      _T.copy(_gS).addScaledVector(_gN, 0.04);
      shapeHand(a, open);
      for (let it = 0; it < 3; it++) {
        solveIK(a.sh, a.el, 0.32, 0.30, _T, _P); orientHand(a, _qb, 0, _gP, 1);
        _C.copy(PALM_C); a.hand.localToWorld(_C);
        _T.add(_F.copy(_gS).addScaledVector(_gN, PALM_GAP).sub(_C));
      }
      _T.lerp(_gT, 1 - hw);
    }
    solveIK(a.sh, a.el, 0.32, 0.30, _T, _P);
    // Elbows tucked across the body used to sink into the ribs: swing the elbow out past the torso.
    a.el.getWorldPosition(_C);
    if (pushOutOfTorso(H, _C, 0.06)) {
      a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A)); // pole through the pushed elbow
    }
    // Upper arm hugging the lats used to sink up to 4 cm into the side of the back (the arm looked thin and
    // glued into the torso): swing the elbow out until the middle of the upper arm clears the body.
    for (let it = 0; it < 2; it++) {
      a.sh.getWorldPosition(_A); a.el.getWorldPosition(_C); _C.lerp(_A, 0.5); _F.copy(_C);
      if (!pushOutOfTorso(H, _C, UPPER_R)) break;
      a.el.getWorldPosition(_E); _E.add(_C.sub(_F).multiplyScalar(2));
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _E.sub(_A).multiplyScalar(4).add(_A));
    }
    // Forearm resting across the chest: if its middle is inside the torso, move the fist out by the same amount.
    for (let it = 0; it < 2; it++) for (const u of [0.35, 0.7]) {
    a.el.getWorldPosition(_C); a.hand.getWorldPosition(_F); _C.lerp(_F, u); _F.copy(_C);
    if (pushOutOfTorso(H, _C, 0.07 /* forearm radius + gap */)) {
      _T.add(_C.sub(_F).multiplyScalar(1 / u));
      a.el.getWorldPosition(_C); a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A));
    }
    }
    const w = side === 'L' ? s.lw : s.rw, gp = a.grip;
    shapeHand(a, open);
    const gP = hw > 0.01 ? _gP : null;
    orientHand(a, _qb, w, gP, hw);
    // The torso checks above only see the wrist; the fist reaches 14 cm past it, and with the palm turned in
    // toward the body (guard, tucked jumps) its palm side and thumb sank up to 5 cm into the chest.
    // An open hand also checks its fingertips and thumb tip.
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const [x, y, z, r] of FIST_PTS) {
        _C.set(a.s * x, y, z); a.hand.localToWorld(_C); _F.copy(_C);
        if (pushOutOfTorso(H, _C, r) || pushOutOfHead(H, _C, r)) { _T.add(_C.sub(_F)); moved = true; break; }
      }
      if (!moved && gp && gp.openG.visible) for (const tip of gp.tips) {
        tip.getWorldPosition(_C); _F.copy(_C);
        if (pushOutOfTorso(H, _C, 0.012) || pushOutOfHead(H, _C, 0.012)) { _T.add(_C.sub(_F)); moved = true; break; }
      }
      if (!moved) break;
      a.el.getWorldPosition(_C); a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A));
      orientHand(a, _qb, w, gP, hw);
    }
    if (gp) gp.wk = gP ? gp.wk || [] : null; // per-finger eased grip curls (wrapFingers)
    if (gp && !gP && gp.pk) relaxFingers(a, Math.max(0, Math.min(1, open || 0)));
    // fingers wrap the held body; backed off it while a finger, the thumb or the palm still cannot clear it
    for (let it = 0, d; gP && it < 3 && (d = wrapFingers(a, O, Math.max(0, Math.min(1, open || 0)), hw)) > 0.002; it++) {
      _T.addScaledVector(_gN, d + 0.002);
      a.el.getWorldPosition(_C); a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A));
      orientHand(a, _qb, w, gP, hw);
    }
  }
  for (const [side, tg, lift, dz, p] of [['L', s.lf, Math.max(0, cw), sw, 0], ['R', s.rf, Math.max(0, -cw), -sw, 0.5]]) {
    const l = H.legs[side];
    if (s.gph != null) {
      const [off, up] = gaitStep(s.gph / (Math.PI * 2) + p);
      _T.set(tg[0] + off * GAIT_A * g * gx, tg[1] + up * GAIT_LIFT * g, tg[2] + off * GAIT_A * g * gz);
    } else _T.set(tg[0], tg[1] + lift * 0.18 * g, tg[2] + dz * 0.32 * g);
    H.root.localToWorld(_T);
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
    kneePole(H, l, tg);
    solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
    orientFoot(l, _qb, air);
    // When the body is pitched (rolls, tumbles) the boot's toe/heel can still dip through the roof even
    // with the ankle above it: lift the ankle by the deficit of the lowest boot corner and re-solve.
    // Repeated: a heel lifted by the dorsiflexion cap changes the shin angle as the ankle rises.
    for (let it = 0; it < 4 && _T.y > ground - 0.6; it++) {
      let low = Infinity;
      for (const c of BOOT_CORNERS) { _P.copy(c); l.an.localToWorld(_P); low = Math.min(low, _P.y); }
      if (low >= ground - 0.002) break;
      _T.y += ground - low;
      kneePole(H, l, tg);
      solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
      orientFoot(l, _qb);
    }
  }
}
