// Contoured, skinned Batman / Superman, posed with analytic two-bone IK.
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
  const suit = mat(B ? 0x414751 : 0x174b9c, 0.66, 0.04);
  const dark = mat(0x10151e, 0.57, 0.06);
  const red = mat(0xa9152b, 0.64);
  const skin = mat(0xdca784, 0.84);
  const yellow = mat(0xd9ac38, 0.48, 0.24);
  const boot = B ? dark : red;
  const root = new THREE.Group();
  const hips = joint(root, [0, 0, 0]);
  const spine = joint(hips, [0, 0.08, 0]);
  const chest = joint(spine, [0, 0.28, 0]);
  const head = joint(chest, [0, 0.43, 0]);
  head.scale.setScalar(1.14); // heroic head-to-shoulder ratio (~1:3) instead of a pinhead
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const oval = (parent, material, pos, scale) => part(parent, sphere, material, pos, scale);
  const skins = [];
  const skinSurface = (parent, geometry, material, weights) => skins.push({ parent, geometry, material, weights });
  const line = (parent, points, radius, material) => part(parent,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 8, false), material);

  // The pecs, sternum, obliques and abdomen are sculpted into one continuous surface.
  // Heavyweight V-taper: wide lats/chest, trapezius slope into a thick neck, tight waist.
  const torsoRows = [[0.035, 0.155, 0.108], [0.13, 0.142, 0.104], [0.23, 0.14, 0.103],
    [0.34, 0.178, 0.12], [0.45, 0.228, 0.14], [0.56, 0.262, 0.152],
    [0.64, 0.252, 0.142], [0.69, 0.205, 0.12], [0.735, 0.1, 0.082],
    [0.78, B ? 0.065 : 0.074, B ? 0.063 : 0.068], [0.835, B ? 0.061 : 0.069, B ? 0.06 : 0.064]];
  const chestDepth = (x, y) => {
    const [rx, rz] = contour(torsoRows, y);
    const base = rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
    const pec = 0.052 * bump(Math.abs(x), 0.105, 0.07) * bump(y, 0.565, 0.065);
    const abs = [0.21, 0.285, 0.36, 0.427].reduce((v, cy) => v + 0.016 * bump(Math.abs(x), 0.047, 0.035) * bump(y, cy, 0.028), 0);
    const sternum = -0.007 * bump(x, 0, 0.017) * bump(y, 0.52, 0.12);
    const clavicle = 0.011 * bump(y, 0.663 - Math.abs(x) * 0.10, 0.013) * bump(Math.abs(x), 0.12, 0.10);
    return base + pec + abs + sternum + clavicle;
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
  const emblemGeo = new THREE.PlaneGeometry(B ? 0.22 : 0.17, B ? 0.11 : 0.155, 24, 20);
  const ep = emblemGeo.attributes.position;
  for (let i = 0; i < ep.count; i++) {
    const x = ep.getX(i), y = ep.getY(i) + 0.565;
    ep.setXYZ(i, x, y, chestDepth(x, y) + 0.0025);
  }
  emblemGeo.computeVertexNormals();
  skinSurface(hips, emblemGeo, new THREE.MeshStandardMaterial({ map: emblemTexture(B ? 'bat' : 's'), alphaTest: 0.3, roughness: 0.75 }), torsoWeights);

  part(hips, surface([[-0.095, 0.05, 0.05], [-0.06, 0.142, 0.104], [0.015, 0.162, 0.114], [0.085, 0.15, 0.106]], p => p, 32), B ? dark : red);
  part(hips, surface([[0.063, 0.153, 0.108], [0.071, 0.158, 0.113], [0.103, 0.153, 0.11], [0.11, 0.148, 0.105]], p => p, 12), yellow);
  oval(hips, yellow, [0, 0.087, 0.114], [0.03, 0.024, 0.011]);
  if (B) for (const s of [-1, 1]) for (const a of [0.5, 0.9, 1.3])
    oval(hips, yellow, [s * Math.sin(a) * 0.158, 0.084, Math.cos(a) * 0.112], [0.024, 0.034, 0.018]);

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
  const faceSculpt = (p, a) => {
    const front = Math.max(0, Math.cos(a));
    p.x = Math.sign(p.x) * Math.pow(Math.abs(Math.sin(a)), 0.83) * contour(faceRows, p.y)[0];
    p.z += front ** 5 * (0.025 * bump(p.x, 0, 0.014) * bump(p.y, 0.112, 0.032)
      + 0.012 * bump(p.y, 0.032, 0.023) - 0.008 * bump(p.y, 0.068, 0.012));
    p.z -= 0.008 * bump(Math.abs(p.x), 0.034, 0.021) * bump(p.y, 0.144, 0.014) * front;
    return p;
  };
  const faceGeo = surface(faceRows, faceSculpt, 72);
  if (B) {
    // Color the exposed jaw on the cowl surface; there is no overlapping mouth patch.
    const colors = [], pos = faceGeo.attributes.position;
    const cowlColor = dark.color, skinColor = skin.color;
    for (let i = 0; i < pos.count; i++) {
      const jaw = pos.getY(i) < 0.082 && pos.getZ(i) > 0.045 && Math.abs(pos.getX(i)) < 0.062;
      const c = jaw ? skinColor : cowlColor; colors.push(c.r, c.g, c.b);
    }
    faceGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    part(head, faceGeo, mat(0xffffff, 0.7, 0, { vertexColors: true }));
    for (const s of [-1, 1]) {
      const ear = surface([[0.19, 0.025, 0.022], [0.235, 0.018, 0.014], [0.30, 0.01, 0.007], [0.36, 0.0001, 0.0001]], p => { p.x += s * (0.064 + (p.y - 0.19) * 0.045); return p; }, 32, 24);
      part(head, ear, dark, [0, 0, -0.017]);
    }
  } else {
    part(head, faceGeo, skin);
    const hair = mat(0x0c1018, 0.48);
    const hairGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const hp = hairGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      // Low hairline at the temples and enough volume to cover the crown fully.
      const hairline = 0.158 + 0.02 * Math.max(0, z) - 0.012 * (1 - Math.abs(z));
      hp.setXYZ(i, x * 0.093, hairline + y * (0.09 + 0.01 * z), z * 0.092 - 0.006);
    }
    hairGeo.computeVertexNormals(); part(head, hairGeo, hair);
    oval(head, hair, [0.008, 0.222, 0.05], [0.07, 0.02, 0.045]); // low swept front, not a top-knot
    for (const s of [-1, 1]) oval(head, hair, [s * 0.08, 0.15, -0.004], [0.014, 0.034, 0.03]); // sideburns
    line(head, [[-0.027, 0.21, 0.06], [0.003, 0.2, 0.077], [0.017, 0.184, 0.078], [0.008, 0.169, 0.079], [-0.002, 0.174, 0.079]], 0.004, hair);
    for (const s of [-1, 1]) oval(head, skin, [s * 0.085, 0.126, -0.004], [0.012, 0.026, 0.017]);
  }
  const eyes = [];
  const brow = B ? dark : mat(0x241c1a, 0.9);
  for (const s of [-1, 1]) {
    eyes.push(oval(head, new THREE.MeshStandardMaterial({ color: B ? 0xe4ecf2 : 0xe1ddd4, roughness: 0.6, emissive: 0 }),
      [s * 0.034, 0.143, 0.071], [0.018, 0.006, 0.006]));
    if (!B) {
      oval(head, mat(0x416b88), [s * 0.034, 0.143, 0.077], [0.0045, 0.005, 0.002]);
      oval(head, dark, [s * 0.034, 0.143, 0.079], [0.002, 0.003, 0.001]);
    }
    line(head, [[s * 0.014, 0.156, 0.076], [s * 0.032, 0.16, 0.076], [s * 0.053, 0.158, 0.067]], B ? 0.006 : 0.0035, brow);
  }
  line(head, [[-0.018, 0.06, 0.077], [0, 0.061, 0.08], [0.018, 0.06, 0.077]], 0.0016, mat(0x754b43, 0.9));

  const arms = {}, legs = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint(chest, [s * 0.24, 0.235, 0]);
    const el = joint(sh, [0, -0.32, 0]);
    const hand = joint(el, [0, -0.3, 0]);
    const armRows = [[-0.63, 0.036, 0.034], [-0.57, 0.043, 0.039], [-0.49, 0.062, 0.052],
      [-0.41, 0.074, 0.06], [-0.32, 0.055, 0.054], [-0.25, 0.07, 0.072],
      [-0.16, 0.086, 0.084], [-0.065, 0.088, 0.086], [0.015, 0.1, 0.092],
      [0.072, 0.07, 0.064], [0.1, 0.001, 0.001]];
    const armGeo = surface(armRows, (p, a) => {
      p.z += 0.02 * bump(p.y, -0.17, 0.065) * Math.cos(a) ** 3; // biceps peak
      p.x += s * 0.017 * bump(p.y, 0.005, 0.06);
      return p;
    }, 80, 40);
    armGeo.clearGroups();
    const cuffRing = Math.floor((-0.40 + 0.63) / 0.731 * 80);
    armGeo.addGroup(0, cuffRing * 40 * 6, B ? 1 : 0);
    armGeo.addGroup(cuffRing * 40 * 6, (80 - cuffRing) * 40 * 6, 0);
    skinSurface(sh, armGeo, [suit, dark], p => {
      const lower = 1 - blend(-0.38, -0.26, p.y), shoulder = blend(0.015, 0.095, p.y) * 0.7;
      return [[el, lower], [sh, (1 - lower) * (1 - shoulder)], [chest, (1 - lower) * shoulder]];
    });
    if (B) for (let k = 0; k < 3; k++)
      part(el, new THREE.ConeGeometry(0.012, 0.06, 4), dark, [s * 0.072, -0.11 - k * 0.05, -0.02], [0.6, 1, 1], [0, 0, -s * 1.1]);
    const handMat = B ? dark : skin;
    part(hand, surface([[-0.095, 0.025, 0.028, 0.014], [-0.078, 0.044, 0.037, 0.012],
      [-0.035, 0.044, 0.031, 0.006], [0.005, 0.035, 0.03, 0]], p => p, 32, 32), handMat);
    for (let k = 0; k < 4; k++) oval(hand, handMat, [(k - 1.5) * 0.019, -0.072, 0.039], [0.011, 0.016, 0.012]);
    oval(hand, handMat, [-s * 0.034, -0.036, 0.028], [0.018, 0.031, 0.021]);
    arms[side] = { sh, el, hand, s };

    const th = joint(hips, [s * 0.1, -0.04, 0]);
    const kn = joint(th, [0, -0.46, 0]);
    const an = joint(kn, [0, -0.46, 0]);
    const legRows = [[-0.94, 0.044, 0.044], [-0.85, 0.048, 0.048], [-0.73, 0.07, 0.066],
      [-0.62, 0.08, 0.078], [-0.54, 0.064, 0.062], [-0.46, 0.058, 0.06],
      [-0.37, 0.078, 0.078], [-0.25, 0.098, 0.095], [-0.12, 0.108, 0.102],
      [-0.025, 0.1, 0.098], [0.06, 0.062, 0.066], [0.09, 0.001, 0.001]];
    const legGeo = surface(legRows, (p, a) => {
      p.x += s * 0.01 * bump(p.y, -0.2, 0.15);
      p.z += 0.012 * bump(p.y, -0.29, 0.14) * Math.max(0, Math.cos(a));
      p.z -= 0.017 * bump(p.y, -0.65, 0.09);
      return p;
    }, 96, 40);
    legGeo.clearGroups();
    const bootRing = Math.floor((-0.61 + 0.94) / 1.04 * 96);
    legGeo.addGroup(0, bootRing * 40 * 6, 1);
    legGeo.addGroup(bootRing * 40 * 6, (96 - bootRing) * 40 * 6, 0);
    skinSurface(th, legGeo, [suit, boot], p => {
      const lower = 1 - blend(-0.52, -0.40, p.y), pelvis = blend(-0.015, 0.10, p.y) * 0.7;
      return [[kn, lower], [th, (1 - lower) * (1 - pelvis)], [hips, (1 - lower) * pelvis]];
    });
    const footGeo = new THREE.SphereGeometry(1, 40, 24);
    const fp = footGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
      fp.setXYZ(i, x * (0.057 + 0.007 * z), Math.max(-0.071, y * 0.055 - 0.025), z * 0.126 + 0.06);
    }
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
