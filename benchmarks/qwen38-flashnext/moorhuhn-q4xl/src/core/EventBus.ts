/** Minimal typed event bus - no globals, all game communication flows through here. */

export interface GameEvents {
  'boot:ready': void;
  'settings:changed': void;
  'run:start': { mode: string; map: string; seed: number };
  'run:end': unknown; // RunResult (kept loose to avoid circular imports)
  'round:pause': void;
  'round:resume': void;
  'round:quit': void;
  'hud:tick': void;
  'hud:combo': { combo: number; mult: number; milestone: boolean };
  'hud:ammo': { ammo: number; reserve: number; status: string };
  'hud:score': { score: number; delta: number };
  'hud:time': { left: number; bonus: boolean };
  'hud:phase': { phase: number; key: string };
  'hud:event': { id: string | null; nameKey: string | null; remaining: number };
  'hud:boss': { nameKey: string | null; hp: number; maxHp: number; label: string };
  'hud:challenge': { text: string } | null;
  'ui:show': { name: string; payload?: unknown };
  'ui:toast': { text: string; kind?: 'info' | 'gold' | 'ach' };
  'audio:unlock': void;
  'debug:toggle': void;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private map = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(key);
    if (!set) {
      set = new Set();
      this.map.set(key, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(key, fn);
  }

  off<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): void {
    this.map.get(key)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    const set = this.map.get(key);
    if (!set) return;
    for (const fn of set) {
      (fn as Handler<GameEvents[K]>)(payload);
    }
  }

  clear(): void {
    this.map.clear();
  }
}

/** Application-wide bus (single instance, explicit module - not a mutable global). */
export const bus = new EventBus();
