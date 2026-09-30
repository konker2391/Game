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

  // Controllers (USB or Bluetooth) come through the Gamepad API. Browsers only reveal a
  // controller after one of its buttons is pressed while the page is focused.
  padIndex: [-1, -1],   // navigator.getGamepads() index behind each player slot
  padCount: 0,
  padsBlocked: false,
  toasts: [],

  readPads() {
    if (!navigator.getGamepads || this.padsBlocked) return [];
    try {
      return Array.from(navigator.getGamepads() || []);
    } catch (e) {
      // An embedding page can disallow gamepads; keep the game running on keyboard/touch.
      this.padsBlocked = true;
      return [];
    }
  },

  // Normalise one controller into { up, down, left, right, a, b, x, y, lb, rb, lt, rt, start, axisX }.
  readPad(gp) {
    const btn = n => gp.buttons[n];
    const b = n => !!(btn(n) && (btn(n).pressed || btn(n).value > 0.5));
    const v = n => (btn(n) ? btn(n).value || (btn(n).pressed ? 1 : 0) : 0);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let hatX = 0, hatY = 0;
    if (gp.mapping !== 'standard') {
      // Non-standard Bluetooth pads often report the d-pad as a hat switch: one axis that steps
      // through 8 directions in [-1, 1] and rests outside that range.
      for (let i = 4; i < gp.axes.length; i++) {
        const h = gp.axes[i];
        if (h < -1.05 || h > 1.05 || Math.abs((h + 1) * 3.5 - Math.round((h + 1) * 3.5)) > 0.08) continue;
        if (i === 9 || gp.axes.length === 10) {
          const dir = Math.round((h + 1) * 3.5) % 8;   // 0 up, 2 right, 4 down, 6 left
          hatX = [0, 1, 1, 1, 0, -1, -1, -1][dir];
          hatY = [-1, -1, 0, 1, 1, 1, 0, -1][dir];
          break;
        }
      }
      // Some Android controllers put the d-pad on axes 6/7 instead.
      if (!hatX && !hatY && gp.axes.length >= 8 && gp.axes.length < 10) {
        hatX = Math.round(gp.axes[6] || 0); hatY = Math.round(gp.axes[7] || 0);
      }
    }
    const st = {
      connected: true,
      axisX: Math.abs(ax) > 0.2 ? ax : 0,
      up: b(12) || hatY < 0 || ay < -0.6, down: b(13) || hatY > 0 || ay > 0.6,
      left: b(14) || hatX < 0 || ax < -0.6, right: b(15) || hatX > 0 || ax > 0.6,
      a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), lt: v(6), rt: v(7), start: b(9),
    };
    return st;
  },

  poll() {
    const gps = this.readPads();
    const live = gps.filter(gp => gp && gp.connected);
    // Keep each player on the same physical controller while it stays connected.
    for (let slot = 0; slot < 2; slot++) {
      const gi = this.padIndex[slot];
      if (gi >= 0 && !live.some(gp => gp.index === gi)) {
        this.toast('CONTROLLER ' + (slot + 1) + ' DISCONNECTED');
        this.padIndex[slot] = -1;
      }
    }
    for (const gp of live) {
      if (this.padIndex.includes(gp.index)) continue;
      const slot = this.padIndex.indexOf(-1);
      if (slot < 0) break;
      this.padIndex[slot] = gp.index;
      this.toast('CONTROLLER ' + (slot + 1) + ' CONNECTED');
      SFX.ensure();
    }
    this.padCount = live.length;
    for (let slot = 0; slot < 2; slot++) {
      const gp = live.find(g => g.index === this.padIndex[slot]);
      const st = gp ? this.readPad(gp) : {};
      if (gp && Object.keys(st).some(k => k !== 'connected' && k !== 'axisX' && st[k] === true)) this.lastDevice = 'gamepad';
      this.pads[slot] = st;
    }
  },

  toast(msg) {
    this.toasts.push({ msg, life: 2.5 });
    if (this.toasts.length > 3) this.toasts.shift();
  },

  // Rumble the controller behind a player slot. strength 0..1.
  rumble(slot, strength, ms = 120) {
    const gi = this.padIndex[slot === 'p2' ? 1 : 0];
    if (gi < 0 || strength <= 0) return;
    const gp = this.readPads()[gi];
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    const k = clamp(strength, 0, 1);
    act.playEffect(act.type || 'dual-rumble', { duration: ms, strongMagnitude: k, weakMagnitude: Math.min(1, k * 0.7 + 0.2) }).catch(() => {});
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
    // Keys, A and the touch pedal are full throttle; the right trigger is analog.
    const throttle = this.anyKey(k.up) || pad.a || (useTouch && this.touch.gas) ? 1 : pad.rt > 0.08 ? clamp((pad.rt - 0.08) / 0.8, 0.25, 1) : 0;
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
