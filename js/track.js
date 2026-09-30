'use strict';
// Track geometry: centerline sampling, nearest-point queries, pickups and decor.

const SAMPLE_SPACING = 10;

function crPoint(p0, p1, p2, p3, t) {
  // Centripetal Catmull-Rom (Barry-Goldman), avoids cusps and self-loops.
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-4, 0.5);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => {
    const u = (tt - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const A1 = mix(p0, p1, t0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
  const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
  return mix(B1, B2, t1, t2);
}

class Track {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.theme = THEMES[def.theme];
    this.laps = def.laps || 3;
    this.halfW = def.halfW || 115;
    this.wallOff = this.halfW + 45;
    this.gridLat = Math.round(this.halfW * 0.42);   // grid columns sit either side of centre
    this._buildCenterline(def.points);
    this._buildTurnAhead();
    this._buildPath();
    const rng = mulberry32(def.seed || 1);
    this._buildPickups();
    this._buildBoosts(rng);
    this._buildDecor(rng);
    this.pattern = null;
  }

  _buildCenterline(cp) {
    const dense = [];
    const n = cp.length;
    for (let i = 0; i < n; i++) {
      const p0 = cp[(i - 1 + n) % n], p1 = cp[i], p2 = cp[(i + 1) % n], p3 = cp[(i + 2) % n];
      const steps = Math.max(10, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4));
      for (let k = 0; k < steps; k++) dense.push(crPoint(p0, p1, p2, p3, k / steps));
    }
    // Resample to even spacing.
    let total = 0;
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
      cum.push(total);
    }
    const N = Math.round(total / SAMPLE_SPACING);
    const step = total / N;
    this.px = new Float32Array(N); this.py = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = i * step;
      while (cum[j + 1] < target) j++;
      const a = dense[j], b = dense[(j + 1) % dense.length];
      const u = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.px[i] = a[0] + (b[0] - a[0]) * u;
      this.py[i] = a[1] + (b[1] - a[1]) * u;
    }
    // Put the start line midway along the first straight (control points 0 -> 1).
    const mx = (cp[0][0] + cp[1][0]) / 2, my = (cp[0][1] + cp[1][1]) / 2;
    let k0 = 0, kd = Infinity;
    for (let i = 0; i < N; i++) {
      const d = (this.px[i] - mx) ** 2 + (this.py[i] - my) ** 2;
      if (d < kd) { kd = d; k0 = i; }
    }
    const rot = a => Float32Array.from({ length: N }, (_, i) => a[(i + k0) % N]);
    this.px = rot(this.px); this.py = rot(this.py);
    this.n = N;
    this.spacing = step;
    this.length = total;
    this.tx = new Float32Array(N); this.ty = new Float32Array(N); this.ang = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = this.px[b] - this.px[a], dy = this.py[b] - this.py[a];
      const l = Math.hypot(dx, dy) || 1;
      this.tx[i] = dx / l; this.ty[i] = dy / l;
      this.ang[i] = Math.atan2(dy, dx);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minY = Math.min(minY, this.py[i]); maxY = Math.max(maxY, this.py[i]);
    }
    this.bounds = { minX, minY, maxX, maxY };
  }

  // For each sample, the largest heading change over the next ~320px. AI uses it to brake.
  _buildTurnAhead() {
    const N = this.n, win = Math.round(320 / this.spacing);
    this.turnAhead = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let k = 4; k <= win; k += 2) {
        m = Math.max(m, Math.abs(wrapAngle(this.ang[(i + k) % N] - this.ang[i])));
      }
      this.turnAhead[i] = m;
    }
  }

  _buildPath() {
    const p = new Path2D();
    p.moveTo(this.px[0], this.py[0]);
    for (let i = 1; i < this.n; i++) p.lineTo(this.px[i], this.py[i]);
    p.closePath();
    this.path = p;
  }

  idxAt(s) {
    s = ((s % this.length) + this.length) % this.length;
    return Math.floor(s / this.spacing) % this.n;
  }

  pointAt(s, lat = 0) {
    s = ((s % this.length) + this.length) % this.length;
    const f = s / this.spacing;
    const i = Math.floor(f) % this.n, j = (i + 1) % this.n, u = f - Math.floor(f);
    const x = this.px[i] + (this.px[j] - this.px[i]) * u;
    const y = this.py[i] + (this.py[j] - this.py[i]) * u;
    const tx = this.tx[i], ty = this.ty[i];
    return { x: x - ty * lat, y: y + tx * lat, angle: this.ang[i], tx, ty };
  }

  angleAt(s) { return this.ang[this.idxAt(s)]; }
  turnAheadAt(s) { return this.turnAhead[this.idxAt(s)]; }

  // Nearest centerline point. With a hint index, only a local window is searched.
  nearest(x, y, hint) {
    const N = this.n;
    let best = 0, bd = Infinity;
    if (hint == null || hint < 0) {
      for (let i = 0; i < N; i++) {
        const dx = x - this.px[i], dy = y - this.py[i], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
    } else {
      for (let k = -30; k <= 30; k++) {
        const i = (hint + k + N) % N;
        const dx = x - this.px[i], dy = y - this.py[i], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return this._project(x, y, best);
  }

  _project(x, y, i) {
    const N = this.n;
    let a = i, b = (i + 1) % N;
    let dx = this.px[b] - this.px[a], dy = this.py[b] - this.py[a];
    let l2 = dx * dx + dy * dy || 1;
    let t = ((x - this.px[a]) * dx + (y - this.py[a]) * dy) / l2;
    if (t < 0) {
      a = (i - 1 + N) % N; b = i;
      dx = this.px[b] - this.px[a]; dy = this.py[b] - this.py[a];
      l2 = dx * dx + dy * dy || 1;
      t = ((x - this.px[a]) * dx + (y - this.py[a]) * dy) / l2;
    }
    t = clamp(t, 0, 1);
    const l = Math.sqrt(l2);
    const cx = this.px[a] + dx * t, cy = this.py[a] + dy * t;
    const nx = -dy / l, ny = dx / l;
    const lat = (x - cx) * nx + (y - cy) * ny;
    let s = a * this.spacing + t * l;
    if (s >= this.length) s -= this.length;
    return { i: a, s, lat, cx, cy, nx, ny, tx: dx / l, ty: dy / l };
  }

  gridSlot(k) {
    const row = Math.floor(k / 2), col = k % 2;
    const s = this.length - 70 - row * 70 - col * 30;
    const lat = col ? this.gridLat : -this.gridLat;
    return this.pointAt(s, lat);
  }

  _buildPickups() {
    this.pickupSpots = [];
    for (const f of [0.18, 0.42, 0.66, 0.88]) {
      const s = this.length * f;
      for (const lat of [-0.55 * this.halfW, 0, 0.55 * this.halfW]) {
        const p = this.pointAt(s, lat);
        this.pickupSpots.push({ x: p.x, y: p.y, s, lat });
      }
    }
  }

  _buildBoosts(rng) {
    this.boosts = [];
    const N = this.n;
    const candidates = [];
    for (let i = 0; i < N; i += 5) {
      const s = i * this.spacing;
      if (this.turnAhead[i] < 0.25 && s > 300 && s < this.length - 400) candidates.push(s);
    }
    const count = Math.min(3, candidates.length);
    for (let tries = 0; this.boosts.length < count && tries < 200; tries++) {
      const s = candidates[Math.floor(rng() * candidates.length)];
      if (this.boosts.some(b => Math.abs(b.s - s) < 900)) continue;
      if (this.pickupSpots.some(p => Math.abs(p.s - s) < 150)) continue;
      const lat = (rng() - 0.5) * this.halfW;
      const p = this.pointAt(s, lat);
      this.boosts.push({ x: p.x, y: p.y, s, lat, angle: p.angle, len: 56, wid: 48 });
    }
  }

  _buildDecor(rng) {
    this.decor = [];
    const b = this.bounds, pad = 300;
    const area = (b.maxX - b.minX + pad * 2) * (b.maxY - b.minY + pad * 2);
    const want = Math.floor(area / 26000);
    for (let tries = 0; this.decor.length < want && tries < want * 6; tries++) {
      const x = b.minX - pad + rng() * (b.maxX - b.minX + pad * 2);
      const y = b.minY - pad + rng() * (b.maxY - b.minY + pad * 2);
      const type = this.theme.decor[Math.floor(rng() * this.theme.decor.length)];
      const size = type === 'building' ? 50 + rng() * 45 : type === 'lava' ? 30 + rng() * 40 : 14 + rng() * 14;
      const n = this.nearest(x, y);
      if (Math.abs(n.lat) < this.wallOff + 20 + size) continue;
      if (this.decor.some(d => Math.hypot(d.x - x, d.y - y) < d.size + size + 8)) continue;
      this.decor.push({ x, y, type, size, seed: rng(), rot: rng() * TAU });
    }
    this.decor.sort((a, b) => a.y - b.y);
  }
}
