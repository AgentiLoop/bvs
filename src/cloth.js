// Verlet cloth cape pinned to a hero's shoulders, colliding with body spheres and the roof.
import * as THREE from 'three';

const _v = new THREE.Vector3();

// Spheres hug the sculpted torso so the cape lies on the back instead of floating off it.
const COLLIDERS = [
  ['chest', [0.1, 0.2, 0.0], 0.15], ['chest', [-0.1, 0.2, 0.0], 0.15], ['chest', [0, 0.3, 0.0], 0.11],
  ['spine', [0, 0.1, 0], 0.13], ['hips', [0, 0, 0], 0.17], ['head', [0, 0.11, 0], 0.12],
];
// Capsules (joint -> joint) keep the cloth out of the legs and upper arms.
const CAPSULES = [
  ['legs', 'L', 'th', 'kn', 0.12], ['legs', 'L', 'kn', 'an', 0.09],
  ['legs', 'R', 'th', 'kn', 0.12], ['legs', 'R', 'kn', 'an', 0.09],
  ['arms', 'L', 'sh', 'el', 0.1], ['arms', 'R', 'sh', 'el', 0.1],
];
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _hInv = new THREE.Matrix4(), _cInv = new THREE.Matrix4();
const CHEST_Y = 0.36; // chest bone height above the hips bone (spine 0.08 + chest 0.28)

export class Cape {
  constructor(hero, { cols, rows, topW, botW, len, color, scallop = false }) {
    this.hero = hero; this.cols = cols; this.rows = rows;
    const n = cols * rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.canon = [];
    for (let j = 0; j < rows; j++) {
      const w = topW + (botW - topW) * Math.pow(j / (rows - 1), 0.8);
      for (let i = 0; i < cols; i++) {
        const u = i / (cols - 1) * 2 - 1, f = Math.min(1, j / 2);
        const pinY = 0.375 - 0.05 * u * u, pinZ = -0.088 + 0.035 * u * u;
        // Soft vertical folds that deepen toward the hem give the cape volume instead of a flat sheet.
        const fold = 0.035 * (j / (rows - 1)) * Math.cos(u * Math.PI * 1.5);
        this.canon.push(new THREE.Vector3(u * w / 2, pinY - (j * len) / (rows - 1), pinZ * (1 - f) + (-0.17 - j * 0.02 + fold) * f));
      }
    }
    // Rest shape (incl. the pinned neckline) starts outside the torso so the pinned corners don't sit
    // inside the trapezius.
    if (hero.torsoSection) for (const c of this.canon) {
      const y = c.y + CHEST_Y;
      if (y <= 0.035 || y >= 0.83) continue;
      const [rx, rz] = hero.torsoSection(y), e = Math.hypot(c.x / (rx + 0.02), c.z / (rz + 0.02));
      if (e < 1 && e > 1e-6) { c.x /= e; c.z /= e; }
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
    this.capsules = CAPSULES.map(([group, side, a, b, r]) => ({ a: hero[group][side][a], b: hero[group][side][b], r,
      p: new THREE.Vector3(), q: new THREE.Vector3() }));

    // The coarse sim grid is rendered through a Catmull-Rom surface SUB times denser, so edges and
    // folds are smooth curves instead of jagged facets.
    const SUB = 5, RC = (cols - 1) * SUB + 1, RR = (rows - 1) * SUB + 1;
    this.RC = RC; this.RR = RR; this.SUB = SUB;
    this.rowTmp = new Float32Array(rows * RC * 3);
    this.rpos = new Float32Array(RC * RR * 3);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.rpos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const uv = [], index = [];
    for (let j = 0; j < RR; j++) for (let i = 0; i < RC; i++) uv.push(i / (RC - 1), 1 - j / (RR - 1));
    for (let j = 0; j < RR - 1; j++) for (let i = 0; i < RC - 1; i++) {
      const a = j * RC + i, b = a + 1, c = a + RC, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // Ink outline on the free edges (sides + hem, not the neck): the outermost render row/column is
    // near-black, matching the inked body hulls without any extra geometry that could tear.
    const col = [];
    for (let j = 0; j < RR; j++) for (let i = 0; i < RC; i++) {
      const e = j === RR - 1 || i === 0 || i === RC - 1 ? 0.06 : 1;
      col.push(e, e, e);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(index);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide, vertexColors: true }));
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
    this.groundFn = groundFn;
    for (const c of this.colliders) { c.c.copy(c.off); c.bone.localToWorld(c.c); }
    for (const c of this.capsules) { c.a.getWorldPosition(c.p); c.b.getWorldPosition(c.q); }
    // The spheres under-fill the broad upper back, so the cape sank 1-2 cm (up to 11 cm on Batman) into
    // it. Also collide against the torso's real elliptical cross-section in the bone frame that drives it.
    const sec = this.hero.torsoSection;
    if (sec) this.prepSection();
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
        for (const c of this.capsules) {
          _b.subVectors(c.q, c.p);
          _v.set(P[o], P[o + 1], P[o + 2]);
          const t = Math.min(1, Math.max(0, _a.subVectors(_v, c.p).dot(_b) / (_b.lengthSq() || 1e-9)));
          _a.copy(c.p).addScaledVector(_b, t);
          const dx = P[o] - _a.x, dy = P[o + 1] - _a.y, dz = P[o + 2] - _a.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < c.r * c.r && d2 > 1e-10) {
            const s = c.r / Math.sqrt(d2);
            P[o] = _a.x + dx * s; P[o + 1] = _a.y + dy * s; P[o + 2] = _a.z + dz * s;
          }
        }
        if (sec) this.pushOut(P, o);
        const gy = groundFn(P[o], P[o + 2]) + 0.015;
        if (P[o + 1] < gy) { P[o + 1] = gy; Q[o] += (P[o] - Q[o]) * 0.3; Q[o + 2] += (P[o + 2] - Q[o + 2]) * 0.3; }
      }
    }
  }

  prepSection() { _hInv.copy(this.hero.hips.matrixWorld).invert(); _cInv.copy(this.hero.chest.matrixWorld).invert(); }

  // Push point A[o..o+2] out of the torso's elliptical cross-section (in the bone frame that drives it).
  pushOut(A, o) {
    const sec = this.hero.torsoSection;
    _v.set(A[o], A[o + 1], A[o + 2]).applyMatrix4(_cInv);
    let bone = this.hero.chest, y = _v.y + CHEST_Y;
    if (y < 0.4) { _v.set(A[o], A[o + 1], A[o + 2]).applyMatrix4(_hInv); bone = this.hero.hips; y = _v.y; }
    else _v.y = y;
    if (y <= 0.035 || y >= 0.83) return;
    const [rx, rz] = sec(y), e = Math.hypot(_v.x / (rx + 0.02), _v.z / (rz + 0.02));
    // The front has sculpted pecs/abs up to 6 cm proud of the ellipse; a cape wrapped round the front
    // (after Batman's roll) sank into them.
    const cd = this.hero.chestDepth, front = cd && _v.z > 0 && Math.abs(_v.x) < rx ? cd(_v.x, y) + 0.02 : 0;
    if ((e >= 1 || e < 1e-6) && !(front && _v.z < front)) return;
    if (e < 1 && e >= 1e-6) { _v.x /= e; _v.z /= e; }
    if (front) _v.z = Math.max(_v.z, front);
    if (bone === this.hero.chest) _v.y -= CHEST_Y;
    _v.applyMatrix4(bone.matrixWorld);
    A[o] = _v.x; A[o + 1] = _v.y; A[o + 2] = _v.z;
  }

  updateMesh() {
    const { cols, rows, RC, RR, SUB, pos: P, rowTmp: T, rpos: R } = this;
    // Catmull-Rom between p1 and p2 (endpoints clamped), written into out[o..o+2].
    const cr = (src, n, stride, base, k, t, out, o) => {
      const i0 = base + Math.max(0, k - 1) * stride, i1 = base + k * stride,
        i2 = base + Math.min(n - 1, k + 1) * stride, i3 = base + Math.min(n - 1, k + 2) * stride;
      const t2 = t * t, t3 = t2 * t;
      const a = -0.5 * t3 + t2 - 0.5 * t, b = 1.5 * t3 - 2.5 * t2 + 1, c = -1.5 * t3 + 2 * t2 + 0.5 * t, d = 0.5 * t3 - 0.5 * t2;
      for (let q = 0; q < 3; q++) out[o + q] = a * src[i0 + q] + b * src[i1 + q] + c * src[i2 + q] + d * src[i3 + q];
    };
    for (let j = 0; j < rows; j++) for (let x = 0; x < RC; x++) {
      const k = Math.min(cols - 2, Math.floor(x / SUB));
      cr(P, cols, 3, j * cols * 3, k, x / SUB - k, T, (j * RC + x) * 3);
    }
    for (let y = 0; y < RR; y++) {
      const k = Math.min(rows - 2, Math.floor(y / SUB));
      for (let x = 0; x < RC; x++) cr(T, rows, RC * 3, x * 3, k, y / SUB - k, R, (y * RC + x) * 3);
    }
    // The smooth surface can cut corners between sim points (e.g. across the back of the neck when the
    // cape flips over the shoulders), so the rendered points get the same torso push-out.
    // The same for the limbs (torso push-out runs last so it wins near the shoulders): between sim points the surface could dip up to ~4 cm into a thigh or shin.
    for (const c of this.capsules) {
      c.a.getWorldPosition(c.p); c.b.getWorldPosition(c.q); _b.subVectors(c.q, c.p);
      const L2 = _b.lengthSq() || 1e-9, r = c.r * 0.85;
      for (let o = RC * 3; o < R.length; o += 3) {
        _v.set(R[o], R[o + 1], R[o + 2]);
        const u = Math.min(1, Math.max(0, _a.subVectors(_v, c.p).dot(_b) / L2));
        _a.copy(c.p).addScaledVector(_b, u);
        const dx = R[o] - _a.x, dy = R[o + 1] - _a.y, dz = R[o + 2] - _a.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r && d2 > 1e-10) {
          const k = r / Math.sqrt(d2);
          R[o] = _a.x + dx * k; R[o + 1] = _a.y + dy * k; R[o + 2] = _a.z + dz * k;
          if (this.groundFn) R[o + 1] = Math.max(R[o + 1], this.groundFn(R[o], R[o + 2]) + 0.015); // not into the roof
        }
      }
    }
    if (this.hero.torsoSection) { this.prepSection(); for (let o = RC * 3; o < R.length; o += 3) this.pushOut(R, o); }
    this.attr.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
