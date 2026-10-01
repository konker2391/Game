'use strict';
// Procedural sound effects and a chiptune soundtrack via Web Audio.

const MUSIC_VOL = 0.65;

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
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
      this.applyVolumes();
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
    this.applyVolumes();
  },
  // Options volumes are 0-10; the defaults (music 7, effects 8) give the original mix.
  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = this.musicOn ? MUSIC_VOL * Options.musicVol / 7 : 0;
    this.sfxGain.gain.value = 0.8 * Options.sfxVol / 8;
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

  // --- Music (see music.js) -----------------------------------------------
  playSong(name) {
    if (!this.ctx) { this.pendingSong = name; return; }
    this.pendingSong = null;
    if (!this.music) this.music = new MusicEngine(this.ctx, this.musicGain);
    if (this.song === SONGS[name]) return;
    this.song = SONGS[name];
    this.music.setSong(this.song);
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
    const stepDur = this.music.stepDur();
    // After a stall (tab in background), skip ahead instead of firing a burst of notes.
    if (this.nextNoteTime < this.ctx.currentTime - 0.2) this.nextNoteTime = this.ctx.currentTime + 0.05;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.music.step(this.songStep, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.songStep++;
    }
  },
};
