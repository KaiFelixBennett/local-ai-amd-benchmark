import type { AudioEngine } from '../audio/audioEngine';
import type { GameClient } from './gameClient';
import type { GameCoreAPI } from './api';

/**
 * Tiny service locator so engine code (created by Phaser, outside the main wiring
 * closure) can reach the client/audio/api without prop-drilling or globals.
 * Set exactly once during bootstrap in main.ts.
 */
interface CoreContext {
  audio: AudioEngine;
  client: GameClient;
  api: GameCoreAPI;
}

let ctx: CoreContext | null = null;

export function setCoreContext(c: CoreContext): void {
  ctx = c;
}

export function getCoreContext(): CoreContext {
  if (!ctx) throw new Error('Core context not initialised — main.ts must call setCoreContext() first.');
  return ctx;
}
