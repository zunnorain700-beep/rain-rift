/**
 * audio.js — 100% procedural Web Audio engine.
 * No external audio files: engine tone, tire roar, SFX, sequenced music,
 * synthesized character voices and speech-synthesis fallback are all generated.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function impulse(ctx, seconds = 1.4, decay = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ok = false;
    this.settings = { master: 0.9, music: 0.6, sfx: 0.9, mute: false, voice: true };
    this.musicMode = null;
    this.engineOn = false;
    this._musicTimer = null;
    this._step = 0;
    this._nextNoteTime = 0;
    this._lastVoice = 0;
    this._eng = {};
  }

  /* ------------------------------------------------ lifecycle */
  unlock() {
    if (this.ok) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.connect(ctx.destination);

      // gentle reverb bus
      this.verb = ctx.createConvolver();
      this.verb.buffer = impulse(ctx, 1.3, 3.4);
      this.verbGain = ctx.createGain();
      this.verbGain.gain.value = 0.22;
      this.verb.connect(this.verbGain);
      this.verbGain.connect(this.master);

      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.sfxVerb = ctx.createGain();
      this.sfxVerb.gain.value = 0.35;
      this.sfx.connect(this.sfxVerb);
      this.sfxVerb.connect(this.verb);

      this.music = ctx.createGain();
      this.music.connect(this.master);
      this.musicVerb = ctx.createGain();
      this.musicVerb.gain.value = 0.3;
      this.music.connect(this.musicVerb);
      this.musicVerb.connect(this.verb);

      this.noise = noiseBuffer(ctx);
      this.ok = true;
      this.applySettings(this.settings);
      this._buildEngine();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (this.musicMode) {
        const m = this.musicMode;
        this.musicMode = null;
        this.startMusic(m);
      }
      if (this.engineOn) { this.engineOn = false; this.engineStart(); }
    } catch (err) {
      this.ok = false;
    }
  }

  applySettings(patch) {
    Object.assign(this.settings, patch);
    if (!this.ok) return;
    const s = this.settings;
    const target = s.mute ? 0 : s.master;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    this.music.gain.setTargetAtTime(s.music * 0.5, this.ctx.currentTime, 0.03);
    this.sfx.gain.setTargetAtTime(s.sfx, this.ctx.currentTime, 0.03);
  }

  dispose() {
    this.stopMusic();
    this.engineStop();
    this.stopTires();
    if (this.ctx && this.ctx.close) { this.ctx.close().catch(() => {}); }
    this.ctx = null; this.ok = false;
  }

  /* ------------------------------------------------ engine tone */
  _buildEngine() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 6;

    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 60; o2.detune.value = 9;
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = 30;
    const subG = ctx.createGain(); subG.gain.value = 0.5;

    const intake = ctx.createBufferSource();
    intake.buffer = this.noise; intake.loop = true;
    const intakeFilter = ctx.createBiquadFilter();
    intakeFilter.type = 'bandpass'; intakeFilter.frequency.value = 900; intakeFilter.Q.value = 1.2;
    const intakeG = ctx.createGain(); intakeG.gain.value = 0.0;

    const motion = ctx.createBufferSource();
    motion.buffer = this.noise; motion.loop = true;
    const roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'bandpass'; roadFilter.frequency.value = 280; roadFilter.Q.value = 0.7;
    const roadG = ctx.createGain(); roadG.gain.value = 0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'highpass'; windFilter.frequency.value = 1800;
    const windG = ctx.createGain(); windG.gain.value = 0;
    motion.connect(roadFilter); roadFilter.connect(roadG); roadG.connect(g);
    motion.connect(windFilter); windFilter.connect(windG); windG.connect(g);

    o1.connect(filter); o2.connect(filter); sub.connect(subG); subG.connect(filter);
    intake.connect(intakeFilter); intakeFilter.connect(intakeG); intakeG.connect(g);
    filter.connect(g);
    g.connect(this.sfx);

    o1.start(); o2.start(); sub.start(); intake.start(); motion.start();

    this._eng = {
      g, filter, o1, o2, sub, intakeG, intakeFilter,
      motion, roadFilter, roadG, windFilter, windG,
      rpm: 0.12, gear: 1, shiftUntil: 0
    };
  }

  engineStart() {
    if (!this.ok || this.engineOn) return;
    this.engineOn = true;
    this._eng.rpm = 0.12;
    this._eng.gear = 1;
    this._eng.shiftUntil = 0;
    this._eng.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
  }

  engineStop() {
    if (!this.ok || !this.engineOn) return;
    this.engineOn = false;
    const t = this.ctx.currentTime;
    this._eng.g.gain.setTargetAtTime(0, t, 0.12);
  }

  /**
   * @param {{speed:number,maxSpeed:number,throttle:number,brake:number,dt:number,offroad:boolean,boosting:boolean}} s
   */
  updateEngine(s) {
    if (!this.ok || !this.engineOn) return;
    const t = this.ctx.currentTime;
    const e = this._eng;
    const ratio = clamp(Math.abs(s.speed) / Math.max(6, s.maxSpeed), 0, 1.15);
    const throttle = clamp(s.throttle || 0, 0, 1);
    const brake = clamp(s.brake || 0, 0, 1);
    const dt = clamp(s.dt ?? 1 / 60, 0, 0.1);
    const gearBands = [0, 0.22, 0.42, 0.64, 0.84, 1.2];
    const previousGear = e.gear;
    if (t >= e.shiftUntil) {
      if (e.gear < 5 && ratio > gearBands[e.gear]) e.gear++;
      else if (e.gear > 1 && ratio < gearBands[e.gear - 1] - 0.07) e.gear--;
    }
    if (e.gear !== previousGear) e.shiftUntil = t + 0.18;
    const gearProgress = clamp((ratio - gearBands[e.gear - 1]) / (gearBands[e.gear] - gearBands[e.gear - 1]), 0, 1);
    const movingRpm = 0.35 + gearProgress * 0.6;
    const targetRpm = clamp((e.gear === 1 ? 0.12 + gearProgress * 0.83 : movingRpm)
      + throttle * 0.1 + (s.boosting ? 0.14 : 0), 0.12, 1.15);
    e.rpm += (targetRpm - e.rpm) * (1 - Math.exp(-dt * 9));

    const flutter = Math.sin(t * (18 + e.rpm * 24)) * (0.7 + throttle * 1.2);
    const base = 44 + e.rpm * 168 + flutter;
    e.o1.frequency.setTargetAtTime(base, t, 0.05);
    e.o2.frequency.setTargetAtTime(base * 1.005, t, 0.05);
    e.sub.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    e.filter.frequency.setTargetAtTime(320 + e.rpm * 2600 + throttle * 600 + (s.boosting ? 800 : 0), t, 0.06);
    e.intakeFilter.frequency.setTargetAtTime(700 + e.rpm * 1800, t, 0.08);

    const load = 0.10 + throttle * 0.14 + e.rpm * 0.10 + (s.boosting ? 0.08 : 0);
    const shiftDip = t < e.shiftUntil ? 0.68 : 1;
    e.g.gain.setTargetAtTime(load * shiftDip * (1 - brake * 0.18), t, 0.08);
    e.intakeG.gain.setTargetAtTime(0.01 + e.rpm * throttle * 0.06 + (s.boosting ? 0.09 : 0), t, 0.1);
    const movement = clamp(ratio, 0, 1);
    const roughness = s.offroad ? 2.8 + Math.sin(t * 31) * 0.35 : 1;
    e.motion.playbackRate.setTargetAtTime(0.65 + movement * 1.6, t, 0.1);
    e.roadFilter.frequency.setTargetAtTime((s.offroad ? 480 : 180) + movement * 650, t, 0.1);
    e.roadG.gain.setTargetAtTime(movement * 0.24 * roughness, t, 0.12);
    e.windFilter.frequency.setTargetAtTime(1200 + movement * 1800, t, 0.15);
    e.windG.gain.setTargetAtTime(movement * movement * 0.22, t, 0.15);
  }

  /* ------------------------------------------------ one-shots */
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  beep(freq = 880, dur = 0.14, type = 'square', gain = 0.35, when = 0) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.05);
  }

  sweep(f0, f1, dur = 0.3, type = 'sawtooth', gain = 0.3, dest) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4000;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g);
    g.connect(dest || this.sfx);
    g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.05);
  }

  burst(dur = 0.25, freq = 1200, gain = 0.4, type = 'bandpass') {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = 1.4;
    f.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.25), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx); g.connect(this.verb);
    src.start(t); src.stop(t + dur + 0.05);
  }

  menuClick(high = false) { this.beep(high ? 920 : 520, 0.07, 'triangle', 0.22); }
  menuBack() { this.beep(320, 0.1, 'triangle', 0.2); }
  select() { this.beep(660, 0.08, 'square', 0.2); this.beep(990, 0.1, 'square', 0.16, 0.07); }

  countdownBeep(final = false) { this.beep(final ? 1320 : 620, final ? 0.45 : 0.16, 'square', 0.4); }
  pickup() {
    this.beep(760, 0.07, 'square', 0.25);
    this.beep(1140, 0.1, 'square', 0.22, 0.06);
  }
  itemDraw(id) {
    const f = id === 'nitro' ? 880 : id === 'shield' ? 660 : id === 'oil' ? 440 : 550;
    this.beep(f, 0.09, 'sawtooth', 0.24);
    this.beep(f * 1.5, 0.12, 'sawtooth', 0.2, 0.08);
  }
  boost() { this.burst(0.5, 2600, 0.4); this.sweep(180, 60, 0.45, 'sawtooth', 0.22); }
  shieldUp() { this.sweep(300, 1400, 0.4, 'sine', 0.3); this.beep(1400, 0.2, 'sine', 0.2, 0.1); }
  pulseWave() {
    this.sweep(900, 90, 0.7, 'sine', 0.4);
    this.burst(0.5, 3200, 0.18, 'highpass');
  }
  slickDrop() { this.sweep(420, 140, 0.28, 'triangle', 0.24); }
  collision(intensity = 1) {
    const i = clamp(intensity, 0.15, 1.4);
    this.burst(0.22 + i * 0.16, 900 * i, 0.45 * i, 'lowpass');
    this.sweep(160 * i, 45, 0.22, 'square', 0.28 * i);
  }
  wallHit(intensity = 1) { this.burst(0.3, 420, 0.5 * clamp(intensity, .2, 1), 'lowpass'); }
  spinOut() { this.sweep(700, 90, 0.7, 'sawtooth', 0.3); }
  wrongWay() { this.beep(300, 0.16, 'square', 0.3); this.beep(240, 0.2, 'square', 0.26, 0.17); }

  finishRace(win) {
    const base = win ? 523.25 : 392;
    const seq = win ? [0, 4, 7, 12] : [0, -3, 0];
    seq.forEach((semi, i) => {
      this.beep(base * Math.pow(2, semi / 12), 0.34, 'triangle', 0.32, i * 0.15);
    });
    if (win) this.beep(base * 4, 0.8, 'sine', 0.26, seq.length * 0.15);
  }

  /* ------------------------------------------------ synthesized voice */
  voice(character, line) {
    if (!this.settings.voice || !this.ok) return;
    const t = performance.now();
    if (t - this._lastVoice < 900) return;
    this._lastVoice = t;

    const prefersTTS = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
    if (prefersTTS) {
      try {
        const u = new SpeechSynthesisUtterance(line);
        u.pitch = character.voice.base > 300 ? 1.6 : character.voice.base < 240 ? 0.6 : 1.1;
        u.rate = character.voice.rate;
        u.volume = clamp(this.settings.master * this.settings.sfx, 0, 1);
        window.speechSynthesis.speak(u);
        return;
      } catch (err) { /* fall through to blips */ }
    }
    this._blipVoice(character, line);
  }

  _blipVoice(character, line) {
    const ctx = this.ctx;
    const words = line.split(/\s+/).filter(Boolean);
    const base = character.voice.base;
    let when = 0;
    const n = Math.min(words.length * 2, character.voice.blips + 2);
    for (let i = 0; i < n; i++) {
      const dur = 0.08 + Math.random() * 0.06;
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = base * (0.9 + Math.random() * 0.5) * (i === n - 1 ? 1.25 : 1);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(60, f * 0.8), t + dur);

      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 7; f1.frequency.value = 500 + Math.random() * 300;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 9; f2.frequency.value = 1300 + Math.random() * 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g);
      g.connect(this.sfx); g.connect(this.verb);
      o.start(t); o.stop(t + dur + 0.03);
      when += dur + 0.03 + Math.random() * 0.04;
    }
  }

  /* ------------------------------------------------ procedural music */
  startMusic(mode = 'menu') {
    if (!this.ok) { this.musicMode = mode; return; }
    if (this.musicMode === mode && this._musicTimer) return;
    this.musicMode = mode;
    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    if (this._musicTimer) clearInterval(this._musicTimer);
    this._musicTimer = setInterval(() => this._scheduler(), 25);
  }

  stopMusic() {
    this.musicMode = null;
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  }

  _scheduler() {
    if (!this.ok) return;
    const bpm = this.musicMode === 'race' ? 146 : 118;
    const stepDur = 60 / bpm / 4;
    while (this._nextNoteTime < this.ctx.currentTime + 0.12) {
      this._playStep(this._step % 32, this._nextNoteTime, stepDur);
      this._nextNoteTime += stepDur;
      this._step++;
    }
  }

  _playStep(step, time, dur) {
    const ctx = this.ctx;
    const race = this.musicMode === 'race';
    const bassLine = race
      ? [55, 55, 0, 82.4, 0, 55, 0, 73.4, 55, 0, 55, 82.4, 0, 61.7, 0, 73.4]
      : [65.4, 0, 0, 0, 98, 0, 0, 0, 58.3, 0, 0, 0, 87.3, 0, 0, 0];
    const arp = race
      ? [440, 0, 587, 523, 0, 440, 0, 659, 587, 0, 523, 0, 440, 0, 659, 0]
      : [523, 0, 0, 659, 0, 0, 784, 0, 0, 659, 0, 0, 587, 0, 0, 0];

    const i = step % 16;
    const b = bassLine[i];
    if (b && (step < 16 || race)) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = b;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 4;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.28, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.7);
      o.connect(f); f.connect(g); g.connect(this.music); g.connect(this.musicVerb);
      o.start(time); o.stop(time + dur * 1.8);
    }

    const a = arp[i];
    if (a && step >= 16) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = a;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.16, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.2);
      o.connect(g); g.connect(this.music); g.connect(this.musicVerb);
      o.start(time); o.stop(time + dur * 1.3);
    }

    if (step % 8 === 0) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, time);
      o.frequency.exponentialRampToValueAtTime(48, time + 0.12);
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
      o.connect(g); g.connect(this.music);
      o.start(time); o.stop(time + 0.3);
    }
    if (step % 8 === 4 && race) {
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
      src.connect(f); f.connect(g); g.connect(this.music);
      src.start(time); src.stop(time + 0.09);
    }
  }

  /* ------------------------------------------------ tire noise */
  startTires() {
    if (!this.ok || this._tires) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 3.5;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start();
    this._tires = { src, f, g };
  }

  stopTires() {
    if (!this._tires) return;
    try { this._tires.src.stop(); } catch (err) { /* already stopped */ }
    this._tires = null;
  }

  updateTires(slip, speed) {
    if (!this.ok || !this._tires) return;
    const t = this.ctx.currentTime;
    const amount = clamp(slip, 0, 1) * clamp(Math.abs(speed) / 22, 0, 1);
    this._tires.g.gain.setTargetAtTime(amount * 0.16, t, 0.05);
    this._tires.f.frequency.setTargetAtTime(1800 + amount * 1800, t, 0.08);
  }
}
