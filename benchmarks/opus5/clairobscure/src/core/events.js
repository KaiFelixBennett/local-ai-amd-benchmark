/**
 * Minimal synchronous event bus.
 *
 * Systems publish facts ("parry-perfect", "turn-ended", "damage-dealt") and the
 * presentation layers (audio, particles, camera, screen FX) subscribe. This is
 * what keeps battle logic free of any knowledge about rendering or sound.
 */

export class EventBus {
  constructor() {
    this._handlers = new Map();
    this._depth = 0;
  }

  /** Subscribe. Returns an unsubscribe function. */
  on(type, fn) {
    let list = this._handlers.get(type);
    if (!list) {
      list = [];
      this._handlers.set(type, list);
    }
    list.push(fn);
    return () => this.off(type, fn);
  }

  /** Subscribe for exactly one emission. */
  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    const list = this._handlers.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  /**
   * Emit synchronously. Handler exceptions are contained and logged so a bad
   * listener can never break the battle loop.
   */
  emit(type, payload) {
    const list = this._handlers.get(type);
    if (!list || list.length === 0) return;
    this._depth++;
    // Copy so handlers may safely subscribe/unsubscribe during dispatch.
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](payload);
      } catch (err) {
        console.error(`[events] handler for "${type}" threw:`, err);
      }
    }
    this._depth--;
  }

  clear(type) {
    if (type) this._handlers.delete(type);
    else this._handlers.clear();
  }
}

/**
 * Canonical event names. Using constants keeps typos from silently producing
 * a listener that never fires.
 */
export const EV = {
  // Battle flow
  BATTLE_START: 'battle-start',
  WAVE_START: 'wave-start',
  WAVE_CLEAR: 'wave-clear',
  TURN_START: 'turn-start',
  TURN_END: 'turn-end',
  STATE_CHANGE: 'state-change',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  ENCOUNTER_END: 'encounter-end',

  // Actions
  ACTION_CHOSEN: 'action-chosen',
  ATTACK_SWING: 'attack-swing',
  DAMAGE_DEALT: 'damage-dealt',
  HEAL_DEALT: 'heal-dealt',
  STATUS_APPLIED: 'status-applied',
  STATUS_TICK: 'status-tick',
  BREAK_STAGGER: 'break-stagger',
  COMBATANT_DIED: 'combatant-died',
  AP_CHANGED: 'ap-changed',
  GRADIENT_CHANGED: 'gradient-changed',

  // Reactive defence
  TELEGRAPH_START: 'telegraph-start',
  TELEGRAPH_TICK: 'telegraph-tick',
  HIT_INCOMING: 'hit-incoming',
  PARRY_PERFECT: 'parry-perfect',
  DODGE_SUCCESS: 'dodge-success',
  REACTION_WHIFF: 'reaction-whiff',
  HIT_LANDED: 'hit-landed',
  COMBO_COMPLETE: 'combo-complete',
  COUNTER_TRIGGERED: 'counter-triggered',
  FLOW_CHANGED: 'flow-changed',

  // Free aim
  AIM_ENTER: 'aim-enter',
  AIM_EXIT: 'aim-exit',
  AIM_SHOT: 'aim-shot',

  // Presentation hints
  CAMERA_FOCUS: 'camera-focus',
  SCREEN_SHAKE: 'screen-shake',
  SCREEN_FLASH: 'screen-flash',
  TIME_WARP: 'time-warp',
  MENU_MOVE: 'menu-move',
  MENU_CONFIRM: 'menu-confirm',
  MENU_CANCEL: 'menu-cancel',
  LEVEL_UP: 'level-up',
};
