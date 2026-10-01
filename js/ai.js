'use strict';
// Computer-controlled drivers: racing line, pickups, hazard avoidance and weapons.

function aiControl(car, race, dt) {
  const tr = race.track, L = tr.length;
  const ai = car.ai || (car.ai = {
    lane: rand(-0.4, 0.4) * race.track.halfW, laneT: rand(1, 4), stuckT: 0, reverseT: 0,
    fireT: rand(1.5, 3.5), itemT: rand(1, 3), aggression: rand(0.7, 1.3) * (race.aggression || 1),
  });
  const spd = Math.hypot(car.vx, car.vy);

  ai.laneT -= dt;
  if (ai.laneT <= 0) { ai.lane = rand(-0.5, 0.5) * tr.halfW; ai.laneT = rand(2, 5); }
  let lane = ai.lane;

  // Grab crates ahead when empty-handed.
  if (!car.item) {
    let best = null, bestDs = 380;
    for (const p of race.pickups) {
      if (!p.active) continue;
      const ds = (p.s - car.s + L) % L;
      if (ds > 50 && ds < bestDs) { best = p; bestDs = ds; }
    }
    if (best) lane = best.lat;
  }

  // Steer around hazards and slower cars ahead.
  for (const h of race.hazards) {
    if (h.owner === car && h.age < 1) continue;
    const ds = (h.s - car.s + L) % L;
    if (ds > 0 && ds < 260 && Math.abs(h.lat - lane) < 48) lane = h.lat > 0 ? h.lat - 85 : h.lat + 85;
  }
  for (const o of race.cars) {
    if (o === car || o.dead) continue;
    const ds = (o.s - car.s + L) % L;
    if (ds > 10 && ds < 110 && Math.abs(o.lat - lane) < 32 && o.speed < car.speed) {
      lane = o.lat > 0 ? o.lat - 50 : o.lat + 50;
      break;
    }
  }
  lane = clamp(lane, -tr.halfW + 22, tr.halfW - 22);

  const look = 70 + spd * 0.42;
  const tgt = tr.pointAt(car.s + look, lane);
  const desired = Math.atan2(tgt.y - car.y, tgt.x - car.x);
  const diff = wrapAngle(desired - car.angle);
  let steer = clamp(diff * 3, -1, 1);

  const turn = tr.turnAheadAt(car.s + spd * 0.35);
  let target = car.maxSpeed * car.speedMul * (1 - clamp((turn - 0.35) * 0.42, 0, 0.45));
  if (tr.theme.grip < 0.8) target *= 0.93;
  if (Math.abs(diff) > 0.9) target *= 0.55;
  let throttle = spd < target ? 1 : 0;
  let brake = car.speed > target + 90 ? 1 : 0;

  // Unstick after wall hits.
  if (race.state === 'racing' && spd < 35 && !car.disabled) ai.stuckT += dt; else ai.stuckT = 0;
  if (ai.stuckT > 1.1) { ai.reverseT = 0.9; ai.stuckT = 0; }
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    throttle = 0; brake = 1; steer = -steer;
  }

  let special = false, item = false;
  if (race.state === 'racing') {
    ai.fireT -= dt;
    if (ai.fireT <= 0 && car.ammo > 0) {
      if (aiWantsFire(car, car.driver.special, race)) {
        special = true;
        ai.fireT = rand(2.5, 6) / ai.aggression;
      } else ai.fireT = 0.25;
    }
    ai.itemT -= dt;
    if (ai.itemT <= 0 && car.item) {
      if (aiWantsFire(car, car.item, race)) { item = true; ai.itemT = rand(1, 3); } else ai.itemT = 0.3;
    }
  }
  return { steer, throttle, brake, special, item };
}

function aiWantsFire(car, type, race) {
  const L = race.track.length;
  const behind = range => race.cars.some(o => {
    if (o === car || o.dead) return false;
    const ds = (car.s - o.s + L) % L;
    return ds > 20 && ds < range;
  });
  switch (type) {
    case 'missile': return !!race.findTarget(car, 0.5, 750);
    case 'freeze': return !!race.findTarget(car, 0.2, 650);
    case 'flame': return !!race.findTarget(car, 0.45, 170);
    case 'ram': return !!race.findTarget(car, 0.35, 220);
    case 'emp': return race.cars.filter(o => o !== car && !o.dead && Math.hypot(o.x - car.x, o.y - car.y) < 175).length >= 1;
    case 'oil': case 'mine': return behind(260);
    case 'nitro': return race.track.turnAheadAt(car.s) < 0.3 && car.speed > car.maxSpeed * 0.55;
  }
  return false;
}
