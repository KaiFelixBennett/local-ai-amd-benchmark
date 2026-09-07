/**
 * Einstiegspunkt: Phaser.Game anlegen, Szenen registrieren,
 * Debug-Instanz als window.__game exponieren.
 */
import Phaser from 'phaser';
import { BootScene } from './game/scenes/boot';
import { MenuScene } from './game/scenes/menu';
import { GameScene } from './game/scenes/game';
import { ResultScene } from './game/scenes/result';
import { applyLang, loadSave, bootOnce, audio } from './game/state';

// Save + Sprache früh anwenden (vor dem ersten Rendering).
loadSave();
applyLang();

// Phaser legt sein eigenes Canvas im #game-container an (AUTO: WebGL, mit
// Canvas-Fallback). Kein externes canvas-Element — sonst verlangt Phaser
// einen expliziten renderType, der den WebGL-Start unterbinden kann.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  parent: 'game-container',
  backgroundColor: '#0a0e14',
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  scene: [BootScene, MenuScene, GameScene, ResultScene],
});

// Debug- & Test-Hook (bewusst global; nur für Entwicklung/Verifikation).
(window as unknown as { __game: Phaser.Game }).__game = game;

// Audio-Boot nach der allerersten Interaktion (Autoplay-Policy).
window.addEventListener(
  'pointerdown',
  () => bootOnce(),
  { once: true },
);
window.addEventListener(
  'keydown',
  () => bootOnce(),
  { once: true },
);

// Tab-Blur: Audio runterfahren, damit Musik nicht „mitspielt".
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
  } else {
    audio.resume();
  }
});
