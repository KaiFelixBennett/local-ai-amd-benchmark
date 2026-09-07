// Tiny event bus. Battle logic emits; UI / FX / audio subscribe. Keeps modules decoupled.

export class EventBus {
  constructor() {
    this._handlers = new Map();
  }
  on(event, fn) {
    let list = this._handlers.get(event);
    if (!list) { list = []; this._handlers.set(event, list); }
    list.push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const list = this._handlers.get(event);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  emit(event, payload) {
    const list = this._handlers.get(event);
    if (!list) return;
    // Copy so handlers may unsubscribe during dispatch.
    for (const fn of list.slice()) {
      try { fn(payload); } catch (err) { console.error(`[bus:${event}]`, err); }
    }
  }
  clear() { this._handlers.clear(); }
}

// Canonical event names (documentation, not enforced).
export const EV = {
  BATTLE_START: 'battle:start',
  WAVE_START: 'battle:wave',
  TURN_START: 'turn:start',
  TURN_END: 'turn:end',
  MENU_OPEN: 'ui:menu',
  MENU_CHOICE: 'ui:choice',
  AIM_START: 'aim:start',
  AIM_RESULT: 'aim:result',
  ATTACK_START: 'attack:start',
  DAMAGE: 'combat:damage',
  HEAL: 'combat:heal',
  STATUS: 'combat:status',
  STAGGER: 'combat:stagger',
  BREAK: 'combat:break',
  DEATH: 'combat:death',
  CHARGE: 'charge:gained',
  TELEGRAPH: 'react:telegraph',
  REACT_HIT: 'react:hit-judged',
  PARRY: 'react:parry',
  PERFECT: 'react:perfect',
  DODGE: 'react:dodge',
  FAIL: 'react:fail',
  COMBO_END: 'react:combo-end',
  COUNTER_WINDOW: 'react:counter-window',
  COUNTER: 'react:counter',
  GRADIENT_READY: 'ult:ready',
  GRADIENT_FIRE: 'ult:fire',
  VICTORY: 'battle:victory',
  DEFEAT: 'battle:defeat',
  RESTART: 'battle:restart',
  LOG: 'log',
  CAM_SHAKE: 'fx:shake',
  CAM_FOCUS: 'cam:focus',
  FX: 'fx',
  SLOWMO: 'fx:slowmo',
  FLASH: 'fx:flash'
};
