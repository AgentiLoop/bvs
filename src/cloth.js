// Verlet cloth cape pinned to a hero's shoulders, colliding with body spheres and the roof.
import * as THREE from 'three';

const _v = new THREE.Vector3();

const COLLIDERS = [
  ['chest', [0.1, 0.17, 0], 0.17], ['chest', [-0.1, 0.17, 0], 0.17], ['chest', [0, 0.33, -0.02], 0.13],
  ['spine', [0, 0.1, 0], 0.16], ['hips', [0, 0, 0], 0.2], ['head', [0, 0.11, 0], 0.13],
];

export class Cape {
  constructor(hero, { cols, rows, topW, botW, len, color, scallop = false }) {
    this.hero = hero; this.cols = cols; this.rows = rows;
    const n = cols * rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.canon = [];
    for (let j = 0; j < rows; j++) {
      const w = topW + (botW - topW) * Math.pow(j / (rows - 1), 0.8);
      for (let i = 0; i < cols; i++)
        this.canon.push(new THREE.Vector3((i / (cols - 1) - 0.5) * w, 0.31 - (j * len) / (rows - 1), -0.13 - j * 0.04));
    }
    const idx = (i, j) => j * cols + i;
    this.cons = [];
    const link = (a, b, k = 1) => this.cons.push([a, b, this.canon[a].distanceTo(this.canon[b]) * k]);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (i < cols - 1) link(idx(i, j), idx(i + 1, j));
      if (j < rows - 1) link(idx(i, j), idx(i, j + 1), scallop && j === rows - 2 && i % 2 ? 0.45 : 1);
      if (i < cols - 1 && j < rows - 1) { link(idx(i, j), idx(i + 1, j + 1)); link(idx(i + 1, j), idx(i, j + 1)); }
      if (j < rows - 2) link(idx(i, j), idx(i, j + 2));
      if (i < cols - 2) link(idx(i, j), idx(i + 2, j));
    }
    this.colliders = COLLIDERS.map(([bone, off, r]) => ({ bone: hero[bone], off: new THREE.Vector3(...off), r, c: new THREE.Vector3() }));

    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const uv = [], index = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) uv.push(i / (cols - 1), 1 - j / (rows - 1));
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
      index.push(a, c, b, b, c, d);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
  }

  reset() {
    this.hero.root.updateMatrixWorld(true);
    this.canon.forEach((c, k) => {
      _v.copy(c); this.hero.chest.localToWorld(_v);
      this.pos.set([_v.x, _v.y, _v.z], k * 3); this.prev.set([_v.x, _v.y, _v.z], k * 3);
    });
    this.updateMesh();
  }

  step(dt, t, wind, groundFn) {
    const P = this.pos, Q = this.prev, cols = this.cols, n = this.canon.length;
    for (const c of this.colliders) { c.c.copy(c.off); c.bone.localToWorld(c.c); }
    const dt2 = dt * dt, damp = 0.982;
    for (let k = 0; k < n; k++) {
      const o = k * 3;
      if (k < cols) {
        _v.copy(this.canon[k]); this.hero.chest.localToWorld(_v);
        P[o] = Q[o] = _v.x; P[o + 1] = Q[o + 1] = _v.y; P[o + 2] = Q[o + 2] = _v.z;
        continue;
      }
      const j = Math.floor(k / cols), i = k % cols;
      const flutter = 0.55 + 0.45 * Math.sin(t * 7.3 + j * 0.8 + i * 0.45);
      for (let a = 0; a < 3; a++) {
        const vel = (P[o + a] - Q[o + a]) * damp;
        Q[o + a] = P[o + a];
        P[o + a] += vel + ((a === 1 ? -9.8 : 0) + wind[a] * flutter) * dt2;
      }
    }
    for (let it = 0; it < 10; it++) {
      for (const [a, b, rest] of this.cons) {
        const oa = a * 3, ob = b * 3;
        const dx = P[ob] - P[oa], dy = P[ob + 1] - P[oa + 1], dz = P[ob + 2] - P[oa + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (L - rest) / L;
        const pa = a < cols, pb = b < cols;
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        P[oa] += dx * diff * wa; P[oa + 1] += dy * diff * wa; P[oa + 2] += dz * diff * wa;
        P[ob] -= dx * diff * wb; P[ob + 1] -= dy * diff * wb; P[ob + 2] -= dz * diff * wb;
      }
      for (let k = cols; k < n; k++) {
        const o = k * 3;
        for (const c of this.colliders) {
          const dx = P[o] - c.c.x, dy = P[o + 1] - c.c.y, dz = P[o + 2] - c.c.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < c.r * c.r && d2 > 1e-10) {
            const s = c.r / Math.sqrt(d2);
            P[o] = c.c.x + dx * s; P[o + 1] = c.c.y + dy * s; P[o + 2] = c.c.z + dz * s;
          }
        }
        const gy = groundFn(P[o], P[o + 2]) + 0.015;
        if (P[o + 1] < gy) { P[o + 1] = gy; Q[o] += (P[o] - Q[o]) * 0.3; Q[o + 2] += (P[o + 2] - Q[o + 2]) * 0.3; }
      }
    }
  }

  updateMesh() {
    this.attr.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
