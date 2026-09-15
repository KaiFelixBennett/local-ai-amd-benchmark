import Phaser from 'phaser';
import './ui/styles.css';
import './config/names';
import type { GameCoreAPI, ScreenId } from './core/api';
import { GameClient } from './core/gameClient';
import { AudioEngine } from './audio/audioEngine';
import { setCoreContext } from './core/context';
import { bus } from './core/bus';
import { UIRouter } from './ui/router';
import { GameScene } from './engine/GameScene';
import type { MapId, ModeId } from './types';

/**
 * Bootstrap: wires the DOM UI (router + screens), the Phaser engine and the
 * shared services (audio, save client) together through the GameCoreAPI contract.
 */

const client = new GameClient();
const audio = new AudioEngine();

let lastRound: { mode: ModeId; map: MapId; tutorial: boolean } = {
  mode: 'classic',
  map: 'nebelmoor',
  tutorial: false,
};

function syncAudioVolumes(): void {
  const s = client.settings.all;
  audio.setVolumes({
    master: s.masterVolume,
    music: s.musicVolume,
    sfx: s.sfxVolume,
    ambient: s.ambientVolume,
  });
}
syncAudioVolumes();
bus.on('settings:changed', syncAudioVolumes);

const gameScene = (): GameScene | null => {
  const sc = game.scene.getScene('game') as GameScene | undefined;
  return sc && sc.sys && sc.sys.isActive() ? sc : null;
};

const api: GameCoreAPI = {
  unlockAudio(): void {
    audio.unlock();
    if (router.current !== 'game') {
      audio.startMusic('menu');
    }
  },

  playUI(name: 'click' | 'hover' | 'back'): void {
    audio.play(name === 'back' ? 'ui_back' : name === 'hover' ? 'ui_hover' : 'ui_click');
  },

  getSetting(k) {
    return client.settings.get(k);
  },

  setSetting(k, v) {
    client.settings.set(k, v);
  },

  go(screen: ScreenId): void {
    router.show(screen);
    if (screen !== 'game') {
      audio.stopAmbient();
      audio.startMusic('menu');
    }
  },

  back(): void {
    router.back();
  },

  startRound(mode: ModeId, map: MapId): void {
    // First-time players get the interactive tutorial on the classic map.
    if (!client.tutorialDone() && mode === 'classic' && map === 'nebelmoor') {
      api.startTutorial();
      return;
    }
    lastRound = { mode, map, tutorial: false };
    audio.stopMusic();
    game.scene.stop('game');
    game.scene.start('game', { mode, map });
  },

  retryRound(): void {
    lastRound = { ...lastRound, tutorial: false };
    audio.stopMusic();
    game.scene.stop('game');
    // A fresh seed keeps retries distinct outside daily mode.
    const seed = lastRound.mode === 'daily' ? undefined : (Date.now() & 0x7fffffff) >>> 0;
    game.scene.start('game', { mode: lastRound.mode, map: lastRound.map, seed });
  },

  quitToMenu(): void {
    audio.stopAmbient();
    audio.stopMusic();
    game.scene.stop('game');
    router.show('main');
    audio.startMusic('menu');
  },

  pauseGame(): void {
    const sc = gameScene();
    if (!sc || router.current !== 'game') return;
    sc.pause();
    bus.emit('game:paused', { at: Date.now() });
    router.showPause('game');
  },

  resumeGame(): void {
    const sc = gameScene();
    if (!sc) {
      router.hidePause();
      return;
    }
    sc.resume();
    bus.emit('game:resumed', { at: Date.now() });
    router.hidePause();
  },

  startTutorial(): void {
    lastRound = { mode: 'classic', map: 'nebelmoor', tutorial: true };
    audio.stopMusic();
    game.scene.stop('game');
    game.scene.start('game', { mode: 'classic', map: 'nebelmoor', tutorial: true });
  },

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        bus.emit('toast', { message: 'Vollbild nicht verfügbar', kind: 'info' });
      });
    }
  },
};

setCoreContext({ audio, client, api });

// ---- Phaser -------------------------------------------------------------

const gameRoot = document.getElementById('game-root');
const uiRoot = document.getElementById('ui-root');
if (!gameRoot || !uiRoot) {
  throw new Error('Missing #game-root or #ui-root in index.html');
}

const router = new UIRouter(uiRoot, api, client);
router.show('boot');

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: gameRoot,
  width: 1920,
  height: 1080,
  backgroundColor: '#141008',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  disableContextMenu: true,
});

// Registered inactive: the boot screen shows first, and rounds start on demand.
game.scene.add('game', GameScene, false);

// Dev-only handles for debugging in the console.
if (import.meta.env.DEV) {
  const w = window as unknown as { __mmfGame: Phaser.Game; __mmfClient: GameClient; __mmfAudio: AudioEngine };
  w.__mmfGame = game;
  w.__mmfClient = client;
  w.__mmfAudio = audio;
}

// When a run ends and the scene stops, make sure menu music is back if the
// player skipped straight from results to the menu.
bus.on('game:ended', () => {
  audio.setMusicIntensity(0.4);
});

// Persist the profile when the tab is closed or reloaded.
window.addEventListener('beforeunload', () => {
  client.flush();
});

export { game, router, client, audio, api };
