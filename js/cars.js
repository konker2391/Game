'use strict';
// Pixel-art car designs. Each body type has its own silhouette and parts, drawn into a
// pixel grid with a tiny drawing kit. Coordinates are fractions so the same design
// renders at any zoom: t runs along the car (0 = rear, 1 = nose), v across it
// (-1 = left edge, +1 = right edge). Values outside 0..1 / -1..1 overhang the body.

const CAR_PAL = {
  glass: '#1b2430', glassHi: '#7fb8e8', glassTop: '#d0f0ff',
  chrome: '#d8d8e0', chromeLo: '#8a8a98', tire: '#161616', tread: '#4a4a4a',
  light: '#fff6b0', tail: '#c01010', dark: '#202020',
};

function carArtKit(G, L, W, pad, drv) {
  const cy = (W - 1) / 2, hw = (W - 1) / 2;
  const X = t => pad + Math.round(t * (L - 1));
  const Y = v => pad + Math.round(cy + v * hw);
  const body = drv.color;
  const c = Object.assign({
    body, hi: shade(body, 0.35), hi2: shade(body, 0.6), fr: shade(body, 0.15),
    lo: shade(body, -0.28), lo2: shade(body, -0.5), acc: drv.accent,
  }, CAR_PAL);
  const A = {
    c, L, W, X, Y,
    px(t, v, col) { G.set(X(t), Y(v), col); },
    rect(t0, t1, v0, v1, col) {
      for (let x = X(t0); x <= X(t1); x++) for (let y = Y(v0); y <= Y(v1); y++) G.set(x, y, col);
    },
    hline(t0, t1, v, col) { for (let x = X(t0); x <= X(t1); x++) G.set(x, Y(v), col); },
    vline(t, v0, v1, col) { for (let y = Y(v0); y <= Y(v1); y++) G.set(X(t), y, col); },
    line(t0, v0, t1, v1, col) {
      let x0 = X(t0), y0 = Y(v0);
      const x1 = X(t1), y1 = Y(v1), dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        G.set(x0, y0, col);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    ell(tc, vc, rt, rv, col) {
      G.ellipse(X(tc) + 0.5, Y(vc) + 0.5, Math.max(1, rt * (L - 1)), Math.max(1, rv * hw), col);
    },
    // Tyre on one side (side = -1 left, +1 right); `thick` is a fraction of the car width.
    wheel(t0, t1, side, thick, chunky = false) {
      const th = Math.max(2, Math.round(thick * W));
      const ya = side < 0 ? Y(-1) : Y(1) - th + 1, yb = ya + th - 1;
      const xa = X(t0), xb = X(t1);
      for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
        const outer = side < 0 ? y === ya : y === yb;
        let col = c.tire;
        if (outer && (x - xa) % 2 === 0) col = c.tread;
        if (chunky && (x + y) % 2 === 0 && (y - ya < 2 || yb - y < 2)) col = c.tread;
        G.set(x, y, col);
      }
      if (th >= 3 && xb - xa >= 2) {
        const hx = (xa + xb) >> 1, hy = (ya + yb) >> 1;
        G.set(hx, hy, c.chromeLo);
        if (chunky) { G.set(hx + 1, hy, c.chrome); G.set(hx, hy + (side < 0 ? 1 : -1), c.chromeLo); }
      }
    },
    // Body silhouette from a half-width profile h(t) in 0..1, shaded from its own edges:
    // light top edge, dark bottom and rear edges, a specular streak one row in.
    body(h, t0 = 0, t1 = 1, pal = c) {
      const m = new Uint8Array(G.w * G.h);
      for (let x = X(t0); x <= X(t1); x++) {
        const hh = h((x - pad) / (L - 1));
        if (hh <= 0) continue;
        for (let y = 0; y < G.h; y++) if (Math.abs((y - pad - cy) / hw) <= hh + 0.5 / hw) m[y * G.w + x] = 1;
      }
      const at = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h && m[y * G.w + x];
      for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
        if (!m[y * G.w + x]) continue;
        let col = pal.body;
        if (!at(x, y - 1)) col = pal.hi;
        else if (!at(x, y + 1)) col = pal.lo;
        else if (!at(x - 1, y)) col = pal.lo;
        else if (!at(x + 1, y)) col = pal.fr;
        else if (!at(x, y - 2) && x % 3) col = pal.hi2;
        G.set(x, y, col);
      }
      A.mask = m;
      return m;
    },
    // Blotchy two-tone pattern over the last body (camouflage, rust, frost).
    blotch(cols, density, size = 2, seed = 1) {
      const m = A.mask;
      for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
        if (!m[y * G.w + x]) continue;
        if (!m[(y - 1) * G.w + x] || !m[(y + 1) * G.w + x]) continue;   // keep edge shading
        const r = hash2(Math.floor(x / size) * 7 + seed, Math.floor(y / size) * 13 + seed);
        if (r < density) G.set(x, y, cols[Math.floor(r / density * cols.length)]);
      }
    },
    helmet(t, v) {
      const big = W >= 16;
      const x = X(t) - (big ? 1 : 0), y = Y(v) - (big ? 1 : 0), n = big ? 3 : 2;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) G.set(x + i, y + j, c.acc);
      G.set(x, y, '#ffffff');
      G.set(x + n - 1, y + (n >> 1), c.glass);       // visor faces forward
    },
  };
  return A;
}

// Physical size (world units) and art for each body type.
const CAR_ART = {
  // Sgt. Havoc: boxy camo jeep, open tub with roll cage, rear missile pod, spare tyre.
  jeep: {
    len: 36, wid: 24,
    draw(A, c) {
      A.ell(-0.02, 0, 0.06, 0.32, c.tire); A.px(-0.02, 0, c.tread);
      for (const s of [-1, 1]) { A.wheel(0.06, 0.3, s, 0.3, true); A.wheel(0.66, 0.9, s, 0.3, true); }
      A.body(t => (t < 0.02 || t > 0.985 ? 0.6 : 0.72));
      A.blotch(['#33481e', '#8c8a52'], 0.34, 2, 3);
      A.rect(0.1, 0.52, -0.52, 0.52, c.lo2);                       // open tub
      A.rect(0.12, 0.27, 0.12, 0.46, '#3a3a3a');                    // missile pod
      A.hline(0.12, 0.27, 0.3, c.dark);
      A.px(0.27, 0.16, '#e02030'); A.px(0.27, 0.42, '#e02030');
      A.vline(0.31, -0.58, 0.58, c.chrome); A.vline(0.52, -0.62, 0.62, c.chrome);   // roll cage
      A.hline(0.31, 0.52, -0.6, c.chromeLo); A.hline(0.31, 0.52, 0.6, c.chromeLo);
      A.helmet(0.42, -0.28);
      A.vline(0.56, -0.58, 0.58, c.glassHi);                        // fold-down windscreen
      A.hline(0.62, 0.95, 0, c.lo);                                 // hood seam
      for (const v of [-0.48, -0.24, 0, 0.24, 0.48]) A.px(1, v, c.chrome);   // grille
      A.px(0.97, -0.62, c.light); A.px(0.97, 0.62, c.light);
      A.px(0.02, -0.6, c.tail); A.px(0.02, 0.6, c.tail);
    },
  },
  // Blaze: open-wheel hot rod, skinny fronts, huge rear slicks, chrome blower and zoomie pipes.
  hotrod: {
    len: 40, wid: 22,
    draw(A, c) {
      for (const s of [-1, 1]) { A.wheel(0.03, 0.32, s, 0.36); A.wheel(0.79, 0.93, s, 0.18); }
      A.vline(0.86, -0.82, 0.82, c.chromeLo);                       // front axle
      A.body(t => (t < 0.1 ? 0.4 : t < 0.5 ? 0.56 : t < 0.58 ? 0.44 : t < 0.97 ? 0.3 : 0.2));
      A.rect(0.56, 0.84, -0.27, 0.27, c.chromeLo);                  // engine block
      A.rect(0.62, 0.78, -0.17, 0.17, c.chrome);                    // blower
      A.rect(0.66, 0.74, -0.06, 0.06, c.dark);                      // intake
      for (const t of [0.6, 0.68, 0.76]) {                          // zoomie pipes
        A.line(t, -0.3, t - 0.07, -0.66, c.chrome);
        A.line(t, 0.3, t - 0.07, 0.66, c.chrome);
      }
      A.px(0.9, -0.22, c.acc); A.px(0.94, -0.12, '#ff6a1a'); A.px(0.9, 0.22, c.acc); A.px(0.94, 0.12, '#ff6a1a');
      A.px(0.97, 0, '#ff6a1a');
      A.rect(0.17, 0.45, -0.34, 0.34, c.lo2);                       // cockpit
      A.vline(0.16, -0.36, 0.36, c.chrome);                         // roll hoop
      A.helmet(0.3, 0);
      A.vline(0.48, -0.3, 0.3, c.glassHi);
      A.px(0.01, -0.3, c.tail); A.px(0.01, 0.3, c.tail);
    },
  },
  // Dr. Volt: teardrop electric coupe, bubble canopy, glowing stripe, Tesla coil on the tail.
  coupe: {
    len: 40, wid: 21,
    draw(A, c) {
      for (const s of [-1, 1]) { A.wheel(0.14, 0.3, s, 0.16); A.wheel(0.64, 0.8, s, 0.16); }
      A.body(t => 0.95 * Math.min(1, Math.pow(Math.max(0, 1 - t) / 0.42, 0.75), Math.sqrt(t / 0.12 + 0.35)));
      A.hline(0.62, 0.95, 0, c.acc); A.hline(0.04, 0.3, 0, c.acc);  // light stripe
      A.ell(0.46, 0, 0.19, 0.42, c.glass);                          // bubble canopy
      for (const v of [-0.24, -0.12, 0, 0.12, 0.24]) A.px(0.6 - Math.abs(v) * 0.15, v, c.glassHi);   // reflection arc
      A.px(0.56, -0.2, c.glassTop);
      A.ell(0.2, 0, 0.045, 0.26, c.chrome);                         // Tesla coil
      A.px(0.2, 0, c.acc);
      A.px(0.32, -0.62, c.lo2); A.px(0.34, -0.62, c.lo2); A.px(0.32, 0.62, c.lo2); A.px(0.34, 0.62, c.lo2);
      A.px(0.9, -0.25, c.acc); A.px(0.9, 0.25, c.acc);              // headlight slits
      A.px(0.02, -0.4, c.tail); A.px(0.02, 0.4, c.tail);
    },
  },
  // Grease Monkey: long rusty tow truck, oil drums in the bed, light bar, tow boom and hook.
  pickup: {
    len: 44, wid: 22,
    draw(A, c) {
      A.rect(-0.07, 0.06, -0.08, 0.08, '#e0b020'); A.px(-0.08, 0, c.chromeLo);   // tow boom + hook
      for (const s of [-1, 1]) { A.wheel(0.09, 0.27, s, 0.24); A.wheel(0.68, 0.85, s, 0.24); }
      A.body(t => (t > 0.97 ? 0.7 : 0.78));
      A.blotch(['#8a4a1a', '#6a3a14'], 0.1, 1, 9);                  // rust
      A.rect(0.05, 0.46, -0.6, 0.6, c.lo2);                         // bed
      for (const [t, v, col] of [[0.15, -0.3, '#b04a1a'], [0.15, 0.3, '#2a6a3a'], [0.33, 0, '#303030']]) {
        A.ell(t, v, 0.045, 0.26, col); A.px(t - 0.01, v - 0.1, '#ffffff');
      }
      A.vline(0.5, -0.56, 0.56, c.glass);                            // rear window
      for (let k = 0; k < 5; k++) A.px(0.6, -0.5 + k * 0.25, k % 2 ? c.dark : '#ff9a20');   // light bar
      A.rect(0.68, 0.72, -0.6, 0.6, c.glass); A.vline(0.72, -0.6, 0.6, c.glassHi);
      A.hline(0.76, 0.97, -0.3, c.lo); A.hline(0.76, 0.97, 0.3, c.lo);
      A.vline(1, -0.72, 0.72, c.chrome);                             // bumper
      A.px(0.98, -0.6, c.light); A.px(0.98, 0.6, c.light);
    },
  },
  // Mina Blast: stubby rally hatch with a huge rear wing, roof scoop, roundel and spot lights.
  rally: {
    len: 34, wid: 21,
    draw(A, c) {
      for (const s of [-1, 1]) { A.wheel(0.1, 0.28, s, 0.22); A.wheel(0.7, 0.88, s, 0.22); A.px(0.06, s * 0.95, c.lo2); }
      A.body(t => (t > 0.86 ? 0.8 - (t - 0.86) * 1.8 : 0.8));
      A.rect(0.13, 0.19, -0.8, 0.8, c.acc);                         // livery band
      A.rect(0.27, 0.31, -0.56, 0.56, c.glass);                     // rear window
      A.rect(0.6, 0.65, -0.6, 0.6, c.glass); A.vline(0.65, -0.6, 0.6, c.glassHi);
      A.rect(0.44, 0.52, -0.14, 0.14, c.lo2);                       // roof scoop
      A.ell(0.79, 0, 0.06, 0.36, '#ffffff'); A.px(0.79, 0, c.dark);  // roundel
      for (const v of [-0.48, -0.16, 0.16, 0.48]) A.px(1, v, c.light);   // rally lights
      A.rect(-0.05, 0.03, -1.18, 1.18, c.lo2);                      // rear wing
      A.px(-0.05, -1.18, c.acc); A.px(0.03, -1.18, c.acc); A.px(-0.05, 1.18, c.acc); A.px(0.03, 1.18, c.acc);
    },
  },
  // Turbo Tex: long-hood muscle car, supercharger, black racing stripes, side pipes, steer horns.
  muscle: {
    len: 42, wid: 23,
    draw(A, c) {
      for (const s of [-1, 1]) { A.wheel(0.05, 0.26, s, 0.3); A.wheel(0.7, 0.88, s, 0.22); A.hline(0.3, 0.62, s * 0.98, c.chrome); }
      A.body(t => (t < 0.3 ? 0.86 : t > 0.92 ? 0.78 - (t - 0.92) * 2.4 : 0.78));   // wide hips, tapered nose
      A.hline(0, 1, -0.2, c.acc); A.hline(0, 1, 0.2, c.acc);         // racing stripes
      A.rect(0, 0.03, -0.8, 0.8, c.lo2);                            // ducktail spoiler
      A.rect(0.27, 0.31, -0.56, 0.56, c.glass);                     // rear window
      A.rect(0.5, 0.55, -0.62, 0.62, c.glass); A.vline(0.55, -0.62, 0.62, c.glassHi);
      A.rect(0.68, 0.83, -0.28, 0.28, c.chrome);                    // supercharger
      A.rect(0.71, 0.8, -0.12, 0.12, c.dark);
      A.vline(1, -0.5, 0.5, c.lo2);                                 // grille
      A.px(0.99, -0.64, c.light); A.px(0.99, 0.64, c.light);
      for (const s of [-1, 1]) {                                    // steer horns on the bumper
        for (const [t, v] of [[0.98, 0.62], [1.0, 0.74], [1.02, 0.86], [1.04, 0.98], [1.04, 1.1]]) A.px(t, s * v, '#efe2b8');
        A.px(1.01, s * 1.22, '#3a2a1a');
      }
      A.px(0.01, -0.62, c.tail); A.px(0.01, 0.62, c.tail);
    },
  },
  // Frostbite: snow racer on front skis with a rear track, pointed nose and icicle fins.
  sled: {
    len: 40, wid: 20,
    draw(A, c) {
      for (const s of [-1, 1]) {
        A.hline(0.55, 1.04, s * 0.86, c.chrome); A.px(1.07, s * 0.74, c.chrome);   // skis
        A.px(0.64, s * 0.66, c.chromeLo); A.px(0.82, s * 0.66, c.chromeLo);
      }
      A.rect(0.0, 0.42, -0.74, 0.74, '#1a1a1a');                    // track
      for (let k = 0; k <= 20; k += 2) { A.px(k * 0.021, -0.74, '#5a5a5a'); A.px(k * 0.021, 0.74, '#5a5a5a'); }
      A.body(t => (t < 0.5 ? 0.52 : Math.max(0.1, 0.52 * (1 - t) / 0.5 + 0.06)));
      A.blotch(['#e8f8ff'], 0.12, 1, 5);                            // frost sparkle
      A.hline(0.66, 0.95, 0, c.acc);
      A.rect(0.24, 0.5, -0.26, 0.26, c.lo2);                        // seat
      A.helmet(0.43, 0);
      A.line(0.6, -0.4, 0.64, 0, c.glassHi); A.line(0.64, 0, 0.6, 0.4, c.glassHi);   // curved screen
      for (const s of [-1, 1]) { A.px(0.03, s * 0.56, '#e8f8ff'); A.px(-0.01, s * 0.66, '#ffffff'); A.px(-0.04, s * 0.74, '#bfe8ff'); }
    },
  },
  // Brick: monster truck on giant lugged tyres, tiny cab, spiked bull bar, exhaust stacks.
  truck: {
    len: 40, wid: 28,
    draw(A, c) {
      for (const s of [-1, 1]) { A.wheel(0.02, 0.36, s, 0.36, true); A.wheel(0.64, 0.98, s, 0.36, true); }
      A.vline(0.19, -0.68, 0.68, c.chromeLo); A.vline(0.81, -0.68, 0.68, c.chromeLo);
      A.body(t => 0.48, 0.09, 0.9);
      A.rect(0.13, 0.38, -0.34, 0.34, c.lo2);                       // bed
      A.vline(0.42, -0.34, 0.34, c.glass);
      A.rect(0.62, 0.66, -0.38, 0.38, c.glass); A.vline(0.66, -0.38, 0.38, c.glassHi);
      A.hline(0.7, 0.88, 0, c.acc);
      A.px(0.4, -0.44, c.chrome); A.px(0.4, 0.44, c.chrome);        // exhaust stacks
      A.vline(0.94, -0.56, 0.56, c.acc);                            // bull bar
      for (const v of [-0.46, 0, 0.46]) A.px(0.99, v, c.chrome);    // spikes
      A.px(0.1, -0.4, c.tail); A.px(0.1, 0.4, c.tail);
    },
  },
};

const _carSprites = new Map();

// Sprite set for a driver at world scale Z: the car (nose pointing +x) plus shadow,
// white hit-flash and frozen variants.
function carSprite(drv, Z) {
  const key = drv.id + '@' + Z;
  if (_carSprites.has(key)) return _carSprites.get(key);
  const art = CAR_ART[drv.body];
  const L = Math.max(14, Math.round(art.len * Z)), W = Math.max(9, Math.round(art.wid * Z));
  const pad = 3;
  const G = new PixGrid(L + pad * 2, W + pad * 2);
  const A = carArtKit(G, L, W, pad, drv);
  art.draw(A, A.c);
  G.outline('#0c0c14');
  const img = G.toCanvas();
  const spr = {
    img,
    shadow: recolor(img, () => [0, 0, 0, 90]),
    white: recolor(img, () => [255, 255, 255]),
    frozen: recolor(img, (r, g, bl, x, y) => (hash2(x, y) < 0.15 ? [255, 255, 255] : [q4(r * 0.35 + 190 * 0.65), q4(g * 0.35 + 235 * 0.65), q4(bl * 0.35 + 255 * 0.65)])),
  };
  _carSprites.set(key, spr);
  return spr;
}
