// Sound from code, like the pictures: every effect and the score are synthesized live with Web Audio.
// No sample files. Effects are fed by the fx calls (impact, sparks, blast, shockwave, rubble, dust,
// flash) — collected per sim step and voiced once, so a hit that spawns sparks + blast + ring is one
// layered sound, not five. The score is a step sequencer in D minor (drone, low string ostinato,
// taiko, braams, heartbeat, high tremolo cluster, risers) whose layers fade in with `intensity`.
//
// Browsers only start audio after a gesture: start() runs on the first key / click. M mutes.

const BPM = 92, STEP = 60 / BPM / 4;            // 16th notes
const LOOK = 0.15;                              // schedule this far ahead (s)
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
// 4-bar progression, roots as MIDI notes: Dm · Bb · Gm · A
const PROG = [[38, 41, 45], [34, 38, 41], [31, 34, 38], [33, 37, 40]];
// low string ostinato: chord-tone index per 16th (-1 = rest), the Zimmer-ish "dun-dun-da-dun"
const OST = [0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 2, 1, 0, 2];
const TAIKO = [1, 0, 0, 0, 0, 0, 0.6, 0, 0.8, 0, 0, 0, 0, 0, 0.5, 0.4];

export class Sound {
  constructor() {
    this.ctx = null; this.on = true; this.intensity = 0.2; this.target = 0.2; this.slow = 1;
    this.frame = this.blank(); this.heatOn = false; this.step16 = 0; this.next = 0;
  }
  blank() { return { impact: 0, sparks: 0, blast: 0, wave: 0, rubble: 0, dust: 0, flash: 0, swing: 0, metal: 0 }; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.on) this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; // slow-mo muffles everything
    this.master.connect(this.lp).connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.45; this.music.connect(this.master);
    // hall reverb: a convolver over a decaying stereo noise impulse
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(3.2, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.35; this.verb.connect(wet).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startDrone();
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  toggle() { this.on = !this.on; if (this.ctx) this.on ? this.ctx.resume() : this.ctx.suspend(); return this.on; }
  pause(p) { if (this.ctx && this.on) p ? this.ctx.suspend() : this.ctx.resume(); }

  impulse(sec, decay) {
    const { ctx } = this, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
    return b;
  }

  // ---------- building blocks ----------
  out(bus, send = 0.3) {
    const g = this.ctx.createGain(); g.connect(bus);
    if (send) { const s = this.ctx.createGain(); s.gain.value = send; g.connect(s).connect(this.verb); }
    return g;
  }
  env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  osc(type, f0, f1, t, dur, peak, dest, a = 0.003) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, peak, a, dur); o.connect(g).connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  hiss(t, dur, peak, dest, type, f0, f1 = f0, q = 1, a = 0.002) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    this.env(g, t, peak, a, dur); s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  }
  rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------- action sound effects ----------
  // A punch: chest thump (falling sine), knuckle crack (high noise), body crunch (mid noise).
  punch(p, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.15 + p * 0.3), v = Math.min(1, 0.35 + p * 1.6);
    this.osc('sine', this.rnd(150, 190), 42, t, 0.14 + p * 0.35, v, o);
    this.osc('triangle', this.rnd(300, 380), 90, t, 0.06, v * 0.4, o);
    this.hiss(t, 0.03, v * 0.7, o, 'highpass', 2500);
    this.hiss(t, 0.08 + p * 0.25, v * 0.6, o, 'bandpass', this.rnd(700, 1100), 250, 1.2);
  }
  // Batman's gauntlets / armour on steel: inharmonic partials ringing out.
  clang(amt, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.45), v = Math.min(0.35, 0.08 + amt * 0.3), base = this.rnd(520, 760);
    for (const r of [1, 2.76, 5.4, 8.93]) this.osc('sine', base * r, base * r * 0.995, t, 0.25 + 0.4 / r, v / Math.sqrt(r), o);
    this.hiss(t, 0.05, v, o, 'highpass', 5000);
  }
  // Spark crackle: short bright grains.
  crackle(amt, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.2), n = Math.min(10, 2 + Math.floor(amt * 8));
    for (let i = 0; i < n; i++) this.hiss(t + Math.random() * 0.25, 0.015, this.rnd(0.05, 0.15), o, 'bandpass', this.rnd(3000, 7000), undefined, 4);
  }
  // Explosion / energy blast: noise falling through a lowpass plus a sub drop.
  boom(size, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.5), v = Math.min(1, 0.3 + size * 0.45);
    this.hiss(t, 0.5 + size * 0.7, v, o, 'lowpass', 2400, 70, 0.7, 0.005);
    this.osc('sine', 85, 26, t, 0.6 + size * 0.6, v, o, 0.005);
  }
  // Shockwave ring: a whooshing pressure front (band sweep) that lands in a low whomp.
  shock(r, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.5), v = Math.min(0.7, 0.15 + r * 0.09);
    this.hiss(t, 0.35 + r * 0.06, v, o, 'bandpass', 3500, 180, 1.5, 0.01);
    this.osc('sine', 70, 34, t + 0.02, 0.5 + r * 0.08, v * 1.2, o, 0.01);
  }
  // Concrete breaking: many gritty grains over a low rumble.
  crumble(n, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.3), k = Math.min(24, 4 + (n >> 3)), len = Math.min(1.2, 0.25 + n / 150);
    for (let i = 0; i < k; i++) this.hiss(t + Math.random() * len, this.rnd(0.02, 0.07), this.rnd(0.1, 0.3), o, 'bandpass', this.rnd(500, 2600), undefined, 2.5);
    this.hiss(t, len, Math.min(0.5, 0.1 + n / 300), o, 'lowpass', 300, 90, 0.8, 0.02);
  }
  // A body hitting the roof / landing: low thud.
  thud(n, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.2), v = Math.min(0.7, 0.15 + n / 150);
    this.osc('sine', 95, 38, t, 0.25, v, o);
    this.hiss(t, 0.18, v * 0.6, o, 'lowpass', 600, 120);
  }
  // Thunderclap: a crack then a long rolling lowpassed tail.
  thunder(v, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.7);
    this.hiss(t, 0.12, v * 0.6, o, 'highpass', 1500, 800, 0.7);
    for (let i = 0; i < 4; i++) this.hiss(t + 0.05 + i * this.rnd(0.25, 0.5), this.rnd(0.9, 1.8), v * this.rnd(0.35, 0.6), o, 'lowpass', this.rnd(250, 500), 60, 0.6, 0.06);
  }
  // Attack swing: a cape-and-fist whoosh. Heavy = longer, lower.
  whoosh(heavy, t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.15), d = heavy ? 0.32 : 0.16;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 2.2;
    const lo = heavy ? 250 : 500, hi = heavy ? 1400 : 2600;
    f.frequency.setValueAtTime(lo, t); f.frequency.exponentialRampToValueAtTime(hi, t + d * 0.45); f.frequency.exponentialRampToValueAtTime(lo, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(heavy ? 0.5 : 0.3, t + d * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(g).connect(o); s.start(t, Math.random()); s.stop(t + d + 0.05);
  }
  // Screen flash on a big moment: the cinematic "BRAAM" (detuned brass stack through an opening filter).
  braam(v = 0.6, t = this.ctx.currentTime, root = 26, dur = 2.2) {
    const o = this.out(this.sfx, 0.6), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(120, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.15); f.frequency.exponentialRampToValueAtTime(200, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(o);
    for (const [m, det] of [[root, -9], [root, 9], [root + 12, -5], [root + 12, 6], [root + 19, 0], [root - 12, 0]]) {
      const x = this.ctx.createOscillator(); x.type = 'sawtooth'; x.frequency.value = mtof(m); x.detune.value = det;
      x.connect(f); x.start(t); x.stop(t + dur + 0.05);
    }
    this.taiko(1, t, this.out(this.sfx, 0.6));
  }
  // Gong for a new round.
  gong(t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.7);
    for (const [r, v] of [[1, 0.3], [1.48, 0.18], [2.03, 0.15], [2.74, 0.1], [3.9, 0.06]]) this.osc('sine', 110 * r, 108 * r, t, 3.5 / Math.sqrt(r), v, o, 0.01);
    this.hiss(t, 0.4, 0.15, o, 'bandpass', 900, 400, 0.8);
  }
  // Victory: a rising D major brass chord.
  fanfare(t = this.ctx.currentTime) {
    const o = this.out(this.sfx, 0.6);
    [[50, 0], [54, 0.12], [57, 0.24], [62, 0.36], [38, 0]].forEach(([m, d]) => {
      for (const det of [-6, 6]) { const x = this.osc('sawtooth', mtof(m), mtof(m), t + d, 2.4 - d, 0.07, o, 0.08); x.detune.value = det; }
    });
    this.taiko(1, t, o); this.taiko(0.8, t + 0.36, o);
  }
  // Noise riser into a hit.
  riser(dur, t = this.ctx.currentTime) {
    const o = this.out(this.music, 0.5), s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; s.loop = true; f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    s.connect(f).connect(g).connect(o); s.start(t); s.stop(t + dur + 0.1);
  }
  // Superman's heat vision: a sustained searing hum with a sizzle on top.
  heat(on) {
    if (!this.ctx || on === this.heatOn) return;
    this.heatOn = on;
    const t = this.ctx.currentTime;
    if (on) {
      const o = this.out(this.sfx, 0.3), g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.12); g.connect(o);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4; f.connect(g);
      const trem = this.ctx.createGain(); trem.gain.value = 0.7; trem.connect(f);
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 31; lg.gain.value = 0.3; lfo.connect(lg).connect(trem.gain);
      const src = [lfo];
      for (const [hz, type] of [[110, 'sawtooth'], [113.5, 'sawtooth'], [220.7, 'square']]) { const x = this.ctx.createOscillator(); x.type = type; x.frequency.value = hz; x.connect(trem); src.push(x); }
      const n = this.ctx.createBufferSource(), hp = this.ctx.createBiquadFilter(), ng = this.ctx.createGain();
      n.buffer = this.noise; n.loop = true; hp.type = 'highpass'; hp.frequency.value = 4000; ng.gain.value = 0.5; n.connect(hp).connect(ng).connect(g); src.push(n);
      src.forEach((s) => s.start(t));
      this.heatNodes = { g, src };
    } else if (this.heatNodes) {
      const { g, src } = this.heatNodes; this.heatNodes = null;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      src.forEach((s) => s.stop(t + 0.3));
    }
  }

  // ---------- fx feed: each sim step adds what it spawned; flush() voices it once ----------
  note(kind, amt) { if (kind === 'sparks' || kind === 'dust' || kind === 'rubble') this.frame[kind] += amt; else this.frame[kind] = Math.max(this.frame[kind], amt); }
  flush() {
    const F = this.frame; this.frame = this.blank();
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (F.swing) this.whoosh(F.swing > 1, t);
    if (F.impact >= 0.05) this.punch(F.impact, t);
    if (F.sparks >= 12) { this.crackle(Math.min(1, F.sparks / 80), t); if (F.metal || F.sparks >= 30) this.clang(Math.min(1, F.sparks / 120), t); }
    if (F.blast) this.boom(F.blast, t);
    if (F.wave >= 1.2) this.shock(F.wave, t);
    if (F.rubble >= 6) this.crumble(F.rubble, t);
    if (F.dust >= 20 && F.impact < 0.05) this.thud(F.dust, t);
    if (F.flash >= 0.3 && t - (this.lastBraam || 0) > 1.5) { this.lastBraam = t; this.braam(Math.min(0.7, F.flash), t); }
  }

  // ---------- theatrical suspense score ----------
  startDrone() {
    const { ctx } = this;
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0.0001;
    const f = this.droneF = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 4;
    f.connect(this.droneG).connect(this.out(this.music, 0.4));
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 90; lfo.connect(lg).connect(f.frequency); lfo.start();
    this.drone = [[26, -7], [26, 7], [33, 0], [14, 0]].map(([m, det]) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; o.connect(f); o.start(); return o;
    });
    // high tremolo cluster (D6 / Eb6 / A5): the suspense shimmer, strongest when things are quiet
    this.shimG = ctx.createGain(); this.shimG.gain.value = 0.0001; this.shimG.connect(this.out(this.music, 0.8));
    const trem = ctx.createGain(); trem.connect(this.shimG);
    const tl = ctx.createOscillator(), tg = ctx.createGain(); tl.frequency.value = 7; tg.gain.value = 0.5; tl.connect(tg).connect(trem.gain); tl.start();
    for (const m of [81, 86, 87]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = this.rnd(-8, 8); o.connect(trem); o.start(); }
  }
  setIntensity(x) { this.target = Math.max(0, Math.min(1, x)); }
  setSlow(s) {
    if (!this.ctx) return;
    const s1 = Math.max(0.05, Math.min(1, s));
    if (Math.abs(s1 - this.slow) < 0.02) return;
    this.slow = s1;
    this.lp.frequency.setTargetAtTime(s1 < 0.6 ? 900 + s1 * 3000 : 18000, this.ctx.currentTime, 0.08);
  }
  schedule() {
    const { ctx } = this;
    if (ctx.state !== 'running') { this.next = ctx.currentTime + 0.05; return; }
    this.intensity += (this.target - this.intensity) * 0.04;
    const I = this.intensity, now = ctx.currentTime;
    this.droneG.gain.setTargetAtTime(0.06 + I * 0.1, now, 0.5);
    this.droneF.frequency.setTargetAtTime(140 + I * 500, now, 0.5);
    this.shimG.gain.setTargetAtTime(0.012 * (1 - I * 0.6), now, 0.8);
    while (this.next < now + LOOK) { this.tick(this.step16, this.next, I); this.step16++; this.next += STEP; }
  }
  tick(n, t, I) {
    const s = n % 16, bar = Math.floor(n / 16), chord = PROG[bar % 4], phrase = bar % 4;
    // heartbeat while it's quiet: lub-dub on beats 1 and 3
    if (I < 0.5 && (s === 0 || s === 8)) { const o = this.out(this.music, 0.1), v = 0.5 * (1 - I);
      this.osc('sine', 62, 38, t, 0.16, v, o); this.osc('sine', 58, 36, t + STEP * 0.9, 0.14, v * 0.7, o); }
    // low string ostinato (cello + bass saws, plucky lowpass), joins at 0.35, doubles octave above at 0.7
    if (I > 0.35 && OST[s] >= 0) {
      const o = this.out(this.music, 0.25), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(400 + I * 1800, t); f.frequency.exponentialRampToValueAtTime(180, t + STEP * 1.6); f.connect(o);
      const m = chord[OST[s]] + 12, acc = s % 4 === 0 ? 1 : 0.7, v = (I - 0.3) * 0.22 * acc;
      for (const mm of I > 0.7 ? [m, m + 12] : [m]) { const x = this.osc('sawtooth', mtof(mm), mtof(mm), t, STEP * 1.6, v, f, 0.004); x.detune.value = this.rnd(-6, 6); }
    }
    // taiko pattern, with a 16th-note fill closing every 4th bar at high intensity
    const fill = I > 0.75 && phrase === 3 && s >= 12;
    if (I > 0.3 && (TAIKO[s] || fill)) this.taiko((fill ? 0.7 : TAIKO[s]) * Math.min(1, I + 0.2), t, this.out(this.music, 0.5));
    // a soft held pad on each bar's chord (strings section)
    if (s === 0) {
      const o = this.out(this.music, 0.7), g = this.ctx.createGain(), dur = STEP * 16;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 + I * 0.03, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700 + I * 1200; f.connect(g).connect(o);
      for (const m of chord) for (const det of [-7, 7]) { const x = this.ctx.createOscillator(); x.type = 'sawtooth'; x.frequency.value = mtof(m + 24); x.detune.value = det; x.connect(f); x.start(t); x.stop(t + dur + 0.05); }
    }
    // the braam lands on every phrase start once it's hot; riser leads into it
    if (I > 0.65 && phrase === 0 && s === 0) this.braam(0.18 + I * 0.15, t, chord[0] - 12, STEP * 14);
    if (I > 0.6 && phrase === 3 && s === 8) this.riser(STEP * 8, t);
  }
  taiko(v, t, o) {
    this.osc('sine', 110, 46, t, 0.45, 0.9 * v, o, 0.002);
    this.osc('triangle', 180, 70, t, 0.08, 0.3 * v, o, 0.002);
    this.hiss(t, 0.12, 0.35 * v, o, 'lowpass', 1200, 200, 0.7);
  }
}
