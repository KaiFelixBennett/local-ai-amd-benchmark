import Phaser from 'phaser';
import { Boot } from '../scenes/Boot';
import { GameScene } from '../scenes/GameScene';
import { AudioManager } from '../audio/AudioManager';
import { getSettings } from '../core/Save';
import { DESIGN_H, DESIGN_W } from '../scenes/tex';
import { setRunConfig, type RunConfig } from './RunConfig';

/**
 * Owns the Phaser instance so both main.ts and the DOM UI can drive it
 * without circular imports (UI -> bootstrap only).
 */
let game: Phaser.Game | null = null;
let audio: AudioManager | null = null;

export function createGame(parent: HTMLElement): void {
  audio = new AudioManager(getSettings());
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0d1410',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_W,
      height: DESIGN_H,
    },
    render: { antialias: true, powerPreference: 'low-power' },
    scene: [Boot, GameScene],
  });
  game.registry.set('audio', audio);
}

let lastRun: RunConfig | null = null;

/**
 * Start a round. The Game scene re-emits 'run:start' through the bus, which
 * the DOM UI listens to in order to hide every menu overlay.
 */
export function startRun(cfg: RunConfig): void {
  lastRun = cfg;
  setRunConfig(cfg);
  audio?.init();
  game?.scene.start('Game');
}

/** The most recent (or, at the menu, next) run selection — used for restart. */
export function getLastRun(): RunConfig | null {
  return lastRun;
}

/** Back to the (DOM) menu: stop gameplay, the UI shows the menu again. */
export function quitToMenu(): void {
  game?.scene.stop('Game');
}
