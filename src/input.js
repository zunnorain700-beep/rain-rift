/**
 * input.js — unified keyboard + touch control state.
 * Keyboard produces analog-ish values (with smoothing applied in physics);
 * touch buttons set raw flags. Item use is edge triggered.
 */

const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['Space'],
  item: ['ShiftLeft', 'ShiftRight', 'KeyE'],
  pause: ['Escape']
};

export class Input {
  constructor({ onPause } = {}) {
    this.keys = new Set();
    this.touch = { left: false, right: false, throttle: false, brake: false, drift: false };
    this.itemQueued = false;
    this.onPause = onPause || (() => {});
    this.enabled = false;
    this.anyGesture = false;

    this._onKeyDown = (e) => this._keydown(e);
    this._onKeyUp = (e) => this._keyup(e);
    this._onBlur = () => this.keys.clear();
    this._unbindTouch = [];
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this._bindTouch();
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    for (const off of this._unbindTouch) off();
    this._unbindTouch.length = 0;
    this.keys.clear();
  }

  _bindTouch() {
    const buttons = document.querySelectorAll('[data-touch]');
    buttons.forEach((btn) => {
      const action = btn.dataset.touch;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('is-down');
        this.anyGesture = true;
        if (action === 'item') this.itemQueued = true;
        else this.touch[action] = true;
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('is-down');
        if (action !== 'item') this.touch[action] = false;
      };
      // Android fires contextmenu on long-press, which cancels the held pointer.
      const noMenu = (e) => e.preventDefault();
      btn.addEventListener('contextmenu', noMenu);
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      this._unbindTouch.push(() => {
        btn.removeEventListener('contextmenu', noMenu);
        btn.removeEventListener('pointerdown', down);
        btn.removeEventListener('pointerup', up);
        btn.removeEventListener('pointercancel', up);
        btn.removeEventListener('pointerleave', up);
      });
    });
  }

  _keydown(e) {
    this.anyGesture = true;
    const code = e.code;
    if (code === 'Escape') {
      e.preventDefault();
      this.onPause();
      return;
    }
    if (KEYMAP.item.includes(code)) {
      if (!this.keys.has(code)) this.itemQueued = true;
    }
    const bound = Object.values(KEYMAP).some((list) => list.includes(code));
    if (bound) e.preventDefault();
    this.keys.add(code);
  }

  _keyup(e) {
    this.keys.delete(e.code);
  }

  down(list) {
    for (const k of list) if (this.keys.has(k)) return true;
    return false;
  }

  /** Current frame control state. */
  sample() {
    const k = this.keys, t = this.touch;
    const steer = (this.down(KEYMAP.left) || t.left ? 1 : 0) -
                  (this.down(KEYMAP.right) || t.right ? 1 : 0);
    const throttle = (this.down(KEYMAP.throttle) || t.throttle) ? 1 : 0;
    const brake = (this.down(KEYMAP.brake) || t.brake) ? 1 : 0;
    const drift = this.down(KEYMAP.drift) || t.drift;
    return { throttle, brake, steer, drift, active: throttle + brake + Math.abs(steer) + (drift ? 1 : 0) > 0 };
  }

  /** Edge-triggered power-up use. */
  consumeItem() {
    if (this.itemQueued) { this.itemQueued = false; return true; }
    return false;
  }

  clear() {
    this.keys.clear();
    this.touch.left = this.touch.right = this.touch.throttle = this.touch.brake = this.touch.drift = false;
    this.itemQueued = false;
    document.querySelectorAll('.tbtn.is-down').forEach((b) => b.classList.remove('is-down'));
  }
}

/** Detect coarse pointers so we can show touch controls automatically. */
export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}
