/**
 * Tiny event bus for decoupled system communication.
 */

export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(event, fn) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, []);
    }
    this._handlers.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit(event, data) {
    const list = this._handlers.get(event);
    if (!list) return;
    for (const fn of list) {
      try { fn(data); } catch (e) {
        console.error(`EventBus error in handler for "${event}":`, e);
      }
    }
  }

  once(event, fn) {
    const unsub = this.on(event, (data) => {
      unsub();
      fn(data);
    });
    return unsub;
  }
}
