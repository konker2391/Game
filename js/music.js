'use strict';
// Original techno soundtrack in the spirit of 90s fighting-game themes: four-on-the-floor
// kicks, pumping 16th-note saw bass ducked by the kick, syncopated supersaw stabs,
// claps and open hats, orchestra hits on the drops and noise risers into breakdowns.
// Everything is synthesised with Web Audio; songs are arranged in looping sections.

// Chords are [semitones above the key root, 'm' | 'M']. Bass, lead and stab patterns are
// 16 steps per bar (-1 = rest). Bass steps are relative to the chord root, lead steps to the key.
const SONGS = {
  // Title, garage and menus: darker and a little slower.
  menu: {
    bpm: 126, key: 45,                                   // A minor
    prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [0, 'm'], [0, 'm'], [1, 'M'], [-5, 'M']],
    bass: [
      [0, -1, 12, 0, -1, 12, 0, -1, 0, -1, 12, 0, -1, 12, 0, 12],
      [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 3, 12, 7, 12],
    ],
    stab: [0, -1, -1, 1, -1, -1, 1, -1, -1, -1, 1, -1, -1, -1, -1, -1],
    lead: [
      12, -1, -1, 15, -1, -1, 14, -1, 12, -1, 10, -1, 12, -1, -1, -1,
      12, -1, -1, 15, -1, -1, 17, -1, 19, -1, 17, -1, 15, -1, 14, -1,
    ],
    sections: [
      { bars: 4, parts: 'pad bass0 hat' },
      { bars: 8, parts: 'kick hat bass0 pad stab' },
      { bars: 8, parts: 'kick hat ohat clap bass1 stab lead hit' },
      { bars: 4, parts: 'pad bass0 riser' },
    ],
    loopFrom: 1,
  },
  // Races: full-on 140 BPM with a Phrygian flat-II for menace.
  race: {
    bpm: 140, key: 38,                                   // D minor
    prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [0, 'm'], [0, 'm'], [1, 'M'], [-2, 'M']],
    bass: [
      [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 7, 12],
      [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 3, 15, 5, 17],
    ],
    stab: [1, -1, -1, 1, -1, -1, 1, -1, -1, -1, 1, -1, 1, -1, -1, -1],
    lead: [
      12, -1, 12, 15, -1, 12, 10, -1, 12, -1, 15, 17, -1, 15, 12, 10,
      12, -1, 12, 15, -1, 17, 19, -1, 20, -1, 19, 17, -1, 15, 13, -1,
    ],
    sections: [
      { bars: 4, parts: 'kick hat bass0' },
      { bars: 8, parts: 'kick hat ohat clap bass0 stab hit' },
      { bars: 8, parts: 'kick hat ohat clap bass1 stab lead hit' },
      { bars: 4, parts: 'pad bass0 riser' },
      { bars: 8, parts: 'kick hat ohat clap bass1 stab lead hit' },
      { bars: 4, parts: 'kick hat clap bass0 pad' },
    ],
    loopFrom: 1,
  },
  // Podium and championship win: same drive, brighter major progression.
  win: {
    bpm: 144, key: 41,                                   // F major
    prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']],
    bass: [
      [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 7, 12],
      [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 4, 16, 7, 19],
    ],
    stab: [1, -1, -1, 1, -1, -1, 1, -1, -1, -1, 1, -1, 1, -1, 1, -1],
    lead: [
      12, -1, 16, -1, 19, -1, 24, -1, -1, 19, 21, -1, 19, -1, 16, -1,
      12, -1, 16, -1, 19, -1, 24, -1, 26, -1, 24, -1, 21, -1, 19, -1,
    ],
    sections: [
      { bars: 8, parts: 'kick hat ohat clap bass1 stab lead hit' },
      { bars: 4, parts: 'pad bass0 riser' },
    ],
    loopFrom: 0,
  },
};

class MusicEngine {
  // ctx: an AudioContext or OfflineAudioContext; dest: node the music plays into.
  constructor(ctx, dest) {
    this.ctx = ctx;
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // bus -> compressor -> dest. Tonal parts go through `duck`, which the kick pumps.
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.12;
    this.bus.connect(comp); comp.connect(dest);
    this.duck = ctx.createGain(); this.duck.connect(this.bus);
    // Echo for the lead.
    this.delay = ctx.createDelay(1);
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
    this.delay.connect(tone); tone.connect(fb); fb.connect(this.delay); tone.connect(wet); wet.connect(this.bus);
    this.song = null;
  }

  setSong(song) {
    this.song = song;
    const beat = 60 / song.bpm;
    this.delay.delayTime.value = beat * 0.75;            // dotted eighth
    let bars = 0;
    this.loopStart = 0;
    for (let i = 0; i < song.sections.length; i++) {
      if (i === song.loopFrom) this.loopStart = bars;
      bars += song.sections[i].bars;
    }
    this.totalBars = bars;
  }

  // Which section a (never-ending) bar number falls in, and the bar's index within it.
  sectionAt(bar) {
    const s = this.song;
    if (bar >= this.totalBars) bar = this.loopStart + (bar - this.loopStart) % (this.totalBars - this.loopStart);
    let start = 0;
    for (const sec of s.sections) {
      if (bar < start + sec.bars) return { sec, i: bar - start };
      start += sec.bars;
    }
    return { sec: s.sections[0], i: 0 };
  }

  stepDur() { return 60 / this.song.bpm / 4; }

  // Schedule one 16th-note step of the current song at audio time t.
  step(step, t) {
    const s = this.song;
    if (!s) return;
    const dur = this.stepDur(), barDur = dur * 16;
    const bar = Math.floor(step / 16), k = step % 16;
    const { sec, i } = this.sectionAt(bar);
    const has = p => sec.parts.includes(p);
    const [chordOff, quality] = s.prog[bar % s.prog.length];
    const root = s.key + chordOff;
    const triad = [0, quality === 'm' ? 3 : 4, 7];

    if (has('kick') && k % 4 === 0) this.kick(t);
    if (has('clap') && (k === 4 || k === 12)) this.clap(t);
    if (has('hat')) this.hat(t, false, k % 4 === 2 ? 0.14 : 0.06);
    if (has('ohat') && k % 4 === 2) this.hat(t, true, 0.1);

    const bp = has('bass1') ? s.bass[1] : has('bass0') ? s.bass[0] : null;
    if (bp && bp[k] >= 0) {
      // Filter opens and closes over an 8-bar cycle.
      const sweep = 0.5 - 0.5 * Math.cos((bar % 8 + k / 16) / 8 * Math.PI * 2);
      this.bass(t, root + bp[k], dur * 0.9, 260 + sweep * 1100);
    }
    if (has('stab') && s.stab[k] > 0) this.stab(t, triad.map(n => root + 12 + n), dur * 1.6);
    if (has('lead')) {
      const n = s.lead[(bar % 2) * 16 + k];
      if (n >= 0) this.lead(t, s.key + 12 + n, dur * 1.8);
    }
    if (k === 0) {
      if (has('pad')) this.pad(t, triad.map(n => root + 12 + n).concat([root + 24]), barDur);
      if (has('hit') && i % 4 === 0) this.hit(t, root);
      if (has('riser') && i === 0) this.riser(t, sec.bars * barDur);
    }
  }

  // --- Instruments -------------------------------------------------------------
  env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  kick(t) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    g.gain.setValueAtTime(1.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.4);
    // Click on the attack.
    const n = this.noiseSrc(t, 0.012), f = c.createBiquadFilter(), ng = c.createGain();
    f.type = 'highpass'; f.frequency.value = 3000;
    this.env(ng, t, 0.25, 0.001, 0.012);
    n.connect(f); f.connect(ng); ng.connect(this.bus);
    // Sidechain pump.
    this.duck.gain.setValueAtTime(0.3, t);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.19);
  }

  clap(t) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const o of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(0.55, t + o);
      g.gain.exponentialRampToValueAtTime(0.08, t + o + 0.01);
    }
    g.gain.setValueAtTime(0.4, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const n = this.noiseSrc(t, 0.25);
    n.connect(f); f.connect(g); g.connect(this.bus);
  }

  hat(t, open, vol) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = open ? 6500 : 8000;
    const g = c.createGain();
    this.env(g, t, vol, 0.001, open ? 0.2 : 0.035);
    const n = this.noiseSrc(t, open ? 0.25 : 0.05);
    n.connect(f); f.connect(g); g.connect(this.bus);
  }

  bass(t, midi, dur, cutoff) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 7;
    f.frequency.setValueAtTime(cutoff * 3.2, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.09);
    const g = c.createGain();
    this.env(g, t, 0.34, 0.003, dur);
    for (const det of [-8, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = this.mf(midi); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    const sub = c.createOscillator(); sub.type = 'square'; sub.frequency.value = this.mf(midi - 12);
    const sg = c.createGain(); sg.gain.value = 0.35;
    sub.connect(sg); sg.connect(f); sub.start(t); sub.stop(t + dur + 0.05);
    f.connect(g); g.connect(this.duck);
  }

  stab(t, notes, dur) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.075, 0.003, dur);
    for (const n of notes) for (const det of [-14, 0, 14]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = this.mf(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g); g.connect(this.duck);
  }

  lead(t, midi, dur) {
    const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'square'; o2.type = 'sawtooth';
    o1.frequency.value = o2.frequency.value = this.mf(midi);
    o2.detune.value = 7;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = 9;
    lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200; f.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.bus); g.connect(this.delay);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + dur + 0.05); }
  }

  pad(t, notes, dur) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.3);
    g.gain.setValueAtTime(0.05, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const n of notes) for (const det of [-10, 10]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = this.mf(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g); g.connect(this.duck);
  }

  // Orchestra-style hit: a bright low chord with a noise burst, fast filter decay.
  hit(t, root) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.7);
    const g = c.createGain();
    this.env(g, t, 0.16, 0.004, 0.8);
    for (const n of [root, root + 7, root + 12, root + 19, root + 24]) for (const det of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = this.mf(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + 0.85);
    }
    const n = this.noiseSrc(t, 0.3), ng = c.createGain();
    this.env(ng, t, 0.2, 0.002, 0.25);
    n.connect(ng); ng.connect(f);
    f.connect(g); g.connect(this.bus);
  }

  riser(t, dur) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.97);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.bus);
    src.start(t); src.stop(t + dur + 0.05);
  }
}
