/**
 * A tiny typed event bus for communication between the Phaser scene and the
 * HTML/CSS UI layer. Avoids uncontrolled global state — every message is
 * explicitly typed.
 */

export type GameToUiEvents = {
  'round-end': RoundEndPayload;
  'hud': HudPayload;
  'combo': ComboPayload;
  'event': EventPayload;
  'boss': BossPayload;
  'score-popup': ScorePopupPayload;
  'toast': ToastPayload;
  'countdown': { value: number };
  'paused': { paused: boolean };
  'back-to-menu': void;
  'state': GameStatePayload;
};

export type UiToGameEvents = {
  'start-round': { mode: string; map: string; seed?: number };
  'resume': void;
  'pause': void;
  'restart': void;
  'quit-to-menu': void;
  'replay': void;
};

export interface RoundEndPayload {
  mode: string;
  map: string;
  score: number;
  shots: number;
  hits: number;
  misses: number;
  perfectHits: number;
  maxCombo: number;
  bestHitValue: number;
  bestHitTarget: string | null;
  avgReactionMs: number;
  hitsByTarget: Record<string, number>;
  eventBonuses: number;
  multikills: number;
  chainReactions: number;
  bossKills: number;
  durationMs: number;
  rank: string;
  isPersonalBest: boolean;
  previousBest: number;
  xpGained: number;
  coinsGained: number;
  newAchievements: string[];
  newUnlocks: string[];
}

export interface HudPayload {
  time: number;
  score: number;
  combo: number;
  multiplier: number;
  ammo: number;
  magazine: number;
  reloading: boolean;
  empty: boolean;
  event: string | null;
  bestCombo: number;
}

export interface ComboPayload {
  combo: number;
  milestone: boolean;
  label: string;
}

export interface EventPayload {
  id: string;
  name: string;
  active: boolean;
  remainingMs: number;
}

export interface BossPayload {
  active: boolean;
  health: number;
  maxHealth: number;
  name: string;
}

export interface ScorePopupPayload {
  x: number;
  y: number;
  value: number;
  perfect: boolean;
  label?: string;
}

export interface ToastPayload {
  text: string;
  kind: 'info' | 'good' | 'bad';
}

export interface GameStatePayload {
  fps: number;
  targets: number;
  particles: number;
  phase: number;
  difficulty: number;
  seed: number;
  mode: string;
  map: string;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners: Map<string, Set<Handler<unknown>>> = new Map();

  on<K extends keyof GameToUiEvents>(event: K, fn: Handler<GameToUiEvents[K]>): () => void {
    if (!this.listeners.has(event as string)) this.listeners.set(event as string, new Set());
    this.listeners.get(event as string)!.add(fn as Handler<unknown>);
    return () => this.off(event, fn);
  }

  off<K extends keyof GameToUiEvents>(event: K, fn: Handler<GameToUiEvents[K]>): void {
    this.listeners.get(event as string)?.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameToUiEvents>(event: K, payload: GameToUiEvents[K]): void {
    const set = this.listeners.get(event as string);
    if (!set) return;
    for (const fn of set) fn(payload as unknown);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export class UiBus {
  private listeners: Map<string, Set<Handler<unknown>>> = new Map();

  on<K extends keyof UiToGameEvents>(event: K, fn: Handler<UiToGameEvents[K]>): () => void {
    if (!this.listeners.has(event as string)) this.listeners.set(event as string, new Set());
    this.listeners.get(event as string)!.add(fn as Handler<unknown>);
    return () => this.off(event, fn);
  }
  off<K extends keyof UiToGameEvents>(event: K, fn: Handler<UiToGameEvents[K]>): void {
    this.listeners.get(event as string)?.delete(fn as Handler<unknown>);
  }
  emit<K extends keyof UiToGameEvents>(event: K, payload: UiToGameEvents[K]): void {
    const set = this.listeners.get(event as string);
    if (!set) return;
    for (const fn of set) fn(payload as unknown);
  }
  clear(): void {
    this.listeners.clear();
  }
}
