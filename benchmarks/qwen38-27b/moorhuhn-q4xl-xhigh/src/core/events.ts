/**
 * Typisierter Event-Bus für die Kommunikation zwischen Systemen
 * (Spawner, Waffe, Score, UI, Audio …) ohne unkontrollierte globale Zustände.
 */

export interface GameEventMap {
  'shot-fired': { x: number; y: number };
  'shot-hit': {
    targetId: string;
    x: number;
    y: number;
    perfect: boolean;
    score: number;
    combo: number;
  };
  'shot-miss': { x: number; y: number };
  'combo-changed': { combo: number; multiplier: number };
  'combo-lost': { remaining: number };
  'target-killed': { targetId: string; x: number; y: number; score: number };
  'ammo-changed': { current: number; size: number; state: string; totalLeft: number };
  'reload-started': { durationMs: number };
  'reload-finished': { current: number };
  'score-changed': { score: number };
  'round-phase': { index: number; name: string };
  'event-started': { eventId: string; durationMs: number };
  'event-ended': { eventId: string };
  'boss-appeared': { bossId: string; name: string; maxHp: number };
  'boss-damage': { hp: number; maxHp: number };
  'boss-defeated': { bossId: string; reward: number };
  'chain-triggered': { chainId: string; stations: number };
  'bonus-time': { seconds: number };
  'time-slow': { factor: number; durationMs: number };
  'achievement-unlocked': { achievementId: string };
  'new-record': { score: number };
}

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

export class EventBus {
  private listeners = new Map<keyof GameEventMap, Set<Handler<keyof GameEventMap>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<keyof GameEventMap>);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEventMap>(event: K, handler: Handler<K>): void {
    this.listeners.get(event)?.delete(handler as Handler<keyof GameEventMap>);
  }

  once<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    const wrapped: Handler<K> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of [...set]) {
      (h as Handler<K>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
