'use strict';
// A single race: simulation, weapons, pickups, effects, cameras and HUD.

class Race {
  // opts: { trackDef, humans: [{driver, slot, upgrades, bonusAmmo}], aiDrivers, aiLevel, attract }
  constructor(opts) {
    this.track = new Track(opts.trackDef);
    this.laps = opts.laps || this.track.laps;
    this.attract = !!opts.attract;
    this.cars = [];
    this.humans = [];
    this.projectiles = [];
    this.hazards = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.skids = [];
    this.finishOrder = [];
    this.time = 0;
    this.t = 0;
    this.state = this.attract ? 'racing' : 'countdown';
    this.countdown = 3.6;
    this.lastBeep = 4;
    this.endTimer = 0;
    this.done = false;
    this.messages = [];

    const lvl = opts.aiLevel || 0;
    const aiUpg = { engine: Math.min(4, Math.floor(lvl / 2)), tires: Math.min(4, Math.floor(lvl / 2)), armor: Math.min(4, Math.floor(lvl / 3)) };
    const aiCars = opts.aiDrivers.map(d => new Car(d, {
      upgrades: aiUpg, speedMul: 0.86 + lvl * 0.018 + rand(-0.015, 0.015), bonusAmmo: Math.floor(lvl / 2),
    }));
    const humanCars = (opts.humans || []).map((h, i) => new Car(h.driver, {
      human: true, slot: h.slot, playerIndex: i, upgrades: h.upgrades, bonusAmmo: h.bonusAmmo || 0,
    }));
    // Humans start mid-pack.
    const grid = shuffle(aiCars.slice());
    const humanStart = Math.min(4, grid.length);
    grid.splice(humanStart, 0, ...humanCars);
    grid.forEach((c, k) => {
      c.placeAt(this.track.gridSlot(k));
      const n = this.track.nearest(c.x, c.y);
      c.idx = n.i; c.s = n.s; c.prevS = n.s; c.lat = n.lat;
      c.lap = 0;
      this.cars.push(c);
    });
    this.humans = humanCars;
    this.baseSpeedMul = new Map(aiCars.map(c => [c, c.speedMul]));

    this.pickups = this.track.pickupSpots.map(p => ({ ...p, active: true, respawnT: 0 }));
    this.cams = (this.humans.length ? this.humans : [this.cars[0]]).map(c => ({ x: c.x, y: c.y, shake: 0, target: c }));
    this.sortPositions();
  }

  // --- Main update ------------------------------------------------------
  update(dt) {
    this.t += dt;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastBeep && n >= 1 && n <= 3) { SFX.play('beep'); this.lastBeep = n; }
      if (this.countdown <= 0) {
        this.state = 'racing';
        SFX.play('go');
        for (const c of this.cars) c.lapStart = 0;
      }
    } else {
      this.time += dt;
    }

    this.rubberBand();

    for (const c of this.cars) {
      if (c.human && !c.finished && !this.attract) c.ctl = Input.controls(c.slot);
      else c.ctl = aiControl(c, this, dt);
      c.tick(dt);
      this.carLogic(c, dt);
    }

    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      for (const c of this.cars) c.physics(h, this);
      for (const c of this.cars) this.wallCollide(c);
      this.carCollisions();
    }

    for (const c of this.cars) this.updateProgress(c);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.sortPositions();
    this.updateCameras(dt);
    this.updateEngines();

    if (this.state === 'finished') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.done = true;
    }
  }

  rubberBand() {
    if (!this.humans.length) return;
    const lead = Math.max(...this.humans.map(h => h.lap * this.track.length + h.s));
    for (const c of this.cars) {
      if (c.human) continue;
      const gap = (c.lap * this.track.length + c.s) - lead;
      const rb = clamp(1 - gap / 14000, 0.93, 1.07);
      c.speedMul = this.baseSpeedMul.get(c) * rb;
    }
  }

  carLogic(c, dt) {
    if (c.dead) {
      c.respawnT -= dt;
      if (c.respawnT <= 0) c.respawn(this);
      return;
    }
    if (this.state === 'countdown') return;
    const ctl = c.ctl;
    const canAct = !c.frozenT && !c.stunT;
    if (ctl.special && canAct && c.ammo > 0 && c.fireCd <= 0) {
      this.fire(c, c.driver.special);
      c.ammo--;
      c.fireCd = WEAPONS[c.driver.special].cd;
    } else if (ctl.special && c.human && c.ammo <= 0) {
      if (c.fireCd <= 0) { SFX.play('deny', 0.5); c.fireCd = 0.4; }
    }
    if (ctl.item && canAct && c.item) {
      this.fire(c, c.item);
      c.item = null;
    }

    // Flamethrower stream.
    if (c.flameT > 0) {
      c.flameT -= dt;
      c.flameTick -= dt;
      while (c.flameTick <= 0) {
        c.flameTick += 0.035;
        const a = c.angle + rand(-0.22, 0.22);
        const nose = BODY[c.driver.body].len / 2;
        const sp = 430 + Math.max(0, c.speed);
        this.projectiles.push({
          type: 'fire', owner: c, x: c.x + Math.cos(c.angle) * nose, y: c.y + Math.sin(c.angle) * nose,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.38, age: 0, r: 12, idx: c.idx,
        });
      }
    }

    // Surface effects.
    if (c.surface && this.track.theme.offDamage) this.damage(c, this.track.theme.offDamage * dt, null, true);

    // Boost pads.
    for (const b of this.track.boosts) {
      const dx = c.x - b.x, dy = c.y - b.y;
      const u = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
      const v = -dx * Math.sin(b.angle) + dy * Math.cos(b.angle);
      if (Math.abs(u) < b.len / 2 + 6 && Math.abs(v) < b.wid / 2 + 6) {
        if (c.padCd <= 0 && c.human) SFX.play('boost');
        c.boostT = Math.max(c.boostT, 1.1);
        c.padCd = 0.5;
      }
    }

    // Exhaust / smoke / skid marks.
    if (c.boostT > 0 && Math.random() < 0.6) {
      const bx = c.x - Math.cos(c.angle) * 22, by = c.y - Math.sin(c.angle) * 22;
      this.particle(bx, by, rand(-30, 30) - c.vx * 0.2, rand(-30, 30) - c.vy * 0.2, 0.35, 5, choice(['#ffb030', '#ff6a1a', '#ffe070']), 'fire');
    }
    if (c.hp < c.maxHp * 0.35 && Math.random() < 0.3) {
      this.particle(c.x + rand(-6, 6), c.y + rand(-6, 6), rand(-15, 15), rand(-40, -10), 0.9, rand(5, 9), '#444', 'smoke');
    }
    const sliding = Math.abs(c.slip) > 95 || c.spinT > 0 || (c.ctl.brake && c.speed > 180);
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    const hl = BODY[c.driver.body].len / 2 - 6, hw = BODY[c.driver.body].wid / 2 - 1;
    const rl = { x: c.x - fx * hl + fy * hw, y: c.y - fy * hl - fx * hw };
    const rr = { x: c.x - fx * hl - fy * hw, y: c.y - fy * hl + fx * hw };
    if (sliding && c.rearL && !c.surface) {
      this.addSkid(c.rearL, rl);
      this.addSkid(c.rearR, rr);
      if (Math.random() < 0.25) this.particle(rl.x, rl.y, rand(-10, 10), rand(-10, 10), 0.6, 6, 'rgba(220,220,220,0.6)', 'smoke');
    }
    if (c.surface && Math.abs(c.speed) > 120 && Math.random() < 0.35) {
      this.particle(rl.x, rl.y, rand(-20, 20), rand(-20, 20), 0.5, 5, this.track.theme.shoulder, 'dust');
    }
    c.rearL = rl; c.rearR = rr;

    // Wrong-way detection.
    const tx = this.track.tx[c.idx], ty = this.track.ty[c.idx];
    if (c.vx * tx + c.vy * ty < -60) c.wrongWayT += dt; else c.wrongWayT = 0;
  }

  addSkid(a, b) {
    this.skids.push(a.x, a.y, b.x, b.y);
    if (this.skids.length > 4800) this.skids.splice(0, 400);
  }

  wallCollide(c) {
    if (c.dead) return;
    const tr = this.track;
    const n = tr.nearest(c.x, c.y, c.idx);
    c.idx = n.i; c.s = n.s; c.lat = n.lat;
    c.surface = Math.abs(n.lat) > tr.halfW + 6 ? 1 : 0;
    const lim = tr.wallOff - CAR_RADIUS + 4;
    if (Math.abs(n.lat) > lim) {
      const sgn = Math.sign(n.lat);
      c.x -= n.nx * (n.lat - sgn * lim);
      c.y -= n.ny * (n.lat - sgn * lim);
      const vn = c.vx * n.nx + c.vy * n.ny;
      if (vn * sgn > 0) {
        c.vx -= 1.45 * vn * n.nx; c.vy -= 1.45 * vn * n.ny;
        c.vx *= 0.9; c.vy *= 0.9;
        const impact = Math.abs(vn);
        if (impact > 60 && c.wallCd <= 0) {
          c.wallCd = 0.25;
          if (impact > 220) this.damage(c, (impact - 220) * 0.035, null, true);
          if (c.human) {
            SFX.play(impact > 200 ? 'bump' : 'scrape', 0.8);
            this.shake(c, Math.min(8, impact / 50));
          }
          for (let k = 0; k < 5; k++) this.particle(c.x + n.nx * sgn * 12, c.y + n.ny * sgn * 12, rand(-120, 120), rand(-120, 120), 0.25, 2, '#ffe070', 'spark');
        }
      }
    }
  }

  carCollisions() {
    const cars = this.cars;
    const R = CAR_RADIUS * 2;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const overlap = R - d;
        const ma = a.mass * (a.ramT > 0 ? 4 : 1), mb = b.mass * (b.ramT > 0 ? 4 : 1);
        const ia = 1 / ma, ib = 1 / mb, sum = ia + ib;
        a.x -= nx * overlap * ia / sum; a.y -= ny * overlap * ia / sum;
        b.x += nx * overlap * ib / sum; b.y += ny * overlap * ib / sum;
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vrel >= 0) continue;
        const jImp = -(1 + 0.45) * vrel / sum;
        a.vx -= jImp * ia * nx; a.vy -= jImp * ia * ny;
        b.vx += jImp * ib * nx; b.vy += jImp * ib * ny;
        const impact = -vrel;
        if (a.ramT > 0 && b.ramT <= 0) this.ramHit(a, b, nx, ny);
        else if (b.ramT > 0 && a.ramT <= 0) this.ramHit(b, a, -nx, -ny);
        else if (impact > 170) {
          const dmg = (impact - 170) * 0.03;
          this.damage(a, dmg * mb / ma, b, true);
          this.damage(b, dmg * ma / mb, a, true);
        }
        if (impact > 90 && (a.human || b.human)) {
          SFX.play('bump', Math.min(1, impact / 300));
          if (a.human) this.shake(a, Math.min(6, impact / 60));
          if (b.human) this.shake(b, Math.min(6, impact / 60));
        }
        if (impact > 120) {
          for (let k = 0; k < 4; k++) this.particle((a.x + b.x) / 2, (a.y + b.y) / 2, rand(-150, 150), rand(-150, 150), 0.25, 2, '#ffe070', 'spark');
        }
      }
    }
  }

  ramHit(att, vic, nx, ny) {
    if (vic.ramHitCd > 0) return;
    vic.ramHitCd = 0.6;
    vic.vx += nx * 380; vic.vy += ny * 380;
    vic.spinT = Math.max(vic.spinT, 0.5); vic.spinDir = Math.random() < 0.5 ? -1 : 1;
    this.damage(vic, 26, att);
    this.explosion((att.x + vic.x) / 2, (att.y + vic.y) / 2, 0.5);
    if (att.human || vic.human) SFX.play('explode', 0.6);
  }

  updateProgress(c) {
    if (c.dead) return;
    const L = this.track.length;
    if (c.prevS > L * 0.75 && c.s < L * 0.25) {
      c.lap++;
      if (c.lap >= 2 && !c.finished) {
        const lt = this.time - c.lapStart;
        if (lt < c.bestLap) c.bestLap = lt;
      }
      c.lapStart = this.time;
      if (c.lap > this.laps && !c.finished) this.finishCar(c);
      else if (c.human && c.lap > 1 && !this.attract) {
        SFX.play('lap');
        this.message(c, c.lap === this.laps ? 'FINAL LAP!' : 'LAP ' + c.lap, '#ffe066');
      }
    } else if (c.prevS < L * 0.25 && c.s > L * 0.75) {
      c.lap--;
    }
    c.prevS = c.s;
  }

  finishCar(c) {
    c.finished = true;
    c.finishTime = this.time;
    this.finishOrder.push(c);
    if (c.human) {
      SFX.play('finish');
      const place = this.finishOrder.length;
      this.message(c, 'FINISHED ' + ordinal(place) + '!', place <= QUALIFY_PLACE ? '#7dff7a' : '#ff8a5a', 4);
    }
    if (this.humans.length && this.humans.every(h => h.finished) && this.state !== 'finished') {
      this.state = 'finished';
      this.endTimer = 3.5;
    }
  }

  sortPositions() {
    const L = this.track.length;
    const key = c => c.finished ? 1e12 - this.finishOrder.indexOf(c) : c.lap * L + c.s;
    const sorted = this.cars.slice().sort((a, b) => key(b) - key(a));
    sorted.forEach((c, i) => { c.place = i + 1; });
    this.standings = sorted;
  }

  results() {
    return this.standings.map(c => ({
      driver: c.driver, human: c.human, playerIndex: c.playerIndex, place: c.place,
      time: c.finished ? c.finishTime : null, bestLap: c.bestLap, kos: c.kos, raceCash: c.raceCash,
    }));
  }

  // --- Weapons ------------------------------------------------------------
  // Nearest car inside a forward cone from `src` (anything with x, y, angle).
  findTarget(src, cone, range, exclude = src) {
    let best = null, bd = range;
    const fx = Math.cos(src.angle), fy = Math.sin(src.angle);
    for (const o of this.cars) {
      if (o === exclude || o.dead) continue;
      const dx = o.x - src.x, dy = o.y - src.y;
      const d = Math.hypot(dx, dy);
      if (d > bd || d < 1) continue;
      const dot = (dx * fx + dy * fy) / d;
      if (dot < Math.cos(cone)) continue;
      best = o; bd = d;
    }
    return best;
  }

  fire(c, type) {
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    const nose = BODY[c.driver.body].len / 2 + 6;
    const vol = c.human ? 1 : this.nearHumanVolume(c);
    switch (type) {
      case 'missile': {
        const sp = 640 + Math.max(0, c.speed) * 0.5;
        this.projectiles.push({
          type: 'missile', owner: c, x: c.x + fx * nose, y: c.y + fy * nose, vx: fx * sp, vy: fy * sp, sp,
          angle: c.angle, life: 3, age: 0, r: 14, target: this.findTarget(c, 0.6, 900), idx: c.idx,
        });
        SFX.play('missile', vol);
        break;
      }
      case 'freeze': {
        const sp = 880 + Math.max(0, c.speed) * 0.4;
        this.projectiles.push({ type: 'freeze', owner: c, x: c.x + fx * nose, y: c.y + fy * nose, vx: fx * sp, vy: fy * sp, angle: c.angle, life: 1.1, age: 0, r: 14, idx: c.idx });
        SFX.play('freeze', vol);
        break;
      }
      case 'flame':
        c.flameT = 0.65; c.flameTick = 0;
        SFX.play('flame', vol);
        break;
      case 'emp': {
        this.rings.push({ x: c.x, y: c.y, r: 10, max: 190, life: 0.45, age: 0, color: '#8ff3ff', follow: c });
        for (const o of this.cars) {
          if (o === c || o.dead) continue;
          const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy);
          if (d > 190) continue;
          if (o.ramT > 0 || o.invulnT > 0) continue;
          o.stunT = Math.max(o.stunT, 1.3);
          o.vx += dx / (d || 1) * 220; o.vy += dy / (d || 1) * 220;
          this.damage(o, 14, c);
          if (o.human) SFX.play('shock');
        }
        SFX.play('emp', vol);
        break;
      }
      case 'oil': case 'mine': {
        const back = BODY[c.driver.body].len / 2 + 14;
        const x = c.x - fx * back, y = c.y - fy * back;
        const n = this.track.nearest(x, y, c.idx);
        this.hazards.push({ type, owner: c, x, y, s: n.s, lat: n.lat, age: 0, life: type === 'oil' ? 22 : 45, r: type === 'oil' ? 34 : 18, rot: rand(0, TAU) });
        SFX.play(type === 'oil' ? 'oil' : 'drop', vol);
        break;
      }
      case 'nitro':
        c.boostT = Math.max(c.boostT, 2.4);
        SFX.play('nitro', vol);
        break;
      case 'ram':
        c.ramT = 4;
        SFX.play('ram', vol);
        break;
      case 'repair':
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.5);
        break;
    }
  }

  nearHumanVolume(c) {
    let d = Infinity;
    for (const h of this.humans) d = Math.min(d, Math.hypot(h.x - c.x, h.y - c.y));
    if (this.attract) return 0;
    return d < 250 ? 0.8 : d < 600 ? 0.35 : 0;
  }

  damage(c, amt, attacker, silent) {
    if (c.dead || c.invulnT > 0 || c.ramT > 0 || amt <= 0) return;
    if (this.state === 'countdown') return;
    c.hp -= amt;
    if (!silent || amt > 4) c.flashT = 0.12;
    if (c.human && amt > 3) this.shake(c, Math.min(10, amt / 3));
    if (c.hp <= 0) this.destroy(c, attacker);
  }

  destroy(c, attacker) {
    c.hp = 0;
    c.dead = true;
    c.respawnT = 2.2;
    c.vx = c.vy = 0;
    this.explosion(c.x, c.y, 1.4);
    SFX.play('bigexplode', c.human ? 1 : Math.max(0.3, this.nearHumanVolume(c)));
    if (c.human) { this.shake(c, 16); this.message(c, 'WRECKED!', '#ff5a3a', 2); }
    if (attacker && attacker !== c) {
      attacker.kos++;
      attacker.raceCash += KO_BONUS;
      if (attacker.human) {
        this.floatText(attacker.x, attacker.y - 30, 'K.O. +' + fmtMoney(KO_BONUS), '#ffe066');
        SFX.play('cash');
      }
    }
  }

  explosion(x, y, scale = 1) {
    this.rings.push({ x, y, r: 6, max: 70 * scale, life: 0.35, age: 0, color: '#ffd060' });
    for (let k = 0; k < 26 * scale; k++) {
      const a = rand(0, TAU), sp = rand(40, 260) * scale;
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.7), rand(4, 10) * scale, choice(['#ffdd55', '#ff8a1a', '#ff4a1a', '#fff2b0']), 'fire');
    }
    for (let k = 0; k < 14 * scale; k++) {
      const a = rand(0, TAU), sp = rand(20, 90);
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.8, 1.6), rand(8, 16) * scale, '#3a3a3a', 'smoke');
    }
    for (let k = 0; k < 8 * scale; k++) {
      const a = rand(0, TAU), sp = rand(150, 320);
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 0.8), 3, '#222', 'debris');
    }
    for (const cam of this.cams) {
      const d = Math.hypot(cam.x - x, cam.y - y);
      if (d < 500) cam.shake = Math.max(cam.shake, (1 - d / 500) * 8 * scale);
    }
  }

  updateProjectiles(dt) {
    const tr = this.track;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt; p.life -= dt;
      if (p.type === 'missile') {
        if (p.target && (p.target.dead)) p.target = null;
        if (!p.target && p.age > 0.2) {
          p.target = this.findTarget(p, 0.8, 700, p.owner);
        }
        if (p.target) {
          const want = Math.atan2(p.target.y - p.y, p.target.x - p.x);
          const d = wrapAngle(want - p.angle);
          p.angle += clamp(d, -3.4 * dt, 3.4 * dt);
        } else {
          // Follow the road when nothing to chase.
          const ahead = tr.pointAt(tr.nearest(p.x, p.y, p.idx).s + 160);
          const d = wrapAngle(Math.atan2(ahead.y - p.y, ahead.x - p.x) - p.angle);
          p.angle += clamp(d, -2.2 * dt, 2.2 * dt);
        }
        p.vx = Math.cos(p.angle) * p.sp; p.vy = Math.sin(p.angle) * p.sp;
        if (Math.random() < 0.9) this.particle(p.x - p.vx * 0.02, p.y - p.vy * 0.02, rand(-20, 20), rand(-20, 20), 0.5, rand(4, 7), 'rgba(200,200,200,0.7)', 'smoke');
      } else if (p.type === 'fire') {
        p.vx *= 1 - 1.5 * dt; p.vy *= 1 - 1.5 * dt;
        p.r = 10 + p.age * 40;
      } else if (p.type === 'freeze') {
        if (Math.random() < 0.8) this.particle(p.x, p.y, rand(-30, 30), rand(-30, 30), 0.35, 3, choice(['#bfefff', '#ffffff', '#7fd8ff']), 'spark');
      }
      p.x += p.vx * dt; p.y += p.vy * dt;

      const n = tr.nearest(p.x, p.y, p.idx);
      p.idx = n.i;
      let hit = null;
      for (const c of this.cars) {
        if (c.dead) continue;
        if (c === p.owner && p.age < 0.6) continue;
        if (p.type === 'fire' && c === p.owner) continue;
        const rr = p.r + CAR_RADIUS;
        if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < rr * rr) { hit = c; break; }
      }
      const offTrack = Math.abs(n.lat) > tr.wallOff + 4;
      if (hit) {
        this.projectileHit(p, hit);
        if (p.type !== 'fire') { this.projectiles.splice(i, 1); continue; }
        else p.hitSet = (p.hitSet || new Set()).add(hit);
      }
      if (offTrack || p.life <= 0) {
        if (p.type === 'missile') { this.explosion(p.x, p.y, 0.6); SFX.play('explode', this.nearHumanVolume(p) * 0.8); }
        this.projectiles.splice(i, 1);
      }
    }
  }

  projectileHit(p, c) {
    switch (p.type) {
      case 'missile':
        c.vx += p.vx * 0.35; c.vy += p.vy * 0.35;
        c.spinT = Math.max(c.spinT, 0.45); c.spinDir = Math.random() < 0.5 ? -1 : 1;
        this.damage(c, 30, p.owner);
        this.explosion(p.x, p.y, 0.8);
        SFX.play('explode', Math.max(c.human ? 1 : 0, this.nearHumanVolume(c)));
        break;
      case 'freeze':
        if (c.ramT <= 0 && c.invulnT <= 0) {
          c.frozenT = 1.7;
          if (c.human || p.owner.human) SFX.play('frozen');
        }
        this.damage(c, 8, p.owner);
        for (let k = 0; k < 14; k++) this.particle(c.x, c.y, rand(-120, 120), rand(-120, 120), 0.5, 3, choice(['#bfefff', '#ffffff']), 'spark');
        break;
      case 'fire':
        if (p.hitSet && p.hitSet.has(c)) return;
        this.damage(c, 3.2, p.owner, true);
        if (Math.random() < 0.5) this.particle(c.x, c.y, rand(-40, 40), rand(-40, 40), 0.4, 6, '#ff8a1a', 'fire');
        break;
    }
  }

  updateHazards(dt) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.age += dt; h.life -= dt;
      if (h.life <= 0) { this.hazards.splice(i, 1); continue; }
      for (const c of this.cars) {
        if (c.dead) continue;
        const d = Math.hypot(c.x - h.x, c.y - h.y);
        if (h.type === 'oil') {
          if (d < h.r + 6 && c.oilCd <= 0 && c.ramT <= 0 && !(c === h.owner && h.age < 1.5)) {
            c.spinT = 0.9; c.spinDir = Math.random() < 0.5 ? -1 : 1; c.oilCd = 1.6;
            c.vx *= 0.8; c.vy *= 0.8;
            if (c.human) SFX.play('spin');
          }
        } else if (h.type === 'mine') {
          if (h.age < 0.7) continue;
          if (d < h.r + CAR_RADIUS) {
            c.vx *= 0.3; c.vy *= 0.3;
            c.spinT = Math.max(c.spinT, 0.6); c.spinDir = Math.random() < 0.5 ? -1 : 1;
            this.damage(c, 32, h.owner === c ? null : h.owner);
            this.explosion(h.x, h.y, 0.9);
            SFX.play('explode', Math.max(c.human ? 1 : 0, this.nearHumanVolume(c)));
            this.hazards.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      if (!p.active) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) p.active = true;
        continue;
      }
      for (const c of this.cars) {
        if (c.dead) continue;
        if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 > 28 * 28) continue;
        p.active = false; p.respawnT = 7;
        let it = weightedChoice(ITEM_TABLE);
        if (c.item && it !== 'repair' && it !== 'cash') it = Math.random() < 0.5 ? 'cash' : 'repair';
        if (it === 'repair' && c.hp >= c.maxHp) it = 'cash';
        if (it === 'repair') {
          c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.5);
          if (c.human) { SFX.play('repair'); this.floatText(c.x, c.y - 30, 'REPAIR!', '#7dff7a'); }
        } else if (it === 'cash') {
          const amt = 250 * randInt(1, 3);
          c.raceCash += amt;
          if (c.human) { SFX.play('cash'); this.floatText(c.x, c.y - 30, '+' + fmtMoney(amt), '#ffe066'); }
        } else {
          c.item = it;
          if (c.human) { SFX.play('pickup'); this.floatText(c.x, c.y - 30, WEAPONS[it].name, '#8ff3ff'); }
        }
        for (let k = 0; k < 10; k++) this.particle(p.x, p.y, rand(-100, 100), rand(-100, 100), 0.4, 3, choice(['#ffe066', '#ffffff', '#ff9a2f']), 'spark');
        break;
      }
    }
  }

  // --- Effects --------------------------------------------------------------
  particle(x, y, vx, vy, life, size, color, kind) {
    if (this.particles.length > 900) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, max: life, size, color, kind });
  }
  floatText(x, y, str, color) { this.texts.push({ x, y, str, color, life: 1.3 }); }
  message(car, str, color, dur = 1.8) { this.messages.push({ car, str, color, life: dur, max: dur }); }
  shake(car, amt) {
    const cam = this.cams.find(c => c.target === car);
    if (cam) cam.shake = Math.max(cam.shake, amt);
  }

  updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      const drag = p.kind === 'smoke' ? 2 : p.kind === 'debris' ? 3 : 4;
      p.vx *= 1 - drag * dt; p.vy *= 1 - drag * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += 12 * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.follow) { r.x = r.follow.x; r.y = r.follow.y; }
      if (r.age >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.y -= 30 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.messages.length - 1; i >= 0; i--) {
      this.messages[i].life -= dt;
      if (this.messages[i].life <= 0) this.messages.splice(i, 1);
    }
  }

  updateCameras(dt) {
    for (const cam of this.cams) {
      const c = cam.target;
      const tx = c.x + c.vx * 0.38, ty = c.y + c.vy * 0.38;
      const k = 1 - Math.exp(-6 * dt);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
      cam.shake = Math.max(0, cam.shake - 30 * dt);
    }
  }

  updateEngines() {
    if (this.attract) return;
    this.humans.forEach((c, i) => {
      const rpm = c.dead ? 0 : clamp(Math.abs(c.speed) / c.maxSpeed, 0, 1.4) + (c.ctl.throttle && this.state === 'countdown' ? 0.4 : 0);
      SFX.engine(i, !c.dead, rpm);
    });
  }

  // --- Drawing -------------------------------------------------------------
  draw(ctx) {
    const n = this.cams.length;
    const zoom = n > 1 ? 0.72 : 0.9;
    const vps = n > 1
      ? [{ x: 0, y: 0, w: VIEW_W / 2 - 2, h: VIEW_H }, { x: VIEW_W / 2 + 2, y: 0, w: VIEW_W / 2 - 2, h: VIEW_H }]
      : [{ x: 0, y: 0, w: VIEW_W, h: VIEW_H }];
    for (let i = 0; i < n; i++) this.drawView(ctx, this.cams[i], vps[i], zoom);
    if (n > 1) { ctx.fillStyle = '#000'; ctx.fillRect(VIEW_W / 2 - 2, 0, 4, VIEW_H); }
    if (!this.attract) for (let i = 0; i < n; i++) this.drawHud(ctx, this.cams[i].target, vps[i], n > 1);
  }

  drawView(ctx, cam, vp, zoom) {
    const tr = this.track;
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
    const sx = cam.shake ? rand(-cam.shake, cam.shake) : 0, sy = cam.shake ? rand(-cam.shake, cam.shake) : 0;
    ctx.translate(vp.x + vp.w / 2, vp.y + vp.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x + sx, -cam.y + sy);
    const hw = vp.w / 2 / zoom + 20, hh = vp.h / 2 / zoom + 20;
    const view = { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
    const inView = (x, y, m = 60) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;

    drawTrackSurface(ctx, tr, view, this.t);

    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    const sk = this.skids;
    for (let i = 0; i < sk.length; i += 4) {
      if (!inView(sk[i], sk[i + 1])) continue;
      ctx.moveTo(sk[i], sk[i + 1]); ctx.lineTo(sk[i + 2], sk[i + 3]);
    }
    ctx.stroke();

    // Hazards.
    for (const h of this.hazards) {
      if (!inView(h.x, h.y)) continue;
      const fade = Math.min(1, h.life / 2);
      if (h.type === 'oil') {
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot); ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = '#0b0b0b';
        ctx.beginPath(); ctx.ellipse(0, 0, h.r, h.r * 0.7, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(h.r * 0.5, h.r * 0.3, h.r * 0.5, h.r * 0.4, 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(120,80,255,0.35)'; ctx.beginPath(); ctx.ellipse(-h.r * 0.2, -h.r * 0.2, h.r * 0.4, h.r * 0.15, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(80,255,200,0.25)'; ctx.beginPath(); ctx.ellipse(h.r * 0.1, h.r * 0.15, h.r * 0.3, h.r * 0.1, -0.3, 0, TAU); ctx.fill();
        ctx.restore();
      } else {
        drawIcon(ctx, 'mine', h.x, h.y, 26);
        if (h.age > 0.7 && Math.floor(this.t * 4) % 2) {
          ctx.fillStyle = '#ff2020'; ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, TAU); ctx.fill();
        }
      }
    }

    // Pickups (floating crates).
    for (const p of this.pickups) {
      if (!p.active || !inView(p.x, p.y)) continue;
      const bob = Math.sin(this.t * 4 + p.s) * 2;
      ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(Math.sin(this.t * 2 + p.lat) * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-10, -7, 22, 22);
      ctx.fillStyle = '#c8872e'; ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeStyle = '#6b4414'; ctx.lineWidth = 2; ctx.strokeRect(-12, -12, 24, 24);
      ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(12, 12); ctx.moveTo(12, -12); ctx.lineTo(-12, 12); ctx.stroke();
      ctx.fillStyle = '#ffe066'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', 1, 1);
      ctx.restore();
    }

    // Cars.
    for (const c of this.cars) {
      if (c.dead || !inView(c.x, c.y)) continue;
      const blink = c.invulnT > 0 && Math.floor(this.t * 12) % 2 === 0;
      drawCar(ctx, c.driver, c.x, c.y, c.angle, {
        alpha: blink ? 0.4 : 1, boost: c.boostT > 0, frozen: c.frozenT > 0, flash: c.flashT > 0,
        ram: c.ramT > 0, stun: c.stunT > 0,
      });
    }
    // Wreck scorch for dead cars.
    for (const c of this.cars) {
      if (!c.dead || !inView(c.x, c.y)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 24, 16, c.angle, 0, TAU); ctx.fill();
    }

    // Projectiles.
    for (const p of this.projectiles) {
      if (!inView(p.x, p.y)) continue;
      if (p.type === 'missile') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.fillStyle = '#ffcf40'; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-16 - Math.random() * 8, 0); ctx.lineTo(-8, 3); ctx.fill();
        ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-8, -3, 14, 6);
        ctx.fillStyle = '#e23'; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3); ctx.fill();
        ctx.fillRect(-8, -6, 4, 12);
        ctx.restore();
      } else if (p.type === 'freeze') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.fillStyle = 'rgba(140,220,255,0.5)'; ctx.beginPath(); ctx.ellipse(-6, 0, 18, 7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (p.type === 'fire') {
        const k = p.age / (p.age + p.life);
        ctx.fillStyle = k < 0.3 ? 'rgba(255,240,160,0.9)' : k < 0.6 ? 'rgba(255,150,40,0.8)' : 'rgba(200,60,20,0.6)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, 0, TAU); ctx.fill();
      }
    }

    // Particles.
    for (const p of this.particles) {
      if (!inView(p.x, p.y, 20)) continue;
      const a = p.life / p.max;
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.5 : Math.min(1, a * 1.5);
      ctx.fillStyle = p.color;
      if (p.kind === 'smoke' || p.kind === 'fire' || p.kind === 'dust') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === 'fire' ? a : 1), 0, TAU); ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    // Shockwave rings.
    for (const r of this.rings) {
      const k = r.age / r.life;
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawSceneryInView(ctx, tr, view, this.t);

    // Player markers.
    if (this.humans.length > 1) {
      for (const c of this.humans) {
        if (c.dead || !inView(c.x, c.y)) continue;
        const col = c.playerIndex === 0 ? '#ffe066' : '#7af0ff';
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(c.x - 6, c.y - 34); ctx.lineTo(c.x + 6, c.y - 34); ctx.lineTo(c.x, c.y - 26); ctx.fill();
        text(ctx, 'P' + (c.playerIndex + 1), c.x, c.y - 46, 8, col, 'center');
      }
    }

    for (const t of this.texts) {
      if (!inView(t.x, t.y)) continue;
      ctx.globalAlpha = Math.min(1, t.life * 2);
      text(ctx, t.str, t.x, t.y, 10, t.color, 'center');
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    if (tr.theme.night) {
      const g = ctx.createRadialGradient(vp.x + vp.w / 2, vp.y + vp.h / 2, vp.h * 0.25, vp.x + vp.w / 2, vp.y + vp.h / 2, vp.w * 0.75);
      g.addColorStop(0, 'rgba(10,0,40,0)'); g.addColorStop(1, 'rgba(10,0,40,0.45)');
      ctx.fillStyle = g; ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    }
  }

  drawHud(ctx, car, vp, split) {
    const x0 = vp.x, y0 = vp.y, w = vp.w, h = vp.h;
    const pad = 12;

    // Position + lap.
    const placeStr = ordinal(car.place);
    const placeCol = car.place <= QUALIFY_PLACE ? '#ffe066' : '#ff8a5a';
    text(ctx, placeStr, x0 + pad, y0 + pad, split ? 22 : 30, placeCol, 'left', '#000');
    text(ctx, '/' + this.cars.length, x0 + pad + (split ? 22 : 30) * placeStr.length + 4, y0 + pad + (split ? 10 : 14), 12, '#fff');
    const lapShown = clamp(car.lap, 1, this.laps);
    text(ctx, 'LAP ' + lapShown + '/' + this.laps, x0 + pad, y0 + pad + (split ? 30 : 40), 12, '#fff');

    // Time & cash.
    text(ctx, fmtTime(this.time), x0 + w - pad, y0 + pad, 12, '#fff', 'right');
    text(ctx, fmtMoney(car.raceCash), x0 + w - pad, y0 + pad + 20, 10, '#9fe39f', 'right');
    if (isFinite(car.bestLap)) text(ctx, 'BEST ' + fmtTime(car.bestLap), x0 + w - pad, y0 + pad + 36, 8, '#bbb', 'right');

    // Armor bar.
    // With on-screen touch buttons, the bottom corners are covered, so dock the HUD at the top.
    const touchUI = Game.touchUI;
    const bw = split ? 150 : 200, bx = x0 + pad, by = touchUI ? y0 + 110 : y0 + h - pad - 60;
    text(ctx, 'ARMOR', bx, by - 14, 8, '#fff');
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
    const hpK = clamp(car.hp / car.maxHp, 0, 1);
    ctx.fillStyle = hpK > 0.5 ? '#3ad65a' : hpK > 0.25 ? '#f2c318' : (Math.floor(this.t * 6) % 2 ? '#ff3030' : '#a01010');
    ctx.fillRect(bx, by, bw * hpK, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx, by, bw * hpK, 3);

    // Special + item boxes.
    const iy = by + 18;
    const box = (x, label, icon, count, dim) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, iy, 36, 36);
      ctx.strokeStyle = dim ? '#555' : '#ffe066'; ctx.lineWidth = 2; ctx.strokeRect(x, iy, 36, 36);
      if (icon) { ctx.globalAlpha = dim ? 0.35 : 1; drawIcon(ctx, icon, x + 18, iy + 18, 24); ctx.globalAlpha = 1; }
      if (count != null) text(ctx, 'x' + count, x + 40, iy + 22, 10, dim ? '#888' : '#fff');
      text(ctx, label, x, iy - 10 + 48, 6, '#aaa');
    };
    box(bx, 'SPECIAL', car.driver.special, car.ammo, car.ammo <= 0);
    box(bx + (split ? 80 : 90), 'ITEM', car.item, null, !car.item);

    // Speed.
    if (!split && !touchUI) {
      const mph = Math.round(Math.abs(car.speed) * 0.42);
      text(ctx, String(mph).padStart(3, ' '), x0 + w / 2 + 20, y0 + h - pad - 26, 20, '#fff', 'right');
      text(ctx, 'MPH', x0 + w / 2 + 26, y0 + h - pad - 18, 8, '#aaa');
    }

    // Minimap.
    const mw = split ? 120 : 170, mh = split ? 100 : 130;
    const mx = x0 + w - mw - pad, my = touchUI ? y0 + 70 : y0 + h - mh - pad;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(mx, my, mw, mh);
    const mm = minimapImage(this.track, mw, mh);
    ctx.drawImage(mm.canvas, mx, my);
    for (const c of this.cars) {
      if (c.dead) continue;
      const px = mx + mm.tf.ox + c.x * mm.tf.sc, py = my + mm.tf.oy + c.y * mm.tf.sc;
      const me = c === car;
      ctx.fillStyle = c.driver.color;
      ctx.beginPath(); ctx.arc(px, py, me ? 5 : 3.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = me ? '#fff' : '#000'; ctx.lineWidth = me ? 2 : 1; ctx.stroke();
    }

    // Center messages.
    const cx = x0 + w / 2;
    if (this.state === 'countdown') {
      const n = Math.ceil(this.countdown);
      if (n <= 3 && n >= 1) {
        const k = this.countdown - Math.floor(this.countdown);
        text(ctx, String(n), cx, y0 + h * 0.3, Math.round(48 + k * 24), '#ffe066', 'center');
      } else {
        text(ctx, 'GET READY', cx, y0 + h * 0.3, 20, '#fff', 'center');
      }
    } else if (this.time < 1) {
      text(ctx, 'GO!', cx, y0 + h * 0.3, 56, '#7dff7a', 'center');
    }
    const msgs = this.messages.filter(m => m.car === car);
    msgs.forEach((m, i) => {
      ctx.globalAlpha = Math.min(1, m.life * 2);
      text(ctx, m.str, cx, y0 + h * 0.22 + i * 30, split ? 16 : 22, m.color, 'center');
    });
    ctx.globalAlpha = 1;
    if (car.wrongWayT > 1 && !car.finished && Math.floor(this.t * 3) % 2) {
      text(ctx, 'WRONG WAY!', cx, y0 + h * 0.4, split ? 16 : 24, '#ff4040', 'center');
    }
    if (car.dead) text(ctx, 'RESPAWNING...', cx, y0 + h * 0.45, 12, '#fff', 'center');
    if (car.frozenT > 0) text(ctx, 'FROZEN!', cx, y0 + h * 0.62, 12, '#bfefff', 'center');
    if (car.stunT > 0) text(ctx, 'SHOCKED!', cx, y0 + h * 0.62, 12, '#8ff3ff', 'center');
    if (car.finished) {
      text(ctx, ordinal(this.finishOrder.indexOf(car) + 1) + ' PLACE', cx, y0 + h * 0.4, split ? 18 : 26, car.place <= QUALIFY_PLACE ? '#7dff7a' : '#ff8a5a', 'center');
      if (this.state !== 'finished') text(ctx, 'WAITING FOR OTHER PLAYER', cx, y0 + h * 0.4 + 36, 8, '#fff', 'center');
    }
  }
}
