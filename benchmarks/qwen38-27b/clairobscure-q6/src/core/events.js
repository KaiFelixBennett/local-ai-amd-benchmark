/**
 * core/events.js — Minimal synchronous event bus.
 *
 * Combat systems talk to each other exclusively through named events so no
 * module imports another for side effects. Event names are listed in the
 * docblock below; handlers may call `off()` at any time.
 *
 *   telegraph-started   {source, target, pattern, index, phase}
 *   hit-landed          {source, target, window, comboIndex, isLast}
 *   hit-resolved        {source, target, damage, outcome, comboIndex, crit, weakness}
 *   parry-success       {target, source, perfect, comboIndex, isLast, outcome}
 *   counter-fired       {source, target}
 *   flow-changed        {amount}
 *   staggered           {character, bonusWindowMs}
 *   hp-changed          {character, hp, maxHp, source}
 *   ap-changed          {character, ap, maxAp}
 *   ultimate-changed    {amount, max}
 *   status-changed     {character, statuses}
 *   status-ticked       {character, status, damage}
 *   character-dead      {character}
 *   turn-started        {actor}
 *   turn-queued         {actor}
 *   battle-won
 *   battle-lost
 *   aim-mode            {active}
 */
export class EventBus {
  constructor() {
    this._map = new Map();
  }

  on(name, fn, ctx = null) {
    if (!this._map.has(name)) this._map.set(name, []);
    this._map.get(name).push({ fn, ctx });
    return () => this.off(name, fn);
  }

  once(name, fn, ctx = null) {
    const wrap = (payload) => {
      this.off(name, wrap);
      fn(payload);
    };
    return this.on(name, wrap, ctx);
  }

  off(name, fn) {
    const list = this._map.get(name);
    if (!list) return;
    const i = list.findIndex((h) => h.fn === fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(name, payload) {
    const list = this._map.get(name);
    if (!list) return;
    // Copy so handlers may safely off() during emit.
    for (const h of list.slice()) {
      h.fn.call(h.ctx, payload);
    }
  }

  clear() {
    this._map.clear();
  }
}
