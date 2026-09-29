'use strict';
// Vehicle state and arcade top-down physics.

const CAR_RADIUS = 15;

class Car {
  constructor(driver, opts = {}) {
    this.driver = driver;
    this.name = driver.name;
    this.human = !!opts.human;
    this.slot = opts.slot || null;          // 'solo' | 'p1' | 'p2'
    this.playerIndex = opts.playerIndex == null ? -1 : opts.playerIndex;
    this.upg = Object.assign({ engine: 0, tires: 0, armor: 0 }, opts.upgrades || {});
    this.speedMul = opts.speedMul || 1;     // AI difficulty / rubber band

    const st = driver.stats;
    this.maxSpeed = 300 + st.speed * 28 + this.upg.engine * 20;
    this.accel = 190 + st.accel * 45 + this.upg.engine * 14;
    this.turnRate = 2.35 + st.handling * 0.22 + this.upg.tires * 0.07;
    this.grip = 4.2 + st.handling * 0.9 + this.upg.tires * 0.9;
    this.maxHp = 60 + st.armor * 18 + this.upg.armor * 16;
    this.mass = 1 + st.armor * 0.12;

    this.hp = this.maxHp;
    this.ammo = WEAPONS[driver.special].ammo + (opts.bonusAmmo || 0);
    this.item = null;

    this.x = 0; this.y = 0; this.angle = 0; this.vx = 0; this.vy = 0;
    this.speed = 0; this.slip = 0; this.angVel = 0;

    this.idx = -1; this.s = 0; this.lat = 0; this.lap = 0; this.prevS = 0;
    this.surface = 0;
    this.finished = false; this.finishTime = 0; this.place = 0;
    this.maxLap = 0; this.lapStart = 0; this.bestLap = Infinity; this.lastLap = null;

    this.dead = false; this.respawnT = 0;
    this.boostT = 0; this.stunT = 0; this.frozenT = 0; this.spinT = 0; this.spinDir = 1;
    this.ramT = 0; this.invulnT = 0; this.flashT = 0; this.flameT = 0; this.flameTick = 0;
    this.fireCd = 0; this.oilCd = 0; this.padCd = 0; this.ramHitCd = 0; this.wallCd = 0;
    this.wrongWayT = 0;

    this.raceCash = 0; this.kos = 0;
    this.ctl = { steer: 0, throttle: 0, brake: 0, special: false, item: false };
    this.ai = null;
    this.rearL = null; this.rearR = null;
  }

  get alive() { return !this.dead; }
  get disabled() { return this.frozenT > 0 || this.spinT > 0 || this.stunT > 0; }
  get progress() { return this.lap * 1e6 + this.s; }

  placeAt(p) {
    this.x = p.x; this.y = p.y; this.angle = p.angle;
    this.vx = 0; this.vy = 0; this.speed = 0; this.slip = 0;
  }

  // Per-frame timers and actions (not substepped).
  tick(dt) {
    for (const k of ['boostT', 'stunT', 'frozenT', 'spinT', 'ramT', 'invulnT', 'flashT', 'fireCd', 'oilCd', 'padCd', 'ramHitCd', 'wallCd']) {
      if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    }
  }

  physics(dt, race) {
    if (this.dead) return;
    const theme = race.track.theme;
    const ctl = this.ctl;
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    let vf = this.vx * fx + this.vy * fy;
    let vr = -this.vx * fy + this.vy * fx;

    let maxSp = this.maxSpeed * this.speedMul;
    if (this.surface) maxSp *= theme.offSpeed;
    if (this.boostT > 0) maxSp *= 1.42;
    if (this.ramT > 0) maxSp *= 1.12;

    const canDrive = race.state !== 'countdown' && !this.disabled;
    let throttle = canDrive ? ctl.throttle : 0;
    const brake = canDrive ? ctl.brake : 0;
    const steer = canDrive ? ctl.steer : 0;
    if (this.boostT > 0 && canDrive && !brake) throttle = 1;

    const acc = this.accel * (this.boostT > 0 ? 2 : 1) * (this.surface ? 0.7 : 1);
    if (throttle > 0 && vf < maxSp) vf = Math.min(maxSp, vf + acc * throttle * dt);
    if (brake > 0) {
      if (vf > 15) vf -= 720 * dt;
      else if (vf > -maxSp * 0.38) vf -= acc * 0.7 * dt;
    }
    if (!throttle && !brake) {
      const d = (this.surface ? 260 : 130) * dt;
      vf = Math.abs(vf) < d ? 0 : vf - Math.sign(vf) * d;
    }
    if (vf > maxSp) vf -= Math.min(vf - maxSp, (this.surface ? 700 : 260) * dt);

    let g = this.grip * theme.grip * (this.surface ? 0.8 : 1);
    if (this.spinT > 0 || this.frozenT > 0) g *= 0.07;
    vr *= Math.exp(-g * dt);

    this.vx = fx * vf - fy * vr;
    this.vy = fy * vf + fx * vr;

    const spdF = clamp(Math.abs(vf) / 110, 0, 1);
    const hiDamp = 1 - 0.28 * clamp(Math.abs(vf) / this.maxSpeed, 0, 1);
    this.angVel = steer * this.turnRate * spdF * hiDamp * (vf < -5 ? -1 : 1);
    if (this.spinT > 0) this.angVel = this.spinDir * 10;
    if (this.frozenT > 0) this.angVel = 0;
    this.angle = wrapAngle(this.angle + this.angVel * dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.speed = vf;
    this.slip = vr;
  }

  respawn(race) {
    const tr = race.track;
    const s = this.s - 40;
    let lat = 0;
    // Nudge sideways off any car already at the respawn point.
    for (const o of race.cars) {
      if (o === this || o.dead) continue;
      const p = tr.pointAt(s, lat);
      if (Math.hypot(o.x - p.x, o.y - p.y) < 40) lat = lat <= 0 ? 40 : -40;
    }
    this.placeAt(tr.pointAt(s, lat));
    this.idx = -1;
    this.dead = false;
    this.hp = this.maxHp;
    this.invulnT = 2.2;
    this.boostT = this.stunT = this.frozenT = this.spinT = this.ramT = this.flameT = 0;
    this.rearL = this.rearR = null;
  }
}
