'use strict';
// Menu screens: title, driver select, track select, results, standings, shop.

const PAL = {
  night: '#0c0e26', deep: '#161a44', panel: 'rgba(12,14,38,0.86)', edge: '#3b3f8a',
  gold: '#ffd23f', orange: '#ff7a1a', red: '#e8352a', cyan: '#5ee8ff', green: '#7dff7a', white: '#f4f4f4', grey: '#9aa0c8',
};

// Keyboard / gamepad / pointer driven vertical menu.
class Menu {
  constructor(items, o = {}) {
    this.items = items;
    this.sel = 0;
    this.x = o.x || VIEW_W / 2; this.y = o.y || 300;
    this.w = o.w || 360; this.h = o.h || 34; this.gap = o.gap || 8;
    this.size = o.size || 14;
    this.rects = [];
    this.fixSel(1);
  }
  enabled(i) { const it = this.items[i]; return it && (!it.enabled || it.enabled()); }
  visible(i) { const it = this.items[i]; return it && (!it.visible || it.visible()); }
  fixSel(dir) {
    for (let k = 0; k < this.items.length; k++) {
      if (this.visible(this.sel) && this.enabled(this.sel)) return;
      this.sel = (this.sel + dir + this.items.length) % this.items.length;
    }
  }
  move(dir) {
    const start = this.sel;
    do { this.sel = (this.sel + dir + this.items.length) % this.items.length; }
    while ((!this.visible(this.sel) || !this.enabled(this.sel)) && this.sel !== start);
    SFX.play('move');
  }
  update() {
    this.fixSel(1);
    if (Input.menu('up')) this.move(-1);
    if (Input.menu('down')) this.move(1);
    const it = this.items[this.sel];
    if (Input.menu('left') && it.left) { it.left(); SFX.play('move'); }
    if (Input.menu('right') && it.right) { it.right(); SFX.play('move'); }
    if (Input.pointer.moved) {
      this.rects.forEach((r, i) => {
        if (r && this.enabled(i) && hit(Input.pointer, r) && this.sel !== i) this.sel = i;
      });
    }
    for (const c of Input.clicks) {
      this.rects.forEach((r, i) => {
        if (r && this.enabled(i) && hit(c, r)) { this.sel = i; this.activate(); }
      });
    }
    if (Input.menu('ok')) this.activate();
  }
  activate() {
    const it = this.items[this.sel];
    if (!it || !this.enabled(this.sel)) return;
    SFX.play('select');
    it.action && it.action();
  }
  draw(ctx) {
    this.rects = [];
    let y = this.y;
    this.items.forEach((it, i) => {
      if (!this.visible(i)) { this.rects[i] = null; return; }
      const r = { x: this.x - this.w / 2, y, w: this.w, h: this.h };
      this.rects[i] = r;
      const on = i === this.sel, en = this.enabled(i);
      ctx.fillStyle = on ? 'rgba(255,210,63,0.18)' : 'rgba(0,0,0,0.35)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (on) {
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(r.x, r.y, 4, r.h); ctx.fillRect(r.x + r.w - 4, r.y, 4, r.h);
      }
      const label = typeof it.label === 'function' ? it.label() : it.label;
      text(ctx, label, this.x, r.y + (r.h - this.size) / 2, this.size, !en ? '#555a7a' : on ? PAL.gold : PAL.white, 'center');
      y += this.h + this.gap;
    });
  }
}

function hit(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

function drawBackdrop(ctx, t, tint = PAL.night) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, tint); g.addColorStop(1, '#05060f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Speed stripes.
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = PAL.orange;
  for (let k = 0; k < 14; k++) {
    const y = (k * 47 + t * 60) % (VIEW_H + 80) - 40;
    const x = ((k * 173 + t * 700 * (1 + (k % 3) * 0.3)) % (VIEW_W + 400)) - 200;
    ctx.fillRect(x, y, 180 + (k % 4) * 60, 4);
  }
  ctx.restore();
  // Checker strip along the bottom.
  const cw = 20;
  for (let r = 0; r < 2; r++) for (let c = 0; c < VIEW_W / cw + 2; c++) {
    ctx.fillStyle = (r + c) % 2 ? '#141414' : '#e8e8e8';
    ctx.globalAlpha = 0.25;
    ctx.fillRect(c * cw - ((t * 40) % (cw * 2)), VIEW_H - 40 + r * cw, cw, cw);
  }
  ctx.globalAlpha = 1;
}

function drawPanel(ctx, x, y, w, h, edge = PAL.edge) {
  ctx.fillStyle = PAL.panel; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function drawHeading(ctx, str, y = 28, color = PAL.gold) {
  text(ctx, str, VIEW_W / 2, y, 22, color, 'center', '#6a1a00');
  ctx.fillStyle = color; ctx.fillRect(VIEW_W / 2 - 180, y + 32, 360, 3);
}

const LOGO_TOP = pxStyle(['#fffbd0', '#fff070', '#ffd23f', '#ffa020', '#ff7a1a', '#e84a1a', '#b82810'], '#3a0a00', true);
const LOGO_SUB = pxStyle(['#f0ffff', '#c0f8ff', '#5ee8ff', '#38c0f0', '#2098e0', '#1a70c0', '#104c90'], '#001830', true);
const LOGO_SHADOW = pxStyle('rgb(0,0,0)', 'rgb(0,0,0)', true);

function drawLogo(ctx, cx, y, t) {
  const wob = Math.round(Math.sin(t * 2) * 2);
  pxText(ctx, 'COMBAT', cx + 6, y + 6 + wob, 9, LOGO_SHADOW, 'center');
  pxText(ctx, 'COMBAT', cx, y + wob, 9, LOGO_TOP, 'center');
  pxText(ctx, 'CIRCUIT', cx + 4, y + 84, 5, LOGO_SHADOW, 'center');
  pxText(ctx, 'CIRCUIT', cx, y + 80, 5, LOGO_SUB, 'center');
}

function statBar(ctx, label, v, x, y, w, color = PAL.gold) {
  text(ctx, label, x, y, 8, PAL.grey);
  const bx = x + 84, seg = (w - 84) / 5;
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = k < v ? color : 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx + k * seg, y - 1, seg - 3, 10);
  }
}

function wrapText(ctx, str, x, y, maxW, size, color, lineH = size + 6) {
  const words = str.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (textWidth(test, size) > maxW && line) {
      text(ctx, line, x, y, size, color);
      y += lineH; line = w;
    } else line = test;
  }
  if (line) text(ctx, line, x, y, size, color);
  return y + lineH;
}

function drawTrackPreview(ctx, track, x, y, w, h) {
  const mm = minimapImage(track, w, h);
  ctx.fillStyle = track.theme.ground; ctx.globalAlpha = 0.35; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  ctx.drawImage(mm.canvas, x, y);
}

// --- Title -------------------------------------------------------------------
class TitleScreen {
  constructor() {
    this.t = 0;
    this.attract = new Race({ trackDef: TRACKS[Math.floor(Math.random() * TRACKS.length)], humans: [], aiDrivers: shuffle(DRIVERS.slice()), aiLevel: 4, attract: true });
    this.menu = new Menu([
      { label: '1 PLAYER CHAMPIONSHIP', action: () => Game.set(new DriverSelectScreen(1, drivers => Champ.start(1, drivers))) },
      { label: '2 PLAYER CHAMPIONSHIP', action: () => Game.set(new DriverSelectScreen(2, drivers => Champ.start(2, drivers))) },
      { label: 'CONTINUE CHAMPIONSHIP', visible: () => Champ.hasSave(), action: () => Champ.resume() },
      { label: 'QUICK RACE', action: () => Game.set(new PlayerCountScreen()) },
      { label: 'PRACTICE', action: () => Game.set(new DriverSelectScreen(1, d => Game.set(new TrackSelectScreen(d, { practice: true })))) },
      { label: 'HOW TO PLAY', action: () => Game.set(new HelpScreen()) },
      { label: () => 'SOUND: ' + (SFX.muted ? 'OFF' : 'ON'), action: () => SFX.toggleMute(), left: () => SFX.toggleMute(), right: () => SFX.toggleMute() },
      { label: () => 'MUSIC: ' + (SFX.musicOn ? 'ON' : 'OFF'), action: () => SFX.toggleMusic(), left: () => SFX.toggleMusic(), right: () => SFX.toggleMusic() },
    ], { y: 236, w: 420, h: 28, gap: 5, size: 12 });
  }
  enter() { SFX.stopEngines(); SFX.playSong('menu'); }
  update(dt) {
    this.t += dt;
    this.attract.update(dt);
    // Swap the attract camera between leaders every few seconds.
    if (Math.floor(this.t / 6) !== Math.floor((this.t - dt) / 6)) {
      this.attract.cams[0].target = choice(this.attract.cars);
    }
    this.menu.update();
  }
  draw(ctx) {
    this.attract.draw(ctx);
    ctx.fillStyle = 'rgba(8,8,30,0.62)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawLogo(ctx, VIEW_W / 2, 40, this.t);
    this.menu.draw(ctx);
    text(ctx, 'ARROWS/WASD + ENTER  ·  CLICK OR TAP  ·  GAMEPAD', VIEW_W / 2, VIEW_H - 26, 8, PAL.grey, 'center');
  }
}

class PlayerCountScreen {
  constructor() {
    this.t = 0;
    this.menu = new Menu([
      { label: '1 PLAYER', action: () => Game.set(new DriverSelectScreen(1, d => Game.set(new TrackSelectScreen(d)))) },
      { label: '2 PLAYERS (SPLIT SCREEN)', action: () => Game.set(new DriverSelectScreen(2, d => Game.set(new TrackSelectScreen(d)))) },
      { label: 'BACK', action: () => Game.set(new TitleScreen()) },
    ], { y: 220, w: 460 });
  }
  update(dt) {
    this.t += dt;
    this.menu.update();
    if (Input.menu('back')) { SFX.play('back'); Game.set(new TitleScreen()); }
  }
  draw(ctx) {
    drawBackdrop(ctx, this.t);
    drawHeading(ctx, 'QUICK RACE', 90);
    this.menu.draw(ctx);
  }
}

// --- Help ----------------------------------------------------------------------
class HelpScreen {
  constructor() { this.t = 0; }
  update(dt) {
    this.t += dt;
    if (Input.menu('ok') || Input.menu('back') || Input.clicks.length) { SFX.play('back'); Game.set(new TitleScreen()); }
  }
  draw(ctx) {
    drawBackdrop(ctx, this.t);
    drawHeading(ctx, 'HOW TO PLAY', 18);
    drawPanel(ctx, 30, 70, 430, 250);
    text(ctx, 'CONTROLS', 46, 84, 12, PAL.cyan);
    const rows = [
      ['', '1 PLAYER', 'P1 (2P)', 'P2 (2P)'],
      ['DRIVE', 'ARROWS/WASD', 'W A S D', 'ARROWS'],
      ['SPECIAL', 'Z / SPACE', 'F', '. or NUM0'],
      ['ITEM', 'X', 'G', '/ or NUM.'],
      ['PAUSE', 'ESC / P', 'ESC / P', 'ESC / P'],
    ];
    rows.forEach((r, i) => {
      r.forEach((c, j) => text(ctx, c, 46 + [0, 90, 220, 320][j], 112 + i * 22, 8, i === 0 ? PAL.gold : j === 0 ? PAL.grey : PAL.white));
    });
    wrapText(ctx, 'GAMEPAD: stick/d-pad steer, A gas, B brake, X special, Y item. TOUCH: on-screen buttons.', 46, 232, 400, 8, PAL.grey, 16);
    text(ctx, 'M = mute   ·   Boost pads: drive over the arrows', 46, 292, 7, PAL.grey);

    drawPanel(ctx, 480, 70, 450, 250);
    text(ctx, 'WEAPONS', 496, 84, 12, PAL.cyan);
    const ws = ['missile', 'flame', 'emp', 'oil', 'mine', 'nitro', 'freeze', 'ram'];
    ws.forEach((w, i) => {
      const y = 112 + i * 25;
      drawIcon(ctx, w, 508, y + 5, 20);
      text(ctx, WEAPONS[w].name, 528, y, 8, PAL.gold);
      text(ctx, WEAPONS[w].desc, 528, y + 11, 6, PAL.white);
    });

    drawPanel(ctx, 30, 334, 900, 160);
    text(ctx, 'THE CHAMPIONSHIP', 46, 348, 12, PAL.cyan);
    const tips = [
      'Eight tracks. Finish ' + ordinal(QUALIFY_PLACE) + ' or better to move on. Miss it and you spend a continue.',
      'Every driver has a signature special weapon. Grab ? crates for extra items, repairs and cash.',
      'Wreck a rival for a ' + fmtMoney(KO_BONUS) + ' K.O. bonus. Wrecked cars respawn after a short delay.',
      'Spend prize money in the garage on engine, tires, armor and extra ammo between races.',
      'Most points after the final race wins the championship.',
    ];
    tips.forEach((s, i) => text(ctx, '> ' + s, 46, 376 + i * 22, 7, PAL.white));
    text(ctx, 'PRESS ENTER', VIEW_W / 2, VIEW_H - 32, 10, Math.floor(this.t * 2) % 2 ? PAL.gold : PAL.white, 'center');
  }
}

// --- Driver select ---------------------------------------------------------
class DriverSelectScreen {
  constructor(players, onDone) {
    this.players = players;
    this.onDone = onDone;
    this.picks = [];
    this.sel = 0;
    this.t = 0;
    this.rects = [];
  }
  get current() { return this.picks.length; }
  taken(i) { return this.picks.includes(DRIVERS[i]); }
  update(dt) {
    this.t += dt;
    const cols = 4;
    const mv = (d) => {
      let n = this.sel;
      for (let k = 0; k < 8; k++) { n = (n + d + 8) % 8; if (!this.taken(n)) break; }
      this.sel = n; SFX.play('move');
    };
    if (Input.menu('left')) mv(-1);
    if (Input.menu('right')) mv(1);
    if (Input.menu('up') || Input.menu('down')) {
      const n = (this.sel + cols) % 8;
      if (!this.taken(n)) { this.sel = n; SFX.play('move'); }
    }
    if (Input.pointer.moved) this.rects.forEach((r, i) => { if (hit(Input.pointer, r) && !this.taken(i)) this.sel = i; });
    let confirm = Input.menu('ok');
    for (const c of Input.clicks) {
      this.rects.forEach((r, i) => { if (hit(c, r) && !this.taken(i)) { if (this.sel === i || Input.lastDevice === 'touch') confirm = true; this.sel = i; } });
      if (this.goRect && hit(c, this.goRect)) confirm = true;
    }
    if (confirm && !this.taken(this.sel)) {
      SFX.play('select');
      this.picks.push(DRIVERS[this.sel]);
      if (this.picks.length >= this.players) { this.onDone(this.picks); return; }
      for (let k = 0; k < 8 && this.taken(this.sel); k++) this.sel = (this.sel + 1) % 8;
    }
    if (Input.menu('back')) {
      SFX.play('back');
      if (this.picks.length) this.picks.pop(); else Game.set(new TitleScreen());
    }
  }
  draw(ctx) {
    drawBackdrop(ctx, this.t);
    const who = this.players > 1 ? 'PLAYER ' + (this.current + 1) + ' ' : '';
    drawHeading(ctx, who + 'CHOOSE YOUR DRIVER', 18, this.current === 1 ? PAL.cyan : PAL.gold);
    this.rects = [];
    const cw = 104, ch = 96, gx = 34, gy = 76;
    DRIVERS.forEach((d, i) => {
      const x = gx + (i % 4) * (cw + 8), y = gy + Math.floor(i / 4) * (ch + 8);
      const r = { x, y, w: cw, h: ch };
      this.rects.push(r);
      const on = i === this.sel, tk = this.taken(i);
      drawPanel(ctx, x, y, cw, ch, on ? (this.current === 1 ? PAL.cyan : PAL.gold) : PAL.edge);
      ctx.globalAlpha = tk ? 0.3 : 1;
      drawCar(ctx, d, x + cw / 2, y + 40, -Math.PI / 2 + (on ? Math.sin(this.t * 3) * 0.3 : 0), { scale: 1.5 });
      text(ctx, d.name.length > 11 ? d.name.split(' ')[0] : d.name, x + cw / 2, y + ch - 18, 7, on ? PAL.gold : PAL.white, 'center');
      ctx.globalAlpha = 1;
      if (tk) text(ctx, 'P' + (this.picks.indexOf(d) + 1), x + cw / 2, y + 36, 16, PAL.green, 'center');
    });

    // Detail panel.
    const d = DRIVERS[this.sel];
    const px = 490, py = 76, pw = 440, ph = 200;
    drawPanel(ctx, px, py, pw, ph);
    text(ctx, d.name, px + 16, py + 14, 16, d.color === '#5a5f66' ? PAL.white : d.color);
    text(ctx, d.car.toUpperCase() + '  #' + d.num, px + 16, py + 38, 8, PAL.grey);
    statBar(ctx, 'SPEED', d.stats.speed, px + 16, py + 62, 250);
    statBar(ctx, 'ACCEL', d.stats.accel, px + 16, py + 80, 250);
    statBar(ctx, 'HANDLING', d.stats.handling, px + 16, py + 98, 250);
    statBar(ctx, 'ARMOR', d.stats.armor, px + 16, py + 116, 250);
    drawCar(ctx, d, px + 350, py + 90, this.t * 0.8, { scale: 2.4 });
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 12, py + 138, pw - 24, 52);
    drawIcon(ctx, d.special, px + 36, py + 164, 30);
    text(ctx, 'SPECIAL: ' + WEAPONS[d.special].name, px + 62, py + 146, 9, PAL.gold);
    wrapText(ctx, WEAPONS[d.special].desc, px + 62, py + 164, pw - 90, 7, PAL.white, 12);

    drawPanel(ctx, px, py + ph + 10, pw, 40);
    text(ctx, '"' + d.quote + '"', px + pw / 2, py + ph + 25, 8, PAL.cyan, 'center');

    this.goRect = { x: px, y: py + ph + 60, w: pw, h: 34 };
    ctx.fillStyle = 'rgba(255,210,63,0.18)'; ctx.fillRect(this.goRect.x, this.goRect.y, this.goRect.w, this.goRect.h);
    text(ctx, 'SELECT ' + d.name, px + pw / 2, this.goRect.y + 11, 12, PAL.gold, 'center');
    text(ctx, 'ENTER to choose  ·  ESC to go back', VIEW_W / 2, VIEW_H - 70, 8, PAL.grey, 'center');
  }
}

// --- Track select (quick race or practice) ---------------------------------
class TrackSelectScreen {
  constructor(drivers, opts = {}) {
    this.drivers = drivers;
    this.practice = !!opts.practice;
    this.sel = loadJSON('cc_lastTrack', 0) % TRACKS.length;
    this.tracks = TRACKS.map(d => new Track(d));
    this.t = 0;
    this.laps = 3;
    this.menu = new Menu([
      { label: () => '< ' + this.tracks[this.sel].name + ' >', left: () => this.cycle(-1), right: () => this.cycle(1), action: () => this.cycle(1) },
      { label: () => '< LAPS: ' + this.laps + ' >', visible: () => !this.practice, left: () => { this.laps = Math.max(1, this.laps - 1); }, right: () => { this.laps = Math.min(9, this.laps + 1); }, action: () => { this.laps = this.laps % 9 + 1; } },
      { label: () => (this.practice ? 'START PRACTICE' : 'START RACE'), action: () => this.start() },
      { label: 'BACK', action: () => Game.set(new TitleScreen()) },
    ], { y: 360, w: 480, h: 30, gap: 6, size: 11 });
  }
  cycle(d) { this.sel = (this.sel + d + TRACKS.length) % TRACKS.length; }
  start() {
    saveJSON('cc_lastTrack', this.sel);
    const humans = this.drivers.map((d, i) => ({
      driver: d, slot: this.drivers.length > 1 ? (i ? 'p2' : 'p1') : 'solo',
      upgrades: { engine: 1, tires: 1, armor: 1 }, bonusAmmo: 0,
    }));
    if (this.practice) {
      const make = () => new Race({ trackDef: TRACKS[this.sel], humans, aiDrivers: [], practice: true });
      Game.set(new RaceScreen(make, null, { onChangeTrack: () => Game.set(new TrackSelectScreen(this.drivers, { practice: true })) }));
      return;
    }
    const ai = DRIVERS.filter(d => !this.drivers.includes(d));
    const make = () => new Race({ trackDef: TRACKS[this.sel], humans, aiDrivers: ai, aiLevel: 3, laps: this.laps });
    Game.set(new RaceScreen(make, results => Game.set(new ResultsScreen(results, null, make))));
  }
  update(dt) {
    this.t += dt;
    this.menu.update();
    if (Input.menu('back')) { SFX.play('back'); Game.set(new TitleScreen()); }
  }
  draw(ctx) {
    drawBackdrop(ctx, this.t);
    drawHeading(ctx, this.practice ? 'PRACTICE: SELECT TRACK' : 'SELECT TRACK', 18);
    const tr = this.tracks[this.sel];
    drawPanel(ctx, 180, 70, 600, 270);
    drawTrackPreview(ctx, tr, 196, 86, 380, 238);
    text(ctx, tr.name, 596, 96, 10, PAL.gold);
    text(ctx, 'TERRAIN', 596, 130, 8, PAL.grey);
    text(ctx, tr.theme.name, 596, 144, 10, PAL.white);
    text(ctx, 'LENGTH', 596, 172, 8, PAL.grey);
    text(ctx, (tr.length / 1000 * 0.25).toFixed(2) + ' MI', 596, 186, 10, PAL.white);
    text(ctx, 'SURFACE', 596, 214, 8, PAL.grey);
    text(ctx, tr.theme.grip < 0.8 ? 'ICY' : tr.theme.offDamage ? 'HOT ASH' : 'NORMAL', 596, 228, 10, tr.theme.grip < 0.8 ? PAL.cyan : tr.theme.offDamage ? PAL.orange : PAL.white);
    if (this.practice) {
      const rec = loadJSON('cc_record_' + tr.name, null);
      text(ctx, 'LAP RECORD', 596, 256, 8, PAL.grey);
      text(ctx, rec != null ? fmtTime(rec) : 'NONE YET', 596, 270, 10, PAL.gold);
    }
    text(ctx, (this.sel + 1) + ' / ' + TRACKS.length, 596, 300, 10, PAL.grey);
    this.menu.draw(ctx);
  }
}

// --- Race wrapper with pause menu -----------------------------------------
class RaceScreen {
  // opts.onChangeTrack adds a CHANGE TRACK option to the pause menu (practice).
  constructor(makeRace, onDone, opts = {}) {
    this.makeRace = makeRace;
    this.race = makeRace();
    this.onDone = onDone;
    this.paused = false;
    this.isRace = true;
    this.pauseMenu = new Menu([
      { label: 'RESUME', action: () => { this.paused = false; } },
      { label: () => (this.race.practice ? 'RESTART PRACTICE' : 'RESTART RACE'), visible: () => !Champ.active, action: () => { this.race = this.makeRace(); this.paused = false; } },
      { label: 'CHANGE TRACK', visible: () => !!opts.onChangeTrack, action: () => { SFX.stopEngines(); opts.onChangeTrack(); } },
      { label: 'QUIT TO TITLE', action: () => { SFX.stopEngines(); Game.set(new TitleScreen()); } },
    ], { y: 230, w: 340 });
  }
  enter() { SFX.playSong('race'); }
  update(dt) {
    if (Input.menu('pause') && !this.race.done) {
      this.paused = !this.paused;
      SFX.play(this.paused ? 'select' : 'back');
      if (this.paused) SFX.stopEngines();
      return;
    }
    if (this.paused) { this.pauseMenu.update(); return; }
    this.race.update(dt);
    if (this.race.done) {
      SFX.stopEngines();
      this.onDone(this.race.results());
    }
  }
  draw(ctx) {
    this.race.draw(ctx);
    if (this.paused) {
      ctx.fillStyle = 'rgba(5,6,20,0.7)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawHeading(ctx, 'PAUSED', 150);
      this.pauseMenu.draw(ctx);
    }
  }
}

// --- Results ----------------------------------------------------------------
class ResultsScreen {
  // champCtx: null for quick race, or {awards} from Champ.
  constructor(results, champCtx, remake) {
    this.results = results;
    this.champ = champCtx;
    this.remake = remake;
    this.t = 0;
    const items = champCtx
      ? [{ label: 'CONTINUE', action: () => Champ.afterResults() }]
      : [
        { label: 'RACE AGAIN', action: () => Game.set(new RaceScreen(remake, r => Game.set(new ResultsScreen(r, null, remake)))) },
        { label: 'CHANGE TRACK', action: () => Game.set(new TrackSelectScreen(results.filter(r => r.human).sort((a, b) => a.playerIndex - b.playerIndex).map(r => r.driver))) },
        { label: 'TITLE SCREEN', action: () => Game.set(new TitleScreen()) },
      ];
    this.menu = new Menu(items, { y: champCtx ? 470 : 424, w: 300, h: 28, gap: 6, size: 11 });
  }
  enter() {
    const best = Math.min(...this.results.filter(r => r.human).map(r => r.place));
    SFX.playSong(best <= QUALIFY_PLACE ? 'win' : 'menu');
  }
  update(dt) { this.t += dt; this.menu.update(); }
  draw(ctx) {
    drawBackdrop(ctx, this.t);
    drawHeading(ctx, 'RACE RESULTS', 14);
    const x = 110, w = 740, y0 = 66;
    drawPanel(ctx, x, y0, w, 44 + this.results.length * 38);
    const cols = [x + 16, x + 76, x + 330, x + 450, x + 540, x + 630];
    ['POS', 'DRIVER', 'TIME', 'K.O.', 'PRIZE', 'PTS'].forEach((h, i) => text(ctx, h, cols[i], y0 + 14, 8, PAL.grey));
    this.results.forEach((r, i) => {
      const y = y0 + 38 + i * 38;
      const reveal = clamp((this.t - i * 0.12) * 4, 0, 1);
      ctx.globalAlpha = reveal;
      if (r.human) { ctx.fillStyle = r.playerIndex === 1 ? 'rgba(94,232,255,0.15)' : 'rgba(255,210,63,0.15)'; ctx.fillRect(x + 6, y - 6, w - 12, 34); }
      text(ctx, ordinal(r.place), cols[0], y + 4, 12, r.place <= 3 ? PAL.gold : PAL.white);
      drawCar(ctx, r.driver, cols[1] + 16, y + 10, 0, { scale: 0.8 });
      text(ctx, r.driver.name + (r.human ? '  (P' + (r.playerIndex + 1) + ')' : ''), cols[1] + 40, y + 6, 9, r.human ? PAL.gold : PAL.white);
      text(ctx, r.time != null ? fmtTime(r.time) : '--:--.--', cols[2], y + 6, 9, PAL.white);
      text(ctx, String(r.kos), cols[3], y + 6, 9, PAL.white);
      const prize = PRIZES[r.place - 1] + (r.human ? r.raceCash : 0);
      text(ctx, fmtMoney(prize), cols[4], y + 6, 9, '#9fe39f');
      text(ctx, '+' + POINTS[r.place - 1], cols[5], y + 6, 9, PAL.cyan);
      ctx.globalAlpha = 1;
    });
    if (this.champ) {
      const q = this.champ.qualified;
      const y = y0 + 52 + this.results.length * 38;
      text(ctx, q ? 'QUALIFIED! ON TO THE NEXT TRACK' : 'DID NOT QUALIFY: FINISH ' + ordinal(QUALIFY_PLACE) + ' OR BETTER',
        VIEW_W / 2, y, 12, q ? PAL.green : PAL.red, 'center');
      if (!q) text(ctx, this.champ.continues >= 0 ? 'CONTINUES LEFT: ' + this.champ.continues : 'NO CONTINUES LEFT', VIEW_W / 2, y + 22, 9, PAL.white, 'center');
    }
    this.menu.draw(ctx);
  }
}

// --- Championship standings -----------------------------------------------
class StandingsScreen {
  constructor(onNext, final) {
    this.onNext = onNext;
    this.final = final;
    this.t = 0;
    this.menu = new Menu([{ label: final ? 'CONTINUE' : 'TO THE GARAGE', action: () => onNext() }], { y: 474, w: 320, h: 30 });
  }
  update(dt) { this.t += dt; this.menu.update(); }
  draw(ctx) {
    drawBackdrop(ctx, this.t);
    const d = Champ.data;
    drawHeading(ctx, 'CHAMPIONSHIP STANDINGS', 14);
    text(ctx, 'AFTER RACE ' + Math.min(d.trackIdx + (this.final ? 0 : 0), TRACKS.length) + ' OF ' + TRACKS.length, VIEW_W / 2, 58, 9, PAL.grey, 'center');
    const rows = Champ.standings();
    const x = 200, w = 560, y0 = 80;
    drawPanel(ctx, x, y0, w, 30 + rows.length * 44);
    const max = Math.max(1, rows[0].pts);
    rows.forEach((r, i) => {
      const y = y0 + 16 + i * 44;
      const humanIdx = d.players.findIndex(p => p.driverId === r.driver.id);
      if (humanIdx >= 0) { ctx.fillStyle = humanIdx ? 'rgba(94,232,255,0.15)' : 'rgba(255,210,63,0.15)'; ctx.fillRect(x + 6, y - 4, w - 12, 40); }
      text(ctx, ordinal(i + 1), x + 16, y + 10, 12, i === 0 ? PAL.gold : PAL.white);
      drawCar(ctx, r.driver, x + 90, y + 16, 0, { scale: 0.8 });
      text(ctx, r.driver.name + (humanIdx >= 0 ? ' (P' + (humanIdx + 1) + ')' : ''), x + 118, y + 6, 9, humanIdx >= 0 ? PAL.gold : PAL.white);
      const bw = (w - 230) * clamp(r.pts / max, 0, 1) * clamp(this.t * 2, 0, 1);
      ctx.fillStyle = r.driver.color; ctx.fillRect(x + 118, y + 22, bw, 6);
      text(ctx, String(r.pts), x + w - 20, y + 10, 12, PAL.cyan, 'right');
    });
    this.menu.draw(ctx);
  }
}

// --- Garage / shop ------------------------------------------------------------
class ShopScreen {
  constructor(playerIdx, onDone) {
    this.pi = playerIdx;
    this.onDone = onDone;
    this.t = 0;
    this.msg = ''; this.msgT = 0;
    const p = () => Champ.data.players[this.pi];
    const upItems = UPGRADES.map(u => ({
      label: () => {
        const lv = p().upg[u.key];
        return u.name + ' LV ' + lv + '/4   ' + (lv >= 4 ? 'MAXED' : fmtMoney(u.costs[lv]));
      },
      action: () => this.buyUpgrade(u),
    }));
    this.menu = new Menu([
      ...upItems,
      {
        label: () => {
          const pl = p();
          return WEAPONS[Champ.driverOf(pl).special].name + ' +' + AMMO_PACK.amount + '   ' + (pl.bonusAmmo >= AMMO_PACK.max ? 'MAXED' : fmtMoney(AMMO_PACK.cost));
        },
        action: () => this.buyAmmo(),
      },
      { label: 'DONE', action: () => { Champ.save(); this.onDone(); } },
    ], { x: 300, y: 250, w: 520, h: 34, gap: 8, size: 11 });
  }
  enter() { SFX.playSong('menu'); }
  flash(m) { this.msg = m; this.msgT = 1.6; }
  buyUpgrade(u) {
    const pl = Champ.data.players[this.pi];
    const lv = pl.upg[u.key];
    if (lv >= 4) { SFX.play('deny'); return this.flash('ALREADY MAXED'); }
    if (pl.cash < u.costs[lv]) { SFX.play('deny'); return this.flash('NOT ENOUGH CASH'); }
    pl.cash -= u.costs[lv];
    pl.upg[u.key]++;
    SFX.play('buy');
    this.flash(u.name + ' UPGRADED!');
  }
  buyAmmo() {
    const pl = Champ.data.players[this.pi];
    if (pl.bonusAmmo >= AMMO_PACK.max) { SFX.play('deny'); return this.flash('AMMO RACK FULL'); }
    if (pl.cash < AMMO_PACK.cost) { SFX.play('deny'); return this.flash('NOT ENOUGH CASH'); }
    pl.cash -= AMMO_PACK.cost;
    pl.bonusAmmo += AMMO_PACK.amount;
    SFX.play('buy');
    this.flash('AMMO LOADED!');
  }
  update(dt) {
    this.t += dt;
    this.msgT -= dt;
    this.menu.update();
  }
  draw(ctx) {
    drawBackdrop(ctx, this.t, '#1a1030');
    const pl = Champ.data.players[this.pi];
    const d = Champ.driverOf(pl);
    drawHeading(ctx, (Champ.data.players.length > 1 ? 'P' + (this.pi + 1) + ' ' : '') + 'GARAGE', 14, this.pi ? PAL.cyan : PAL.gold);

    // Car + stats.
    drawPanel(ctx, 40, 70, 480, 160);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let k = 0; k < 6; k++) ctx.fillRect(60 + k * 30, 90, 2, 120);
    ctx.restore();
    drawCar(ctx, d, 150, 150, -0.4 + Math.sin(this.t) * 0.1, { scale: 3 });
    text(ctx, d.name, 270, 88, 12, PAL.white);
    const car = new Car(d, { upgrades: pl.upg, bonusAmmo: pl.bonusAmmo });
    const bar = (label, v, max, y) => {
      text(ctx, label, 270, y, 8, PAL.grey);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(360, y - 1, 140, 10);
      ctx.fillStyle = PAL.gold; ctx.fillRect(360, y - 1, 140 * clamp(v / max, 0, 1), 10);
    };
    bar('TOP SPEED', car.maxSpeed - 300, 240, 116);
    bar('HANDLING', car.grip, 13, 136);
    bar('ARMOR', car.maxHp, 214, 156);
    text(ctx, 'SPECIAL AMMO: ' + car.ammo, 270, 180, 8, PAL.white);
    drawIcon(ctx, d.special, 490, 184, 22);

    drawPanel(ctx, 540, 70, 380, 160);
    text(ctx, 'CASH', 560, 90, 10, PAL.grey);
    text(ctx, fmtMoney(pl.cash), 560, 110, 26, '#9fe39f');
    text(ctx, 'NEXT RACE', 560, 160, 8, PAL.grey);
    const next = TRACKS[Math.min(Champ.data.trackIdx, TRACKS.length - 1)];
    text(ctx, next.name, 560, 176, 10, PAL.white);
    text(ctx, THEMES[next.theme].name, 560, 196, 8, PAL.cyan);

    this.menu.x = VIEW_W / 2;
    this.menu.draw(ctx);
    // Level pips next to upgrade rows.
    UPGRADES.forEach((u, i) => {
      const r = this.menu.rects[i];
      if (!r) return;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k < pl.upg[u.key] ? PAL.green : 'rgba(255,255,255,0.15)';
        ctx.fillRect(r.x + r.w + 10 + k * 14, r.y + 11, 10, 12);
      }
    });
    if (this.msgT > 0) text(ctx, this.msg, VIEW_W / 2, 468, 10, this.msg.includes('NOT') || this.msg.includes('MAX') || this.msg.includes('FULL') ? PAL.red : PAL.green, 'center');
  }
}

// --- Track intro -----------------------------------------------------------
class TrackIntroScreen {
  constructor(onGo) {
    this.onGo = onGo;
    this.t = 0;
    const d = Champ.data;
    this.track = new Track(TRACKS[d.trackIdx]);
    this.menu = new Menu([
      { label: 'START RACE', action: () => onGo() },
      { label: 'SAVE & QUIT', action: () => { Champ.save(); Game.set(new TitleScreen()); } },
    ], { y: 440, w: 300, h: 30, gap: 6, size: 12 });
  }
  enter() { SFX.playSong('menu'); }
  update(dt) { this.t += dt; this.menu.update(); }
  draw(ctx) {
    drawBackdrop(ctx, this.t);
    const d = Champ.data;
    text(ctx, 'RACE ' + (d.trackIdx + 1) + ' OF ' + TRACKS.length, VIEW_W / 2, 20, 12, PAL.grey, 'center');
    drawHeading(ctx, this.track.name, 42);
    drawPanel(ctx, 120, 100, 440, 320);
    drawTrackPreview(ctx, this.track, 136, 116, 408, 288);
    drawPanel(ctx, 580, 100, 260, 320);
    const rows = [
      ['TERRAIN', this.track.theme.name, PAL.white],
      ['LAPS', String(this.track.laps), PAL.white],
      ['SURFACE', this.track.theme.grip < 0.8 ? 'ICY ROADS' : this.track.theme.offDamage ? 'SCORCHING ASH' : 'NORMAL', this.track.theme.grip < 0.8 ? PAL.cyan : this.track.theme.offDamage ? PAL.orange : PAL.white],
      ['TO QUALIFY', ordinal(QUALIFY_PLACE) + ' OR BETTER', PAL.gold],
      ['CONTINUES', String(d.continues), PAL.white],
    ];
    rows.forEach((r, i) => {
      text(ctx, r[0], 600, 120 + i * 56, 8, PAL.grey);
      text(ctx, r[1], 600, 136 + i * 56, 11, r[2]);
    });
    this.menu.draw(ctx);
  }
}

// --- Championship end / game over -----------------------------------------
class FinalScreen {
  constructor(won, heading, lines) {
    this.won = won; this.heading = heading; this.lines = lines; this.t = 0;
    this.confetti = [];
    if (won) for (let k = 0; k < 120; k++) this.confetti.push({ x: rand(0, VIEW_W), y: rand(-VIEW_H, 0), vy: rand(60, 160), vx: rand(-30, 30), c: choice([PAL.gold, PAL.cyan, PAL.red, PAL.green, '#fff']), r: rand(0, TAU) });
    this.menu = new Menu([{ label: 'TITLE SCREEN', action: () => Game.set(new TitleScreen()) }], { y: 460, w: 300 });
  }
  enter() { SFX.playSong(this.won ? 'win' : 'menu'); }
  update(dt) {
    this.t += dt;
    for (const c of this.confetti) {
      c.y += c.vy * dt; c.x += c.vx * dt; c.r += dt * 4;
      if (c.y > VIEW_H) { c.y = -10; c.x = rand(0, VIEW_W); }
    }
    this.menu.update();
  }
  draw(ctx) {
    drawBackdrop(ctx, this.t, this.won ? '#2a1a00' : '#200a0a');
    for (const c of this.confetti) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-4, -2, 8, 4); ctx.restore();
    }
    const s = 1 + Math.sin(this.t * 3) * 0.04;
    ctx.save(); ctx.translate(VIEW_W / 2, 120); ctx.scale(s, s);
    text(ctx, this.heading, 0, -20, 36, this.won ? PAL.gold : PAL.red, 'center', '#000');
    ctx.restore();
    if (this.won) {
      // Trophy.
      ctx.save(); ctx.translate(VIEW_W / 2, 250);
      const g = ctx.createLinearGradient(-40, -60, 40, 60);
      g.addColorStop(0, '#fff6a0'); g.addColorStop(0.5, PAL.gold); g.addColorStop(1, '#a86a00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-45, -60); ctx.lineTo(45, -60); ctx.quadraticCurveTo(45, 20, 0, 25); ctx.quadraticCurveTo(-45, 20, -45, -60); ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = g;
      ctx.beginPath(); ctx.arc(-48, -30, 18, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(48, -30, 18, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
      ctx.fillRect(-8, 25, 16, 25); ctx.fillRect(-35, 50, 70, 14);
      ctx.restore();
    }
    this.lines.forEach((l, i) => text(ctx, l, VIEW_W / 2, (this.won ? 340 : 220) + i * 28, 11, PAL.white, 'center'));
    this.menu.draw(ctx);
  }
}
