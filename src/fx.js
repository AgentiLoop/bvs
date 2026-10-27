// Simple physics FX: rigid debris (rubble/planks), point particles (water/sparks/dust), shockwave rings, scorch decals.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3(),
  _s0 = new THREE.Vector3(0, 0, 0), _c = new THREE.Color();

export class Debris {
  constructor(max) {
    this.max = max; this.next = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.items = Array.from({ length: max }, () => ({
      alive: false, sleep: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(),
      w: new THREE.Vector3(), s: new THREE.Vector3(),
    }));
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    this.clear();
  }
  clear() { this.items.forEach((it) => (it.alive = false)); this.next = 0; this.update(); }
  spawn(p, v, s, color, q = null, w = null) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const it = this.items[i];
    it.alive = true; it.sleep = false;
    it.p.copy(p); it.v.copy(v); it.s.set(...s);
    q ? it.q.copy(q) : it.q.identity();
    w ? it.w.copy(w) : it.w.set(0, 0, 0);
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }
  step(dt, groundFn) {
    for (const it of this.items) {
      if (!it.alive || it.sleep) continue;
      it.v.y -= 9.8 * dt;
      it.p.addScaledVector(it.v, dt);
      const wl = it.w.length();
      if (wl > 1e-4) { _q.setFromAxisAngle(_ax.copy(it.w).multiplyScalar(1 / wl), wl * dt); it.q.premultiply(_q); }
      const half = Math.min(it.s.x, it.s.y, it.s.z) * 0.5;
      const gy = groundFn(it.p.x, it.p.z);
      if (it.p.y - half < gy && it.p.y > gy - 1) {
        it.p.y = gy + half;
        if (it.v.y < 0) it.v.y *= -0.25;
        it.v.x *= 0.55; it.v.z *= 0.55; it.w.multiplyScalar(0.5);
        if (it.v.lengthSq() < 0.08) it.sleep = true;
      }
      if (it.p.y < -75) it.alive = false;
    }
  }
  update() {
    this.items.forEach((it, i) => {
      if (it.alive) _m.compose(it.p, it.q, it.s); else _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Particles {
  constructor(max, { size = 0.06, additive = false, gravity = 9.8, bounce = 0.2, drag = 0.2, opacity = 1 } = {}) {
    Object.assign(this, { max, gravity, bounce, drag, next: 0 });
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.fade = additive;
    const geo = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pa); geo.setAttribute('color', this.ca);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity, depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.points.frustumCulled = false;
    this.clear();
  }
  clear() { this.life.fill(0); this.p.fill(-9999); this.next = 0; this.update(); }
  spawn(x, y, z, vx, vy, vz, life, color) {
    const i = this.next; this.next = (this.next + 1) % this.max; const o = i * 3;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
    this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz;
    _c.set(color);
    this.base[o] = _c.r; this.base[o + 1] = _c.g; this.base[o + 2] = _c.b;
    this.life[i] = this.maxLife[i] = life;
  }
  step(dt, groundFn) {
    const P = this.p, V = this.v;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const o = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { P[o + 1] = -9999; continue; }
      V[o + 1] -= this.gravity * dt;
      const k = 1 - this.drag * dt;
      V[o] *= k; V[o + 1] *= k; V[o + 2] *= k;
      P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += V[o + 2] * dt;
      const gy = groundFn(P[o], P[o + 2]) + 0.02;
      if (P[o + 1] < gy && P[o + 1] > gy - 1) {
        P[o + 1] = gy; V[o + 1] *= -this.bounce; V[o] *= 0.7; V[o + 2] *= 0.7;
      }
    }
  }
  update() {
    for (let i = 0; i < this.max; i++) {
      const o = i * 3;
      const f = this.life[i] > 0 ? (this.fade ? this.life[i] / this.maxLife[i] : 1) : 0;
      this.col[o] = this.base[o] * f; this.col[o + 1] = this.base[o + 1] * f; this.col[o + 2] = this.base[o + 2] * f;
    }
    this.pa.needsUpdate = true; this.ca.needsUpdate = true;
  }
}

export class Shockwaves {
  constructor(scene, n = 8) {
    this.pool = Array.from({ length: n }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false;
      scene.add(m);
      return { m, t: 0, dur: 1, r: 1 };
    });
    this.i = 0;
  }
  clear() { this.pool.forEach((w) => (w.m.visible = false)); }
  spawn(x, y, z, r, color = 0xfff2d0, dur = 0.7) {
    const w = this.pool[this.i++ % this.pool.length];
    w.m.position.set(x, y, z); w.m.material.color.set(color);
    Object.assign(w, { t: 0, dur, r }); w.m.visible = true;
  }
  step(dt) {
    for (const w of this.pool) {
      if (!w.m.visible) continue;
      w.t += dt;
      const u = w.t / w.dur;
      if (u >= 1) { w.m.visible = false; continue; }
      const s = 0.2 + w.r * (1 - Math.pow(1 - u, 3));
      w.m.scale.set(s, s, s);
      w.m.material.opacity = 1 - u;
    }
  }
}

export class Decals {
  constructor(max = 300) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), max);
    this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.clear();
  }
  clear() { this.n = 0; this.mesh.count = 0; }
  add(x, z, r, y = 0.006) {
    const i = this.n % this.max; this.n++;
    _m.compose(_ax.set(x, y, z), _q.identity(), _s0.set(r, 1, r * (0.8 + ((i * 37) % 10) / 25)));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.count = Math.min(this.n, this.max);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
