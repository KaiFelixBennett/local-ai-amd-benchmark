import type { GameEndPayload, GameStartPayload } from '../types';
import type { HudState, ResultsPayload } from './api';

/** Event catalog mapping event names to their payload types. */
export interface EventCatalog {
  'settings:changed': { keys: string[] };
  'game:started': GameStartPayload;
  'game:ended': GameEndPayload;
  'game:paused': { at: number };
  'game:resumed': { at: number };
  'game:aborted': { reason: string };
  'ui:navigate': { screen: string };
  'debug:toggle': { enabled: boolean };
  'audio:autoplay-blocked': Record<string, never>;
  'hud:update': HudState;
  'results:show': ResultsPayload;
  toast: { message: string; kind?: 'info' | 'coins' | 'unlock' | 'record' };
  'target:spawned': { targetId: string; groupIndex: number };
  'target:hit': { targetId: string; points: number; perfect: boolean };
  'target:escaped': { targetId: string };
  'weapon:fired': { ammo: number };
  'weapon:reload': { kind: 'manual' | 'auto' | 'cancel' };
  'combo:changed': { combo: number; multiplier: number };
  'combo:milestone': { combo: number };
  'combo:broken': { combo: number };
  'event:announced': { eventId: string; label: string };
  'event:started': { eventId: string };
  'event:ended': { eventId: string };
  'chain:step': { chainId: string; step: number; objectId: string };
  'chain:complete': { chainId: string; steps: number };
  'boss:spawned': { bossId: string };
  'boss:defeated': { bossId: string };
  'challenge:progress': { challengeId: string; progress: number; goal: number };
  'challenge:complete': { challengeId: string };
  'achievement:unlocked': { achievementId: string };
  'run:phase': { phase: string; index: number };
  'unlock:changed': { kind: string; id: string };
}

export type EventName = keyof EventCatalog;

type Handler<K extends EventName> = (payload: EventCatalog[K]) => void;

/** Tiny typed publish/subscribe bus. No globals, easy to dispose. */
export class EventBus {
  private map = new Map<EventName, Set<Handler<EventName>>>();

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    let set = this.map.get(name);
    if (!set) {
      set = new Set();
      this.map.set(name, set);
    }
    const generic = fn as unknown as Handler<EventName>;
    set.add(generic);
    return () => {
      set?.delete(generic);
    };
  }

  once<K extends EventName>(name: K, fn: Handler<K>): () => void {
    const off = this.on(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends EventName>(name: K, fn: Handler<K>): void {
    const set = this.map.get(name);
    if (set) set.delete(fn as unknown as Handler<EventName>);
  }

  emit<K extends EventName>(name: K, payload: EventCatalog[K]): void {
    const set = this.map.get(name);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        (fn as unknown as Handler<K>)(payload);
      } catch (err) {
        console.error(`[bus] handler error for "${name}"`, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }

  listenerCount(name: EventName): number {
    return this.map.get(name)?.size ?? 0;
  }
}

export const bus = new EventBus();
