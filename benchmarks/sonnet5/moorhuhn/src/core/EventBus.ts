/**
 * Lightweight typed event emitter used for decoupled cross-system communication
 * (e.g. Scoring -> UI, Weapon -> Audio, Environment -> ChainReaction) so systems
 * don't need direct references to each other.
 */
type Listener<T> = (payload: T) => void;

export class TypedEmitter<EventMap extends object> {
  private listeners: { [K in keyof EventMap]?: Set<Listener<EventMap[K]>> } = {};

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    const set = this.listeners[event] ?? new Set();
    set.add(listener);
    this.listeners[event] = set;
    return () => this.off(event, listener);
  }

  once<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const wrapper: Listener<EventMap[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    this.on(event, wrapper);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    for (const listener of Array.from(set)) {
      listener(payload);
    }
  }

  removeAllListeners(): void {
    this.listeners = {};
  }
}
