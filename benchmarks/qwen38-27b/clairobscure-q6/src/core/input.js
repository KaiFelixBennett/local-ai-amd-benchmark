/**
 * core/input.js — Keyboard + mouse input with frame-accurate edge detection
 * and wall-clock press timestamps.
 *
 * The reactive layer needs to know NOT just "was parry pressed this frame"
 * but *when* the key went down, in the same time domain as the attack
 * windows. Raw keydown timestamps (performance.now()) are captured at event
 * time and converted to logical time via `timeline.rawToLogical()`, so a
 * press is judged at its true moment even though the game samples per frame.
 *
 * Actions (key -> action):
 *   PARRY:  Space / J / K  or  left mouse button
 *   DODGE:  Shift / L      or  right mouse button
 *   UI:     arrows / WASD, Enter/E (confirm), X/Escape/Q (cancel), Tab (tab)
 * The battle menu and prompts also listen to these action names.
 */

const KEYMAP = {
  ' ': 'parry',
  j: 'parry',
  k: 'parry',
  shift: 'dodge',
  l: 'dodge',
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
  enter: 'confirm',
  e: 'confirm',
  escape: 'cancel',
  x: 'cancel',
  q: 'cancel',
  tab: 'tab',
};

const MOUSE_MAP = { 0: 'parry', 2: 'dodge' };

export class Input {
  constructor(dom, timeline) {
    this.dom = dom;
    this.timeline = timeline;
    this.mouseNdc = { x: 0, y: 0 };      // -1..1
    this.mousePixel = { x: 0, y: 0 };    // CSS px
    this.mouseInside = false;

    this._down = new Set();              // currently held actions
    this._pending = new Map();           // action -> {raw} keydowns between frames
    this._frame = new Map();             // action -> logical press time (this frame)
    this._clickPixel = { x: 0, y: 0, active: false };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onContext = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    dom.addEventListener('contextmenu', this._onContext);
  }

  _actionForKey(key) {
    return KEYMAP[key] || KEYMAP[key.toLowerCase()] || null;
  }

  _onKeyDown(e) {
    const action = this._actionForKey(e.key || '');
    if (!action) return;
    // Prevent page scroll / tab focus loss for game keys.
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes((e.key || '').toLowerCase())) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this._down.add(action);
    if (!this._pending.has(action)) {
      this._pending.set(action, { raw: performance.now(), key: true });
    }
  }

  _onKeyUp(e) {
    const action = this._actionForKey(e.key || '');
    if (action) this._down.delete(action);
  }

  _onMouseMove(e) {
    const rect = this.dom.getBoundingClientRect();
    this.mousePixel.x = e.clientX - rect.left;
    this.mousePixel.y = e.clientY - rect.top;
    this.mouseNdc.x = (this.mousePixel.x / Math.max(1, rect.width)) * 2 - 1;
    this.mouseNdc.y = -((this.mousePixel.y / Math.max(1, rect.height)) * 2 - 1);
    this.mouseInside =
      this.mousePixel.x >= 0 && this.mousePixel.y >= 0 &&
      this.mousePixel.x <= rect.width && this.mousePixel.y <= rect.height;
  }

  _onMouseDown(e) {
    const action = MOUSE_MAP[e.button];
    if (!action) return;
    this._down.add(action);
    this._clickPixel = {
      x: e.clientX, y: e.clientY,
      active: action === 'parry' ? true : this._clickPixel.active,
      button: e.button,
    };
    if (!this._pending.has(action)) {
      this._pending.set(action, { raw: performance.now(), key: false, button: e.button });
    }
  }

  _onMouseUp(e) {
    const action = MOUSE_MAP[e.button];
    if (action) this._down.delete(action);
  }

  /**
   * Call once per frame AFTER timeline.update(). Moves pending events into
   * the current frame and stamps them with logical time.
   */
  update() {
    this._frame = new Map();
    for (const [action, info] of this._pending) {
      this._frame.set(action, {
        t: this.timeline.rawToLogical(info.raw),
        key: info.key,
        button: info.button ?? null,
      });
    }
    this._pending.clear();
  }

  /** True only on the frame the action was first pressed. */
  pressed(action) {
    return this._frame.has(action);
  }

  /** Logical timestamp (ms) of this frame's press, or null. */
  pressedAt(action) {
    const rec = this._frame.get(action);
    return rec ? rec.t : null;
  }

  /** Currently held. */
  down(action) {
    return this._down.has(action);
  }

  /**
   * A left-mouse click this frame (used to lock the free-aim target), with
   * its logical timestamp and CSS pixel position. Returns null otherwise.
   */
  mouseLock() {
    const rec = this._frame.get('parry');
    return rec && rec.key === false && rec.button === 0
      ? { t: rec.t, x: this.mousePixel.x, y: this.mousePixel.y }
      : null;
  }

  /**
   * Which reaction input (if any) arrived this frame, with its logical
   * timestamp. Reaction system consumes exactly one.
   */
  reactionInput() {
    const parry = this._frame.get('parry');
    const dodge = this._frame.get('dodge');
    if (!parry && !dodge) return null;
    // If both arrive in the same frame, the earliest press wins.
    if (!parry || (dodge && dodge.t < parry.t)) {
      return { action: 'dodge', t: dodge.t };
    }
    return { action: 'parry', t: parry.t };
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.dom.removeEventListener('contextmenu', this._onContext);
  }
}
