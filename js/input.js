'use strict';
// Keyboard, gamepad, touch and pointer input with per-frame edge detection.

const BINDINGS = {
  solo: {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    special: ['KeyZ', 'KeyJ', 'Space'], item: ['KeyX', 'KeyK'],
  },
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    special: ['KeyF'], item: ['KeyG'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    special: ['Period', 'Numpad0'], item: ['Slash', 'NumpadDecimal'],
  },
};

const MENU_KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  ok: ['Enter', 'NumpadEnter', 'Space', 'KeyZ'], back: ['Escape', 'Backspace', 'KeyX'], pause: ['Escape', 'KeyP'],
};

const Input = {
  keys: new Set(),
  pressed: new Set(),
  pads: [{}, {}],
  padPrev: [{}, {}],
  touch: {},
  touchPrev: {},
  clicks: [],
  pointer: { x: -1, y: -1, moved: false },
  canvas: null,
  lastDevice: 'keyboard',

  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      SFX.ensure();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const toLogical = e => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * VIEW_W, y: (e.clientY - r.top) / r.height * VIEW_H };
    };
    canvas.addEventListener('pointerdown', e => {
      SFX.ensure();
      const p = toLogical(e);
      this.clicks.push(p);
      this.pointer.x = p.x; this.pointer.y = p.y;
      if (e.pointerType === 'touch') this.lastDevice = 'touch';
    });
    canvas.addEventListener('pointermove', e => {
      const p = toLogical(e);
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.moved = true;
    });

    // On-screen touch buttons.
    document.querySelectorAll('#touch [data-k]').forEach(btn => {
      const k = btn.dataset.k;
      const on = e => { e.preventDefault(); SFX.ensure(); this.touch[k] = true; btn.classList.add('on'); };
      const off = e => { e.preventDefault(); this.touch[k] = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  },

  poll() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    let slot = 0;
    for (let i = 0; i < gps.length && slot < 2; i++) {
      const gp = gps[i];
      if (!gp || !gp.connected) continue;
      const b = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
      const v = n => (gp.buttons[n] ? gp.buttons[n].value : 0);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const st = {
        connected: true,
        axisX: Math.abs(ax) > 0.2 ? ax : 0,
        up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
        a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), rt: v(7), lt: v(6), start: b(9),
      };
      if (Object.keys(st).some(k => k !== 'connected' && k !== 'axisX' && st[k] === true)) this.lastDevice = 'gamepad';
      this.pads[slot] = st;
      slot++;
    }
    for (; slot < 2; slot++) this.pads[slot] = {};
  },

  endFrame() {
    this.pressed.clear();
    this.clicks.length = 0;
    this.pointer.moved = false;
    for (let i = 0; i < 2; i++) this.padPrev[i] = Object.assign({}, this.pads[i]);
    this.touchPrev = Object.assign({}, this.touch);
  },

  anyKey(codes) { return codes.some(c => this.keys.has(c)); },
  anyPressed(codes) { return codes.some(c => this.pressed.has(c)); },
  padEdge(i, btn) { return !!this.pads[i][btn] && !this.padPrev[i][btn]; },
  touchEdge(k) { return !!this.touch[k] && !this.touchPrev[k]; },

  // Driving controls for a player slot: 'solo', 'p1' or 'p2'.
  controls(slot) {
    const k = BINDINGS[slot];
    const pi = slot === 'p2' ? 1 : 0;
    const pad = this.pads[pi];
    const useTouch = slot !== 'p2';
    let steer = (this.anyKey(k.right) ? 1 : 0) - (this.anyKey(k.left) ? 1 : 0);
    if (pad.axisX) steer += pad.axisX;
    else steer += (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
    if (useTouch) steer += (this.touch.right ? 1 : 0) - (this.touch.left ? 1 : 0);
    const throttle = this.anyKey(k.up) || pad.a || pad.rt > 0.3 || (useTouch && this.touch.gas) ? 1 : 0;
    const brake = this.anyKey(k.down) || pad.b || pad.lt > 0.3 || (useTouch && this.touch.brake) ? 1 : 0;
    const special = this.anyPressed(k.special) || this.padEdge(pi, 'x') || this.padEdge(pi, 'rb') || (useTouch && this.touchEdge('special'));
    const item = this.anyPressed(k.item) || this.padEdge(pi, 'y') || this.padEdge(pi, 'lb') || (useTouch && this.touchEdge('item'));
    return { steer: clamp(steer, -1, 1), throttle, brake, special, item };
  },

  menu(action) {
    if (this.anyPressed(MENU_KEYS[action])) return true;
    const map = { up: 'up', down: 'down', left: 'left', right: 'right', ok: 'a', back: 'b', pause: 'start' };
    for (let i = 0; i < 2; i++) {
      if (this.padEdge(i, map[action])) return true;
      if (action === 'ok' && this.padEdge(i, 'start')) return true;
    }
    if (action === 'pause' && this.touchEdge('pause')) return true;
    return false;
  },
};
