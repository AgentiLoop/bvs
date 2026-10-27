// Playable mode: pick Batman or Superman, both heroes make their entrance, then fight the CPU.
// Poses are the same hip-relative IK poses as the film (POSES), blended toward a target every step.
import * as THREE from 'three';
import { applyPose } from './heroes.js';
import { POSES, face } from './timeline.js';
import { groundAt } from './world.js';

const NUM = ['h', 'lean', 'roll', 'pitch', 'gait'];
const ARR = ['lh', 'rh', 'lf', 'rf'];
const ARENA = { x0: -6.5, x1: 6.5, z0: -2.2, z1: 3.0 };
const BLOCK = { lean: 0.3, lh: [0.1, 0.66, 0.28], rh: [-0.1, 0.64, 0.26] };
const ENTER_END = 3.4;
const MOVES = {
  punch: { dur: 0.36, hit: 0.13, range: 1.3, dmg: 7, heavy: false },
  kick: { dur: 0.6, hit: 0.24, range: 1.55, dmg: 11, heavy: true },
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Game {
  constructor(ctx) {
    this.ctx = ctx; // { bat, sup, batCape, supCape, rng, fx: { sparkBurst, dustBurst, rubble, impact, waves, decals, flash } }
    this.active = false;
    this.keys = new Set();
    this.camPos = new THREE.Vector3(0, 3, 11); this.camLook = new THREE.Vector3(0, 2, 0); this.camN = new THREE.Vector2(0, 1);
    this.ui = {
      hud: document.getElementById('game'), banner: document.getElementById('banner'),
      bars: { bat: document.querySelector('#hpBat i'), sup: document.querySelector('#hpSup i') },
      tags: { bat: document.getElementById('tagBat'), sup: document.getElementById('tagSup') },
    };
  }

  start(choice) {
    const { bat, sup } = this.ctx;
    this.active = true; this.choice = choice; this.t = 0; this.state = 'enter'; this.overT = 0; this.ts = 1; this.landed = false; this.shownWin = false;
    const mk = (H, key, x, yaw) => ({ H, key, x, z: 0, y: 0, vy: 0, kx: 0, kz: 0, yaw, hp: 100, act: null, stun: 0, heavy: false, block: false,
      ko: false, cd: 0, ai: { t: 0, mx: 0, mz: 0, block: 0 }, cur: { ...POSES.guard, pitch: 0, gait: 0 }, moving: 0 });
    this.F = { bat: mk(bat, 'bat', -7.4, Math.PI / 2), sup: mk(sup, 'sup', 2.2, -Math.PI / 2) };
    this.F.sup.y = 26; this.F.sup.cur = { ...POSES.fly, pitch: 0.35, gait: 0 };
    this.me = this.F[choice]; this.cpu = this.F[choice === 'bat' ? 'sup' : 'bat'];
    this.camPos.set(0, 3.5, 13); this.camLook.set(0, 3, 0); this.camN.set(0, 1);
    this.heat = null;
    this.pose(0);
    this.ctx.batCape.reset(); this.ctx.supCape.reset();
    this.ui.hud.style.display = 'block';
    this.ui.tags.bat.textContent = choice === 'bat' ? 'BATMAN · YOU' : 'BATMAN · CPU';
    this.ui.tags.sup.textContent = choice === 'sup' ? 'SUPERMAN · YOU' : 'SUPERMAN · CPU';
    this.say('');
    this.updateBars();
  }

  stop() { this.active = false; this.heat = null; this.ui.hud.style.display = 'none'; this.say(''); }

  say(text, sub = '') { this.ui.banner.innerHTML = text ? `${text}${sub ? `<small>${sub}</small>` : ''}` : ''; this.ui.banner.style.opacity = text ? 1 : 0; }

  keydown(e) {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (this.state === 'over' && this.overT > 1.5 && (k === 'enter' || k === 'r')) { this.ctx.restart(this.choice); return; }
    if (this.state !== 'fight' || this.me.ko || e.repeat) return;
    if (k === 'j') this.attack(this.me, 'punch');
    else if (k === 'k') this.attack(this.me, 'kick');
    else if (k === 'l') this.special(this.me);
    else if (k === ' ') this.jump(this.me);
  }
  keyup(e) { this.keys.delete(e.key.toLowerCase()); }

  free(f) { return !f.act && f.stun <= 0 && !f.ko && f.y <= 0.001; }
  attack(f, type) { if (this.free(f) && !f.block) f.act = { type, t: 0, done: false }; }
  jump(f) { if (this.free(f)) f.vy = 5.2; }
  special(f) {
    if (!this.free(f) || f.cd > 0) return;
    f.cd = 4;
    f.act = { type: f.key === 'bat' ? 'flykick' : 'heat', t: 0, done: false };
  }

  hurt(def, att, dmg, heavy, at) {
    const { fx } = this.ctx;
    if (def.ko) return;
    const dx = def.x - att.x, dz = def.z - att.z, d = Math.hypot(dx, dz) || 1;
    if (def.block && !def.act && def.stun <= 0) {
      dmg *= 0.2;
      fx.sparkBurst(at.x, at.y, at.z, 14, 3, 0xbfd8ff);
      def.kx += dx / d * 1.2; def.kz += dz / d * 1.2;
    } else {
      def.act = null; def.stun = heavy ? 0.55 : 0.3; def.heavy = heavy;
      const kb = heavy ? 4.2 : 1.8;
      def.kx += dx / d * kb; def.kz += dz / d * kb;
      fx.sparkBurst(at.x, at.y, at.z, heavy ? 50 : 22, heavy ? 5 : 3.5, att.key === 'bat' ? 0xfff0c0 : 0xbfd8ff);
      fx.impact(at.x, at.y, at.z, heavy ? 0.35 : 0.15);
      if (heavy) { fx.waves.spawn(at.x, at.y, at.z, 2, 0xffffff, 0.5); fx.flash(0.15); }
    }
    def.hp = Math.max(0, def.hp - dmg);
    this.updateBars();
    if (def.hp <= 0) {
      def.ko = true; def.act = null; def.kx *= 1.6; def.kz *= 1.6; def.vy = 3;
      this.state = 'over'; this.overT = 0; this.winner = att;
      fx.flash(0.6); fx.impact(at.x, at.y, at.z, 0.6); fx.waves.spawn(at.x, at.y, at.z, 4, 0xffffff, 1);
      fx.sparkBurst(at.x, at.y, at.z, 120, 7, 0xffffff);
      this.say('K.O.');
    }
  }

  updateBars() { for (const k of ['bat', 'sup']) this.ui.bars[k].style.width = this.F[k].hp + '%'; }

  // ---------- per fixed step ----------
  step(dt) {
    if (this.state === 'over') { this.overT += dt; this.ts = this.overT < 1.4 ? 0.3 : 1; }
    const sdt = dt * this.ts;
    this.t += sdt;
    if (this.state === 'enter') this.entrance(sdt);
    else {
      for (const f of [this.me, this.cpu]) f.cd = Math.max(0, f.cd - sdt);
      if (this.state === 'fight') { this.player(sdt); this.ai(sdt); }
      else { this.me.block = this.cpu.block = false; }
      for (const [f, o] of [[this.me, this.cpu], [this.cpu, this.me]]) this.physics(f, o, sdt);
      this.separate();
      if (this.state === 'fight' && this.t > ENTER_END + 1) this.say('');
      if (this.state === 'over' && this.overT > 1.5 && !this.shownWin) {
        this.shownWin = true;
        const w = this.winner.key === 'bat' ? 'BATMAN' : 'SUPERMAN';
        this.say(`${w} WINS`, this.winner === this.me ? 'YOU WIN · ENTER REMATCH · ESC MENU' : 'YOU LOSE · ENTER REMATCH · ESC MENU');
      }
    }
    this.pose(sdt);
    this.camera(dt);
    return sdt;
  }

  entrance(dt) {
    const { bat, sup } = this.F, { fx } = this.ctx, t = this.t;
    const u = clamp(t / 2.3, 0, 1);
    bat.x = -7.4 + 5.2 * (1 - (1 - u) * (1 - u)); bat.moving = u < 1 ? 1 : 0;
    const v = clamp(t / 2.0, 0, 1);
    sup.y = 26 * (1 - v * v);
    if (v >= 1 && !this.landed) {
      this.landed = true;
      fx.rubble(sup.x, 0, sup.z, 60, 6, 0.06, 0.26, 5); fx.dustBurst(sup.x, 0, sup.z, 110, 3.5); fx.sparkBurst(sup.x, 0.1, sup.z, 40, 5);
      fx.waves.spawn(sup.x, 0.05, sup.z, 5, 0xfff2d0, 0.8); fx.decals.add(sup.x, sup.z, 0.9); fx.impact(sup.x, 0, sup.z, 0.5); fx.flash(0.35);
    }
    if (t > 0.4 && t < 2.6) this.say(this.choice === 'bat' ? 'YOU ARE BATMAN' : 'YOU ARE SUPERMAN', 'MOVE WASD / ARROWS · J PUNCH · K KICK · L SPECIAL · SPACE JUMP · SHIFT BLOCK');
    else if (t >= 2.6) this.say('FIGHT!');
    if (t >= ENTER_END) this.state = 'fight';
  }

  player(dt) {
    const f = this.me, K = this.keys;
    const ix = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
    const iy = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
    f.block = K.has('shift') && this.free(f);
    // screen-relative: right = camera right on the ground, up = into the screen
    const fx = this.camLook.x - this.camPos.x, fz = this.camLook.z - this.camPos.z, fl = Math.hypot(fx, fz) || 1;
    const rx = -fz / fl, rz = fx / fl;
    this.walk(f, ix * rx + iy * fx / fl, ix * rz + iy * fz / fl, dt);
  }

  ai(dt) {
    const f = this.cpu, o = this.me, A = f.ai, rng = this.ctx.rng;
    const d = Math.hypot(o.x - f.x, o.z - f.z);
    A.t -= dt; A.block -= dt;
    f.block = A.block > 0 && this.free(f);
    if (A.t <= 0) {
      A.t = 0.22 + rng() * 0.3; A.mx = A.mz = 0;
      const threat = o.act && d < 2;
      if (threat && rng() < 0.4) A.block = 0.45;
      else if (d > 3 && f.cd <= 0 && rng() < 0.35) this.special(f);
      else if (d > 1.15) { A.mx = (o.x - f.x) / d; A.mz = (o.z - f.z) / d; if (rng() < 0.25) { A.mx += -A.mz * 0.7; A.mz += A.mx * 0.7; } }
      else if (rng() < 0.7) this.attack(f, rng() < 0.6 ? 'punch' : 'kick');
      else { A.mx = -(o.x - f.x) / d; A.mz = -(o.z - f.z) / d; }
    }
    if (!f.block) this.walk(f, A.mx, A.mz, dt);
  }

  walk(f, mx, mz, dt) {
    const m = Math.hypot(mx, mz);
    f.moving = 0;
    if (!this.free(f) || f.block || m < 0.01) return;
    const sp = 2.6 / Math.max(1, m);
    f.x += mx * sp * dt; f.z += mz * sp * dt; f.moving = Math.min(1, m);
  }

  physics(f, o, dt) {
    const { fx } = this.ctx;
    // jump / airborne
    if (f.y > 0 || f.vy > 0) { if (!(f.act && f.act.type === 'flykick')) { f.vy -= 14 * dt; f.y = Math.max(0, f.y + f.vy * dt); if (f.y === 0) f.vy = 0; } }
    // knockback
    f.x += f.kx * dt; f.z += f.kz * dt;
    const damp = Math.exp(-dt * 5); f.kx *= damp; f.kz *= damp;
    f.stun -= dt;
    if (!f.ko) f.yaw += wrap(face([f.x, 0, f.z], [o.x, 0, o.z]) - f.yaw) * Math.min(1, dt * 12);
    const a = f.act;
    if (a) {
      a.t += dt;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (MOVES[a.type]) {
        const M = MOVES[a.type];
        if (!a.done && a.t >= M.hit) {
          a.done = true;
          if (d < M.range && o.y < (a.type === 'kick' ? 1.4 : 0.8)) {
            const at = (a.type === 'kick' ? f.H.legs.R.an : f.H.arms.R.hand).getWorldPosition(new THREE.Vector3());
            this.hurt(o, f, M.dmg, M.heavy, at);
          }
        }
        if (a.t >= M.dur) f.act = null;
      } else if (a.type === 'flykick') {
        const u = clamp(a.t / 0.75, 0, 1);
        if (u > 0.15 && u < 0.8 && d > 0.9) { const s = Math.min(8 * dt, d - 0.9); f.x += (o.x - f.x) / d * s; f.z += (o.z - f.z) / d * s; }
        f.y = Math.sin(Math.PI * u) * 1.1;
        if (!a.done && u > 0.3 && d < 1.3) {
          a.done = true;
          this.hurt(o, f, 16, true, f.H.legs.R.an.getWorldPosition(new THREE.Vector3()));
        }
        if (u >= 1) { f.act = null; f.y = 0; fx.dustBurst(f.x, 0, f.z, 20, 1.5); }
      } else if (a.type === 'heat') {
        this.heat = null;
        if (a.t > 0.25 && a.t < 1.35 && !o.ko) {
          const tg = o.H.chest.getWorldPosition(new THREE.Vector3()); tg.y += 0.1;
          this.heat = [tg.x, tg.y, tg.z];
          const blocked = o.block && o.stun <= 0;
          o.hp = Math.max(0, o.hp - (blocked ? 4 : 15) * dt);
          if (this.ctx.rng() < 0.5) fx.sparkBurst(tg.x, tg.y, tg.z, 2, 2.5, 0xff8030);
          if (!blocked) o.stun = Math.max(o.stun, 0.12), o.heavy = false;
          this.updateBars();
          if (o.hp <= 0) this.hurt(o, f, 0.01, true, tg);
        }
        if (a.t >= 1.5) { f.act = null; this.heat = null; }
      }
    }
    f.x = clamp(f.x, ARENA.x0, ARENA.x1); f.z = clamp(f.z, ARENA.z0, ARENA.z1);
  }

  separate() {
    const a = this.me, b = this.cpu, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (a.y > 0.5 || b.y > 0.5 || a.ko || b.ko || d >= 0.75 || d === 0) return;
    const p = (0.75 - d) / 2;
    a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p;
  }

  target(f) {
    if (this.state === 'enter' && f.key === 'sup') {
      if (f.y > 1.5) return { ...POSES.fly, pitch: 0.35, rh: [-0.12, 0.6, 0.45], gait: 0, base: f.y };
      if (this.t < 2.7) return { ...POSES.land, pitch: 0, gait: 0 };
      return { ...POSES.heroic, pitch: 0, gait: 0 };
    }
    if (f.ko) return { ...POSES.down, pitch: -1.5, gait: 0 };
    if (this.state === 'over' && f === this.winner && this.overT > 1.4) return { ...POSES.heroic, pitch: 0, gait: 0 };
    const a = f.act;
    if (a && a.type === 'punch') return { ...POSES[a.t < 0.07 ? 'windup' : a.t < 0.27 ? 'punchR' : 'guard'], pitch: 0, gait: 0 };
    if (a && a.type === 'kick') return { ...POSES[a.t < 0.12 ? 'guard' : a.t < 0.46 ? 'kickR' : 'guard'], pitch: 0, gait: 0 };
    if (a && a.type === 'flykick') { const u = a.t / 0.75; return u < 0.15 ? { ...POSES.tuck, pitch: 0, gait: 0 } : { ...POSES.flykick, h: 0.75, pitch: 0, gait: 0 }; }
    if (a && a.type === 'heat') return { ...POSES.heat, pitch: 0, gait: 0 };
    if (f.stun > 0) return { ...POSES[f.heavy ? 'hit' : 'flinch'], pitch: 0, gait: 0 };
    if (f.y > 0.05) return { ...POSES.tuck, pitch: 0, gait: 0 };
    if (f.block) return { ...POSES.guard, ...BLOCK, pitch: 0, gait: 0 };
    return { ...POSES.guard, pitch: 0, gait: f.moving };
  }

  pose(dt) {
    const k = dt ? 1 - Math.exp(-dt * 16) : 1;
    for (const f of [this.F.bat, this.F.sup]) {
      const tg = this.target(f), c = f.cur;
      for (const n of NUM) c[n] += (tg[n] - c[n]) * k;
      for (const n of ARR) c[n] = c[n].map((v, j) => v + (tg[n][j] - v) * k);
      const base = tg.base ?? f.y;
      applyPose(f.H, { ...c, p: [f.x, base + c.h, f.z], yaw: f.yaw }, this.t, groundAt(f.x, f.z));
    }
  }

  camera(dt) {
    const { bat, sup } = this.F;
    const a = new THREE.Vector3(bat.x, bat.y + 1, bat.z), b = new THREE.Vector3(sup.x, sup.y + 1, sup.z);
    const mid = a.clone().lerp(b, 0.5), sep = a.distanceTo(b);
    const dx = sup.x - bat.x, dz = sup.z - bat.z, dl = Math.hypot(dx, dz) || 1;
    const n = new THREE.Vector2(-dz / dl, dx / dl);
    if (n.dot(this.camN) < 0) n.negate();
    this.camN.lerp(n, Math.min(1, dt * 2)).normalize();
    const dist = 3.4 + sep * 0.8;
    const pos = new THREE.Vector3(mid.x + this.camN.x * dist, Math.max(1.4, mid.y * 0.6 + 0.9 + sep * 0.12), mid.z + this.camN.y * dist);
    mid.y = Math.max(1.0, mid.y);
    const k = Math.min(1, dt * 4);
    this.camPos.lerp(pos, k); this.camLook.lerp(mid, k);
  }
}
