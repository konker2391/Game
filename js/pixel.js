'use strict';
// Genesis-style pixel rendering: bitmap font, pixel-art sprites, dithered ground
// tiles and pre-baked track textures. The race is drawn into a half-resolution
// buffer and scaled up with nearest-neighbour filtering.

// --- Colour helpers --------------------------------------------------------
const _rgbCache = new Map();
function rgbOf(c) {
  if (typeof c !== 'string') return c;
  let v = _rgbCache.get(c);
  if (v) return v;
  if (c[0] === '#') v = hexToRgb(c);
  else { const m = c.match(/[\d.]+/g); v = { r: +m[0], g: +m[1], b: +m[2] }; }
  _rgbCache.set(c, v);
  return v;
}
// 4 bits per channel: a light posterise that keeps greys neutral.
function q4(v) { return Math.min(255, Math.round(v / 17) * 17); }
function hash2(x, y) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

// --- Bitmap font (5x7, uppercase) ---------------------------------------------
const GLYPHS = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
const GLYPH_ADV = 6;
const _styles = new Map();
const _glyphs = new Map();

// A text style: per-row colours (a vertical gradient), an outline colour and an optional slant.
function pxStyle(color, outline = '#000', italic = false) {
  const key = (Array.isArray(color) ? color.join(',') : color) + '|' + outline + '|' + italic;
  let s = _styles.get(key);
  if (s) return s;
  let rows;
  if (Array.isArray(color)) rows = color;
  else if (color[0] === '#') rows = [0.5, 0.3, 0.12, 0, -0.08, -0.18, -0.3].map(a => shade(color, a));
  else rows = new Array(7).fill(color);
  s = { key, rows, outline, italic };
  _styles.set(key, s);
  return s;
}
// Genesis HUD styles: yellow italic labels and white values.
const HUD_LABEL = pxStyle(['#fff8b0', '#fff070', '#f8e040', '#f0c828', '#e8a818', '#d88810', '#c07008'], '#201000', true);
const HUD_VALUE = pxStyle(['#ffffff', '#ffffff', '#f0f0f0', '#e0e0e8', '#c8c8d8', '#b0b0c8', '#9898b0'], '#101020', false);

function glyphCanvas(style, ch) {
  const key = style.key + '|' + ch;
  let c = _glyphs.get(key);
  if (c) return c;
  const g = GLYPHS[ch] || GLYPHS['?'];
  const W = 5 + 2 + (style.italic ? 1 : 0), H = 9;
  const lit = new Uint8Array(W * H);
  const rowOf = new Int8Array(W * H);
  for (let r = 0; r < 7; r++) for (let x = 0; x < 5; x++) {
    if (g[r][x] !== '#') continue;
    const px = x + 1 + (style.italic && r < 3 ? 1 : 0), py = r + 1;
    lit[py * W + px] = 1; rowOf[py * W + px] = r;
  }
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (style.outline) {
    ctx.fillStyle = style.outline;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (lit[y * W + x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && lit[ny * W + nx]) { near = true; break; }
      }
      if (near) ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!lit[y * W + x]) continue;
    ctx.fillStyle = style.rows[rowOf[y * W + x]];
    ctx.fillRect(x, y, 1, 1);
  }
  _glyphs.set(key, c);
  return c;
}

function pxWidth(str, scale = 1) { return String(str).length * GLYPH_ADV * scale - scale; }

function pxText(ctx, str, x, y, scale, style, align = 'left') {
  str = String(str).toUpperCase();
  const w = pxWidth(str, scale);
  let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  x0 = Math.round(x0); y = Math.round(y);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ') continue;
    const g = glyphCanvas(style, ch);
    ctx.drawImage(g, x0 + i * GLYPH_ADV * scale - scale, y - scale, g.width * scale, g.height * scale);
  }
  ctx.imageSmoothingEnabled = prev;
}

// --- Pixel grids ----------------------------------------------------------------
class PixGrid {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); }
  set(x, y, col) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = col;
  }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.c[y * this.w + x] : null; }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  ellipse(cx, cy, rx, ry, col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, col);
    }
  }
  outline(col) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, col);
    return this;
  }
  toCanvas(map) {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.c.length; i++) {
      let col = this.c[i];
      if (!col) continue;
      if (map) col = map(col, i % this.w, (i / this.w) | 0);
      const v = rgbOf(col);
      img.data[i * 4] = q4(v.r); img.data[i * 4 + 1] = q4(v.g); img.data[i * 4 + 2] = q4(v.b);
      img.data[i * 4 + 3] = v.a == null ? 255 : v.a;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

// Recolour every opaque pixel of a canvas.
function recolor(src, fn) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const o = fn(d[i], d[i + 1], d[i + 2], (i / 4) % c.width, ((i / 4) / c.width) | 0);
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3] == null ? d[i + 3] : o[3];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Turn an anti-aliased vector drawing into crisp outlined pixel art.
function pixelize(src, outline = '#0c0c14', thresh = 110) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const g = new PixGrid(w, h);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < thresh) continue;
    g.c[i] = `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`;
  }
  if (outline) g.outline(outline);
  return g.toCanvas();
}

// Draw an image centred at (x, y), rotated in 32 steps, scaled by an integer factor.
function blitRot(ctx, img, x, y, angle = 0, k = 1) {
  const step = TAU / 32;
  const a = Math.round(angle / step) * step;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (a) ctx.rotate(a);
  ctx.drawImage(img, -Math.floor(img.width / 2) * k, -Math.floor(img.height / 2) * k, img.width * k, img.height * k);
  ctx.restore();
}

// --- Car sprites -------------------------------------------------------------------
const _carSprites = new Map();
const OPEN_TOP = { jeep: true, hotrod: true };

function carSprite(drv, Z) {
  const key = drv.id + '@' + Z;
  if (_carSprites.has(key)) return _carSprites.get(key);
  const b = BODY[drv.body];
  const truck = drv.body === 'truck';
  const L = Math.max(12, Math.round(b.len * Z));
  const Wd = Math.max(8, Math.round((b.wid + (truck ? 4 : 2)) * Z));
  const pad = 2;
  const G = new PixGrid(L + pad * 2, Wd + pad * 2);
  const P = (x, y, col) => G.set(x + pad, y + pad, col);
  const R = (x, y, w, h, col) => G.rect(x + pad, y + pad, w, h, col);
  const body = drv.color, hi = shade(body, 0.35), hi2 = shade(body, 0.65), lo = shade(body, -0.28), lo2 = shade(body, -0.5), acc = drv.accent;

  // Wheels poke out at the four corners.
  const wl = Math.max(3, Math.round(L * (truck ? 0.3 : 0.22)));
  const wt = Math.max(2, Math.round(Wd * (truck ? 0.3 : 0.22)));
  for (const wx of [1, L - 1 - wl]) for (const top of [true, false]) {
    const wy = top ? 0 : Wd - wt;
    R(wx, wy, wl, wt, '#181818');
    for (let k = 0; k < wl; k += 2) P(wx + k, top ? wy : wy + wt - 1, '#555555');
    if (truck) P(wx + (wl >> 1), top ? wy + wt - 1 : wy, '#909090');
  }

  // Body with light from the top-left.
  const inset = truck ? wt : Math.max(1, wt - 1);
  const by0 = inset, by1 = Wd - inset, bx0 = truck ? 1 : 0, bx1 = truck ? L - 1 : L;
  const mid = Math.floor((by0 + by1 - 1) / 2);
  for (let x = bx0; x < bx1; x++) for (let y = by0; y < by1; y++) {
    const ex = x === bx0 || x === bx1 - 1, ey = y === by0 || y === by1 - 1;
    if (ex && ey) continue;
    let col = body;
    if (y === by0) col = hi;
    else if (y === by1 - 1) col = lo;
    else if (x === bx0) col = lo;
    P(x, y, col);
  }
  for (let x = bx0 + 2; x < bx1 - 3; x++) if (x % 3 !== 0) P(x, by0 + 1, hi2);

  const cx0 = bx0 + Math.round(L * b.cab[0]), cx1 = bx0 + Math.round(L * b.cab[1]);
  const cy0 = by0 + 1, cy1 = by1 - 1;

  switch (drv.body) {
    case 'jeep':
      R(bx0 + 1, cy0, cx1 - bx0 - 1, cy1 - cy0, lo2);            // open tub
      R(bx0 - 1, mid - 1, 2, 3, '#181818');                     // spare tire
      for (let x = cx1 + 1; x < bx1 - 2; x++) P(x, mid, acc);
      for (let y = cy0; y < cy1; y++) P(cx0 + 1, y, '#2a2a2a');  // roll bar
      break;
    case 'hotrod':
      for (let x = bx1 - Math.round(L * 0.32); x < bx1 - 1; x++) for (let y = mid - 1; y <= mid + 1; y++) P(x, y, (x + y) % 2 ? '#e8e8e8' : '#9a9a9a');
      P(bx1 - Math.round(L * 0.36), by0, acc); P(bx1 - Math.round(L * 0.36) - 1, by0 + 1, acc);
      P(bx1 - Math.round(L * 0.36), by1 - 1, acc); P(bx1 - Math.round(L * 0.36) - 1, by1 - 2, acc);
      R(bx0 + 1, cy0, cx1 - bx0, cy1 - cy0, lo2);
      break;
    case 'coupe':
      for (let x = bx0 + 1; x < bx1 - 1; x++) P(x, mid, acc);
      break;
    case 'pickup':
      R(bx0 + 1, cy0, Math.round(L * 0.38), cy1 - cy0, lo2);     // bed
      R(bx0 + 2, mid - 1, 2, 2, '#303030'); P(bx0 + 2, mid - 1, acc);
      break;
    case 'rally':
      for (let y = 0; y < Wd; y++) P(bx0, y, lo2);                  // rear wing
      R(bx1 - 5, mid - 1, 3, 3, '#ffffff'); P(bx1 - 4, mid, '#202020');
      break;
    case 'muscle':
      for (let x = bx0; x < bx1; x++) { P(x, mid - 1, acc); P(x, mid + 1, acc); }
      R(bx1 - 6, mid, 2, 1, lo2);
      break;
    case 'sled':
      P(bx0 - 1, by0 - 1, acc); P(bx0, by0, acc); P(bx0 - 1, by1, acc); P(bx0, by1 - 1, acc);
      for (let x = bx1 - 5; x < bx1 - 1; x++) P(x, mid, acc);
      break;
    case 'truck':
      for (let y = by0; y < by1; y++) P(bx1, y, acc);            // bull bar
      R(bx0 + 1, cy0, Math.round(L * 0.24), cy1 - cy0, lo);
      break;
  }

  if (OPEN_TOP[drv.body]) {
    // Driver's helmet in an open cockpit, windscreen in front.
    const hx = cx0 + Math.max(1, ((cx1 - cx0) >> 1) - 1);
    R(hx, mid - 1, 3, 3, acc); P(hx, mid - 1, '#ffffff'); P(hx + 2, mid, '#1b2430');
    for (let y = cy0; y < cy1; y++) P(cx1, y, '#8fc8f0');
  } else {
    R(cx0, cy0, cx1 - cx0, cy1 - cy0, '#1b2430');
    for (let y = cy0; y < cy1; y++) { P(cx1 - 1, y, '#7fb8e8'); P(cx0, y, '#35506e'); }
    P(cx1 - 1, cy0, '#d0f0ff'); P(cx1 - 2, cy0, '#a8d8ff');
    if (drv.body === 'coupe') P((cx0 + cx1) >> 1, mid, acc);
  }

  P(bx1 - 1, by0 + 1, '#fff6b0'); P(bx1 - 1, by1 - 2, '#fff6b0');
  P(bx0, by0 + 1, '#c01010'); P(bx0, by1 - 2, '#c01010');

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

// --- Small world sprites ---------------------------------------------------------
const _sprites = new Map();
function cachedSprite(key, make) {
  if (!_sprites.has(key)) _sprites.set(key, make());
  return _sprites.get(key);
}

function crateSprite(Z) {
  return cachedSprite('crate' + Z, () => {
    const s = Math.max(10, Math.round(24 * Z));
    const G = new PixGrid(s + 2, s + 2);
    G.rect(1, 1, s, s, '#c8872e');
    for (let k = 1; k <= s; k++) { G.set(k, 1, '#f0b860'); G.set(1, k, '#f0b860'); G.set(k, s, '#6b4414'); G.set(s, k, '#6b4414'); }
    const g = GLYPHS['?'], gx = 1 + Math.floor((s - 5) / 2), gy = 1 + Math.floor((s - 7) / 2);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#') G.set(gx + c + 1, gy + r + 1, '#6b4414');
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#') G.set(gx + c, gy + r, '#ffe066');
    return G.outline('#0c0c14').toCanvas();
  });
}

function mineSprite(Z) {
  return cachedSprite('mine' + Z, () => {
    const r = Math.max(3, Math.round(9 * Z)), s = r * 2 + 5;
    const G = new PixGrid(s, s), c = s / 2;
    G.set(c - 0.5, 0.5, '#505050'); G.set(c - 0.5, s - 1.5, '#505050'); G.set(0.5, c - 0.5, '#505050'); G.set(s - 1.5, c - 0.5, '#505050');
    G.ellipse(c, c, r, r, '#6a6a6a');
    G.set(c - r / 2, c - r / 2, '#b0b0b0');
    G.set(c + r / 2 - 1, c + r / 2 - 1, '#3a3a3a');
    G.rect(Math.floor(c) - 1, Math.floor(c) - 1, 2, 2, '#ff3030');
    return G.outline('#0c0c14').toCanvas();
  });
}

function oilSprite(Z, variant) {
  return cachedSprite('oil' + Z + '_' + variant, () => {
    const rng = mulberry32(variant * 97 + 5);
    const R = Math.round(34 * Z), W = R * 2 + 6, H = Math.round(R * 1.6) + 6;
    const G = new PixGrid(W, H);
    for (let k = 0; k < 4; k++) {
      G.ellipse(W / 2 + (rng() - 0.5) * R * 0.8, H / 2 + (rng() - 0.5) * R * 0.5, R * (0.45 + rng() * 0.4), R * (0.3 + rng() * 0.3), '#0b0b0e');
    }
    for (let i = 0; i < G.c.length; i++) {
      if (G.c[i] && hash2(i, variant) < 0.07) G.c[i] = hash2(variant, i) < 0.5 ? '#6a4acc' : '#2aa890';
    }
    return G.toCanvas();
  });
}

function missileSprite(Z) {
  return cachedSprite('missile' + Z, () => {
    const L = Math.max(7, Math.round(16 * Z));
    const G = new PixGrid(L + 2, 7);
    G.rect(1, 2, L - 2, 3, '#e8e8e8');
    for (let x = 1; x < L - 2; x++) G.set(x, 2, '#ffffff');
    G.rect(L - 1, 3, 1, 1, '#e02030'); G.rect(L - 2, 2, 1, 3, '#e02030');
    G.set(1, 1, '#e02030'); G.set(1, 5, '#e02030'); G.set(2, 1, '#e02030'); G.set(2, 5, '#e02030');
    return G.outline('#0c0c14').toCanvas();
  });
}

// --- Icons (weapon and item badges) -----------------------------------------------
function iconSprite(type) {
  return cachedSprite('icon_' + type, () => {
    const c = document.createElement('canvas');
    c.width = c.height = 20;
    const ctx = c.getContext('2d');
    drawVectorIcon(ctx, type, 10, 10, 16);
    return pixelize(c);
  });
}

// --- Ground tiles --------------------------------------------------------------------
function groundTile(track) {
  const th = track.theme, T = 64, pal = th.gpal;
  const rng = mulberry32((track.def.seed || 1) * 31 + 7);
  const lattice = n => Array.from({ length: n * n }, () => rng());
  const L1 = lattice(4), L2 = lattice(8);
  const smooth = t => t * t * (3 - 2 * t);
  const vnoise = (lat, n, x, y) => {
    const fx = x / T * n, fy = y / T * n;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), u = smooth(fx - x0), v = smooth(fy - y0);
    const at = (a, b) => lat[((b % n + n) % n) * n + ((a % n + n) % n)];
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), u), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), u), v);
  };
  const G = new PixGrid(T, T);
  const streak = th === THEMES.snow;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = streak
      ? 0.55 * vnoise(L1, 4, x * 0.25, y * 2) + 0.45 * vnoise(L2, 8, x * 0.5, y * 2)
      : 0.6 * vnoise(L1, 4, x, y) + 0.4 * vnoise(L2, 8, x, y);
    const level = clamp(n, 0, 0.999) * (pal.length - 1);
    let idx = Math.floor(level) + ((level % 1) > BAYER4[(y & 3) * 4 + (x & 3)] ? 1 : 0);
    const r = rng();
    if (r < 0.06) idx--; else if (r < 0.1) idx++;
    G.set(x, y, pal[clamp(idx, 0, pal.length - 1)]);
  }
  if (th === THEMES.city) {
    for (let k = 0; k < T; k++) { G.set(k, 0, pal[3]); G.set(0, k, pal[3]); G.set(k, 32, pal[3]); G.set(32, k, pal[3]); }
  } else if (th === THEMES.volcano) {
    for (let k = 0; k < 5; k++) {
      let x = rng() * T, y = rng() * T;
      for (let j = 0; j < 14; j++) {
        G.set(((x % T) + T) % T, ((y % T) + T) % T, j % 3 ? '#e0501a' : '#ff9a30');
        x += rng() < 0.5 ? 1 : -1; y += rng() < 0.6 ? 1 : 0;
      }
    }
  } else if (th === THEMES.jungle) {
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(rng() * T), y = Math.floor(rng() * T);
      G.set(x, y, '#23601f'); G.set(x, (y + 1) % T, '#23601f'); G.set(x, (y + T - 1) % T, '#6ab85a');
    }
  } else if (th === THEMES.junk) {
    for (let k = 0; k < 30; k++) { const x = Math.floor(rng() * T), y = Math.floor(rng() * T); G.set(x, y, '#9a9384'); G.set((x + 1) % T, y, '#4a4436'); }
  } else if (th === THEMES.desert) {
    for (let k = 0; k < 50; k++) G.set(Math.floor(rng() * T), Math.floor(rng() * T), rng() < 0.5 ? '#f4dca8' : '#a47a3e');
  }
  const canvas = G.toCanvas();
  const data = canvas.getContext('2d').getImageData(0, 0, T, T).data;
  return { canvas, data, T };
}

// --- Track baking --------------------------------------------------------------------
// Renders the whole course once into a pixel-textured bitmap at world scale Z.
function bakeTrack(track, Z) {
  const t0 = performance.now();
  const th = track.theme;
  const b = track.bounds, pad = 320;
  const ox = Math.floor((b.minX - pad) * Z), oy = Math.floor((b.minY - pad) * Z);
  const W = Math.ceil((b.maxX + pad) * Z) - ox, H = Math.ceil((b.maxY + pad) * Z) - oy;
  const tile = groundTile(track);

  // Scenery drawn as vector art, then snapped to pixels below.
  const dc = document.createElement('canvas');
  dc.width = W; dc.height = H;
  const dctx = dc.getContext('2d', { willReadFrequently: true });
  dctx.setTransform(Z, 0, 0, Z, -ox, -oy);
  for (const d of track.decor) drawDecor(dctx, d, th, 0.3);
  const dec = dctx.getImageData(0, 0, W, H).data;
  dc.width = dc.height = 0;   // release the scratch canvas early

  // Mask of pixels close enough to the track to need a road lookup.
  const mc = document.createElement('canvas');
  mc.width = W; mc.height = H;
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  mctx.setTransform(Z, 0, 0, Z, -ox, -oy);
  const limit = track.wallOff + 16;
  mctx.lineWidth = 2 * limit + 4; mctx.lineJoin = 'round'; mctx.strokeStyle = '#fff';
  mctx.stroke(track.path);
  const mask = mctx.getImageData(0, 0, W, H).data;
  mc.width = mc.height = 0;

  const N = track.n, px = track.px, py = track.py, L = track.length, sp = track.spacing;
  const halfW = track.halfW, wallOff = track.wallOff;
  const col = c => { const v = rgbOf(c); return [v.r, v.g, v.b]; };
  const C = {
    road: col(th.road), roadHi: col(shade(th.road, 0.14)), roadLo: col(shade(th.road, -0.16)),
    edge: col(th.roadEdge), curbA: col(th.curbA), curbB: col(th.curbB),
    sh: col(th.shoulder), shHi: col(shade(th.shoulder, 0.15)), shLo: col(shade(th.shoulder, -0.14)),
    wall: col(th.wall), wallB: col(th.wallB), wallDark: col(shade(th.wall, -0.55)),
    line: col(th.line), chkA: [244, 244, 244], chkB: [17, 17, 17], grid: [216, 216, 216],
    pad: [26, 26, 26], chev: [[255, 176, 0], [255, 208, 64], [255, 240, 128]], ember: [255, 106, 31],
  };
  // Coarse grid of centreline samples for the first lookup on each stretch of road.
  const GC = 160, gx0 = b.minX - pad, gy0 = b.minY - pad;
  const gw = Math.ceil((b.maxX - b.minX + pad * 2) / GC) + 1, gh = Math.ceil((b.maxY - b.minY + pad * 2) / GC) + 1;
  const cells = Array.from({ length: gw * gh }, () => []);
  for (let k = 0; k < N; k++) cells[Math.floor((py[k] - gy0) / GC) * gw + Math.floor((px[k] - gx0) / GC)].push(k);
  const cw = (2 * halfW) / 10;
  const gridSlots = [];
  for (let k = 0; k < 8; k++) {
    const row = Math.floor(k / 2), c = k % 2;
    gridSlots.push({ s: L - 70 - row * 70 - c * 30, lat: c ? track.gridLat : -track.gridLat });
  }

  const img = new ImageData(W, H);
  const out = img.data;
  const out32 = new Uint32Array(out.buffer);
  const tile32 = new Uint32Array(tile.data.buffer);
  const solid = new Uint8Array(W * H);
  let hint = -1;
  for (let j = 0; j < H; j++) {
    hint = -1;
    const Y = oy + j, trow = ((Y % 64) + 64) % 64 * 64;
    let tx = ((ox % 64) + 64) % 64 - 1;
    for (let i = 0; i < W; i++) {
      tx = (tx + 1) & 63;
      const o = (j * W + i) * 4;
      // Fast path: plain ground with no scenery is a straight copy of the (already posterised) tile.
      if (mask[o + 3] === 0 && dec[o + 3] <= 30) { out32[j * W + i] = tile32[trow + tx]; hint = -1; continue; }
      const X = ox + i, ti = (trow + tx) * 4;
      let r = tile.data[ti], g = tile.data[ti + 1], bl = tile.data[ti + 2];

      if (mask[o + 3] > 0) {
        const wx = (X + 0.5) / Z, wy = (Y + 0.5) / Z;
        // Nearest centreline sample: local search from the previous pixel, or a full scan.
        let best = hint, bd = Infinity;
        if (hint < 0) {
          const gcx = Math.floor((wx - gx0) / GC), gcy = Math.floor((wy - gy0) / GC);
          for (let cy2 = gcy - 1; cy2 <= gcy + 1; cy2++) for (let cx2 = gcx - 1; cx2 <= gcx + 1; cx2++) {
            if (cx2 < 0 || cy2 < 0 || cx2 >= gw || cy2 >= gh) continue;
            for (const k of cells[cy2 * gw + cx2]) {
              const dx = wx - px[k], dy = wy - py[k], d = dx * dx + dy * dy;
              if (d < bd) { bd = d; best = k; }
            }
          }
          if (best < 0) best = 0;
        } else {
          // Neighbouring pixels share almost the same nearest sample: hill-climb from the last one.
          const dist = q => { const dx = wx - px[q], dy = wy - py[q]; return dx * dx + dy * dy; };
          bd = dist(best);
          for (;;) {
            const a = best === 0 ? N - 1 : best - 1, c = best === N - 1 ? 0 : best + 1;
            const da = dist(a), dc = dist(c);
            if (da < bd && da <= dc) { best = a; bd = da; } else if (dc < bd) { best = c; bd = dc; } else break;
          }
        }
        hint = best;
        // Project onto the neighbouring segment.
        let a = best, c2 = (best + 1) % N;
        let sx = px[c2] - px[a], sy = py[c2] - py[a];
        let l2 = sx * sx + sy * sy || 1;
        let t = ((wx - px[a]) * sx + (wy - py[a]) * sy) / l2;
        if (t < 0) {
          a = (best - 1 + N) % N; c2 = best;
          sx = px[c2] - px[a]; sy = py[c2] - py[a];
          l2 = sx * sx + sy * sy || 1;
          t = ((wx - px[a]) * sx + (wy - py[a]) * sy) / l2;
        }
        t = clamp(t, 0, 1);
        const ll = Math.sqrt(l2);
        const lat = ((wx - px[a] - sx * t) * -sy + (wy - py[a] - sy * t) * sx) / ll;
        let s = a * sp + t * ll;
        if (s >= L) s -= L;

        const h = hash2(X, Y);
        const aLat = Math.abs(lat) + (hash2(X * 3 + 7, Y * 5 + 1) - 0.5) * 5;
        let c = null;
        if (aLat < halfW - 5) c = h < 0.12 ? C.roadHi : h < 0.27 ? C.roadLo : C.road;
        else if (aLat < halfW) c = h < 0.2 ? C.roadLo : C.edge;
        else if (aLat < halfW + 8) c = ((s / 22) | 0) % 2 ? C.curbB : C.curbA;
        else if (aLat < wallOff) c = th.offDamage && h < 0.07 ? C.ember : h < 0.18 ? C.shLo : h < 0.28 ? C.shHi : C.sh;
        else if (aLat < wallOff + 7) c = ((s / 26) | 0) % 2 ? C.wallB : C.wall;
        else if (aLat < wallOff + 12) c = C.wall;
        else if (aLat < wallOff + 14) c = C.wallDark;

        if (Math.abs(lat) < halfW) {
          if (Math.abs(lat) < 2.2 && ((s / 30) | 0) % 2 === 0) c = C.line;
          const u = s > L / 2 ? s - L : s;
          if (u >= -cw && u < cw) c = (Math.floor((lat + halfW) / cw) + Math.floor((u + cw) / cw)) % 2 ? C.chkB : C.chkA;
          if (s > L - 400) {
            for (const gs of gridSlots) {
              const du = s - gs.s, dv = lat - gs.lat;
              if ((du >= -22 && du <= 24 && Math.abs(Math.abs(dv) - 15) < 1.3) || (Math.abs(du - 24) < 1.3 && Math.abs(dv) <= 15)) c = C.grid;
            }
          }
          for (const bp of track.boosts) {
            let du = s - bp.s;
            if (du > L / 2) du -= L; else if (du < -L / 2) du += L;
            const dv = lat - bp.lat;
            if (Math.abs(du) < bp.len / 2 + 2 && Math.abs(dv) < bp.wid / 2 + 2) {
              c = C.pad;
              const hh = bp.wid / 2 - 4, tt = Math.abs(dv) / hh;
              if (tt <= 1) for (let k = 0; k < 3; k++) {
                const o2 = -bp.len / 2 + 6 + k * 16;
                if (du >= o2 + 6 * (1 - tt) && du <= o2 + 12 * (1 - tt)) c = C.chev[k];
              }
            }
          }
        }
        if (c) { r = c[0]; g = c[1]; bl = c[2]; }
      } else {
        hint = -1;
      }

      // Scenery: solid pixels, soft shadows, and glows.
      const da = dec[o + 3];
      if (da > 170) {
        r = dec[o]; g = dec[o + 1]; bl = dec[o + 2];
        solid[j * W + i] = 1;
      } else if (da > 30) {
        const lum = dec[o] * 0.3 + dec[o + 1] * 0.59 + dec[o + 2] * 0.11;
        if (lum < 90) { r *= 0.62; g *= 0.62; bl *= 0.62; }
        else { const k = da / 255; r = lerp(r, dec[o], k); g = lerp(g, dec[o + 1], k); bl = lerp(bl, dec[o + 2], k); }
      }
      out[o] = q4(r); out[o + 1] = q4(g); out[o + 2] = q4(bl); out[o + 3] = 255;
    }
  }
  // Dark outline around scenery.
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i;
    if (solid[k]) continue;
    if (solid[k - 1] || solid[k + 1] || solid[k - W] || solid[k + W]) {
      const o = k * 4;
      out[o] = 17; out[o + 1] = 12; out[o + 2] = 20;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(img, 0, 0);
  return { canvas, ctx, ox, oy, W, H, Z, tile: tile.canvas, pattern: null, ms: performance.now() - t0 };
}

// The last bake is kept so restarting the same track is instant. Bakes are never
// drawn into after creation, so races can share one.
let _bakeCache = null;
function bakeTrackCached(track, Z) {
  const key = track.name + '@' + Z;
  if (!_bakeCache || _bakeCache.key !== key) _bakeCache = { key, bake: bakeTrack(track, Z) };
  return _bakeCache.bake;
}

// Tiny pixel minimap for the race HUD.
function minimapPixel(track, w, h) {
  track._miniPx = track._miniPx || {};
  const key = w + 'x' + h;
  if (track._miniPx[key]) return track._miniPx[key];
  const tf = minimapTransform(track, w, h);
  const G = new PixGrid(w, h);
  for (let i = 0; i < track.n; i++) G.set(Math.floor(tf.ox + track.px[i] * tf.sc), Math.floor(tf.oy + track.py[i] * tf.sc), '#e8e8e8');
  G.outline('#101020');
  const s = track.pointAt(0);
  G.rect(Math.floor(tf.ox + s.x * tf.sc) - 1, Math.floor(tf.oy + s.y * tf.sc) - 1, 3, 3, '#ffe066');
  track._miniPx[key] = { canvas: G.toCanvas(), tf };
  return track._miniPx[key];
}

// Shared half-resolution buffer for the race view.
const LowRes = {
  canvas: null, ctx: null,
  get() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = VIEW_W / 2; this.canvas.height = VIEW_H / 2;
      this.ctx = this.canvas.getContext('2d');
    }
    this.ctx.imageSmoothingEnabled = false;
    return this;
  },
};
