/**
 * Application entry point. Wires together the pure services (audio, i18n, save),
 * the typed event buses and the Phaser game. The HTML/CSS UI is mounted into
 * #ui-root and talks to the scenes only through the buses (no globals).
 */
import Phaser from 'phaser';
import { AudioManager } from './audio/AudioManager';
import { createI18N } from './core/i18n';
import { SaveStore, highscoreKey, STORAGE_KEY } from './core/save';
import type { StorageAdapter } from './core/save';

function localStorageAdapter(): StorageAdapter {
  return {
    get: (k) => window.localStorage.getItem(k),
    set: (k, v) => window.localStorage.setItem(k, v),
    remove: (k) => window.localStorage.removeItem(k)
  };
}
import type { SaveData, GameMode, MapId } from './core/types';
import { EventBus, UiBus } from './ui/EventBus';
import type { AppContext } from './game/context';
import { GameScene } from './game/GameScene';
import { MenuScene } from './game/MenuScene';
import { mountUI } from './ui/UI';
import { dailyLabel } from './core/rng';

const VIEW_W = 1280;
const VIEW_H = 720;

function buildSave(): SaveData {
  const store = new SaveStore(localStorageAdapter());
  return store.load();
}

export function boot(): void {
  const save = buildSave();
  const i18n = createI18N(save.settings.language);
  const audio = new AudioManager();
  const uiBus = new UiBus();
  const gameToUi = new EventBus();

  // Apply persisted volumes/mute.
  audio.setVolumes({
    master: save.settings.volumeMaster,
    music: save.settings.volumeMusic,
    sfx: save.settings.volumeSfx,
    ambient: save.settings.volumeAmbient
  });

  const persist = (mutator: (s: SaveData) => void): void => {
    mutator(save);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      /* storage may be full or unavailable — non-fatal */
    }
  };

  const ctx: AppContext = {
    audio,
    i18n,
    save,
    settings: save.settings,
    uiBus,
    gameToUi,
    persist
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#1a1f2e',
    roundPixels: true,
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    // Bare classes: Phaser instantiates each and derives the key from the
    // constructor's super(...) call. MenuScene → super('menu'), GameScene →
    // super('game'), so scene.start/stop/isActive('menu'|'game') resolve.
    scene: [MenuScene, GameScene],
    // Let Phaser own the canvas — do NOT pass a custom canvas.
    disableContextMenu: true
  });

  (window as unknown as Record<string, unknown>).__game = game;

  // First user gesture → unlock audio.
  const unlock = (): void => {
    void audio.resume();
    if (game.scene.isActive('menu')) audio.startAmbient();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Mount the HTML/CSS UI and hand the round-start intent to the game.
  mountUI(ctx, game, {
    onRoundStart(mode: GameMode, map: MapId, seed: number): void {
      const isDaily = mode === 'daily';
      const round = {
        mode,
        map,
        seed,
        isDaily,
        dailyLabel: isDaily ? dailyLabel(new Date()) : undefined
      };
      game.scene.stop('menu');
      game.scene.start('game', { ctx, round });
    }
  });

  // Start in the menu.
  game.scene.start('menu', { ctx });

  // Hide the loading overlay once the first frame has rendered.
  const onFirstRender = (): void => {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('done');
      window.setTimeout(() => loading.remove(), 500);
    }
  };
  game.events.once('postrender', onFirstRender);
  // Fallback in case postrender is throttled.
  window.setTimeout(onFirstRender, 1500);
}

export { highscoreKey };

boot();
