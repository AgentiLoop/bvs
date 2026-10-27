// Contoured, skinned Batman / Superman, posed with analytic two-bone IK.
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);

// Cool rim light (Fresnel) so the heroes' silhouettes pop off the night scene like comic-book art,
// which also keeps Batman's dark suit and cowl readable.
const rim = (m) => {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n  reflectedLight.directSpecular += vec3(0.22, 0.28, 0.4) * pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0);');
  };
  m.customProgramCacheKey = () => 'hero-rim';
  return m;
};
const mat = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  rim(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

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
    const pec = 0.06 * bump(Math.abs(x), 0.11, 0.075) * bump(y, 0.57, 0.065)
      - 0.012 * bump(y, 0.505, 0.012) * bump(Math.abs(x), 0.11, 0.07); // hard lower pec edge
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
  const eyes = [];
  const brow = B ? dark : mat(0x241c1a, 0.9);
  for (const s of [-1, 1]) {
    eyes.push(oval(head, new THREE.MeshStandardMaterial({ color: B ? 0xe4ecf2 : 0xe1ddd4, roughness: 0.6, emissive: 0 }),
      [s * 0.034, 0.143, faceZ(s * 0.034, 0.143) - 0.002], [0.018, 0.006, 0.006])); // seated in the socket
    if (!B) {
      oval(head, mat(0x416b88), [s * 0.034, 0.143, faceZ(s * 0.034, 0.143) + 0.0025], [0.0045, 0.005, 0.002]);
      oval(head, dark, [s * 0.034, 0.143, faceZ(s * 0.034, 0.143) + 0.0042], [0.002, 0.003, 0.001]);
    }
    line(head, [[s * 0.014, 0.156], [s * 0.032, 0.16], [s * 0.053, 0.157]].map(onFace(B ? 0.002 : 0.0015)), B ? 0.006 : 0.005, brow);
  }
  // Closed, firm mouth: a thin line close to the lip colour so it reads as set lips, not an open shout.
  line(head, [[-0.016, 0.0605], [0, 0.0615], [0.016, 0.0605]].map(onFace(0.0004)),
    B ? 0.0016 : 0.0011, mat(B ? 0x754b43 : 0x9a5f52, 0.9));

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
    // Closed at both ends so the fist never reads as a hollow ring.
    part(hand, surface([[-0.104, 0.001, 0.001, 0.016], [-0.095, 0.025, 0.028, 0.014], [-0.078, 0.044, 0.037, 0.012],
      [-0.035, 0.044, 0.031, 0.006], [0.005, 0.035, 0.03, 0], [0.016, 0.001, 0.001, 0]], p => p, 40, 32), handMat);
    // Clenched fist built from finger segments instead of four knuckle balls: each finger's first
    // phalanx juts forward from the knuckle, the second curls down, and the thumb wraps across the front.
    const seg = new THREE.CapsuleGeometry(1, 1, 6, 12);
    const phal = (pos, r, len, rot) => part(hand, seg, handMat, pos, [r, len / 2, r], rot);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * 0.019, tip = k === 0 || k === 3 ? 0.9 : 1; // outer fingers a touch smaller
      phal([x, -0.07, 0.044], 0.0095 * tip, 0.016, [Math.PI / 2, 0, 0]);
      phal([x, -0.087, 0.056], 0.0088 * tip, 0.014, [0.15, 0, 0]);
    }
    oval(hand, handMat, [-s * 0.036, -0.05, 0.03], [0.016, 0.026, 0.019]);          // thumb base
    phal([-s * 0.019, -0.097, 0.066], 0.0092, 0.024, [0, 0, s * (Math.PI / 2 - 0.25)]); // thumb over the fingers
    arms[side] = { sh, el, hand, s };

    const th = joint(hips, [s * 0.1, -0.04, 0]);
    const kn = joint(th, [0, -0.46, 0]);
    const an = joint(kn, [0, -0.46, 0]);
    // Athletic leg: thick thigh tapering hard into a narrow knee, a high calf peak set to the back,
    // and a slim ankle. The [y, rx, rz, zOffset] offset pushes the calf behind the shin.
    const legRows = [[-0.94, 0.033, 0.036, 0.004], [-0.87, 0.036, 0.04, 0.0], [-0.78, 0.05, 0.056, -0.01],
      [-0.68, 0.063, 0.068, -0.016], [-0.59, 0.06, 0.06, -0.01], [-0.5, 0.05, 0.05, 0.002],
      [-0.44, 0.054, 0.056, 0.006], [-0.34, 0.074, 0.078, 0.006], [-0.2, 0.092, 0.094, 0.002],
      [-0.06, 0.102, 0.1, 0], [0.04, 0.09, 0.09, 0], [0.09, 0.001, 0.001, 0]];
    const legGeo = surface(legRows, (p, a) => {
      p.x += s * 0.008 * bump(p.y, -0.2, 0.15);
      // The outer upper thigh flared 5 cm wider than the hips (legs looked bolted on). Slim it so the
      // hip line flows down into the thigh, which then tapers to the knee like a comic-book hero's.
      p.x -= s * 0.03 * bump(p.y, -0.09, 0.15) * Math.max(0, s * Math.sin(a)) ** 1.5;
      p.x += s * 0.014 * bump(p.y, -0.26, 0.09) * Math.max(0, s * Math.sin(a)) ** 1.5; // outer-quad sweep below the hip
      p.z += 0.014 * bump(p.y, -0.27, 0.1) * Math.max(0, Math.cos(a)); // quad sweep
      p.x -= s * 0.01 * bump(p.y, -0.42, 0.04) * Math.max(0, Math.cos(a)); // teardrop vastus
      p.z += 0.005 * bump(p.y, -0.49, 0.02) * Math.max(0, Math.cos(a)) ** 4; // kneecap
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
  return { kind, root, hips, spine, chest, head, arms, legs, eyes, torsoSection, chestDepth };
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
// pose: { p:[x,y,z] hips world, yaw, pitch, roll, lean, gait, lh, rh, lf, rf (hip-relative targets) }
const SOLE = 0.076;
const BOOT_CORNERS = [[0, -0.074, -0.058], [0, -0.074, 0.178], [0.042, -0.074, 0.06], [-0.042, -0.074, 0.06], [0, 0.021, 0.178], [0, 0.021, -0.058]]
  .map(p => new THREE.Vector3(...p));
// Contact radii of the joints that touch the roof in kneels, landings and lying poses.
const CONTACT = [['legs', 'kn', 0.062], ['arms', 'el', 0.055], ['arms', 'hand', 0.07]];
export function applyPose(H, s, t, ground = 0) {
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
  H.head.rotation.set(-s.lean * 0.95 - tilt + Math.min(0.5, Math.max(0, s.lean)) * 0.25, 0, 0);
  H.root.updateMatrixWorld(true);

  const g = s.gait || 0, ph = t * Math.PI * 2 * 1.7, sw = Math.sin(ph), cw = Math.cos(ph);
  const limbs = [
    ['L', s.lh, 0, 0, -sw * 0.22 * g],
    ['R', s.rh, 0, 0, sw * 0.22 * g],
  ];
  for (const [side, tg, , , dz] of limbs) {
    const a = H.arms[side];
    _T.set(tg[0], tg[1], tg[2] + dz); H.root.localToWorld(_T);
    if (_T.y > ground - 0.6) _T.y = Math.max(_T.y, ground + 0.07); // fists rest on the roof, not in it
    pushOutOfTorso(H, _T, 0.065); // fists stay in front of / beside the chest, not sunk inside it
    _P.set(a.s * 0.5, 0.2, -0.6); H.root.localToWorld(_P);
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
    if (pushOutOfTorso(H, _C, 0.06)) {
      _T.add(_C.sub(_F).multiplyScalar(1 / u));
      a.el.getWorldPosition(_C); a.sh.getWorldPosition(_A);
      solveIK(a.sh, a.el, 0.32, 0.30, _T, _C.sub(_A).multiplyScalar(4).add(_A));
    }
    }
  }
  H.root.getWorldQuaternion(_qb);
  for (const [side, tg, lift, dz] of [['L', s.lf, Math.max(0, cw), sw], ['R', s.rf, Math.max(0, -cw), -sw]]) {
    const l = H.legs[side];
    _T.set(tg[0], tg[1] + lift * 0.18 * g, tg[2] + dz * 0.32 * g); H.root.localToWorld(_T);
    _T.y -= raise; // body-lift pass: feet stay planted where the first pass put them
    // Keep the boot sole on top of the roof (ankle sits 7.4 cm above the sole) instead of sinking into it;
    // targets far below (falling off the roof) are left alone.
    if (_T.y < ground + SOLE && _T.y > ground - 0.6) _T.y = ground + SOLE;
    // Knee pole tracks the foot's spread so knees track over the toes and never knock together.
    _P.set(l.s * Math.max(0.15, Math.abs(tg[0]) * 1.5), -0.45, 1.0); H.root.localToWorld(_P);
    solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
    l.kn.getWorldQuaternion(_qa).invert();
    l.an.quaternion.copy(_qa).multiply(_qb);
    l.an.updateMatrixWorld(true);
    // When the body is pitched (rolls, tumbles) the boot's toe/heel can still dip through the roof even
    // with the ankle above it: lift the ankle by the deficit of the lowest boot corner and re-solve.
    if (_T.y > ground - 0.6) {
      let low = Infinity;
      for (const c of BOOT_CORNERS) { _P.copy(c); l.an.localToWorld(_P); low = Math.min(low, _P.y); }
      if (low < ground) {
        _T.y += ground - low;
        _P.set(l.s * Math.max(0.15, Math.abs(tg[0]) * 1.5), -0.45, 1.0); H.root.localToWorld(_P);
        solveIK(l.th, l.kn, 0.46, 0.46, _T, _P);
        l.kn.getWorldQuaternion(_qa).invert();
        l.an.quaternion.copy(_qa).multiply(_qb);
        l.an.updateMatrixWorld(true);
      }
    }
  }
}
