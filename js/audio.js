'use strict';
// Procedural sound effects and a chiptune soundtrack via Web Audio.

const SFX = {
  ctx: null, master: null, sfxGain: null, musicGain: null, noiseBuf: null,
  muted: loadJSON('cc_muted', false),
  musicOn: loadJSON('cc_music', true),
  engines: [],
  song: null, songStep: 0, nextNoteTime: 0, timer: null,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicOn ? 0.22 : 0; this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.pendingSong) this.playSong(this.pendingSong);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },

  toggleMute() {
    this.muted = !this.muted;
    saveJSON('cc_muted', this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
  },
  toggleMusic() {
    this.musicOn = !this.musicOn;
    saveJSON('cc_music', this.musicOn);
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? 0.22 : 0;
  },

  tone(freq, dur, o = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    const v = Math.max(0.001, o.vol == null ? 0.2 : o.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  },

  noise(dur, o = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.slide), t + dur);
    f.Q.value = o.q || 1;
    const g = this.ctx.createGain();
    const v = Math.max(0.001, o.vol == null ? 0.3 : o.vol);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfxGain);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },

  play(name, vol = 1) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    switch (name) {
      case 'select': this.tone(660, 0.07, { vol: 0.12 * vol }); this.tone(990, 0.08, { vol: 0.1 * vol, delay: 0.05 }); break;
      case 'move': this.tone(440, 0.04, { vol: 0.08 * vol }); break;
      case 'back': this.tone(330, 0.1, { vol: 0.1 * vol, slide: 200 }); break;
      case 'buy': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, { vol: 0.1 * vol, delay: i * 0.05 })); break;
      case 'deny': this.tone(140, 0.2, { vol: 0.14 * vol, type: 'sawtooth' }); break;
      case 'beep': this.tone(440, 0.18, { vol: 0.18 * vol }); break;
      case 'go': this.tone(880, 0.45, { vol: 0.2 * vol }); break;
      case 'missile': this.noise(0.5, { vol: 0.25 * vol, freq: 3000, slide: 400, filter: 'bandpass', q: 2 }); this.tone(300, 0.3, { vol: 0.08 * vol, type: 'sawtooth', slide: 900 }); break;
      case 'flame': this.noise(0.6, { vol: 0.28 * vol, freq: 900, slide: 300 }); break;
      case 'emp': this.tone(120, 0.6, { vol: 0.2 * vol, type: 'sawtooth', slide: 1800 }); this.tone(1800, 0.5, { vol: 0.08 * vol, type: 'square', slide: 60, delay: 0.05 }); break;
      case 'drop': this.tone(220, 0.12, { vol: 0.14 * vol, slide: 110 }); break;
      case 'oil': this.noise(0.25, { vol: 0.2 * vol, freq: 500, slide: 150 }); this.tone(160, 0.2, { vol: 0.08 * vol, type: 'triangle', slide: 80 }); break;
      case 'nitro': this.noise(0.9, { vol: 0.3 * vol, freq: 800, slide: 4000, filter: 'bandpass', q: 1.5 }); break;
      case 'freeze': this.tone(1600, 0.35, { vol: 0.12 * vol, type: 'triangle', slide: 3200 }); this.tone(2400, 0.2, { vol: 0.06 * vol, type: 'sine', delay: 0.1 }); break;
      case 'frozen': [2000, 2600, 3100].forEach((f, i) => this.tone(f, 0.12, { vol: 0.06 * vol, type: 'sine', delay: i * 0.04 })); break;
      case 'ram': this.tone(80, 0.5, { vol: 0.25 * vol, type: 'sawtooth', slide: 240 }); break;
      case 'explode':
        this.noise(0.9, { vol: 0.5 * vol, freq: 1800, slide: 60 });
        this.tone(90, 0.6, { vol: 0.3 * vol, type: 'sine', slide: 30 });
        break;
      case 'bigexplode':
        this.noise(1.4, { vol: 0.6 * vol, freq: 2500, slide: 40 });
        this.tone(70, 1.0, { vol: 0.35 * vol, type: 'sine', slide: 25 });
        break;
      case 'hit': this.noise(0.12, { vol: 0.25 * vol, freq: 2500, slide: 500 }); break;
      case 'bump': this.noise(0.1, { vol: 0.22 * vol, freq: 600, slide: 120 }); this.tone(90, 0.1, { vol: 0.12 * vol, type: 'sine' }); break;
      case 'scrape': this.noise(0.15, { vol: 0.1 * vol, freq: 3500, filter: 'highpass' }); break;
      case 'pickup': [784, 988, 1318].forEach((f, i) => this.tone(f, 0.07, { vol: 0.1 * vol, delay: i * 0.045 })); break;
      case 'cash': [1318, 1760, 2093, 2637].forEach((f, i) => this.tone(f, 0.06, { vol: 0.08 * vol, delay: i * 0.04, type: 'triangle' })); break;
      case 'repair': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.09, { vol: 0.08 * vol, delay: i * 0.06, type: 'triangle' })); break;
      case 'boost': this.tone(300, 0.25, { vol: 0.12 * vol, type: 'sawtooth', slide: 1200 }); break;
      case 'lap': [659, 784, 988].forEach((f, i) => this.tone(f, 0.12, { vol: 0.12 * vol, delay: i * 0.08 })); break;
      case 'finish': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.15, { vol: 0.13 * vol, delay: i * 0.1 })); break;
      case 'spin': this.tone(700, 0.4, { vol: 0.08 * vol, type: 'triangle', slide: 200 }); break;
      case 'shock': this.noise(0.3, { vol: 0.2 * vol, freq: 4000, filter: 'highpass' }); this.tone(60, 0.3, { vol: 0.12 * vol, type: 'square' }); break;
    }
  },

  // One continuous engine voice per human player.
  engine(i, on, rpm) {
    if (!this.ctx) return;
    let e = this.engines[i];
    if (!e) {
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      const osc2 = this.ctx.createOscillator(); osc2.type = 'square';
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = this.ctx.createGain(); g.gain.value = 0;
      osc.connect(f); osc2.connect(f); f.connect(g); g.connect(this.sfxGain);
      osc.start(); osc2.start();
      e = this.engines[i] = { osc, osc2, f, g };
    }
    const t = this.ctx.currentTime;
    const base = 45 + rpm * 95;
    e.osc.frequency.setTargetAtTime(base, t, 0.05);
    e.osc2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    e.f.frequency.setTargetAtTime(400 + rpm * 900, t, 0.05);
    e.g.gain.setTargetAtTime(on && !this.muted ? 0.05 + rpm * 0.03 : 0, t, 0.08);
  },
  stopEngines() {
    for (let i = 0; i < this.engines.length; i++) this.engine(i, false, 0);
  },

  // --- Music -------------------------------------------------------------
  SONGS: {
    menu: {
      bpm: 118,
      chords: [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M']],
      lead: [12, -1, 15, -1, 19, -1, 15, 12, 17, -1, 15, -1, 12, -1, 10, -1],
    },
    race: {
      bpm: 152,
      chords: [[52, 'm'], [52, 'm'], [48, 'M'], [50, 'M'], [45, 'm'], [45, 'm'], [47, 'M'], [47, 'M']],
      lead: [12, 12, -1, 19, -1, 17, 15, -1, 12, -1, 15, 17, 19, -1, 22, 19],
    },
    win: {
      bpm: 132,
      chords: [[48, 'M'], [53, 'M'], [55, 'M'], [48, 'M']],
      lead: [12, 16, 19, 24, -1, 19, 24, -1, 16, 19, 24, 28, -1, 24, -1, -1],
    },
  },

  playSong(name) {
    if (!this.ctx) { this.pendingSong = name; return; }
    this.pendingSong = null;
    if (this.song === this.SONGS[name]) return;
    this.song = this.SONGS[name];
    this.songStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this._schedule(), 25);
  },
  stopSong() {
    this.song = null;
    this.pendingSong = null;
  },

  _schedule() {
    if (!this.song || !this.ctx) return;
    const stepDur = 60 / this.song.bpm / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this._note(this.songStep, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.songStep++;
    }
  },

  _note(step, t, dur) {
    const s = this.song, ctx = this.ctx, out = this.musicGain;
    const bar = Math.floor(step / 16) % s.chords.length;
    const k = step % 16;
    const [root, quality] = s.chords[bar];
    const mf = m => 440 * Math.pow(2, (m - 69) / 12);
    const voice = (freq, len, type, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.02);
    };
    const drum = (len, freq, vol, type) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + len + 0.02);
    };
    // Bass: driving eighths with octave pops.
    const bassPat = [0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 0, 12, 0, 7, 12, 7];
    if (bassPat[k] >= 0) voice(mf(root - 12 + bassPat[k]), dur * 0.9, 'triangle', 0.5);
    // Arp chord.
    const third = quality === 'm' ? 3 : 4;
    const arp = [0, third, 7, 12];
    if (k % 2 === 1) voice(mf(root + 12 + arp[(k >> 1) % 4]), dur * 0.8, 'square', 0.06);
    // Lead: shifted along with the chord.
    const n = s.lead[k];
    if (n >= 0 && bar % 2 === 1) voice(mf(root + n), dur * 1.6, 'square', 0.09);
    // Drums.
    if (k === 0 || k === 8 || k === 10) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.16);
    }
    if (k === 4 || k === 12) drum(0.15, 1800, 0.35, 'bandpass');
    if (k % 2 === 0) drum(0.04, 7000, 0.12, 'highpass');
  },
};
