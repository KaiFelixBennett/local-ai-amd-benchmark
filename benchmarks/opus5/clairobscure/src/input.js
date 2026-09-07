/**
 * Keyboard and pointer capture, translated into named actions.
 *
 * Edge-triggered presses are collected during the frame and cleared by
 * `endFrame()`, so every consumer sees the same snapshot regardless of the
 * order in which systems poll. Key repeat is deliberately dropped: a held key
 * must never register as a second parry attempt.
 *
 * A key can map to several actions at once. WASD and the arrow keys both drive
 * menus, but only WASD moves the character and only the arrows turn the camera,
 * so the two never fight each other in the overworld.
 */

const KEY_ACTIONS = {
  ArrowUp: ['up', 'camUp'],
  ArrowDown: ['down', 'camDown'],
  ArrowLeft: ['left', 'camLeft'],
  ArrowRight: ['right', 'camRight'],
  KeyW: ['up', 'moveF'],
  KeyS: ['down', 'moveB'],
  KeyA: ['left', 'moveL'],
  KeyD: ['right', 'moveR'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  KeyZ: ['confirm'],
  Escape: ['cancel', 'pause'],
  Backspace: ['cancel'],
  KeyX: ['cancel'],
  Space: ['space'],
  ShiftLeft: ['dodge', 'sprint'],
  ShiftRight: ['dodge', 'sprint'],
  KeyK: ['dodge'],
  KeyJ: ['parry'],
  KeyE: ['interact'],
  KeyU: ['ultimate'],
  KeyR: ['restart'],
  KeyM: ['mute'],
  KeyF: ['aim'],
  KeyQ: ['camLeft'],
  KeyC: ['camRight'],
  KeyH: ['help'],
  Tab: ['skip'],
};

export class InputManager {
  constructor(target) {
    this.target = target || window;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = {
      x: 0, y: 0, dx: 0, dy: 0, wheel: 0,
      clicked: false, downNow: false, inside: false, locked: false,
    };
    this.anyInput = false;
    this.pointerLockElement = null;

    this._onKeyDown = (e) => {
      const actions = KEY_ACTIONS[e.code];
      if (!actions) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backspace' || e.code === 'Tab') {
        e.preventDefault();
      }
      if (!e.repeat) {
        for (const a of actions) this.pressed.add(a);
        this.anyInput = true;
      }
      for (const a of actions) this.down.add(a);
    };
    this._onKeyUp = (e) => {
      const actions = KEY_ACTIONS[e.code];
      if (!actions) return;
      for (const a of actions) this.down.delete(a);
    };
    this._onBlur = () => this.down.clear();
    this._onMove = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.dx += (e.movementX || 0) / window.innerWidth;
      this.mouse.dy += (e.movementY || 0) / window.innerHeight;
      this.mouse.inside = true;
    };
    this._onDown = () => {
      this.mouse.downNow = true;
      this.mouse.clicked = true;
      this.anyInput = true;
    };
    this._onUp = () => { this.mouse.downNow = false; };
    this._onWheel = (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      this.anyInput = true;
    };
    this._onLockChange = () => {
      this.mouse.locked = document.pointerLockElement === this.pointerLockElement;
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  /** Opt into pointer lock for mouse-look; safe to call repeatedly. */
  enablePointerLock(element) {
    this.pointerLockElement = element;
    if (!element) return;
    this._onCanvasClick = () => {
      if (document.pointerLockElement !== element && element.requestPointerLock) {
        const p = element.requestPointerLock();
        // Chrome returns a promise; a rejected lock request must not throw.
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    };
    element.addEventListener('click', this._onCanvasClick);
  }

  releasePointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  is(action) {
    return this.pressed.has(action);
  }

  held(action) {
    return this.down.has(action);
  }

  /** Menu navigation axis (WASD or arrows). */
  axis() {
    return {
      x: (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0),
      y: (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0),
    };
  }

  /** Character movement axis — WASD only. */
  moveAxis() {
    return {
      x: (this.held('moveR') ? 1 : 0) - (this.held('moveL') ? 1 : 0),
      y: (this.held('moveF') ? 1 : 0) - (this.held('moveB') ? 1 : 0),
    };
  }

  /** Camera axis — arrow keys and Q/C only. */
  cameraAxis() {
    return {
      yaw: (this.held('camRight') ? 1 : 0) - (this.held('camLeft') ? 1 : 0),
      pitch: (this.held('camDown') ? 1 : 0) - (this.held('camUp') ? 1 : 0),
    };
  }

  /** Pointer delta, only when the mouse is captured. */
  lookDelta() {
    if (!this.mouse.locked) return { dx: 0, dy: 0 };
    return { dx: this.mouse.dx, dy: this.mouse.dy };
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.mouse.clicked = false;
    this.anyInput = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('mousedown', this._onDown);
    window.removeEventListener('mouseup', this._onUp);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (this.pointerLockElement && this._onCanvasClick) {
      this.pointerLockElement.removeEventListener('click', this._onCanvasClick);
    }
  }
}
