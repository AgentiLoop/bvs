// Playable mode: pick Batman or Superman, both heroes make their entrance, then fight the CPU.
// Poses are the same hip-relative IK poses as the film (POSES), blended toward a target every step.
// Combat: chained punches/kicks, launchers, sweeps, air attacks, juggles, bounces, hitstop, trades; keyboard + gamepad.
import * as THREE from 'three';
import { applyPose } from './heroes.js';
import { POSES, face } from './timeline.js';
import { groundAt } from './world.js';

const NUM = ['h', 'lean', 'roll', 'pitch', 'gait', 'tw'];
const ARR = ['lh', 'rh', 'lf', 'rf'];
const ARENA = { x0: -6.5, x1: 6.5, z0: -2.2, z1: 3.0 };
const BLOCK = { lean: 0.3, lh: [0.1, 0.66, 0.28], rh: [-0.1, 0.64, 0.26] };
const ENTER_END = 3.4, GRAV = 14;
const P = POSES, G = POSES.guard;
// Strike poses (hip-relative like POSES; tw = body twist about the vertical axis).
const MP = {
  jab:     { ...G, lean: 0.46, tw: 0.25, lh: [0.02, 0.56, 0.98], rh: [-0.12, 0.46, 0.3] },
  cross:   { ...P.punchR, tw: -0.35 },
  hookUp:  { ...G, tw: 0.35, rh: [-0.44, 0.52, 0.2] },
  hook:    { ...G, lean: 0.5, tw: -0.55, roll: 0.08, lh: [0.16, 0.44, 0.26], rh: [0.18, 0.6, 0.72] },
  dip:     { ...G, h: 0.6, lean: 0.5, tw: 0.2, rh: [-0.14, 0.05, 0.3] },
  upper:   { ...P.upper, tw: -0.25 },
  chamber: { ...G, h: 0.84, lean: 0.1, rf: [-0.18, -0.2, 0.42] },
  front:   { ...P.kickR },
  roundUp: { ...G, h: 0.86, lean: -0.1, tw: 0.4, rf: [-0.3, -0.15, 0.3] },
  round:   { h: 0.95, lean: -0.45, roll: -0.15, tw: -0.9, lh: [0.38, 0.32, -0.08], rh: [-0.3, 0.42, 0.05], lf: [0.12, -0.9, -0.05], rf: [0.02, 0.6, 0.78] },
  sweep:   { h: 0.44, lean: 0.6, roll: 0, tw: -0.5, lh: [0.4, -0.3, 0.3], rh: [-0.1, -0.36, 0.42], lf: [0.22, -0.4, 0.3], rf: [-0.72, -0.4, 0.42] },
  dive:    { ...P.tuck, h: 0.55, lean: 0.75, lh: [0.3, 0.3, 0.1], rh: [-0.04, 0.12, 0.95] },
  airkick: { h: 0.62, lean: -0.3, roll: 0, lh: [0.3, 0.4, -0.1], rh: [-0.25, 0.35, 0.1], lf: [0.14, -0.4, 0.2], rf: [-0.06, -0.3, 0.82] },
  air:     { ...P.hit, h: 0.6 },
  rush:    { ...P.charge, lean: 0.75, gait: 1 },
  backdash:{ ...G, h: 0.8, lean: -0.25, lf: [0.12, -0.7, -0.1], rf: [-0.12, -0.75, 0.15] },
  grab:    { ...G, lean: 0.45, lh: [0.18, 0.62, 0.62], rh: [-0.18, 0.62, 0.62] },
  hipToss: { ...G, h: 0.72, lean: 0.75, tw: 1.1, roll: 0.15, lh: [0.25, 0.95, 0.1], rh: [-0.15, 1.05, 0.25] },
  lift:    { ...G, h: 0.98, lean: -0.2, lh: [0.18, 1.15, 0.4], rh: [-0.18, 1.15, 0.4] },
  slam:    { ...G, h: 0.66, lean: 0.8, lh: [0.18, 0.25, 0.75], rh: [-0.18, 0.25, 0.75] },
  whiff:   { ...G, lean: 0.55, lh: [0.25, 0.5, 0.75], rh: [-0.25, 0.5, 0.75] },
  // crouching: knees deep, hips low, guard tucked in front of the face
  crouch:  { ...G, h: 0.54, lean: 0.55, lh: [0.12, 0.42, 0.38], rh: [-0.12, 0.36, 0.3], lf: [0.22, -0.47, 0.36], rf: [-0.22, -0.47, -0.3] },
  cblock:  { ...G, h: 0.52, lean: 0.45, lh: [0.1, 0.52, 0.3], rh: [-0.1, 0.5, 0.28], lf: [0.22, -0.46, 0.36], rf: [-0.22, -0.46, -0.3] },
  cjab:    { ...G, h: 0.54, lean: 0.55, tw: 0.25, lh: [0.04, 0.36, 0.92], rh: [-0.12, 0.36, 0.3], lf: [0.22, -0.47, 0.36], rf: [-0.22, -0.47, -0.3] },
  ckickUp: { ...G, h: 0.5, lean: 0.5, lh: [0.12, 0.4, 0.38], rh: [-0.12, 0.34, 0.3], lf: [0.22, -0.43, 0.36], rf: [-0.2, -0.42, 0.18] },
  ckick:   { ...G, h: 0.48, lean: 0.35, tw: -0.4, lh: [0.3, 0.05, 0.3], rh: [-0.12, 0.3, 0.3], lf: [0.24, -0.42, 0.3], rf: [-0.12, -0.4, 0.8] },
  // projectiles: Batman winds the batarang back past his left shoulder and flicks it out; Superman spreads his arms and claps
  bThrowUp:{ ...G, tw: 0.6, lean: 0.2, rh: [0.3, 0.78, -0.05] },
  bThrow:  { ...G, lean: 0.45, tw: -0.5, rh: [-0.1, 0.62, 0.95] },
  clapUp:  { ...G, h: 0.9, lean: -0.05, lh: [0.6, 0.7, 0.2], rh: [-0.6, 0.7, 0.2] },
  clap:    { ...G, h: 0.82, lean: 0.4, lh: [0.03, 0.55, 0.72], rh: [-0.03, 0.55, 0.72] },
  // rising uppercut: fist driven straight up, body corkscrewing, lead knee tucked
  riseUp:  { ...P.upper, h: 0.88, lean: -0.05, tw: -0.45, lh: [0.22, 0.3, 0.2], rh: [-0.04, 1.2, 0.3], lf: [0.15, -0.45, 0.3], rf: [-0.15, -0.88, -0.1] },
  // parry: the lead hand sweeps the blow up and out past the head (standing) or down past the knee (crouching)
  parry:   { ...G, h: 0.86, lean: -0.1, tw: 0.35, lh: [0.4, 0.86, 0.5], rh: [-0.12, 0.55, 0.28] },
  parryLow:{ ...G, h: 0.54, lean: 0.5, tw: 0.3, lh: [0.42, -0.02, 0.55], rh: [-0.12, 0.36, 0.3], lf: [0.22, -0.47, 0.36], rf: [-0.22, -0.47, -0.3] },
  // hit reactions by where the blow lands: head whips back with the rear foot stepping out to catch the weight,
  // a body blow doubles him over clutching the gut, a low kick yanks the front leg out with the arms thrown wide
  hitHead: { h: 0.84, lean: -0.45, roll: 0.12, tw: 0.25, lh: [0.32, 0.68, 0.02], rh: [-0.34, 0.6, 0.08], lf: [0.18, -0.76, 0.32], rf: [-0.2, -0.76, -0.5] },
  hitBody: { h: 0.68, lean: 0.9, roll: 0, tw: 0.1, lh: [0.1, 0.16, 0.3], rh: [-0.1, 0.12, 0.3], lf: [0.19, -0.62, 0.18], rf: [-0.2, -0.6, -0.42] },
  hitLow:  { h: 0.62, lean: 0.25, roll: 0.2, tw: -0.15, lh: [0.42, 0.42, 0.15], rh: [-0.42, 0.38, 0.05], lf: [0.2, -0.42, 0.1], rf: [-0.22, -0.55, -0.32] },
};
const REACT = { head: MP.hitHead, body: MP.hitBody, low: MP.hitLow };
// keys: [time, pose]; hit: active frame; cancel: earliest chain into `next` (J punch / K kick); reach: horizontal range;
// kb: knockback m/s; up: launch m/s (<0 spikes airborne targets down); at: striking limb; blast: hit-explosion size.
// Height (SF/MK mix-ups): hi = whiffs over a crouching foe; low = must be blocked crouching; air/over = overhead,
// must be blocked standing; everything else is a mid (either block works). crouch = performed from the crouch.
const MOVES = {
  jab:     { hi: true, dur: 0.28, hit: 0.09, cancel: 0.13, reach: 1.25, dmg: 4, kb: 1.2, stun: 0.28, lunge: 1.5, at: 'lh', blast: 0.35, next: { J: 'cross', K: 'front' }, keys: [[0, 'guard'], [0.03, 'jab'], [0.18, 'guard']] },
  cross:   { hi: true, dur: 0.34, hit: 0.11, cancel: 0.16, reach: 1.35, dmg: 6, kb: 1.8, stun: 0.32, lunge: 2.5, at: 'rh', blast: 0.5, next: { J: 'hook', K: 'round' }, keys: [[0, 'windup'], [0.06, 'cross'], [0.24, 'guard']] },
  hook:    { hi: true, dur: 0.42, hit: 0.15, cancel: 0.21, reach: 1.25, dmg: 8, kb: 2.6, stun: 0.42, lunge: 2, at: 'rh', blast: 0.65, next: { J: 'upper', K: 'round' }, keys: [[0, 'hookUp'], [0.08, 'hook'], [0.3, 'guard']] },
  upper:   { dur: 0.55, hit: 0.16, reach: 1.2, dmg: 11, kb: 1.6, up: 7, stun: 0.6, lunge: 2.5, at: 'rh', blast: 1, heavy: true, keys: [[0, 'dip'], [0.1, 'upper'], [0.42, 'guard']] },
  front:   { dur: 0.5, hit: 0.2, cancel: 0.27, reach: 1.55, dmg: 9, kb: 3.4, stun: 0.45, lunge: 1.2, at: 'rf', blast: 0.75, next: { K: 'round', J: 'hook' }, keys: [[0, 'chamber'], [0.12, 'front'], [0.38, 'guard']] },
  round:   { hi: true, dur: 0.62, hit: 0.24, reach: 1.6, dmg: 13, kb: 6.5, up: 2.5, stun: 0.7, lunge: 1.5, at: 'rf', blast: 1.1, heavy: true, keys: [[0, 'roundUp'], [0.14, 'round'], [0.46, 'guard']] },
  sweep:   { low: true, dur: 0.6, hit: 0.2, reach: 1.6, dmg: 8, kb: 1.5, up: 3.2, stun: 0.6, lunge: 0.8, at: 'rf', blast: 0.6, heavy: true, trip: true, keys: [[0, 'dip'], [0.1, 'sweep'], [0.45, 'guard']] },
  cjab:    { crouch: true, dur: 0.24, hit: 0.07, cancel: 0.11, reach: 1.15, dmg: 3, kb: 0.8, stun: 0.26, at: 'lh', blast: 0.3, next: { J: 'cjab', K: 'ckick' }, keys: [[0, 'crouch'], [0.02, 'cjab'], [0.15, 'crouch']] },
  ckick:   { crouch: true, low: true, dur: 0.4, hit: 0.12, cancel: 0.2, reach: 1.45, dmg: 5, kb: 1.4, stun: 0.34, at: 'rf', blast: 0.45, next: { K: 'sweep', J: 'cjab' }, keys: [[0, 'ckickUp'], [0.05, 'ckick'], [0.28, 'crouch']] },
  dive:    { air: true, dur: 0.45, hit: 0.12, reach: 1.4, dmg: 9, kb: 3, up: -4, stun: 0.5, at: 'rh', blast: 0.8, heavy: true, keys: [[0, 'tuck'], [0.06, 'dive']] },
  airkick: { air: true, dur: 0.5, hit: 0.14, reach: 1.6, dmg: 10, kb: 5, up: 1.5, stun: 0.55, at: 'rf', blast: 0.9, heavy: true, keys: [[0, 'tuck'], [0.08, 'airkick']] },
};
// Supers (block + special with a full meter): an unblockable armoured rush; if it connects the opponent is pinned
// through a scripted string, then a launching finisher, while the camera orbits the pair.
const SUPERS = {
  bat: { name: 'DARK KNIGHT RUSH', seq: ['jab', 'cross', 'front', 'hook', 'jab', 'cross'], fin: 'round', finish: { dmg: 16, kb: 8, up: 5, stun: 1, heavy: true, at: 'rf', blast: 2.2 } },
  sup: { name: 'KRYPTONIAN FURY', seq: ['cross', 'hook', 'jab', 'cross', 'hook'], fin: 'upper', finish: { dmg: 18, kb: 4, up: 10, stun: 1, heavy: true, at: 'rh', blast: 2.4 } },
};
// Idle stance personality: Batman is a bouncing street fighter (low, rhythmic bob, fists circling);
// Superman stands tall and calm with a slow float. hz: bounce rate, bob: dip depth (m), dh/dl: height/lean offset,
// fist: hand circling radius (m), off: phase so the two never move in sync.
const STYLE = {
  bat: { hz: 1.7, bob: 0.045, dh: -0.03, dl: 0.05, fist: 0.022, off: 0 },
  sup: { hz: 0.8, bob: 0.018, dh: 0.03, dl: -0.08, fist: 0.012, off: 1.3 },
};
const ROUND_TIME = 60, WINS = 2;
const FLYKICK = { over: true, dmg: 16, kb: 6, up: 3, stun: 0.7, heavy: true, at: 'rf', blast: 1.3 };
// Throws (punch+kick together, or U, at close range): unblockable, beaten only by a tech (throw back while held).
// Batman hip-tosses the foe over his shoulder behind him; Superman lifts the foe overhead and slams him down.
const THROW = { reach: 1.15, grab: 0.1, rel: 0.5, dur: 0.75, tech: 0.28 };
const TOSS = {
  bat: { dmg: 12, kb: 5, up: 6.5, stun: 0.8, heavy: true, at: 'rh', blast: 1, back: true, keys: [[0, 'grab'], [0.22, 'hipToss']] },
  sup: { dmg: 13, kb: 3, up: -5, stun: 0.8, heavy: true, at: 'rh', blast: 1.2, lift: true, keys: [[0, 'grab'], [0.18, 'lift'], [0.44, 'slam']] },
};
const DASH = { fwd: 8.5, back: 5.5, dur: 0.32, invuln: 0.16, tap: 0.25 };
const HEATKO = { dmg: 0.01, kb: 2, up: 2, stun: 0.5, heavy: true, blast: 1 };
// MK finishers: the blow that would win the match leaves the loser dazed on his feet at 0 HP ("FINISH HIM!").
// Special up close = the hero's fatality; any other hit, or FINISH.time running out, is a plain K.O.
const FINISH = { time: 5, reach: 1.8 };
const FATAL = {
  bat: { name: 'FATALITY · SHADOW STORM', seq: ['jab', 'cross', 'hook', 'jab', 'cross', 'front', 'hook', 'cross', 'upper'], gap: 0.14, smoke: 0.35,
    finish: { dmg: 0, kb: 12, up: 6, stun: 1, heavy: true, at: 'rf', blast: 3, fin: true } },
  sup: { name: 'FATALITY · ORBITAL SLAM', grab: 0.25, rise: 1.1, top: 9, fall: 0.35,
    finish: { dmg: 0, kb: 2, up: 9, stun: 1, heavy: true, at: 'rh', blast: 3.2, fin: true } },
};
const FALL = { dmg: 0, kb: 0.4, up: 0, stun: 0.5, at: 'rh', blast: 0.2 };
// SF projectiles (quarter circle: crouch, then toward + punch). One on screen per fighter; two projectiles cancel out.
// Batman's batarang flies at head height (duck it or block); Superman's sonic clap rolls along the ground
// (jump it or crouch-block it). rel: release time, y: flight height (m), r: hit radius (m).
const SHOT = {
  bat: { name: 'BATARANG', speed: 12, y: 1.3, r: 0.5, rel: 0.16, dur: 0.46, life: 1.3, hi: true, dmg: 6, kb: 2.2, stun: 0.4, at: 'rh', blast: 0.5,
    keys: [[0, 'bThrowUp'], [0.12, 'bThrow'], [0.34, 'guard']] },
  sup: { name: 'SONIC CLAP', speed: 8, y: 0.45, r: 0.6, rel: 0.2, dur: 0.55, life: 1.6, low: true, dmg: 8, kb: 3, stun: 0.5, at: 'rh', blast: 0.8,
    keys: [[0, 'clapUp'], [0.16, 'clap'], [0.42, 'guard']] },
};
const QCF = 0.35; // crouch must have been held within this many seconds of toward + punch
// SF dragon punch (toward, then crouch + toward + punch, or O): a rising uppercut that is invulnerable for its first
// `inv` s, so it beats jump-ins and pressure, but whiffing or getting it blocked leaves you falling and open (`rec` s
// of landing lag). act: [start, end] of the active window; the fist reaches a foe up to 1.9 m above.
const RISE = {
  bat: { name: 'RISING KNIGHT', vy: 6, fwd: 2, inv: 0.2, act: [0.05, 0.38], reach: 1.35, dmg: 12, kb: 1.5, up: 8, stun: 0.7, heavy: true, at: 'rh', blast: 1.2, col: 0xffd23a, rec: 0.35 },
  sup: { name: 'KRYPTON RISING', vy: 6.5, fwd: 1.5, inv: 0.22, act: [0.05, 0.42], reach: 1.4, dmg: 13, kb: 1.2, up: 9, stun: 0.7, heavy: true, at: 'rh', blast: 1.3, col: 0x6fa8ff, rec: 0.35 },
};
const DP = 0.4; // toward -> crouch -> punch must each follow within this many seconds
// SF3 parry: tap toward (crouch for lows) within `win` s before a strike or projectile lands = no damage, no chip;
// the attacker freezes for `frz` s (can't chain) so the parrier gets a free punish. Taps closer together than `lock` s
// are ignored (no mashing), a successful parry clears the lock. cpu: chance the CPU parries a hit it is idle for.
const PARRY = { win: 0.15, lock: 0.4, frz: 0.3, pose: 0.22, meter: 6, cpu: 0.1 };
// Power-ups: a glowing orb drops into the arena now and then (first at `first` s, then every `every` s if none is out);
// walk through it to collect. rage: 1.5x damage for `time` s (red aura); meter: +50 super meter; heal: +15 HP.
const ORB = { first: 8, every: 11, life: 9, y: 1.0, r: 0.75, fall: 1.2 };
const POWER = {
  rage:  { name: 'RAGE! ×1.5 DAMAGE', col: 0xff3a2a, time: 8, mult: 1.5 },
  meter: { name: 'POWER SURGE +50', col: 0xffd23a, meter: 50 },
  heal:  { name: 'HEALTH +15', col: 0x3aff7a, hp: 15 },
};
// what a parry can deflect: normal strikes, the rising uppercut, projectiles and the flying kick (not throws, supers, fatalities)
const PARRYABLE = new Set([...Object.values(MOVES), ...Object.values(RISE), ...Object.values(SHOT), FLYKICK]);
const LIMB = { lh: (H) => H.arms.L.hand, rh: (H) => H.arms.R.hand, lf: (H) => H.legs.L.an, rf: (H) => H.legs.R.an };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const T = (p, x) => ({ tw: 0, pitch: 0, gait: 0, ...p, ...x });
const mixPose = (a, b, k) => {
  const o = { ...b };
  for (const n of NUM) o[n] = a[n] + (b[n] - a[n]) * k;
  for (const n of ARR) o[n] = a[n].map((v, j) => v + (b[n][j] - v) * k);
  return o;
};

export class Game {
  constructor(ctx) {
    this.ctx = ctx; // { bat, sup, batCape, supCape, rng, restart, quit, fx: { sparkBurst, dustBurst, rubble, impact, waves, decals, flash, blast } }
    this.active = false;
    this.keys = new Set();
    this.pad = null; this.padNow = []; this.padPrev = [];
    this.camPos = new THREE.Vector3(0, 3, 11); this.camLook = new THREE.Vector3(0, 2, 0); this.camN = new THREE.Vector2(0, 1);
    this.camOff = new THREE.Vector3(); this.camRoll = 0; // transient hit punch-in / dutch tilt on top of camPos
    this.ui = {
      hud: document.getElementById('game'), banner: document.getElementById('banner'), combo: document.getElementById('combo'),
      bars: { bat: document.querySelector('#hpBat i'), sup: document.querySelector('#hpSup i') },
      tags: { bat: document.getElementById('tagBat'), sup: document.getElementById('tagSup') },
      meters: { bat: document.getElementById('mtBat'), sup: document.getElementById('mtSup') }, timer: document.getElementById('timer'),
    };
  }

  start(choice) {
    const { bat, sup } = this.ctx;
    this.active = true; this.choice = choice; this.t = 0; this.state = 'enter'; this.overT = 0; this.ts = 1; this.landed = false; this.shownWin = false;
    this.hitstop = 0; this.comboT = 0; this.pending = []; this.cine = null; this.kick = null; this.koCam = null; this.camRoll = 0; this.finish = null; this.shots = []; this.orb = null; this.orbT = ORB.first;
    this.round = 1; this.wins = { bat: 0, sup: 0 }; this.clock = ROUND_TIME; this.fightT = 0; this.matchOver = false; this.winner = null;
    const mk = (H, key, x, yaw) => ({ H, key, x, z: 0, y: 0, vy: 0, kx: 0, kz: 0, yaw, hp: 100, act: null, stun: 0, heavy: false, block: false,
      ko: false, cd: 0, down: 0, meter: 0, launched: false, buf: null, bufT: 0, bufMod: false, hits: 0, inX: 0, inZ: 0,
      heldBy: null, lastBtn: null, lastBtnT: -1, lastTap: 0, lastTapT: -1, tapS: 0, crouch: false, dazed: false, downT: -9, tow: 0, rage: 0, fwdT: -9, cT0: -9, cNow: false, parT: -9, parL: -9, parTap: -9, parryT: 0, parLow: false, frz: 0,
      ai: { t: 0, mx: 0, mz: 0, block: 0, crouch: 0, chain: 0, air: false }, cur: T(POSES.guard), moving: 0, hx: 0, hy: 0, squash: 0 });
    this.F = { bat: mk(bat, 'bat', -7.4, Math.PI / 2), sup: mk(sup, 'sup', 2.2, -Math.PI / 2) };
    this.F.sup.y = 26; this.F.sup.cur = T(POSES.fly, { pitch: 0.35 });
    this.me = this.F[choice]; this.cpu = this.F[choice === 'bat' ? 'sup' : 'bat'];
    this.camPos.set(0, 3.5, 13); this.camLook.set(0, 3, 0); this.camN.set(0, 1);
    this.heat = null;
    this.pose(0);
    this.ctx.batCape.reset(); this.ctx.supCape.reset();
    this.ui.hud.style.display = 'block';
    this.updateTags();
    this.ui.combo.style.opacity = 0;
    this.say('');
    this.updateBars();
  }

  stop() { this.active = false; this.heat = null; this.shots = []; this.orb = null; this.ui.hud.style.display = 'none'; this.say(''); }

  say(text, sub = '') { this.ui.banner.innerHTML = text ? `${text}${sub ? `<small>${sub}</small>` : ''}` : ''; this.ui.banner.style.opacity = text ? 1 : 0; }

  // ---------- input ----------
  keydown(e) {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (this.matchOver && this.overT > 1.5 && (k === 'enter' || k === 'r')) { this.ctx.restart(this.choice); return; }
    if (e.repeat) return;
    if (k === 'j') this.press(this.me, 'J', this.blockHeld());
    else if (k === 'k') this.press(this.me, 'K', this.blockHeld());
    else if (k === 'l') this.press(this.me, 'S', this.blockHeld());
    else if (k === 'i') this.press(this.me, 'S', true);
    else if (k === 'u') this.throwStart(this.me);
    else if (k === 'o') this.rise(this.me);
    else if (k === ' ') this.press(this.me, 'A');
  }
  keyup(e) { this.keys.delete(e.key.toLowerCase()); }

  // Merge every connected pad: macOS can expose one controller as several gamepads (one of them dead),
  // so reading only the first one can miss all input.
  readPad() {
    const list = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((g) => g && g.connected);
    this.padPrev = this.padNow; this.pads = list;
    if (!list.length) { this.pad = null; this.padNow = []; return; }
    const n = Math.max(...list.map((g) => g.buttons.length));
    this.padNow = Array.from({ length: n }, (_, i) => list.some((g) => g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5)));
    let axes = [0, 0], rs = 0;
    for (const g of list) if (g.axes.length >= 2 && Math.hypot(g.axes[0], g.axes[1]) > Math.hypot(axes[0], axes[1])) axes = [g.axes[0], g.axes[1]];
    for (const g of list) if (g.axes.length >= 4) rs = Math.max(rs, g.axes[3]);
    this.pad = { axes, rs };
  }
  padHit(i) { return !!this.padNow[i] && !this.padPrev[i]; }
  // Title screen: X / d-pad left = Batman, B / d-pad right = Superman.
  menuPad() {
    this.readPad();
    if (this.padHit(2) || this.padHit(14)) return 'bat';
    if (this.padHit(1) || this.padHit(15)) return 'sup';
    return null;
  }
  // In game (standard mapping): X punch, Y kick, B special, A jump, LB/RB/LT/RT block, Start rematch, Back menu.
  gamePad() {
    this.readPad();
    if (!this.pad) return true;
    if (this.padHit(8)) { this.ctx.quit(); return false; }
    if (this.matchOver && this.overT > 1.5 && (this.padHit(9) || this.padHit(0))) { this.ctx.restart(this.choice); return true; }
    if (this.padHit(2)) this.press(this.me, 'J', this.blockHeld());
    if (this.padHit(3)) this.press(this.me, 'K', this.blockHeld());
    if (this.padHit(1)) this.press(this.me, 'S', this.blockHeld());
    if (this.padHit(0)) this.press(this.me, 'A');
    return true;
  }
  blockHeld() { return this.keys.has('shift') || [4, 5, 6, 7].some((i) => this.padNow[i]); }
  // Crouch: C, or right stick down / L3 (left stick + d-pad already walk in depth).
  crouchHeld() { return this.keys.has('c') || !!this.padNow[10] || !!(this.pad && this.pad.rs > 0.5); }
  canCrouch(f) {
    const M = f.act && MOVES[f.act.type];
    return !f.ko && f.y <= 0.001 && f.stun <= 0 && f.down <= 0 && !f.launched && !f.heldBy && (!f.act || !!(M && M.crouch));
  }
  rumble(strong, ms) {
    for (const g of this.pads || []) {
      const a = g.vibrationActuator;
      if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: Math.min(1, strong + 0.3) }).catch(() => {});
    }
  }

  // ---------- moves ----------
  free(f) { return !f.act && f.stun <= 0 && !f.ko && f.y <= 0.001 && f.down <= 0 && !f.launched; }
  press(f, btn, mod = false) {
    if (this.state !== 'fight' || f.ko || f.dazed) return;
    if (btn === 'S') return this.canFatal(f) ? this.fatality(f) : mod && f.meter >= 100 ? this.superMove(f) : this.special(f);
    if (btn === 'A') return this.jump(f, f.inX, f.inZ);
    // dragon punch (toward, then crouch + toward + punch) = rising uppercut; quarter circle forward + punch = projectile
    if (btn === 'J' && f.tow > 0.6 && f.cNow && f.cT0 >= f.fwdT && f.cT0 - f.fwdT < DP && this.fightT - f.cT0 < DP && this.rise(f)) return;
    if (btn === 'J' && f.tow > 0.6 && this.fightT - f.downT < QCF && this.shoot(f)) return;
    // punch + kick together = throw (SF style)
    if (f.lastBtn === (btn === 'J' ? 'K' : 'J') && this.fightT - f.lastBtnT < 0.1) { f.lastBtn = null; return this.throwStart(f); }
    f.lastBtn = btn; f.lastBtnT = this.fightT;
    f.buf = btn; f.bufT = 0.3; f.bufMod = mod;
    this.tryStart(f);
  }
  // Consume the buffered button: fresh move when idle (air attack if airborne, block+J uppercut, block+K sweep),
  // or the chain continuation once the current move has hit and passed its cancel point.
  tryStart(f) {
    if (!f.buf || f.ko) return;
    let a = f.act;
    if (a && a.type === 'dash' && a.dir > 0 && a.t > 0.12) f.act = a = null; // dash cancels into any attack
    const M = a && MOVES[a.type];
    let name = null;
    if (!a) {
      if (f.stun > 0 || f.down > 0 || f.launched) return;
      if (f.y > 0.3) name = f.buf === 'J' ? 'dive' : 'airkick';
      else if (f.y <= 0.001) name = f.bufMod ? (f.buf === 'J' ? 'upper' : 'sweep') : f.crouch ? (f.buf === 'J' ? 'cjab' : 'ckick') : (f.buf === 'J' ? 'jab' : 'front');
    } else if (M && M.next && a.done && !a.parried && a.t >= M.cancel) name = M.next[f.buf];
    if (name) { f.buf = null; this.begin(f, name); }
  }
  begin(f, name) {
    f.act = { type: name, t: 0, done: false };
    if (name === 'dive') { f.vy = Math.min(f.vy, -2); f.kx += Math.sin(f.yaw) * 4; f.kz += Math.cos(f.yaw) * 4; }
    if (name === 'airkick') { f.vy = Math.max(f.vy, 1.5); f.kx += Math.sin(f.yaw) * 3; f.kz += Math.cos(f.yaw) * 3; }
  }
  // Double-tap toward = dash (cancellable into attacks), away = backdash (short hop, briefly invulnerable).
  dash(f, dir) {
    if (!this.free(f) || f.block || f.crouch) return;
    f.act = { type: 'dash', t: 0, dir, go: false };
  }
  // Grab attempt; while being held, the same input techs (breaks) the throw inside the tech window.
  throwStart(f) {
    if (this.state !== 'fight' || f.ko || f.dazed) return;
    const g = f.heldBy;
    if (g) { if (g.act && g.act.type === 'throw' && g.act.t < THROW.grab + THROW.tech) this.tech(g, f); return; }
    const a = f.act;
    const early = a && ((a.type === 'jab' || a.type === 'front') && !a.done && a.t < 0.1 || a.type === 'dash' && a.dir > 0);
    if (!this.free(f) && !(early && f.stun <= 0 && f.y <= 0.001)) return;
    f.act = { type: 'throw', t: 0, done: false, grab: false, checked: false }; f.buf = null; f.block = false;
  }
  grabbable(o) {
    const a = o.act;
    if (o.ko || o.down > 0 || o.launched || o.y > 0.05 || o.stun > 0 || o.heldBy) return false;
    return !(a && (a.type === 'super' || a.type === 'flykick' || a.type === 'rise' || a.type === 'dash' && a.dir < 0 && a.t < DASH.invuln));
  }
  // Throw broken: both are shoved apart.
  tech(f, o) {
    const { fx } = this.ctx, dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz) || 1;
    f.act = null; o.act = null; o.heldBy = null; f.stun = o.stun = 0.18; f.heavy = o.heavy = false; o.y = 0;
    f.kx -= dx / d * 5; f.kz -= dz / d * 5; o.kx += dx / d * 5; o.kz += dz / d * 5;
    const c = f.H.chest.getWorldPosition(new THREE.Vector3()).lerp(o.H.chest.getWorldPosition(new THREE.Vector3()), 0.5);
    fx.sparkBurst(c.x, c.y, c.z, 30, 4, 0xffffff); fx.waves.spawn(c.x, c.y, c.z, 1.5, 0xffffff, 0.5); fx.impact(c.x, c.y, c.z, 0.2);
    this.hitstop = Math.max(this.hitstop, 0.08); this.rumble(0.5, 150);
    this.showCombo('THROW TECH', null);
  }
  // Release: Batman's hip toss sends the foe over his shoulder to land behind him; Superman slams him down in front.
  toss(f, o, S) {
    const { fx } = this.ctx;
    f.hits = 0;
    this.hurt(o, f, S, this.contact(f, o, S));
    if (S.back) { o.kx = -Math.sin(f.yaw) * S.kb; o.kz = -Math.cos(f.yaw) * S.kb; }
    else { fx.waves.spawn(o.x, 0.05, o.z, 3, 0xfff2d0, 0.7); fx.dustBurst(o.x, 0, o.z, 60, 3); fx.decals.add(o.x, o.z, 0.7); }
    this.showCombo(f.key === 'bat' ? 'HIP TOSS' : 'POWER SLAM', f.key);
  }
  shoot(f) {
    if (!this.free(f) || this.shots.some((s) => s.f === f)) return false;
    f.act = { type: 'shoot', t: 0, done: false }; f.buf = null; f.block = f.crouch = false; f.downT = -9;
    return true;
  }
  // Projectiles in flight: trails, cancelling each other, hitting (ducked / jumped / blocked by height).
  shotsStep(dt) {
    const { fx } = this.ctx, rng = this.ctx.rng;
    if (this.state !== 'fight') { this.shots = []; return; }
    for (const s of this.shots) {
      s.t += dt; s.x += s.vx * dt; s.z += s.vz * dt;
      if (s.key === 'bat') { if (rng() < 0.5) fx.sparkBurst(s.x, s.y, s.z, 1, 0.6, 0xffd23a); }
      else { if (rng() < 0.6) fx.dustBurst(s.x, 0, s.z, 2, 1.2); if (rng() < 0.3) fx.sparkBurst(s.x, s.y, s.z, 1, 1, 0x9fc8ff); }
      if (s.t > SHOT[s.key].life || s.x < ARENA.x0 - 1 || s.x > ARENA.x1 + 1 || s.z < ARENA.z0 - 1 || s.z > ARENA.z1 + 1) s.dead = true;
    }
    const [p, q] = this.shots;
    if (p && q && !p.dead && !q.dead && Math.hypot(p.x - q.x, p.z - q.z) < 0.8) {
      p.dead = q.dead = true;
      const x = (p.x + q.x) / 2, z = (p.z + q.z) / 2, y = (p.y + q.y) / 2;
      fx.sparkBurst(x, y, z, 50, 5, 0xffffff); fx.blast(x, y, z, 1.2, 0.5); fx.waves.spawn(x, y, z, 2, 0xffffff, 0.5); fx.impact(x, y, z, 0.25);
      this.hitstop = Math.max(this.hitstop, 0.08);
      this.showCombo('CANCEL!', null);
    }
    for (const s of this.shots) {
      if (s.dead) continue;
      const S = SHOT[s.key], o = s.f === this.me ? this.cpu : this.me;
      if (o.ko || o.down > 0 || o.heldBy || Math.hypot(o.x - s.x, o.z - s.z) > S.r) continue;
      if (S.hi ? o.y > 0.9 || (o.crouch && o.y <= 0.001) : o.y > 0.45) continue; // jumped over / ducked under
      if (o.act && o.act.type === 'dash' && o.act.dir < 0 && o.act.t < DASH.invuln) continue;
      if (o.act && o.act.type === 'rise' && o.act.t < RISE[o.key].inv) continue; // rising uppercut passes through
      s.dead = true;
      const at = new THREE.Vector3(s.x, Math.max(s.y, 0.7), s.z);
      if (this.canParry(o, S)) this.parry(o, null, S, at); else this.hurt(o, s.f, S, at);
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }
  // Power-up orb: drops from the sky, hovers, and is collected by the first fighter to walk through it.
  orbStep(dt) {
    const { fx } = this.ctx, rng = this.ctx.rng;
    if (this.state !== 'fight') { this.orb = null; return; }
    for (const f of [this.me, this.cpu]) if (f.rage > 0) {
      f.rage -= dt;
      if (rng() < 0.35) { const c = f.H.chest.getWorldPosition(new THREE.Vector3()); fx.sparkBurst(c.x + (rng() - 0.5) * 0.5, c.y + (rng() - 0.5) * 0.8, c.z + (rng() - 0.5) * 0.5, 1, 1.2, POWER.rage.col); }
    }
    let o = this.orb;
    if (!o) {
      if (this.finish || this.cine || (this.orbT -= dt) > 0) return;
      const types = Object.keys(POWER);
      o = this.orb = { type: types[Math.floor(rng() * types.length)], x: ARENA.x0 + 1.5 + rng() * (ARENA.x1 - ARENA.x0 - 3), z: -1 + rng() * 2.5, y: 8, t: 0 };
      this.orbT = ORB.every;
    }
    o.t += dt;
    o.y = o.t < ORB.fall ? ORB.y + 7 * (1 - o.t / ORB.fall) ** 2 : ORB.y + Math.sin(o.t * 3) * 0.08;
    if (o.t >= ORB.fall && !o.landed) { o.landed = true; fx.waves.spawn(o.x, 0.05, o.z, 1.6, POWER[o.type].col, 0.5); fx.dustBurst(o.x, 0, o.z, 20, 1.5); }
    if (o.t > ORB.fall + ORB.life) { fx.sparkBurst(o.x, o.y, o.z, 15, 1.5, POWER[o.type].col); this.orb = null; return; }
    if (!o.landed) return;
    for (const f of [this.me, this.cpu]) {
      if (f.ko || f.dazed || f.launched || f.heldBy || f.y > 1.6 || Math.hypot(f.x - o.x, f.z - o.z) > ORB.r) continue;
      const P = POWER[o.type];
      if (P.time) f.rage = P.time;
      if (P.meter) f.meter = Math.min(100, f.meter + P.meter);
      if (P.hp) f.hp = Math.min(100, f.hp + P.hp);
      fx.sparkBurst(o.x, o.y, o.z, 50, 4, P.col); fx.waves.spawn(o.x, o.y, o.z, 2, P.col, 0.6); fx.blast(o.x, o.y, o.z, 1, 0.4, P.col); fx.flash(0.12);
      this.showCombo(P.name, f.key);
      if (f === this.me) this.rumble(0.4, 150);
      this.orb = null; this.updateBars();
      return;
    }
  }
  rise(f) {
    if (!this.free(f)) return false;
    f.act = { type: 'rise', t: 0, done: false, go: false }; f.buf = null; f.block = f.crouch = false; f.cT0 = -9;
    return true;
  }
  jump(f, mx = 0, mz = 0) { if (this.free(f) && !f.block) { f.vy = 6; f.kx += mx * 3; f.kz += mz * 3; } }
  special(f) {
    if (!this.free(f) || f.cd > 0) return;
    f.cd = 4;
    f.act = { type: f.key === 'bat' ? 'flykick' : 'heat', t: 0, done: false };
  }

  superMove(f) {
    if (!this.free(f)) return;
    const S = SUPERS[f.key];
    f.meter = 0; f.block = false; f.hits = 0;
    f.act = { type: 'super', t: 0, phase: 'rush', k: 0, kt: 0, hit: false, done: false };
    // super flash: everything freezes for a beat, the screen whites out and the camera starts its orbit
    this.hitstop = Math.max(this.hitstop, 0.3);
    const c = f.H.chest.getWorldPosition(new THREE.Vector3()), { fx } = this.ctx;
    fx.flash(0.45); fx.waves.spawn(c.x, c.y, c.z, 2.5, f.key === 'bat' ? 0xffd23a : 0x6fa8ff, 0.6); fx.sparkBurst(c.x, c.y, c.z, 60, 4, 0xffffff);
    this.cine = { f, t: 0, a0: Math.atan2(this.camN.x, this.camN.y), end: Infinity };
    this.showCombo(S.name, f.key);
    if (f === this.me || f === this.cpu) this.rumble(0.6, 200);
    this.updateBars();
  }
  // Scripted super after the rush. Returns false when the act is over.
  superStep(f, o, a, dt) {
    const S = SUPERS[f.key], { fx } = this.ctx;
    const d = Math.hypot(o.x - f.x, o.z - f.z);
    if (a.phase === 'rush') {
      if (d > 1.05) { const s = Math.min(9 * dt, d - 1.05); f.x += (o.x - f.x) / d * s; f.z += (o.z - f.z) / d * s; }
      if (d <= 1.15 && !o.ko && o.down <= 0 && o.y < 1.2) { a.phase = 'seq'; a.k = 0; a.kt = 0; a.hit = false; fx.impact(o.x, 1, o.z, 0.3); }
      else if (a.t > 0.7) { this.endCine(0.3); return false; } // whiffed
      return true;
    }
    const name = a.phase === 'seq' ? S.seq[a.k] : S.fin, M = MOVES[name];
    a.kt += dt;
    if (a.phase === 'seq') {
      // pin the victim in front of the attacker for the whole string
      o.x = f.x + Math.sin(f.yaw) * 1.0; o.z = f.z + Math.cos(f.yaw) * 1.0; o.y = 0; o.vy = 0; o.kx = o.kz = 0;
      o.launched = false; o.act = null; o.stun = Math.max(o.stun, 0.4); o.block = false;
    }
    if (!a.hit && a.kt >= M.hit) {
      a.hit = true;
      const fin = a.phase === 'fin', HM = fin ? S.finish : { ...M, kb: 0.4, up: 0 };
      const at = this.contact(f, o, HM);
      this.hurt(o, f, HM, at);
      if (fin) { fx.waves.spawn(at.x, at.y, at.z, 5, 0xffffff, 1); fx.dustBurst(o.x, 0, o.z, 80, 4); fx.flash(0.5); this.hitstop = Math.max(this.hitstop, 0.25); this.endCine(1.4); }
      if (o.ko || o.dazed) { this.endCine(1.4); return false; }
    }
    if (a.kt >= (a.phase === 'seq' ? M.hit + 0.09 : M.dur)) {
      if (a.phase === 'fin') return false;
      a.k++; a.kt = 0; a.hit = false;
      if (a.k >= S.seq.length) a.phase = 'fin';
    }
    return true;
  }
  endCine(after) { if (this.cine) this.cine.end = Math.min(this.cine.end, this.cine.t + after); }
  // MK "FINISH HIM!": the match-winning blow leaves the loser standing, dazed, at 0 HP.
  finishHim(def, att) {
    this.finish = { def, att, t: 0, go: false };
    def.dazed = true; def.hp = 0; def.block = def.crouch = false; def.buf = null;
    this.hitstop = Math.max(this.hitstop, 0.25); this.ctx.fx.flash(0.4);
    this.say('FINISH HIM!', att === this.me ? 'GET CLOSE · SPECIAL (L / B) = FATALITY · ANY HIT = K.O.' : '');
    if (att === this.me || def === this.me) this.rumble(0.5, 250);
    this.updateBars();
  }
  canFatal(f) {
    const F = this.finish;
    if (!F || F.go || F.att !== f || !this.free(f)) return false;
    const o = F.def;
    return !o.launched && o.down <= 0 && o.y <= 0.001 && Math.hypot(o.x - f.x, o.z - f.z) < FINISH.reach;
  }
  fatality(f) {
    const o = this.finish.def, { fx } = this.ctx;
    this.finish.go = true; f.block = f.crouch = false; f.buf = null; f.hits = 0;
    f.act = { type: 'fatal', t: 0, k: -1, kt: 0, pose: null, name: null, done: false };
    o.act = null; o.stun = 1; o.kx = o.kz = 0;
    this.hitstop = Math.max(this.hitstop, 0.3); fx.flash(0.5);
    this.cine = { f, t: 0, a0: Math.atan2(this.camN.x, this.camN.y), end: Infinity };
    this.say('');
    this.showCombo(FATAL[f.key].name, f.key);
    this.rumble(0.6, 250);
  }
  // Scripted fatality. Batman: smoke bomb, a blur of strikes on the pinned foe, then a spinning kick that blasts him
  // across the arena. Superman: grabs him, rockets straight up with him overhead, power-dives and slams him into the
  // ground. Only the last blow K.O.s (fin). Returns false when the act is over.
  fatalStep(f, o, a) {
    const S = FATAL[f.key], { fx } = this.ctx, sx = Math.sin(f.yaw), sz = Math.cos(f.yaw);
    const pin = (dist, y) => { o.x = f.x + sx * dist; o.z = f.z + sz * dist; o.y = y; o.vy = 0; o.kx = o.kz = 0; o.stun = 1; o.act = null; o.launched = false; };
    if (f.key === 'bat') {
      if (a.t < S.smoke) {
        a.pose = 'crouch';
        if (!a.smoke) { a.smoke = true; fx.dustBurst(f.x, 0.2, f.z, 140, 2.5); fx.dustBurst(o.x, 0.2, o.z, 90, 2); fx.sparkBurst(f.x, 1, f.z, 30, 3, 0x333333); }
        return true;
      }
      const u = a.t - S.smoke, k = Math.floor(u / S.gap);
      if (k < S.seq.length) {
        pin(1.0, 0);
        a.pose = null; a.name = S.seq[k]; a.kt = u - k * S.gap;
        if (k !== a.k) { a.k = k; const M = { ...MOVES[a.name], kb: 0.3, up: 0, dmg: 0 }; this.hurt(o, f, M, this.contact(f, o, M)); }
        return true;
      }
      a.name = 'round'; a.kt = u - S.seq.length * S.gap;
      if (!a.done && a.kt >= MOVES.round.hit) { a.done = true; this.hurt(o, f, S.finish, this.contact(f, o, S.finish)); }
      return a.kt < MOVES.round.dur;
    }
    const up = S.grab + S.rise, dn = up + S.fall;
    if (a.t < S.grab) a.pose = 'grab';
    else if (a.t < up) {
      a.pose = 'lift';
      const u = (a.t - S.grab) / S.rise; f.y = S.top * u * u * (3 - 2 * u);
      if (!a.launch) { a.launch = true; fx.dustBurst(f.x, 0, f.z, 90, 3.5); fx.waves.spawn(f.x, 0.05, f.z, 3.5, 0xfff2d0, 0.6); fx.impact(f.x, 0, f.z, 0.3); }
    } else if (a.t < dn) { a.pose = 'slam'; const u = (a.t - up) / S.fall; f.y = S.top * (1 - u * u); }
    else if (!a.done) {
      a.done = true; f.y = 0; pin(0.8, 0.3);
      fx.rubble(o.x, 0, o.z, 90, 8, 0.06, 0.3, 6); fx.dustBurst(o.x, 0, o.z, 200, 5); fx.waves.spawn(o.x, 0.05, o.z, 7, 0xfff2d0, 1);
      fx.decals.add(o.x, o.z, 1.3); fx.impact(o.x, 0, o.z, 0.8);
      this.hurt(o, f, S.finish, this.contact(f, o, S.finish));
    }
    if (!a.done) pin(0.8, f.y + (a.t < S.grab ? 0 : 0.9 * clamp((a.t - S.grab) / 0.2, 0, 1)));
    return a.t < dn + 0.6;
  }
  reaches(f, o, M, d) {
    if (o.ko || o.down > 0) return false;
    if (M.air) { const dy = f.y - o.y; return d < M.reach && dy > -0.8 && dy < 1.7; } // limb reaches down to a standing head
    if (M.low) return d < M.reach && o.y < 0.15;
    if (M.hi && o.crouch && o.y <= 0.001) return false; // ducked under
    return d < M.reach && o.y < (M.at[1] === 'f' || M.up > 5 ? 1.6 : 1.2);
  }
  // SF3 parry: a fresh tap toward (crouch for lows) inside PARRY.win before the blow lands, standing on the ground and
  // not attacking, stunned or held. The CPU parries a share of the hits it is idle for.
  canParry(def, M) {
    if (this.state !== 'fight' || !PARRYABLE.has(M) || def.act || def.stun > 0 || def.y > 0.001 || def.heldBy || def.dazed || def.launched) return false;
    if (def === this.cpu) return this.ctx.rng() < PARRY.cpu;
    return this.fightT - (M.low ? def.parL : def.parT) < PARRY.win;
  }
  // Deflected: no damage or chip, a blue flash and freeze; the attacker is stuck in his move for PARRY.frz (no chain).
  parry(def, att, M, at) {
    const { fx } = this.ctx;
    def.parT = def.parL = def.parTap = -9; def.parryT = PARRY.pose; def.parLow = !!M.low;
    def.meter = Math.min(100, def.meter + PARRY.meter); def.block = false;
    if (att) { att.frz = PARRY.frz; att.hits = 0; att.buf = null; if (att.act) att.act.parried = true; }
    def.cur.tw += 0.25; def.hx -= 0.05;
    fx.sparkBurst(at.x, at.y, at.z, 30, 3.5, 0x8fd0ff); fx.waves.spawn(at.x, at.y, at.z, 1.3, 0x8fd0ff, 0.35);
    fx.blast(at.x, at.y, at.z, 0.35, 0.25, 0x6fa8ff); fx.impact(at.x, at.y, at.z, 0.08);
    this.hitstop = Math.max(this.hitstop, 0.1);
    if (def === this.me || att === this.me) this.rumble(0.3, 90);
    this.showCombo('PARRY!', def.key);
    this.updateBars();
  }
  contact(att, def, M) {
    const p = LIMB[M.at || 'rh'](att.H).getWorldPosition(new THREE.Vector3());
    return p.lerp(def.H.chest.getWorldPosition(new THREE.Vector3()), 0.35);
  }

  hurt(def, att, M, at, trade = false) {
    const { fx } = this.ctx;
    if (def.ko || def.down > 0) return;
    if (def.act && def.act.type === 'super') { this.ctx.fx.sparkBurst(at.x, at.y, at.z, 10, 2, 0xffffff); return; } // armoured
    if (def.act && def.act.type === 'dash' && def.act.dir < 0 && def.act.t < DASH.invuln) return; // backdash invulnerability
    if (def.act && def.act.type === 'rise' && def.act.t < RISE[def.key].inv) { fx.sparkBurst(at.x, at.y, at.z, 8, 2, 0xffffff); return; } // invincible start-up
    if (this.canParry(def, M)) { this.parry(def, att, M, at); return; }
    const dx = def.x - att.x, dz = def.z - att.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    const mine = def === this.me || att === this.me;
    const guarding = def.block && !def.act && def.stun <= 0 && def.y <= 0.001, over = M.air || M.over;
    const rage = att.rage > 0 ? POWER.rage.mult : 1;
    if (guarding && (def.crouch ? !over : !M.low)) {
      def.hp = Math.max(1, def.hp - M.dmg * 0.15 * rage);
      att.meter = Math.min(100, att.meter + 2); def.meter = Math.min(100, def.meter + 4);
      def.kx += nx * M.kb * 0.45; def.kz += nz * M.kb * 0.45; att.kx -= nx * 0.6; att.kz -= nz * 0.6;
      def.cur.lean -= M.heavy ? 0.22 : 0.12; def.hx -= 0.12; // the guard absorbs the blow: a small jolt back
      fx.sparkBurst(at.x, at.y, at.z, 14, 3, 0xbfd8ff);
      fx.blast(at.x, at.y, at.z, 0.3, 0.3, 0x6fa8ff);
      fx.impact(at.x, at.y, at.z, 0.06);
      this.hitstop = Math.max(this.hitstop, 0.04);
      if (mine) this.rumble(0.2, 80);
      this.updateBars();
      return;
    }
    const juggle = def.stun > 0 || def.launched || def.y > 0.05;
    att.hits = juggle ? att.hits + 1 : 1;
    const dmg = M.dmg * rage * Math.max(0.45, 1 - 0.1 * (att.hits - 1));
    def.act = null; def.buf = null; def.frz = 0; def.stun = def.stunMax = M.stun; def.heavy = !!M.heavy;
    def.zone = M.low ? 'low' : M.hi || M.air || M.over || (M.up || 0) > 5 ? 'head' : 'body'; def.hitSide = M.at === 'lh' ? -1 : 1;
    def.kx = def.kx * 0.3 + nx * M.kb; def.kz = def.kz * 0.3 + nz * M.kb;
    att.kx -= nx * 0.5; att.kz -= nz * 0.5;
    const up = M.up || 0, air = def.y > 0.05;
    if (up > 0 || (air && up === 0)) { def.vy = Math.max(def.vy, air ? 2.8 + up * 0.45 : up); def.y = Math.max(def.y, 0.001); def.launched = true; }
    else if (up < 0 && air) { def.vy = up * 1.5; def.launched = true; }
    // the blow snaps the body back / twists it; the pose spring brings it round again
    def.cur.lean -= M.heavy ? 0.6 : 0.3; def.cur.tw += (M.at === 'lh' ? -0.3 : 0.3);
    def.hy += (M.at === 'lh' ? -0.5 : 0.5); def.hx -= M.heavy ? 0.55 : 0.3; // head snaps with the blow
    const col = att.key === 'bat' ? 0xfff0c0 : 0xbfd8ff, size = (M.blast || 0.6) * (trade ? 1.35 : 1);
    fx.sparkBurst(at.x, at.y, at.z, M.heavy ? 50 : 22, M.heavy ? 5 : 3.5, col);
    fx.blast(at.x, at.y, at.z, size, 0.3 + size * 0.25);
    fx.impact(at.x, at.y, at.z, M.heavy ? 0.35 : 0.15);
    if (M.heavy) { fx.waves.spawn(at.x, at.y, at.z, 1.6 * size, 0xffffff, 0.5); fx.flash(0.15); }
    if (M.trip) fx.dustBurst(def.x, 0, def.z, 30, 2);
    this.hitstop = Math.max(this.hitstop, M.heavy ? 0.12 : 0.06);
    if (M.heavy || att.hits >= 3) this.camKick(at, M.heavy ? 1 : 0.5, M.at === 'lh' ? -1 : 1);
    if (mine) this.rumble(M.heavy ? 0.9 : 0.45, M.heavy ? 220 : 110);
    def.hp = Math.max(0, def.hp - dmg);
    if (!(att.act && att.act.type === 'super')) { att.meter = Math.min(100, att.meter + dmg * 1.4); def.meter = Math.min(100, def.meter + dmg * 0.8); }
    this.updateBars();
    if (att.hits >= 2) this.showCombo(`${att.hits} HIT COMBO`, att.key);
    else if (guarding) this.showCombo(def.crouch ? 'OVERHEAD!' : 'LOW!', att.key); // guard broken by the wrong height
    if (def.hp <= 0) {
      if (!M.fin && att.act && att.act.type === 'fatal') return; // fatality string: only its last blow K.O.s
      if (!this.finish && this.wins[att.key] + 1 >= WINS) { this.finishHim(def, att); return; }
      def.dazed = false; this.finish = null;
      def.ko = true; def.act = null; def.launched = true; def.kx *= 1.6; def.kz *= 1.6; def.vy = Math.max(def.vy, 4); def.y = Math.max(def.y, 0.001);
      this.endRound(att, M.fin ? 'FATALITY' : 'K.O.');
      // MK-style KO camera: low slow-motion orbit round the falling body, then the winner's close-up
      this.cine = null; this.camKick(at, 1.6, M.at === 'lh' ? -1 : 1);
      this.koCam = { def, att, t: 0, a0: Math.atan2(this.camN.x, this.camN.y), side: att.key === 'bat' ? 1 : -1 };
      fx.flash(0.6);
      fx.sparkBurst(at.x, at.y, at.z, 120, 7, 0xffffff); fx.blast(at.x, at.y, at.z, 2, 0.9);
      this.hitstop = 0.2;
      if (mine) this.rumble(1, 500);
    }
  }

  // Both fighters connect in the same instant: a blast on each side plus a shock ring between them.
  clash(h1, h2) {
    const { fx } = this.ctx;
    const m = h1.at.clone().lerp(h2.at, 0.5);
    for (const h of [h1, h2]) { fx.sparkBurst(h.at.x, h.at.y, h.at.z, 60, 6, 0xffffff); fx.waves.spawn(h.at.x, h.at.y, h.at.z, 2.2, 0xffffff, 0.7); }
    fx.waves.spawn(m.x, 0.05, m.z, 4, 0xfff2d0, 0.8); fx.dustBurst(m.x, 0, m.z, 50, 3);
    fx.impact(m.x, m.y, m.z, 0.55); fx.flash(0.3);
    this.hitstop = Math.max(this.hitstop, 0.18);
    this.rumble(1, 300);
    this.showCombo('CLASH!', null);
  }

  showCombo(text, side) {
    const c = this.ui.combo;
    c.textContent = text; c.style.opacity = 1; this.comboT = 1.2;
    c.style.textAlign = side === 'bat' ? 'left' : side === 'sup' ? 'right' : 'center';
    c.style.color = side === 'bat' ? '#ffd23a' : side === 'sup' ? '#6fa8ff' : '#fff';
  }

  updateBars() {
    for (const k of ['bat', 'sup']) {
      this.ui.bars[k].style.width = this.F[k].hp + '%';
      const m = this.ui.meters[k]; m.firstChild.style.width = this.F[k].meter + '%'; m.classList.toggle('full', this.F[k].meter >= 100);
    }
  }
  updateTags() {
    for (const k of ['bat', 'sup']) {
      const pips = '●'.repeat(this.wins[k]) + '○'.repeat(WINS - this.wins[k]);
      const who = `${k === 'bat' ? 'BATMAN' : 'SUPERMAN'} · ${this.choice === k ? 'YOU' : 'CPU'}`;
      this.ui.tags[k].innerHTML = k === 'bat' ? `${who} <span class="pips">${pips}</span>` : `<span class="pips">${pips}</span> ${who}`;
    }
  }
  // Round over (KO or time). winner null = draw. First to WINS rounds takes the match.
  endRound(winner, text) {
    this.state = 'over'; this.overT = 0; this.winner = winner; this.shownWin = false;
    if (winner) this.wins[winner.key]++;
    this.matchOver = Object.values(this.wins).some((w) => w >= WINS);
    this.updateTags();
    this.say(text, this.matchOver ? '' : winner ? `${winner.key === 'bat' ? 'BATMAN' : 'SUPERMAN'} TAKES ROUND ${this.round}` : 'NO WINNER');
  }
  nextRound() {
    this.round++; this.state = 'ready'; this.readyT = 0; this.clock = ROUND_TIME; this.heat = null; this.cine = null; this.winner = null; this.koCam = null; this.kick = null; this.finish = null; this.shots = []; this.orb = null; this.orbT = ORB.first;
    for (const [f, x] of [[this.F.bat, -2.2], [this.F.sup, 2.2]]) {
      Object.assign(f, { x, z: 0, y: 0, vy: 0, kx: 0, kz: 0, hp: 100, act: null, stun: 0, block: false, ko: false, cd: 0, down: 0, launched: false, buf: null, hits: 0, heldBy: null, crouch: false, dazed: false, downT: -9, rage: 0, fwdT: -9, cT0: -9, cNow: false, parT: -9, parL: -9, parTap: -9, parryT: 0, frz: 0, cur: T(POSES.guard) });
      f.yaw = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.ctx.batCape.reset(); this.ctx.supCape.reset();
    this.updateBars();
    this.say(`ROUND ${this.round}`);
  }

  // ---------- per fixed step ----------
  step(dt) {
    if (!this.gamePad()) return 0;
    const hs = this.hitstop > 0; this.hitstop -= dt;
    this.comboT -= dt; if (this.comboT <= 0) this.ui.combo.style.opacity = 0;
    if (this.state === 'over') this.overT += dt;
    this.ts = hs ? 0.04 : this.state === 'over' && this.overT < 1.4 ? 0.3 : 1;
    const sdt = dt * this.ts;
    this.t += sdt;
    if (this.state === 'enter') this.entrance(sdt);
    else if (this.state === 'ready') {
      this.readyT += sdt;
      if (this.readyT > 1.2) this.say('FIGHT!');
      if (this.readyT > 1.7) { this.state = 'fight'; this.fightT = 0; }
    } else {
      for (const f of [this.me, this.cpu]) f.cd = Math.max(0, f.cd - sdt);
      if (this.state === 'fight') {
        this.player(sdt); this.ai(sdt);
        this.fightT += sdt;
        if (!this.cine && !this.finish) this.clock = Math.max(0, this.clock - sdt);
        // nobody finished him in time: he collapses (plain K.O.)
        const F = this.finish;
        if (F && !F.go && (F.t += sdt) > FINISH.time && F.def.down <= 0 && !F.def.launched) this.hurt(F.def, F.att, FALL, F.def.H.chest.getWorldPosition(new THREE.Vector3()));
        if (this.clock <= 0) {
          const { bat, sup } = this.F;
          this.endRound(bat.hp === sup.hp ? null : bat.hp > sup.hp ? bat : sup, 'TIME');
        }
      }
      else { this.me.block = this.cpu.block = this.me.crouch = this.cpu.crouch = false; }
      this.pending = [];
      for (const [f, o] of [[this.me, this.cpu], [this.cpu, this.me]]) this.physics(f, o, sdt);
      // beam ends if heat vision was interrupted (hit / KO clears act without clearing the beam)
      if (![this.me, this.cpu].some((f) => f.act && f.act.type === 'heat')) this.heat = null;
      this.resolve();
      this.shotsStep(sdt);
      this.orbStep(sdt);
      this.separate();
      if (this.state === 'fight' && this.fightT > 1 && this.fightT < 1.2) this.say('');
      if (this.state === 'over' && !this.matchOver && this.overT > 2.8) this.nextRound();
      else if (this.state === 'over' && this.matchOver && this.overT > 1.5 && !this.shownWin) {
        this.shownWin = true;
        const w = this.winner.key === 'bat' ? 'BATMAN' : 'SUPERMAN';
        this.say(`${w} WINS`, this.winner === this.me ? 'YOU WIN · ENTER / START REMATCH · ESC / BACK MENU' : 'YOU LOSE · ENTER / START REMATCH · ESC / BACK MENU');
      }
    }
    this.ui.timer.textContent = Math.ceil(this.clock);
    this.pose(sdt);
    this.camera(dt);
    return sdt;
  }

  // Hits found this step. A lone hit still trades if the defender's own strike was a few frames from landing.
  resolve() {
    const H = this.pending;
    if (this.state !== 'fight' || !H.length) return;
    if (H.length === 1) {
      const o = H[0].def, f = H[0].att, oa = o.act, OM = oa && MOVES[oa.type];
      if (OM && !oa.done && oa.t >= OM.hit - 0.07 && this.reaches(o, f, OM, Math.hypot(f.x - o.x, f.z - o.z))) { oa.done = true; H.push({ att: o, def: f, M: OM }); }
    }
    for (const h of H) h.at = this.contact(h.att, h.def, h.M);
    const trade = H.length === 2;
    for (const h of H) this.hurt(h.def, h.att, h.M, h.at, trade);
    if (trade) this.clash(H[0], H[1]);
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
    if (t > 0.4 && t < 2.6) this.say(this.choice === 'bat' ? 'YOU ARE BATMAN' : 'YOU ARE SUPERMAN',
      'MOVE WASD / STICK · J / X PUNCH ×4 CHAIN · K / Y KICK · SHIFT / LB BLOCK · C / R-STICK DOWN CROUCH<br>CROUCH DUCKS HIGH PUNCHES · LOWS NEED A CROUCH BLOCK, JUMP-INS A STANDING BLOCK<br>BLOCK+PUNCH UPPERCUT · BLOCK+KICK SWEEP · SPACE / A JUMP (+PUNCH/KICK IN AIR) · L / B SPECIAL<br>PUNCH+KICK (OR U) CLOSE = THROW (SAME TO TECH) · DOUBLE-TAP TOWARD / AWAY = DASH / BACKDASH<br>CROUCH, THEN TOWARD + PUNCH = PROJECTILE (BATARANG: DUCK IT · SONIC CLAP: JUMP IT)<br>TOWARD, THEN CROUCH+TOWARD + PUNCH (OR O) = INVINCIBLE RISING UPPERCUT · BEATS JUMP-INS, PUNISHABLE IF IT MISSES<br>TAP TOWARD JUST AS A HIT LANDS = PARRY (TAP CROUCH FOR LOWS) · NO DAMAGE, FREE PUNISH<br>GRAB GLOWING ORBS: RED RAGE ×1.5 DAMAGE · GOLD +50 METER · GREEN +15 HEALTH<br>FULL METER: BLOCK+SPECIAL (OR I) = SUPER · BEST OF 3 ROUNDS · FINISH HIM: CLOSE + SPECIAL = FATALITY');
    else if (t >= 2.6) this.say('FIGHT!');
    if (t >= ENTER_END) { this.state = 'fight'; this.fightT = 0; }
  }

  player(dt) {
    const f = this.me, K = this.keys, p = this.pad, b = this.padNow;
    if (f.dazed) { f.block = f.crouch = false; f.moving = 0; return; }
    let ix = (K.has('d') || K.has('arrowright') || b[15] ? 1 : 0) - (K.has('a') || K.has('arrowleft') || b[14] ? 1 : 0);
    let iy = (K.has('w') || K.has('arrowup') || b[12] ? 1 : 0) - (K.has('s') || K.has('arrowdown') || b[13] ? 1 : 0);
    if (p && p.axes.length >= 2 && Math.hypot(p.axes[0], p.axes[1]) > 0.25) { ix += p.axes[0]; iy -= p.axes[1]; }
    f.block = this.blockHeld() && this.free(f);
    f.crouch = this.crouchHeld() && this.canCrouch(f);
    const ch = this.crouchHeld();
    if (ch) f.downT = this.fightT; // start of the quarter-circle motion
    if (ch && !f.cNow) f.cT0 = this.fightT; // crouch pressed (dragon punch: must come right after toward)
    f.cNow = ch;
    // screen-relative: right = camera right on the ground, up = into the screen
    const fx = this.camLook.x - this.camPos.x, fz = this.camLook.z - this.camPos.z, fl = Math.hypot(fx, fz) || 1;
    const rx = -fz / fl, rz = fx / fl;
    f.inX = ix * rx + iy * fx / fl; f.inZ = ix * rz + iy * fz / fl;
    // double-tap detection on the toward/away axis
    const o = this.cpu, od = Math.hypot(o.x - f.x, o.z - f.z) || 1, tow = (f.inX * (o.x - f.x) + f.inZ * (o.z - f.z)) / od;
    const s = tow > 0.6 ? 1 : tow < -0.6 ? -1 : 0;
    if (s && s !== f.tapS) {
      if (s === f.lastTap && this.fightT - f.lastTapT < DASH.tap) { this.dash(f, s); f.lastTap = 0; } else { f.lastTap = s; f.lastTapT = this.fightT; }
    }
    // parry taps: a fresh toward (or crouch, for lows); taps closer together than PARRY.lock don't count
    const tapT = this.fightT - f.parTap, cTap = ch && f.cT0 === this.fightT;
    if (s === 1 && f.tapS !== 1) { if (tapT > PARRY.lock) f.parT = this.fightT; f.parTap = this.fightT; }
    else if (cTap) { if (tapT > PARRY.lock) f.parL = this.fightT; f.parTap = this.fightT; }
    f.tapS = s; f.tow = tow;
    if (tow > 0.6 && !ch) f.fwdT = this.fightT;
    this.walk(f, f.inX, f.inZ, dt);
  }

  ai(dt) {
    const f = this.cpu, o = this.me, A = f.ai, rng = this.ctx.rng;
    const d = Math.hypot(o.x - f.x, o.z - f.z), tx = (o.x - f.x) / (d || 1), tz = (o.z - f.z) / (d || 1);
    A.t -= dt; A.block -= dt; A.crouch -= dt;
    if (f.dazed) { f.block = f.crouch = false; f.moving = 0; return; }
    if (this.finish && this.finish.att === f) {
      // CPU closes in and usually performs its fatality after a beat, otherwise just knocks him out
      f.block = f.crouch = false;
      if (A.t <= 0 && this.free(f) && this.finish.t > 1 && d < 1.3) { A.t = 0.4; if (this.canFatal(f) && rng() < 0.75) this.fatality(f); else this.press(f, 'J'); }
      this.walk(f, d > 1.2 ? tx : 0, d > 1.2 ? tz : 0, dt);
      return;
    }
    f.block = A.block > 0 && this.free(f);
    f.crouch = A.crouch > 0 && this.canCrouch(f);
    // keep strings going once the first hit is out
    if (f.act && MOVES[f.act.type] && f.act.done && A.chain > 0 && !f.buf) { A.chain--; f.buf = rng() < 0.6 ? 'J' : 'K'; f.bufT = 0.3; f.bufMod = false; }
    if (f.heldBy && A.tech > 0 && (A.tech -= dt) <= 0) this.throwStart(f);
    if (A.air && f.y > 0.5 && d < 1.9 && !f.act) { A.air = false; this.press(f, rng() < 0.5 ? 'J' : 'K'); }
    // incoming projectile: one read per shot (60% right): duck / block the batarang, jump / crouch-block the clap
    for (const s of this.shots) {
      if (s.f === f || s.seen || Math.hypot(s.x - f.x, s.z - f.z) > 4) continue;
      s.seen = true;
      const read = rng() < 0.6;
      if (s.key === 'bat') { A.crouch = read || rng() < 0.3 ? 0.5 : 0; A.block = A.crouch ? 0 : 0.5; }
      else if (read && this.free(f) && rng() < 0.5) { this.jump(f, tx, tz); A.air = true; }
      else { A.block = 0.5; A.crouch = read ? 0.5 : 0; }
      A.t = Math.max(A.t, 0.3);
    }
    // anti-air: one read per jump-in; about half the time the CPU meets it with the rising uppercut
    if (o.y <= 0.001) A.aa = false;
    else if (!A.aa && o.y > 0.3 && !o.launched && d < 2.4 && this.free(f)) { A.aa = true; if (rng() < 0.5) this.rise(f); }
    if (A.t <= 0) {
      A.t = 0.2 + rng() * 0.3; A.mx = A.mz = 0;
      const threat = o.act && d < 2;
      if (f.meter >= 100 && d < 3.2 && this.free(f) && !o.launched && rng() < 0.35) this.superMove(f);
      else if (threat && d < 1.4 && rng() < 0.08 && this.free(f)) this.rise(f); // reversal through pressure
      else if (threat && rng() < 0.15 && this.free(f)) this.dash(f, -1);
      else if (threat && rng() < 0.4) {
        // read the attack's height (right 75% of the time): lows crouch-blocked, overheads stand-blocked, highs ducked
        const OM = MOVES[o.act.type], low = !!(OM && OM.low), over = o.y > 0.3 || !!(OM && OM.air) || o.act.type === 'flykick';
        const read = rng() < 0.75;
        A.block = 0.45; A.crouch = (low ? read : over ? !read : rng() < 0.4) ? 0.45 : 0;
        if (OM && OM.hi && read && rng() < 0.35) { A.block = 0; A.crouch = 0.4; } // duck under it
      }
      else if (d < 1.1 && this.free(f) && (o.block || rng() < 0.12)) this.throwStart(f);
      else if (this.orb && this.orb.t > ORB.fall * 0.5 && rng() < 0.6 && Math.hypot(this.orb.x - f.x, this.orb.z - f.z) < Math.hypot(this.orb.x - o.x, this.orb.z - o.z) + 1) {
        const ox = this.orb.x - f.x, oz = this.orb.z - f.z, od = Math.hypot(ox, oz) || 1; A.mx = ox / od; A.mz = oz / od; // race for the power-up
      }
      else if (d > 3 && rng() < 0.3 && this.free(f) && this.shoot(f)) {} // zoning from range
      else if (d > 2.6 && d < 5 && rng() < 0.22 && this.free(f)) this.dash(f, 1);
      else if (o.launched && d < 1.4 && this.free(f)) { A.chain = 1; this.press(f, 'J'); }
      else if (d > 3 && f.cd <= 0 && rng() < 0.3) this.special(f);
      else if (d > 2 && d < 3.6 && rng() < 0.15 && this.free(f)) { this.jump(f, tx, tz); A.air = true; }
      else if (d > 1.15) { A.mx = tx; A.mz = tz; if (rng() < 0.25) { A.mx += -tz * 0.7; A.mz += tx * 0.7; } }
      else if (rng() < 0.75 && this.free(f)) {
        const r = rng(); A.chain = Math.floor(rng() * 3);
        if (r < 0.14) this.begin(f, 'upper'); else if (r < 0.26) this.begin(f, 'sweep');
        else if (r < 0.38) { A.crouch = 0.3; f.crouch = this.canCrouch(f); this.press(f, rng() < 0.6 ? 'K' : 'J'); }
        else this.press(f, r < 0.68 ? 'J' : 'K');
      } else { A.mx = -tx; A.mz = -tz; }
    }
    if (!f.block) this.walk(f, A.mx, A.mz, dt);
  }

  walk(f, mx, mz, dt) {
    const m = Math.hypot(mx, mz);
    f.moving = 0;
    if (!this.free(f) || f.block || f.crouch || m < 0.01) return;
    const sp = 2.6 / Math.max(1, m);
    f.x += mx * sp * dt; f.z += mz * sp * dt; f.moving = Math.min(1, m);
  }

  // Touchdown: launched bodies bounce once if they come down hard, then lie down and get back up.
  land(f) {
    const { fx } = this.ctx, v = -f.vy;
    if (f.launched) {
      if (v > 4.5) {
        f.vy = v * 0.35; f.y = 0.001;
        fx.dustBurst(f.x, 0, f.z, 40, 2.5); fx.rubble(f.x, 0, f.z, 8, 2, 0.04, 0.12, 2.5); fx.impact(f.x, 0, f.z, 0.2);
        fx.blast(f.x, 0.3, f.z, 0.5, 0.35); fx.decals.add(f.x, f.z, 0.4);
        if (f === this.me) this.rumble(0.5, 120);
        return;
      }
      f.launched = false; if (!f.ko) f.down = 0.9;
      fx.dustBurst(f.x, 0, f.z, 30, 1.8);
    } else if (v > 3) fx.dustBurst(f.x, 0, f.z, 12, 1.2);
    f.squash = Math.max(f.squash, Math.min(0.2, v * 0.025)); // knees absorb the landing
    f.vy = 0;
    if (f.act && MOVES[f.act.type] && MOVES[f.act.type].air) f.act = null;
  }

  physics(f, o, dt) {
    const { fx } = this.ctx;
    f.parryT -= dt;
    if (f.frz > 0) { f.frz -= dt; return; } // parried: frozen mid-move
    // airborne
    if ((f.y > 0 || f.vy > 0) && !(f.act && (f.act.type === 'flykick' || f.act.type === 'fatal'))) {
      f.vy -= GRAV * dt; f.y += f.vy * dt;
      if (f.y <= 0) { f.y = 0; this.land(f); }
    }
    // knockback / momentum (little drag in the air so launched bodies carry it)
    f.x += f.kx * dt; f.z += f.kz * dt;
    const damp = Math.exp(-dt * (f.y > 0 ? 0.8 : 5)); f.kx *= damp; f.kz *= damp;
    f.stun -= dt; f.down -= dt;
    if (f.heldBy && !(f.heldBy.act && f.heldBy.act.type === 'throw')) f.heldBy = null;
    if (f.bufT > 0 && (f.bufT -= dt) <= 0) f.buf = null;
    if (!f.ko && !f.launched && f.down <= 0) f.yaw += wrap(face([f.x, 0, f.z], [o.x, 0, o.z]) - f.yaw) * Math.min(1, dt * 12);
    const a = f.act;
    if (a) {
      a.t += dt;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      const M = MOVES[a.type];
      if (M) {
        if (M.lunge && a.t < M.hit && d > 0.85) { f.x += Math.sin(f.yaw) * M.lunge * dt; f.z += Math.cos(f.yaw) * M.lunge * dt; }
        // SF jump-ins: air attacks stay active from the hit frame until landing (one hit), so an early button connects on the way down
        if (M.air) { if (!a.done && a.t >= M.hit && this.state === 'fight' && this.reaches(f, o, M, d)) { a.done = true; this.pending.push({ att: f, def: o, M }); } }
        else if (!a.done && a.t >= M.hit) { a.done = true; if (this.state === 'fight' && this.reaches(f, o, M, d)) this.pending.push({ att: f, def: o, M }); }
        if (a.t >= M.dur && !(M.air && f.y > 0)) f.act = null;
      } else if (a.type === 'super') {
        if (!this.superStep(f, o, a, dt)) f.act = null;
      } else if (a.type === 'fatal') {
        if (!this.fatalStep(f, o, a)) f.act = null;
      } else if (a.type === 'dash') {
        if (!a.go) {
          a.go = true;
          const s = a.dir > 0 ? DASH.fwd : -DASH.back;
          f.kx += Math.sin(f.yaw) * s; f.kz += Math.cos(f.yaw) * s;
          if (a.dir < 0) { f.vy = 2; f.y = 0.001; }
          fx.dustBurst(f.x, 0, f.z, 14, 1.4);
        }
        if (a.t >= DASH.dur) f.act = null;
      } else if (a.type === 'throw') {
        const S = TOSS[f.key];
        if (!a.checked && a.t >= THROW.grab) {
          a.checked = true;
          if (o.act && o.act.type === 'throw' && !o.act.grab && d < THROW.reach) { this.tech(f, o); return; } // simultaneous throws break
          if (this.state === 'fight' && d < THROW.reach && this.grabbable(o)) {
            a.grab = true; o.heldBy = f; o.act = null; o.buf = null; o.block = false; o.heavy = true; o.stun = 0.3;
            fx.impact(o.x, 1, o.z, 0.12); this.hitstop = Math.max(this.hitstop, 0.05);
            if (o === this.me || f === this.me) this.rumble(0.3, 90);
            o.ai.tech = o === this.cpu && this.ctx.rng() < 0.3 ? 0.05 + this.ctx.rng() * 0.15 : 0;
          }
        }
        if (a.grab && !a.done && o.heldBy === f) {
          // victim pinned in the thrower's hands (Superman hoists him overhead)
          const lift = S.lift ? clamp((a.t - 0.2) / 0.2, 0, 1) * 0.9 : 0;
          o.x = f.x + Math.sin(f.yaw) * 0.8; o.z = f.z + Math.cos(f.yaw) * 0.8; o.y = lift; o.vy = 0; o.kx = o.kz = 0;
          o.stun = Math.max(o.stun, 0.3); o.launched = false;
          if (a.t >= THROW.rel) { a.done = true; o.heldBy = null; this.toss(f, o, S); }
        }
        if (f.act && a.t >= THROW.dur) f.act = null;
      } else if (a.type === 'shoot') {
        const S = SHOT[f.key], sx = Math.sin(f.yaw), sz = Math.cos(f.yaw);
        if (!a.done && a.t >= S.rel) {
          a.done = true;
          const x = f.x + sx * 0.7, z = f.z + sz * 0.7;
          this.shots.push({ f, key: f.key, x, y: S.y, z, vx: sx * S.speed, vz: sz * S.speed, t: 0 });
          if (f.key === 'bat') fx.sparkBurst(x, S.y, z, 12, 2, 0xffd23a);
          else { fx.waves.spawn(x, 1.2, z, 1.4, 0x9fc8ff, 0.4); fx.dustBurst(x, 0, z, 30, 2.5); fx.impact(x, 1.2, z, 0.15); }
          this.showCombo(S.name, f.key);
        }
        if (a.t >= S.dur) f.act = null;
      } else if (a.type === 'rise') {
        // launch straight up off the back foot; the fist is live through the rise, then a fall and landing lag
        const R = RISE[f.key];
        if (!a.go) {
          a.go = true; f.vy = R.vy; f.y = Math.max(f.y, 0.001); f.kx += Math.sin(f.yaw) * R.fwd; f.kz += Math.cos(f.yaw) * R.fwd;
          const c = f.H.chest.getWorldPosition(new THREE.Vector3());
          fx.dustBurst(f.x, 0, f.z, 30, 2.2); fx.waves.spawn(f.x, 0.05, f.z, 1.6, R.col, 0.4); fx.sparkBurst(c.x, c.y, c.z, 25, 3, R.col);
          this.showCombo(R.name, f.key);
        } else if (f.vy > 0 && this.ctx.rng() < 0.7) { const h = LIMB.rh(f.H).getWorldPosition(new THREE.Vector3()); fx.sparkBurst(h.x, h.y, h.z, 2, 1, R.col); }
        const dy = o.y - f.y;
        if (!a.done && a.t >= R.act[0] && a.t <= R.act[1] && this.state === 'fight' && d < R.reach && dy > -0.6 && dy < 1.9 && !o.ko && o.down <= 0) {
          a.done = true; this.pending.push({ att: f, def: o, M: R });
        }
        if (a.t > 0.1 && f.y <= 0.001) { if (a.landT == null) a.landT = a.t; if (a.t - a.landT >= R.rec) f.act = null; }
      } else if (a.type === 'flykick') {
        const u = clamp(a.t / 0.75, 0, 1);
        if (u > 0.15 && u < 0.8 && d > 0.9) { const s = Math.min(8 * dt, d - 0.9); f.x += (o.x - f.x) / d * s; f.z += (o.z - f.z) / d * s; }
        f.y = Math.sin(Math.PI * u) * 1.1;
        if (!a.done && u > 0.3 && d < 1.3 && !o.ko && o.down <= 0) {
          a.done = true;
          this.hurt(o, f, FLYKICK, this.contact(f, o, FLYKICK));
        }
        if (u >= 1) { f.act = null; f.y = 0; fx.dustBurst(f.x, 0, f.z, 20, 1.5); }
      } else if (a.type === 'heat') {
        this.heat = null;
        if (a.t > 0.25 && a.t < 1.35 && !o.ko && !o.dazed) {
          const tg = o.H.chest.getWorldPosition(new THREE.Vector3()); tg.y += 0.1;
          this.heat = [tg.x, tg.y, tg.z];
          const blocked = o.block && o.stun <= 0;
          if (o.down <= 0) {
            o.hp = Math.max(0, o.hp - (blocked ? 4 : 15) * dt);
            if (!blocked) o.stun = Math.max(o.stun, 0.12), o.stunMax = 0.12, o.heavy = false, o.zone = 'body';
          }
          if (this.ctx.rng() < 0.5) fx.sparkBurst(tg.x, tg.y, tg.z, 2, 2.5, 0xff8030);
          this.updateBars();
          if (o.hp <= 0) this.hurt(o, f, HEATKO, tg);
        }
        if (a.t >= 1.5) { f.act = null; this.heat = null; }
      }
    }
    this.tryStart(f);
    // arena edge: hard knockback slams into it and rebounds
    for (const [ax, lo, hi, kv] of [['x', ARENA.x0, ARENA.x1, 'kx'], ['z', ARENA.z0, ARENA.z1, 'kz']]) {
      if (f[ax] >= lo && f[ax] <= hi) continue;
      f[ax] = clamp(f[ax], lo, hi);
      if (Math.abs(f[kv]) > 3) {
        fx.dustBurst(f.x, 0, f.z, 25, 2); fx.rubble(f.x, f.y + 0.6, f.z, 6, 2, 0.04, 0.1, 2);
        fx.blast(f.x, f.y + 1, f.z, 0.5, 0.35); fx.impact(f.x, f.y + 1, f.z, 0.2);
        f[kv] *= -0.35;
      } else f[kv] = 0;
    }
  }

  separate() {
    const a = this.me, b = this.cpu, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (a.y > 0.5 || b.y > 0.5 || a.launched || b.launched || a.heldBy || b.heldBy || a.ko || b.ko || a.down > 0 || b.down > 0 || d >= 0.75 || d === 0) return;
    const p = (0.75 - d) / 2;
    a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p;
  }

  target(f) {
    if (this.state === 'enter' && f.key === 'sup') {
      if (f.y > 1.5) return T(POSES.fly, { pitch: 0.35, rh: [-0.12, 0.6, 0.45], base: f.y });
      if (this.t < 2.7) return T(POSES.land);
      return T(POSES.heroic);
    }
    if (f.ko) return T(POSES.down, { pitch: -1.5 });
    if (this.state === 'over' && f === this.winner && this.overT > 1.4) return T(POSES.heroic);
    if (this.state === 'ready') return this.idle(f);
    if (f.down > 0) return f.down > 0.3 ? T(POSES.down, { pitch: -1.5 }) : T(POSES.kneel);
    if (f.launched && f.y > 0.05) return T(MP.air, { pitch: -0.5 });
    const a = f.act;
    // dazed at 0 HP: guard dropped, swaying on loose knees
    if (f.dazed && !a && f.stun <= 0) {
      const t = this.t;
      return T(G, { h: G.h - 0.08, lean: 0.3 + Math.sin(t * 1.9) * 0.08, roll: Math.sin(t * 1.3) * 0.14, tw: Math.sin(t * 0.9) * 0.2,
        lh: [0.26, 0.12 + Math.sin(t * 2.1) * 0.04, 0.12], rh: [-0.26, 0.1, 0.14] });
    }
    if (a && a.type === 'fatal') {
      if (a.pose) return T(MP[a.pose] || POSES[a.pose]);
      let n = null;
      for (const [t, p] of MOVES[a.name].keys) if (a.kt * (a.name === 'round' ? 1 : 1.5) >= t) n = p;
      return T(MP[n] || POSES[n]);
    }
    if (a && MOVES[a.type]) {
      let n = null;
      for (const [t, p] of MOVES[a.type].keys) if (a.t >= t) n = p;
      return T(MP[n] || POSES[n]);
    }
    if (a && a.type === 'super') {
      if (a.phase === 'rush') return T(MP.rush);
      const S = SUPERS[f.key], name = a.phase === 'seq' ? S.seq[a.k] : S.fin;
      let n = null;
      for (const [t, p] of MOVES[name].keys) if (a.kt >= t * (a.phase === 'seq' ? 0.8 : 1)) n = p;
      return T(MP[n] || POSES[n]);
    }
    if (a && a.type === 'shoot') {
      let n = null;
      for (const [t, p] of SHOT[f.key].keys) if (a.t >= t) n = p;
      return T(MP[n] || POSES[n]);
    }
    if (a && a.type === 'dash') return a.dir > 0 ? T(MP.rush, { gait: 0 }) : T(MP.backdash);
    if (a && a.type === 'throw') {
      if (!a.grab) return T(a.checked ? MP.whiff : MP.grab);
      let n = null;
      for (const [t, p] of TOSS[f.key].keys) if (a.t >= t) n = p;
      return T(MP[n]);
    }
    if (a && a.type === 'flykick') { const u = a.t / 0.75; return u < 0.15 ? T(POSES.tuck) : T(POSES.flykick, { h: 0.75 }); }
    if (a && a.type === 'heat') return T(POSES.heat);
    if (a && a.type === 'rise') return a.landT != null ? T(MP.crouch) : a.t < 0.05 ? T(MP.dip) : f.vy > -1.5 ? T(MP.riseUp) : T(POSES.tuck);
    if (f.parryT > 0 && !a && f.stun <= 0) return T(f.parLow ? MP.parryLow : MP.parry);
    if (f.stun > 0) {
      // reaction by where the blow landed, mirrored to the side it came from; heavy head shots whip all the way back.
      // Full strength while stunned, easing back into the guard over the last 40% of the stun.
      if (f.heldBy || !f.zone) return T(POSES[f.heavy ? 'hit' : 'flinch']);
      const R = f.zone === 'head' && f.heavy ? POSES.hit : REACT[f.zone], s = f.hitSide || 1;
      const r = T(R, { tw: (R.tw || 0) * s, roll: (R.roll || 0) * s, h: R.h - (f.heavy && f.zone !== 'head' ? 0.06 : 0) });
      return mixPose(T(G), r, clamp(f.stun / (0.4 * (f.stunMax || 0.3)), 0, 1));
    }
    if (f.y > 0.05) return T(POSES.tuck);
    if (f.crouch) { const b = this.breath(f); return T(f.block ? MP.cblock : MP.crouch, { lean: (f.block ? MP.cblock : MP.crouch).lean + b * 0.015 }); }
    if (f.block) { const b = this.breath(f); return T(POSES.guard, { ...BLOCK, lean: BLOCK.lean + b * 0.01 }); }
    return this.idle(f);
  }

  // Breathing: faster and deeper as health drops.
  breath(f) { const tired = 1 - f.hp / 100; return Math.sin(this.t * (1.7 + tired * 2.6) + STYLE[f.key].off) * (1 + tired * 1.5); }
  // Living fight stance: rhythmic bounce with the feet planted (hips dip, knees flex), breathing in the chest and
  // fists, a slow weight shift from leg to leg, fists circling, and a lower, hunched, heavier stance when hurt.
  idle(f) {
    const S = STYLE[f.key], t = this.t + S.off, tired = 1 - f.hp / 100, g = POSES.guard;
    const w = t * S.hz * Math.PI * 2, br = this.breath(f);
    const drop = S.bob * (0.5 - 0.5 * Math.cos(w)) * (1 - 0.6 * f.moving) + tired * 0.05;
    const shift = Math.sin(t * 0.55) * (1 - f.moving);
    const fist = (p, ph) => [p[0] + Math.cos(w + ph) * S.fist * 0.5,
      p[1] + br * 0.012 - drop * 0.4 - tired * 0.07 + Math.sin(w + ph) * S.fist, p[2] + Math.cos(w + ph) * S.fist * 0.6];
    const foot = (p, s) => [p[0], p[1] - S.dh + drop + s * shift * 0.025, p[2]];
    return T(g, { h: g.h + S.dh - drop, lean: g.lean + S.dl + br * 0.015 + tired * 0.12, roll: shift * 0.045,
      lh: fist(g.lh, 0), rh: fist(g.rh, 1.9), lf: foot(g.lf, 1), rf: foot(g.rf, -1), gait: f.moving });
  }

  pose(dt) {
    const hk = dt ? 1 - Math.exp(-dt * 9) : 1;
    for (const f of [this.F.bat, this.F.sup]) {
      const o = f === this.F.bat ? this.F.sup : this.F.bat;
      const k = dt ? 1 - Math.exp(-dt * (f.act || f.stun > 0 ? 26 : 16)) : 1;
      const tg = this.target(f), c = f.cur;
      for (const n of NUM) c[n] += (tg[n] - c[n]) * k;
      for (const n of ARR) c[n] = c[n].map((v, j) => v + (tg[n][j] - v) * k);
      // eyes on the opponent: the head turns against body twist and looks up at airborne foes
      let hy = 0, hx = 0;
      if (this.active && this.state !== 'enter' && !f.ko && f.down <= 0 && !f.launched) {
        const d = Math.hypot(o.x - f.x, o.z - f.z);
        hy = clamp(wrap(face([f.x, 0, f.z], [o.x, 0, o.z]) - f.yaw - c.tw), -0.8, 0.8);
        hx = -clamp(Math.atan2(o.y - f.y, d + 0.5), -0.3, 0.6);
      }
      f.hy += (hy - f.hy) * hk; f.hx += (hx - f.hx) * hk;
      // landing squash: hips drop with the feet held on the ground, then spring back
      f.squash *= dt ? Math.exp(-dt * 7) : 1;
      const sq = f.y <= 0.001 && !f.ko && f.down <= 0 ? f.squash : 0;
      const s = { ...c, hx: f.hx, hy: f.hy };
      if (sq > 0.002) { s.h -= sq; s.lf = [c.lf[0], c.lf[1] + sq, c.lf[2]]; s.rf = [c.rf[0], c.rf[1] + sq, c.rf[2]]; s.lean += sq; }
      const base = tg.base ?? f.y;
      applyPose(f.H, { ...s, p: [f.x, base + s.h, f.z], yaw: f.yaw + c.tw }, this.t, groundAt(f.x, f.z));
    }
  }

  // Heavy hit: the camera lurches toward the impact and tilts with the blow, then settles (s = strength).
  camKick(at, s, side) { if (!this.kick || s >= this.kick.s * this.env(this.kick.t)) this.kick = { at: at.clone(), t: 0, s, side }; }
  env(t) { return t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) * 5); }
  camera(dt) {
    this.aim(dt);
    // punch-in / tilt layered on whatever shot is running (real time, so it plays through hitstop)
    const K = this.kick;
    this.camOff.set(0, 0, 0); this.camRoll = 0;
    if (K) {
      K.t += dt;
      const e = this.env(K.t) * K.s;
      this.camOff.subVectors(K.at, this.camPos).multiplyScalar(0.12 * e);
      this.camRoll = K.side * 0.035 * e;
      if (K.t > 1.2) this.kick = null;
    }
    const C = this.koCam;
    if (C && C.t < 1.6) this.camRoll += C.side * 0.07 * Math.sin(Math.PI * C.t / 1.6);
  }
  aim(dt) {
    const { bat, sup } = this.F;
    if (this.koCam) {
      // KO: low, slow orbit round the falling body during the slow-mo, then a low hero shot of the winner
      const C = this.koCam, v = C.def, w = C.att; C.t += dt;
      let cp, lk, k;
      if (C.t < 1.6) {
        const ang = C.a0 + C.side * (0.35 + C.t * 0.7), r = 2.6 - C.t * 0.3;
        cp = new THREE.Vector3(v.x + Math.sin(ang) * r, 0.55 + v.y * 0.5, v.z + Math.cos(ang) * r);
        lk = new THREE.Vector3(v.x, Math.max(0.5, v.y + 0.6), v.z); k = Math.min(1, dt * 5);
      } else {
        const ang = w.yaw + C.side * 0.45;
        cp = new THREE.Vector3(w.x + Math.sin(ang) * 3, 0.85, w.z + Math.cos(ang) * 3);
        lk = new THREE.Vector3(w.x, 1.35, w.z); k = Math.min(1, dt * 2.5);
      }
      this.camPos.lerp(cp, k); this.camLook.lerp(lk, k);
      return;
    }
    const a = new THREE.Vector3(bat.x, bat.y + 1, bat.z), b = new THREE.Vector3(sup.x, sup.y + 1, sup.z);
    const mid = a.clone().lerp(b, 0.5), sep = a.distanceTo(b);
    const dx = sup.x - bat.x, dz = sup.z - bat.z, dl = Math.hypot(dx, dz) || 1;
    const n = new THREE.Vector2(-dz / dl, dx / dl);
    if (n.dot(this.camN) < 0) n.negate();
    this.camN.lerp(n, Math.min(1, dt * 2)).normalize();
    if (this.cine) {
      // super cinematic: orbit the pair (real time, so it keeps turning through hitstop)
      const c = this.cine; c.t += dt;
      const ang = c.a0 + c.t * 1.5 * (c.f.key === 'bat' ? 1 : -1), r = 3.2 + 0.6 * Math.sin(c.t * 2);
      const cp = new THREE.Vector3(mid.x + Math.sin(ang) * r, 1.3 + 0.4 * Math.sin(c.t * 1.3) + Math.max(0, mid.y - 1.5) * 0.7, mid.z + Math.cos(ang) * r);
      const k = Math.min(1, dt * 6);
      this.camPos.lerp(cp, k); this.camLook.lerp(new THREE.Vector3(mid.x, Math.max(1, mid.y), mid.z), k);
      if (c.t >= c.end || c.t > 6) this.cine = null;
      return;
    }
    const dist = 3.4 + sep * 0.8;
    const pos = new THREE.Vector3(mid.x + this.camN.x * dist, Math.max(1.4, mid.y * 0.6 + 0.9 + sep * 0.12), mid.z + this.camN.y * dist);
    mid.y = Math.max(1.0, mid.y);
    const k = Math.min(1, dt * 4);
    this.camPos.lerp(pos, k); this.camLook.lerp(mid, k);
  }
}
