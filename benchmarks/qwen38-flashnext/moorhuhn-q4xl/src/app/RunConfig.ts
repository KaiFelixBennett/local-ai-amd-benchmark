import type { MapId, ModeId } from '../core/types';
import { bus } from '../core/EventBus';

/**
 * The run the GameScene should play next. Set by the DOM UI before starting
 * the Game scene; read once in GameScene.init().
 */
export interface RunConfig {
  mode: ModeId;
  map: MapId;
  /** explicit seed; daily mode recomputes its own from the date. */
  seed: number;
  tutorial?: boolean;
}

let pending: RunConfig | null = null;

export function setRunConfig(cfg: RunConfig): void {
  pending = cfg;
}

export function takeRunConfig(): RunConfig | null {
  const c = pending;
  pending = null;
  return c;
}

export type UiScene =
  | 'menu'
  | 'modes'
  | 'maps'
  | 'settings'
  | 'stats'
  | 'highscores'
  | 'achievements'
  | 'progress'
  | 'howto'
  | 'credits'
  | 'results';

/** Ask the DOM layer to show a screen (Game scene -> UI). */
export function showUi(name: UiScene, payload?: unknown): void {
  bus.emit('ui:show', { name, payload });
}
