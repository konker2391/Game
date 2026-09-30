'use strict';
// Championship flow, main loop and canvas scaling.

const Champ = {
  data: null,
  active: false,
  lastQualified: false,

  start(mode, drivers) {
    this.data = {
      mode,
      players: drivers.map(d => ({ driverId: d.id, cash: START_CASH, upg: { engine: 0, tires: 0, armor: 0 }, bonusAmmo: 0 })),
      trackIdx: 0,
      continues: START_CONTINUES,
      points: Object.fromEntries(DRIVERS.map(d => [d.id, 0])),
    };
    this.active = true;
    this.save();
    this.shopThen(() => this.intro());
  },
  hasSave() { return !!loadJSON('cc_champ', null); },
  resume() {
    this.data = loadJSON('cc_champ', null);
    if (!this.data) return;
    this.active = true;
    this.intro();
  },
  save() { if (this.data) saveJSON('cc_champ', this.data); },
  clear() { removeKey('cc_champ'); },
  driverOf(pl) { return DRIVERS.find(d => d.id === pl.driverId); },
  standings() {
    return DRIVERS.map(d => ({ driver: d, pts: this.data.points[d.id] || 0 })).sort((a, b) => b.pts - a.pts);
  },
  intro() { Game.set(new TrackIntroScreen(() => this.race())); },

  race() {
    const d = this.data;
    const humans = d.players.map((pl, i) => ({
      driver: this.driverOf(pl), slot: d.players.length > 1 ? (i ? 'p2' : 'p1') : 'solo',
      upgrades: pl.upg, bonusAmmo: pl.bonusAmmo,
    }));
    const ai = DRIVERS.filter(x => !humans.some(h => h.driver === x));
    const make = () => new Race({ trackDef: TRACKS[d.trackIdx], humans, aiDrivers: ai, aiLevel: d.trackIdx });
    Game.set(new RaceScreen(make, results => this.onResults(results)));
  },

  onResults(results) {
    const d = this.data;
    for (const r of results) {
      d.points[r.driver.id] = (d.points[r.driver.id] || 0) + POINTS[r.place - 1];
      if (r.human) d.players[r.playerIndex].cash += PRIZES[r.place - 1] + r.raceCash;
    }
    const qualified = results.some(r => r.human && r.place <= QUALIFY_PLACE);
    if (!qualified) d.continues--;
    this.lastQualified = qualified;
    this.save();
    Game.set(new ResultsScreen(results, { qualified, continues: d.continues }));
  },

  afterResults() {
    const d = this.data;
    if (!this.lastQualified) {
      if (d.continues < 0) {
        this.clear();
        const pos = this.standings().findIndex(r => d.players.some(p => p.driverId === r.driver.id)) + 1;
        Game.set(new FinalScreen(false, 'GAME OVER', [
          'OUT OF CONTINUES ON ' + TRACKS[d.trackIdx].name,
          'BEST CHAMPIONSHIP POSITION: ' + ordinal(pos),
        ]));
        return;
      }
      this.shopThen(() => this.intro());
      return;
    }
    d.trackIdx++;
    const final = d.trackIdx >= TRACKS.length;
    this.save();
    Game.set(new StandingsScreen(() => (final ? this.finish() : this.shopThen(() => this.intro())), final));
  },

  shopThen(next) {
    const run = i => (i >= this.data.players.length ? next() : Game.set(new ShopScreen(i, () => run(i + 1))));
    run(0);
  },

  finish() {
    const d = this.data;
    const rows = this.standings();
    this.clear();
    const winner = rows[0].driver;
    const humanWin = d.players.findIndex(p => p.driverId === winner.id);
    const lines = d.players.map((p, i) => {
      const pos = rows.findIndex(r => r.driver.id === p.driverId) + 1;
      return (d.players.length > 1 ? 'P' + (i + 1) + ' ' : '') + this.driverOf(p).name + ': ' + ordinal(pos) + ' WITH ' + d.points[p.driverId] + ' PTS';
    });
    if (humanWin >= 0) {
      Game.set(new FinalScreen(true, 'CHAMPION!', [(d.players.length > 1 ? 'PLAYER ' + (humanWin + 1) + ' ' : '') + winner.name + ' RULES THE CIRCUIT!', ...lines]));
    } else {
      Game.set(new FinalScreen(false, 'SEASON OVER', [winner.name + ' TAKES THE TITLE', ...lines]));
    }
  },
};

const Game = {
  canvas: null, ctx: null, res: 1, screen: null, last: 0, touchUI: false,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    Input.init(this.canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.addEventListener('keydown', e => { if (e.code === 'KeyM') SFX.toggleMute(); });
    this.set(new TitleScreen());
    requestAnimationFrame(t => this.frame(t));
  },

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Whole-number resolution keeps the 2x pixel upscale even (no mixed-width pixels).
    this.res = r.width * dpr / VIEW_W >= 1.5 ? 2 : 1;
    this.canvas.width = VIEW_W * this.res;
    this.canvas.height = VIEW_H * this.res;
  },

  set(screen) {
    if (screen instanceof TitleScreen) Champ.active = false;
    this.screen = screen;
    if (screen.enter) screen.enter();
    this.updateTouchUI();
  },

  // On-screen buttons show during races on touch screens, unless a controller is connected.
  updateTouchUI() {
    const want = !!(this.screen && this.screen.isRace) && Input.padCount === 0 && window.matchMedia('(pointer: coarse)').matches;
    if (want === this.touchUI && this._touchInit) return;
    this._touchInit = true;
    this.touchUI = want;
    const touch = document.getElementById('touch');
    if (touch) touch.hidden = !want;
  },

  frame(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    Input.poll();
    this.updateTouchUI();
    const screen = this.screen;
    screen.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(this.res, 0, 0, this.res, 0, 0);
    ctx.imageSmoothingEnabled = true;
    this.screen.draw(ctx);
    this.drawToasts(ctx, dt);
    Input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  },
};

Game.drawToasts = function (ctx, dt) {
  const list = Input.toasts;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].life -= dt;
    if (list[i].life <= 0) list.splice(i, 1);
  }
  list.forEach((t, i) => {
    const w = textWidth(t.msg, 14) + 24, x = VIEW_W / 2 - w / 2, y = VIEW_H - 64 - i * 30;
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.fillStyle = 'rgba(8,10,30,0.88)'; ctx.fillRect(x, y, w, 26);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y + 24, w, 2);
    text(ctx, t.msg, VIEW_W / 2, y + 6, 14, '#ffd23f', 'center');
    ctx.globalAlpha = 1;
  });
};

window.addEventListener('load', () => Game.init());
