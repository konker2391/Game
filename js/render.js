'use strict';
// Procedural sprites: cars, weapon icons, scenery, track and minimap.

const BODY = {
  jeep:   { len: 36, wid: 22, cab: [0.05, 0.45], wheel: [10, 6], r: 4 },
  hotrod: { len: 38, wid: 18, cab: [0.0, 0.35], wheel: [11, 6], r: 5 },
  coupe:  { len: 38, wid: 20, cab: [0.2, 0.62], wheel: [9, 5], r: 8 },
  pickup: { len: 40, wid: 22, cab: [0.42, 0.7], wheel: [10, 6], r: 4 },
  rally:  { len: 34, wid: 20, cab: [0.2, 0.65], wheel: [9, 5], r: 6 },
  muscle: { len: 40, wid: 21, cab: [0.18, 0.55], wheel: [10, 6], r: 5 },
  sled:   { len: 38, wid: 18, cab: [0.25, 0.58], wheel: [9, 5], r: 9 },
  truck:  { len: 38, wid: 24, cab: [0.3, 0.68], wheel: [14, 9], r: 4 },
};

// Draw a car centred at (x, y) facing `angle`. Local +x is the nose.
function drawCar(ctx, drv, x, y, angle, o = {}) {
  const b = BODY[drv.body];
  const L = b.len, W = b.wid, hl = L / 2, hw = W / 2;
  ctx.save();
  ctx.translate(x, y);
  if (o.scale) ctx.scale(o.scale, o.scale);
  if (o.alpha != null) ctx.globalAlpha = o.alpha;

  // Shadow (unrotated offset so light comes from one direction).
  ctx.save();
  ctx.translate(3, 5);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  roundRect(ctx, -hl - 1, -hw - 2, L + 2, W + 4, b.r);
  ctx.fill();
  ctx.restore();

  ctx.rotate(angle);

  if (o.boost) {
    const fl = 14 + Math.random() * 14;
    ctx.fillStyle = '#ffdd55';
    ctx.beginPath(); ctx.moveTo(-hl, -4); ctx.lineTo(-hl - fl, 0); ctx.lineTo(-hl, 4); ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.moveTo(-hl, -3); ctx.lineTo(-hl - fl * 0.6, 0); ctx.lineTo(-hl, 3); ctx.fill();
  }

  // Wheels.
  const [ww, wh] = b.wheel;
  const wx = hl - ww / 2 - 3;
  const wy = drv.body === 'truck' ? hw + 1 : hw - 1;
  ctx.fillStyle = '#141414';
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    ctx.fillRect(sx * wx - ww / 2, sy * wy - wh / 2, ww, wh);
  }
  if (drv.body === 'truck') {
    ctx.fillStyle = '#3a3a3a';
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      for (let k = -ww / 2 + 2; k < ww / 2; k += 3) ctx.fillRect(sx * wx + k, sy * wy - wh / 2, 1.5, wh);
    }
  }

  // Body.
  const bodyW = drv.body === 'truck' ? W - 6 : W;
  const grad = ctx.createLinearGradient(0, -bodyW / 2, 0, bodyW / 2);
  grad.addColorStop(0, shade(drv.color, 0.35));
  grad.addColorStop(0.5, drv.color);
  grad.addColorStop(1, shade(drv.color, -0.35));
  ctx.fillStyle = grad;
  roundRect(ctx, -hl, -bodyW / 2, L, bodyW, b.r);
  ctx.fill();
  ctx.strokeStyle = shade(drv.color, -0.55);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const cab0 = -hl + L * b.cab[0], cab1 = -hl + L * b.cab[1];
  const cabW = bodyW - 6;

  // Type-specific details.
  switch (drv.body) {
    case 'jeep':
      ctx.fillStyle = shade(drv.color, -0.3);
      ctx.fillRect(-hl + 3, -cabW / 2, L * 0.4, cabW);          // open tub
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cab0 + 2, -cabW / 2); ctx.lineTo(cab0 + 2, cabW / 2); ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(-hl - 2, 0, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = drv.accent; ctx.fillRect(hl - 12, -2, 8, 4);
      break;
    case 'hotrod':
      ctx.fillStyle = '#b8b8b8'; ctx.fillRect(hl - 16, -5, 13, 10);   // engine block
      ctx.fillStyle = '#e8e8e8';
      for (let k = 0; k < 3; k++) ctx.fillRect(hl - 15 + k * 4, -8, 2, 16);
      ctx.fillStyle = drv.accent;
      ctx.beginPath(); ctx.moveTo(hl - 18, -bodyW / 2); ctx.lineTo(hl - 26, -2); ctx.lineTo(hl - 22, -bodyW / 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hl - 18, bodyW / 2); ctx.lineTo(hl - 26, 2); ctx.lineTo(hl - 22, bodyW / 2); ctx.fill();
      break;
    case 'pickup':
      ctx.fillStyle = shade(drv.color, -0.45);
      ctx.fillRect(-hl + 2, -cabW / 2, L * 0.38, cabW);                // bed
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-hl + 9, 0, 4.5, 0, TAU); ctx.fill();  // oil drum
      ctx.fillStyle = drv.accent; ctx.fillRect(-hl + 7, -1, 4, 2);
      break;
    case 'rally':
      ctx.fillStyle = shade(drv.color, -0.5); ctx.fillRect(-hl - 2, -hw, 4, W);   // wing
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hl - 9, 0, 4, 0, TAU); ctx.fill();
      break;
    case 'muscle':
      ctx.fillStyle = drv.accent;
      ctx.fillRect(-hl, -4, L, 3); ctx.fillRect(-hl, 1, L, 3);
      ctx.fillStyle = shade(drv.color, -0.4); ctx.fillRect(hl - 15, -3, 7, 6);    // scoop
      break;
    case 'sled':
      ctx.fillStyle = drv.accent;
      ctx.beginPath(); ctx.moveTo(-hl, -hw); ctx.lineTo(-hl - 6, -hw - 3); ctx.lineTo(-hl + 6, -hw + 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-hl, hw); ctx.lineTo(-hl - 6, hw + 3); ctx.lineTo(-hl + 6, hw - 2); ctx.fill();
      ctx.fillRect(hl - 10, -1.5, 8, 3);
      break;
    case 'truck':
      ctx.fillStyle = drv.accent; ctx.fillRect(hl - 4, -bodyW / 2 + 1, 4, bodyW - 2);   // bull bar
      ctx.fillStyle = shade(drv.color, -0.4); ctx.fillRect(-hl + 3, -cabW / 2, L * 0.25, cabW);
      break;
    case 'coupe':
      ctx.fillStyle = drv.accent; ctx.fillRect(-hl + 2, -1, L - 4, 2);
      break;
  }

  // Cabin glass.
  ctx.fillStyle = '#1b2430';
  roundRect(ctx, cab0, -cabW / 2, cab1 - cab0, cabW, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,255,0.55)';
  ctx.fillRect(cab1 - 5, -cabW / 2 + 1.5, 3.5, cabW - 3);
  ctx.fillStyle = 'rgba(160,210,255,0.3)';
  ctx.fillRect(cab0 + 1, -cabW / 2 + 1.5, 2, cabW - 3);
  if (drv.body === 'coupe') {                       // roof coil
    ctx.fillStyle = drv.accent;
    ctx.beginPath(); ctx.arc((cab0 + cab1) / 2, 0, 3, 0, TAU); ctx.fill();
  }
  if (drv.body === 'jeep') {
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-hl + 8, -2, 10, 4);    // launcher
    ctx.fillStyle = '#c33'; ctx.fillRect(-hl + 16, -1.5, 3, 3);
  }

  // Headlights.
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(hl - 2, -bodyW / 2 + 2, 2, 4);
  ctx.fillRect(hl - 2, bodyW / 2 - 6, 2, 4);
  ctx.fillStyle = '#b01010';
  ctx.fillRect(-hl, -bodyW / 2 + 2, 1.5, 3);
  ctx.fillRect(-hl, bodyW / 2 - 5, 1.5, 3);

  if (o.frozen) {
    ctx.fillStyle = 'rgba(190,235,255,0.75)';
    roundRect(ctx, -hl - 3, -hw - 3, L + 6, W + 6, 4); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-hl + 4, -hw); ctx.lineTo(-hl + 12, hw - 4); ctx.moveTo(4, -hw + 2); ctx.lineTo(10, hw); ctx.stroke();
  }
  if (o.flash) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    roundRect(ctx, -hl, -hw, L, W, b.r); ctx.fill();
  }
  if (o.ram) {
    ctx.strokeStyle = `rgba(255,${120 + Math.random() * 100 | 0},60,0.9)`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(2, 0, hl + 9, hw + 9, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,40,0.15)'; ctx.fill();
  }
  if (o.stun) {
    ctx.strokeStyle = '#aef'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      let px = rand(-hl, hl), py = rand(-hw, hw);
      ctx.moveTo(px, py);
      for (let j = 0; j < 3; j++) { px += rand(-8, 8); py += rand(-8, 8); ctx.lineTo(px, py); }
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Weapon / item icon centred at (x, y).
function drawIcon(ctx, type, x, y, s = 24) {
  ctx.save();
  ctx.translate(x, y);
  const k = s / 24;
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  switch (type) {
    case 'missile':
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#ddd'; ctx.fillRect(-9, -3, 15, 6);
      ctx.fillStyle = '#e33'; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3); ctx.fill();
      ctx.fillStyle = '#e33'; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-12, -7); ctx.lineTo(-5, -3); ctx.moveTo(-9, 3); ctx.lineTo(-12, 7); ctx.lineTo(-5, 3); ctx.fill();
      ctx.fillStyle = '#fb2'; ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-14, 0); ctx.lineTo(-9, 2); ctx.fill();
      break;
    case 'flame':
      ctx.fillStyle = '#ff5a1a';
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.bezierCurveTo(9, -2, 9, 10, 0, 10); ctx.bezierCurveTo(-9, 10, -9, -2, 0, -11); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.bezierCurveTo(5, 2, 5, 9, 0, 9); ctx.bezierCurveTo(-5, 9, -5, 2, 0, -3); ctx.fill();
      break;
    case 'emp':
      ctx.fillStyle = '#8ff3ff';
      ctx.beginPath(); ctx.moveTo(3, -11); ctx.lineTo(-6, 1); ctx.lineTo(0, 1); ctx.lineTo(-3, 11); ctx.lineTo(7, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2f63d6'; ctx.lineWidth = 1.5; ctx.stroke();
      break;
    case 'oil':
      ctx.fillStyle = '#111'; ctx.strokeStyle = '#8a7cff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(5, -3, 4, 2, 0, 2); ctx.bezierCurveTo(-4, 2, -5, -3, 0, -10); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 5, 10, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(140,90,255,0.7)'; ctx.fillRect(-5, 3, 6, 2);
      break;
    case 'mine':
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      for (let a = 0; a < 8; a++) { ctx.beginPath(); ctx.moveTo(Math.cos(a * TAU / 8) * 8, Math.sin(a * TAU / 8) * 8); ctx.lineTo(Math.cos(a * TAU / 8) * 11, Math.sin(a * TAU / 8) * 11); ctx.stroke(); }
      ctx.fillStyle = '#f33'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      break;
    case 'nitro':
      ctx.fillStyle = '#2f7de0'; roundRect(ctx, -6, -7, 12, 17, 3); ctx.fill();
      ctx.fillStyle = '#bbb'; ctx.fillRect(-2, -11, 4, 4);
      ctx.fillStyle = '#fff'; ctx.font = font(7); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, 2);
      break;
    case 'freeze':
      ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 2.5;
      for (let a = 0; a < 3; a++) {
        ctx.save(); ctx.rotate(a * Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 11);
        ctx.moveTo(-4, -8); ctx.lineTo(0, -5); ctx.lineTo(4, -8);
        ctx.moveTo(-4, 8); ctx.lineTo(0, 5); ctx.lineTo(4, 8); ctx.stroke();
        ctx.restore();
      }
      break;
    case 'ram':
      ctx.fillStyle = '#ff5a36';
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, -7); ctx.lineTo(8, 3); ctx.lineTo(0, 11); ctx.lineTo(-8, 3); ctx.lineTo(-9, -7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
      break;
    case 'repair':
      ctx.fillStyle = '#2ecc40'; roundRect(ctx, -10, -10, 20, 20, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-2.5, -7, 5, 14); ctx.fillRect(-7, -2.5, 14, 5);
      break;
    case 'cash':
      ctx.fillStyle = '#2e8b3a'; roundRect(ctx, -11, -7, 22, 14, 2); ctx.fill();
      ctx.fillStyle = '#9fe39f'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0.5, 1);
      break;
  }
  ctx.restore();
}

// --- Scenery -------------------------------------------------------------
function drawDecor(ctx, d, theme, t) {
  const { x, y, size: s, seed } = d;
  ctx.save();
  ctx.translate(x, y);
  switch (d.type) {
    case 'cactus':
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(6, 6, s * 0.5, s * 0.25, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3f8a3a';
      roundRect(ctx, -4, -s, 8, s * 1.5, 4); ctx.fill();
      roundRect(ctx, -s * 0.55, -s * 0.5, 6, s * 0.6, 3); ctx.fill();
      roundRect(ctx, s * 0.35, -s * 0.8, 6, s * 0.6, 3); ctx.fill();
      ctx.fillRect(-s * 0.55, 0, s * 0.55, 5); ctx.fillRect(4, -s * 0.3, s * 0.35, 5);
      ctx.fillStyle = '#5bb050'; ctx.fillRect(-2, -s + 2, 2, s * 1.3);
      break;
    case 'rock': case 'lavarock':
      ctx.rotate(d.rot);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(4, 5, s, s * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = d.type === 'rock' ? (theme === THEMES.snow ? '#8a98a8' : '#8c7358') : '#3a2622';
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s * 0.4, -s * 0.8); ctx.lineTo(s * 0.6, -s * 0.6); ctx.lineTo(s, s * 0.2); ctx.lineTo(s * 0.2, s * 0.7); ctx.lineTo(-s * 0.7, s * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = d.type === 'rock' ? 'rgba(255,255,255,0.18)' : 'rgba(255,100,30,0.6)';
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.8); ctx.lineTo(s * 0.6, -s * 0.6); ctx.lineTo(0, -s * 0.1); ctx.closePath(); ctx.fill();
      break;
    case 'skull':
      ctx.fillStyle = '#efe6cf';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill();
      ctx.fillRect(-s * 0.3, s * 0.2, s * 0.6, s * 0.35);
      ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(-s * 0.17, -s * 0.02, s * 0.12, 0, TAU); ctx.arc(s * 0.17, -s * 0.02, s * 0.12, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-s * 0.9, -s * 0.5); ctx.quadraticCurveTo(-s * 0.9, -s * 1.1, -s * 0.3, -s * 0.4); ctx.moveTo(s * 0.9, -s * 0.5); ctx.quadraticCurveTo(s * 0.9, -s * 1.1, s * 0.3, -s * 0.4); ctx.stroke();
      break;
    case 'pine':
      ctx.fillStyle = 'rgba(40,60,90,0.25)'; ctx.beginPath(); ctx.ellipse(8, 8, s, s * 0.6, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 3; k++) {
        const r = s * (1 - k * 0.28);
        ctx.fillStyle = k % 2 ? '#2f6b4a' : '#255a3d';
        ctx.beginPath();
        for (let a = 0; a < 8; a++) {
          const ang = a * TAU / 8 + k * 0.3, rr = a % 2 ? r * 0.65 : r;
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr - k * 3);
        }
        ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.3 - 6, s * 0.28, 0, TAU); ctx.fill();
      break;
    case 'snowman':
      ctx.fillStyle = 'rgba(40,60,90,0.2)'; ctx.beginPath(); ctx.ellipse(5, 6, s * 0.7, s * 0.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#b8c8d8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.55, s * 0.4, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f07a1a'; ctx.fillRect(0, -s * 0.58, s * 0.35, 3);
      ctx.fillStyle = '#c0282d'; ctx.fillRect(-s * 0.4, -s * 0.25, s * 0.8, 4);
      break;
    case 'building': {
      const w = s, h = s * (0.7 + seed * 0.6), hgt = 8 + seed * 14;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-w / 2 + hgt, -h / 2 + hgt, w, h);
      ctx.fillStyle = '#1b1e28'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = seed > 0.5 ? '#3b3f52' : '#34384a';
      ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
      const rng = mulberry32(Math.floor(seed * 1e6));
      const cols = ['#ffd86b', '#7af0ff', '#ff79c6'];
      for (let yy = -h / 2 + 8; yy < h / 2 - 8; yy += 10) {
        for (let xx = -w / 2 + 8; xx < w / 2 - 8; xx += 10) {
          if (rng() < 0.35) { ctx.fillStyle = cols[Math.floor(rng() * 3)]; ctx.globalAlpha = 0.7; ctx.fillRect(xx, yy, 4, 4); }
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#555a70'; ctx.fillRect(-6, -6, 12, 12);
      if (seed > 0.6) {
        ctx.fillStyle = (Math.floor(t * 2 + seed * 10) % 2) ? '#ff3030' : '#661010';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'lamp': {
      ctx.fillStyle = 'rgba(255,220,120,0.07)'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,150,0.12)'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
      break;
    }
    case 'palm':
      ctx.fillStyle = 'rgba(0,30,0,0.3)'; ctx.beginPath(); ctx.arc(8, 8, s, 0, TAU); ctx.fill();
      ctx.rotate(d.rot);
      for (let k = 0; k < 6; k++) {
        ctx.save(); ctx.rotate(k * TAU / 6);
        ctx.fillStyle = k % 2 ? '#2f9a3a' : '#1f7a2c';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.6, -s * 0.35, s * 1.25, 0); ctx.quadraticCurveTo(s * 0.6, s * 0.35, 0, 0); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#7a5530'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      break;
    case 'bush':
      ctx.fillStyle = 'rgba(0,30,0,0.3)'; ctx.beginPath(); ctx.arc(5, 5, s * 0.9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a6e27';
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(Math.cos(k * 1.3 + seed * 6) * s * 0.45, Math.sin(k * 1.3 + seed * 6) * s * 0.45, s * 0.55, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#e04a7a'; ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.2, 2.5, 0, TAU); ctx.arc(-s * 0.3, s * 0.1, 2.5, 0, TAU); ctx.fill();
      break;
    case 'tires':
      for (let k = 0; k < 3; k++) {
        const ox = (k - 1) * s * 0.55, oy = (k % 2) * s * 0.35;
        ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.arc(ox, oy, s * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(ox, oy, s * 0.2, 0, TAU); ctx.fill();
      }
      break;
    case 'wreck':
      ctx.rotate(d.rot);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-s + 4, -s * 0.5 + 5, s * 2, s);
      ctx.fillStyle = ['#8a3b2b', '#50607a', '#7a7a3b'][Math.floor(seed * 3)];
      ctx.fillRect(-s, -s * 0.5, s * 2, s);
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(-s * 0.6, -s * 0.3, s * 0.5, s * 0.4); ctx.fillRect(s * 0.2, 0, s * 0.6, s * 0.3);
      ctx.fillStyle = '#222'; ctx.fillRect(-s * 0.2, -s * 0.4, s * 0.7, s * 0.8);
      break;
    case 'barrel':
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(3, 4, s * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = seed > 0.5 ? '#c8401e' : '#2f7d4a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, TAU); ctx.stroke();
      break;
    case 'lava': {
      const pulse = 0.75 + Math.sin(t * 2 + seed * 10) * 0.25;
      ctx.rotate(d.rot);
      ctx.fillStyle = '#1a0c0a'; ctx.beginPath(); ctx.ellipse(0, 0, s + 6, s * 0.7 + 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,${80 + pulse * 60 | 0},20,1)`; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,220,80,${pulse * 0.8})`; ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.1, s * 0.5, s * 0.3, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'crystal':
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(4, 5, s * 0.7, s * 0.4, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 3; k++) {
        ctx.save(); ctx.rotate((k - 1) * 0.5);
        ctx.fillStyle = k === 1 ? '#ff8a3d' : '#d9542a';
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(0, -s * (k === 1 ? 1.1 : 0.8)); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
  }
  ctx.restore();
}

// --- Track ---------------------------------------------------------------
function groundPattern(ctx, track) {
  if (track.pattern) return track.pattern;
  const th = track.theme;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = th.ground; g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(track.def.seed * 7 + 3);
  if (th === THEMES.city) {
    g.strokeStyle = '#333846'; g.lineWidth = 2;
    for (let k = 0; k <= 256; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
  }
  for (let k = 0; k < 900; k++) {
    g.fillStyle = th.speck[Math.floor(rng() * th.speck.length)];
    const sz = 1 + rng() * 3;
    g.fillRect(rng() * 256, rng() * 256, sz, sz);
  }
  if (th === THEMES.volcano) {
    g.strokeStyle = 'rgba(255,90,30,0.55)'; g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      let x = rng() * 256, y = rng() * 256;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  }
  if (th === THEMES.jungle) {
    g.fillStyle = '#2b6e28';
    for (let k = 0; k < 60; k++) { const x = rng() * 256, y = rng() * 256; g.fillRect(x, y, 2, 6); g.fillRect(x + 3, y + 1, 2, 5); }
  }
  track.pattern = ctx.createPattern(c, 'repeat');
  return track.pattern;
}

function drawTrackSurface(ctx, track, view, t) {
  const th = track.theme;
  ctx.fillStyle = groundPattern(ctx, track);
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);

  const p = track.path;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Barrier walls.
  ctx.strokeStyle = th.wall; ctx.lineWidth = 2 * (track.wallOff + 12); ctx.stroke(p);
  ctx.strokeStyle = th.wallB; ctx.lineWidth = 2 * (track.wallOff + 7);
  ctx.setLineDash([26, 26]); ctx.stroke(p); ctx.setLineDash([]);
  // Shoulder.
  ctx.strokeStyle = th.shoulder; ctx.lineWidth = 2 * track.wallOff; ctx.stroke(p);
  if (th.offDamage) {
    ctx.strokeStyle = `rgba(255,90,20,${0.25 + Math.sin(t * 3) * 0.1})`;
    ctx.lineWidth = 2 * track.wallOff - 8; ctx.setLineDash([4, 18]); ctx.stroke(p); ctx.setLineDash([]);
  }
  // Curbs.
  ctx.strokeStyle = th.curbA; ctx.lineWidth = 2 * track.halfW + 16; ctx.stroke(p);
  ctx.strokeStyle = th.curbB; ctx.setLineDash([22, 22]); ctx.stroke(p); ctx.setLineDash([]);
  // Asphalt.
  ctx.strokeStyle = th.roadEdge; ctx.lineWidth = 2 * track.halfW; ctx.stroke(p);
  ctx.strokeStyle = th.road; ctx.lineWidth = 2 * track.halfW - 10; ctx.stroke(p);
  if (th.grip < 0.8) {
    ctx.strokeStyle = 'rgba(220,240,255,0.25)'; ctx.lineWidth = 2 * track.halfW - 30;
    ctx.setLineDash([120, 200]); ctx.stroke(p); ctx.setLineDash([]);
  }
  // Center dashes.
  ctx.strokeStyle = th.line; ctx.lineWidth = 3; ctx.lineCap = 'butt';
  ctx.setLineDash([30, 30]); ctx.stroke(p); ctx.setLineDash([]);

  // Start / finish checkers.
  const s0 = track.pointAt(0);
  ctx.save();
  ctx.translate(s0.x, s0.y); ctx.rotate(s0.angle);
  const cells = 10, cw = (2 * track.halfW) / cells;
  for (let r = 0; r < 2; r++) for (let c = 0; c < cells; c++) {
    ctx.fillStyle = (r + c) % 2 ? '#111' : '#f4f4f4';
    ctx.fillRect(-cw + r * cw, -track.halfW + c * cw, cw, cw);
  }
  ctx.restore();

  // Grid boxes.
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const g = track.gridSlot(k);
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.angle);
    ctx.beginPath(); ctx.moveTo(-22, -15); ctx.lineTo(24, -15); ctx.lineTo(24, 15); ctx.lineTo(-22, 15); ctx.stroke();
    ctx.restore();
  }

  // Boost pads.
  for (const b of track.boosts) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-b.len / 2 - 2, -b.wid / 2 - 2, b.len + 4, b.wid + 4);
    const ph = (t * 3) % 1;
    for (let k = 0; k < 3; k++) {
      const a = 0.4 + 0.6 * ((k / 3 + ph) % 1);
      ctx.fillStyle = `rgba(255,${180 + k * 20},40,${a})`;
      const ox = -b.len / 2 + 6 + k * 16;
      ctx.beginPath(); ctx.moveTo(ox, -b.wid / 2 + 4); ctx.lineTo(ox + 12, 0); ctx.lineTo(ox, b.wid / 2 - 4); ctx.lineTo(ox + 6, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

function drawSceneryInView(ctx, track, view, t) {
  const m = 120;
  for (const d of track.decor) {
    if (d.x < view.x0 - m || d.x > view.x1 + m || d.y < view.y0 - m || d.y > view.y1 + m) continue;
    drawDecor(ctx, d, track.theme, t);
  }
}

// Cached minimap image of the track outline.
function minimapImage(track, w, h) {
  track._mini = track._mini || {};
  const key = w + 'x' + h;
  if (track._mini[key]) return track._mini[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tf = minimapTransform(track, w, h);
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < track.n; i += 3) {
    const x = tf.ox + track.px[i] * tf.sc, y = tf.oy + track.py[i] * tf.sc;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 7; g.stroke();
  g.strokeStyle = '#d8d8d8'; g.lineWidth = 3.5; g.stroke();
  const s = track.pointAt(0);
  g.fillStyle = '#fff'; g.fillRect(tf.ox + s.x * tf.sc - 3, tf.oy + s.y * tf.sc - 3, 6, 6);
  track._mini[key] = { canvas: c, tf };
  return track._mini[key];
}
function minimapTransform(track, w, h) {
  const b = track.bounds, pad = 8;
  const sc = Math.min((w - pad * 2) / (b.maxX - b.minX), (h - pad * 2) / (b.maxY - b.minY));
  return {
    sc,
    ox: (w - (b.maxX - b.minX) * sc) / 2 - b.minX * sc,
    oy: (h - (b.maxY - b.minY) * sc) / 2 - b.minY * sc,
  };
}
