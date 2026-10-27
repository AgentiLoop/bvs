// Drop-in fan models: load models/<hero>.glb (static T/A-pose mesh, e.g. a CC0 Meshy fan model),
// cut it into rigid pieces in code (nearest bone capsule per triangle) and parent each piece to the
// procedural skeleton, so the existing IK choreography animates it. Falls back silently if absent.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FOOT_Y = -1.035, TOP_Y = 1.06; // procedural hero extents relative to hips

// rest-pose bone capsules in hips space: [joint object, start, end, radius]
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

export async function loadFanModel(H, url, { yaw = 0 } = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const src = gltf.scene;
  src.rotation.y = yaw;
  src.updateMatrixWorld(true);

  // gather triangles in model space (bind pose for skinned meshes)
  const parts = [];
  src.traverse((o) => { if (o.isMesh) parts.push(o); });
  const box = new THREE.Box3();
  for (const m of parts) {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    m.userData.g = g;
    g.computeBoundingBox(); box.union(g.boundingBox);
  }
  const size = box.getSize(new THREE.Vector3());
  const k = (TOP_Y - FOOT_Y) / size.y;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const norm = (v) => v.set((v.x - cx) * k, (v.y - box.min.y) * k + FOOT_Y, (v.z - cz) * k);

  // arm direction per side: from the shoulder to the farthest vertex out that side (T, A or down pose)
  const v = new THREE.Vector3(), armDir = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = new THREE.Vector3(s * 0.25, 0.6, 0);
    let best = null, bd = 0;
    for (const m of parts) {
      const P = m.userData.g.attributes.position;
      for (let i = 0; i < P.count; i += 3) {
        norm(v.fromBufferAttribute(P, i));
        if (s * v.x < 0.3 || v.y < -0.2 || v.y > 0.9) continue;
        const d = v.distanceToSquared(sh) + (s * v.x) * 0.5;
        if (d > bd) { bd = d; best = v.clone(); }
      }
    }
    armDir[side] = best ? best.sub(sh).normalize().toArray() : [0, -1, 0];
  }
  const BN = bones(H, armDir);

  // per-bone rotation that maps the model's rest direction onto the skeleton's rest direction (DOWN for limbs)
  const rigid = new Set([H.hips, H.spine, H.chest, H.head, H.legs.L.an, H.legs.R.an]);
  const restDir = (bn) => (rigid.has(bn.obj) ? null : new THREE.Vector3(0, -1, 0));
  const pivot = (bn) => bn.obj.getWorldPosition(new THREE.Vector3()).sub(H.hips.getWorldPosition(new THREE.Vector3()));

  // hide the procedural body
  const proc = [];
  H.root.traverse((o) => { if (o.isMesh) proc.push(o); });

  // reset skeleton to rest so joint world positions == rest layout
  const saved = [];
  H.root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone()]));
  H.root.position.set(0, 0, 0); H.root.quaternion.identity();
  H.root.traverse((o) => { if (o !== H.root && o.isObject3D && !o.isMesh) o.quaternion.identity(); });
  H.root.updateMatrixWorld(true);

  const xf = BN.map((bn) => {
    const piv = pivot(bn);
    const q = new THREE.Quaternion();
    const rd = restDir(bn);
    if (rd) q.setFromUnitVectors(_ab.subVectors(bn.b, bn.a).normalize(), rd);
    return { piv, q, start: rd ? bn.a : piv };
  });

  const out = [];
  const c = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (const m of parts) {
    const g = m.userData.g, P = g.attributes.position, N = g.attributes.normal;
    const buckets = BN.map(() => []);
    for (let i = 0; i < P.count; i += 3) {
      c.set(0, 0, 0);
      for (let j = 0; j < 3; j++) c.add(norm(tmp.fromBufferAttribute(P, i + j)));
      c.multiplyScalar(1 / 3);
      let bi = 0, bd = Infinity;
      BN.forEach((bn, n) => { const d = capsuleDist(c, bn); if (d < bd) { bd = d; bi = n; } });
      buckets[bi].push(i);
    }
    buckets.forEach((tris, bi) => {
      if (!tris.length) return;
      const { piv, q, start } = xf[bi];
      const names = Object.keys(g.attributes);
      const ng = new THREE.BufferGeometry();
      for (const name of names) {
        const A = g.attributes[name], is = A.itemSize, arr = new Float32Array(tris.length * 3 * is);
        tris.forEach((i, t) => { for (let j = 0; j < 3; j++) for (let e = 0; e < is; e++) arr[(t * 3 + j) * is + e] = A.getComponent(i + j, e); });
        ng.setAttribute(name, new THREE.BufferAttribute(arr, is, A.normalized));
      }
      ng.deleteAttribute('skinIndex'); ng.deleteAttribute('skinWeight');
      const pa = ng.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        norm(tmp.fromBufferAttribute(pa, i)).sub(start).applyQuaternion(q);
        pa.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      if (N) { const na = ng.attributes.normal; for (let i = 0; i < na.count; i++) { tmp.fromBufferAttribute(na, i).applyQuaternion(q); na.setXYZ(i, tmp.x, tmp.y, tmp.z); } }
      else ng.computeVertexNormals();
      const mesh = new THREE.Mesh(ng, m.material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.fan = true;
      BN[bi].obj.add(mesh);
      out.push(mesh);
    });
  }

  for (const [o, p, qq] of saved) { o.position.copy(p); o.quaternion.copy(qq); }
  H.root.updateMatrixWorld(true);
  for (const o of proc) o.visible = false;
  return out.length;
}
