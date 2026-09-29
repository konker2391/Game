'use strict';
// Shared math, formatting and drawing helpers.

const TAU = Math.PI * 2;
const VIEW_W = 960;
const VIEW_H = 540;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function weightedChoice(table) {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [v, w] of table) {
    r -= w;
    if (r <= 0) return v;
  }
  return table[table.length - 1][0];
}

// Deterministic PRNG so track decorations are identical every visit.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function ordinal(n) {
  const s = ['TH', 'ST', 'ND', 'RD'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function fmtTime(t) {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
// amt in [-1, 1]: negative darkens toward black, positive lightens toward white.
function shade(hex, amt) {
  const c = hexToRgb(hex);
  const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  return `rgb(${Math.round((f - c.r) * p + c.r)},${Math.round((f - c.g) * p + c.g)},${Math.round((f - c.b) * p + c.b)})`;
}
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Bitmap-font text (see pixel.js). `size` is a nominal pixel height, snapped to a
// whole-pixel glyph scale; the outline colour frames every glyph.
function text(ctx, str, x, y, size, color, align = 'left', outline = '#000') {
  pxText(ctx, str, x, y, Math.max(1, Math.round(size / 7)), pxStyle(color, outline), align);
}
function textWidth(str, size) { return pxWidth(str, Math.max(1, Math.round(size / 7))); }

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}
function removeKey(key) {
  try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
}
