// Drop-in fan models: load models/<hero>.glb (static mesh in T/A-pose or arms down), normalise it to the
// hero's size, and SKIN it smoothly onto the procedural IK skeleton (capsule-distance weights, blended only
// between connected bones). One continuous mesh, so there are no tears at the joints. Falls back to the
// procedural body if the file is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FOOT_Y = -1.035, TOP_Y = 1.06; // procedural hero extents relative to hips
const DOWN = new THREE.Vector3(0, -1, 0);

// rest-pose bone capsules in hips space
function bones(H, armDir) {
  const B = [
    [H.hips, [0, -0.06, 0], [0, 0.08, 0], 0.17],
    [H.spine, [0, 0.08, 0], [0, 0.36, 0], 0.16],
    [H.chest, [0, 0.36, 0], [0, 0.78, 0], 0.22],
    [H.head, [0, 0.82, 0], [0, 1.0, 0.02], 0.1],
  ];
  for (const side of ['L', 'R']) {
    const a = H.arms[side], s = a.s, d = armDir[side], sh = [s * 0.25, 0.6, 0];
    const el = sh.map((v, i) => v + d[i] * 0.32), wr = el.map((v, i) => v + d[i] * 0.3), tip = wr.map((v, i) => v + d[i] * 0.12);
    B.push([a.sh, sh, el, 0.08], [a.el, el, wr, 0.06], [a.hand, wr, tip, 0.05]);
    const l = H.legs[side], x = s * 0.1;
    B.push([l.th, [x, -0.04, 0], [x, -0.5, 0], 0.1], [l.kn, [x, -0.5, 0], [x, -0.94, 0], 0.07], [l.an, [x, -0.98, -0.02], [x, -1.0, 0.18], 0.06]);
  }
  return B.map(([obj, a, b, r]) => ({ obj, a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), r }));
}

const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function capsuleDist(p, bn) {
  _ab.subVectors(bn.b, bn.a);
  const t = Math.min(1, Math.max(0, _ap.subVectors(p, bn.a).dot(_ab) / _ab.lengthSq()));
  return _ap.copy(bn.a).addScaledVector(_ab, t).distanceTo(p) - bn.r;
}

export async function loadFanModel(H, url, { yaw = null } = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const src = gltf.scene;
  const wrap = new THREE.Group();
  wrap.add(src);
  wrap.updateMatrixWorld(true);

  const parts = [];
  src.traverse((o) => { if (o.isMesh) parts.push(o); });
  const gather = () => {
    const b = new THREE.Box3();
    for (const m of parts) {
      const g = m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (/^(skinIndex|skinWeight)$/.test(k)) g.deleteAttribute(k);
      g.morphAttributes = {};
      g.applyMatrix4(m.matrixWorld);
      m.userData.g = g;
      g.computeBoundingBox(); b.union(g.boundingBox);
    }
    return b;
  };
  let box = gather();
  // auto up-axis: Z-up exports get stood upright
  let sz = box.getSize(new THREE.Vector3());
  if (sz.z > sz.y * 1.3) { src.rotation.x = -Math.PI / 2; wrap.updateMatrixWorld(true); box = gather(); sz = box.getSize(new THREE.Vector3()); }
  // auto facing: toes stick out in front of the body -> rotate so the feet point +Z (snapped to 90°)
  if (yaw === null) {
    const feet = new THREE.Vector3(), all = new THREE.Vector3(), p = new THREE.Vector3();
    let nf = 0, na = 0;
    const footTop = box.min.y + sz.y * 0.04;
    for (const m of parts) {
      const P = m.userData.g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i); all.add(p); na++;
        if (p.y < footTop) { feet.add(p); nf++; }
      }
    }
    yaw = 0;
    if (nf && na) {
      const d = feet.multiplyScalar(1 / nf).sub(all.multiplyScalar(1 / na)).setY(0);
      if (d.lengthSq() > 1e-10) yaw = Math.round(Math.atan2(-d.x, d.z) / (Math.PI / 2)) * (Math.PI / 2);
    }
  }
  if (yaw) { wrap.rotation.y = yaw; wrap.updateMatrixWorld(true); box = gather(); }
  H.fanYaw = yaw;

  const size = box.getSize(new THREE.Vector3());
  const k = (TOP_Y - FOOT_Y) / size.y;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const norm = (v) => v.set((v.x - cx) * k, (v.y - box.min.y) * k + FOOT_Y, (v.z - cz) * k);
  for (const m of parts) {
    const P = m.userData.g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { norm(v.fromBufferAttribute(P, i)); P.setXYZ(i, v.x, v.y, v.z); }
    m.userData.g.computeBoundingSphere();
  }

  // arm direction per side: shoulder -> farthest vertex out that side (T, A or arms-down pose)
  const v = new THREE.Vector3(), armDir = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = new THREE.Vector3(s * 0.25, 0.6, 0);
    let best = null, bd = 0;
    for (const m of parts) {
      const P = m.userData.g.attributes.position;
      for (let i = 0; i < P.count; i += 3) {
        v.fromBufferAttribute(P, i);
        if (s * v.x < 0.3 || v.y < -0.2 || v.y > 0.9) continue;
        const d = v.distanceToSquared(sh) + (s * v.x) * 0.5;
        if (d > bd) { bd = d; best = v.clone(); }
      }
    }
    armDir[side] = best ? best.sub(sh).normalize().toArray() : [0, -1, 0];
  }
  H.fanArm = armDir;
  const BN = bones(H, armDir);
  const objs = BN.map((b) => b.obj);
  const adj = objs.map((o) => objs.map((p, j) => (p === o || p === o.parent || p.parent === o ? j : -1)).filter((j) => j >= 0));

  // put the skeleton into the model's bind pose (root at origin, arms along armDir) and capture inverses
  const saved = [];
  H.root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone()]));
  H.root.position.set(0, 0, 0); H.root.quaternion.identity();
  H.root.traverse((o) => { if (o !== H.root && !o.isMesh) o.quaternion.identity(); });
  for (const side of ['L', 'R']) H.arms[side].sh.quaternion.setFromUnitVectors(DOWN, new THREE.Vector3(...armDir[side]));
  H.root.updateMatrixWorld(true);
  const inverses = objs.map((o) => o.matrixWorld.clone().invert());
  const skeleton = new THREE.Skeleton(objs, inverses);

  const scene = H.root.parent;
  const meshes = [];
  const d = new Float32Array(BN.length);
  for (const m of parts) {
    const g = m.userData.g, P = g.attributes.position, n = P.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i);
      let best = 0;
      for (let b = 0; b < BN.length; b++) { d[b] = capsuleDist(v, BN[b]); if (d[b] < d[best]) best = b; }
      // cape / cloth: behind the body and away from every bone -> ride rigidly on the torso (no leg/arm tearing)
      if (v.z < -0.06 && d[best] > 0.06 && v.y < 0.85) {
        const t = THREE.MathUtils.clamp((v.y - 0.1) / 0.5, 0, 1); // hips -> chest by height
        const wc = t * t, wh = (1 - t) * (1 - t), ws = 1 - wc - wh;
        [[0, wh], [1, ws], [2, wc]].forEach(([b, w], j) => { si[i * 4 + j] = b; sw[i * 4 + j] = w; });
        continue;
      }
      const cand = adj[best].map((b) => [b, Math.exp(-(d[b] - d[best]) / 0.035)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = cand.reduce((s, c) => s + c[1], 0);
      cand.forEach(([b, w], j) => { si[i * 4 + j] = b; sw[i * 4 + j] = w / tot; });
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const sm = new THREE.SkinnedMesh(g, m.material);
    sm.bindMode = THREE.DetachedBindMode;
    sm.bind(skeleton, new THREE.Matrix4());
    sm.castShadow = sm.receiveShadow = true;
    sm.frustumCulled = false;
    sm.userData.fan = true;
    scene.add(sm);
    meshes.push(sm);
  }

  for (const [o, p, q] of saved) { o.position.copy(p); o.quaternion.copy(q); }
  H.root.updateMatrixWorld(true);
  H.root.traverse((o) => { if (o.isMesh) o.visible = false; });
  H.fanMeshes = meshes;
  return meshes.length;
}
