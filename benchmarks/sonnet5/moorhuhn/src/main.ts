import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/screen';
import { BootScene } from './scenes/BootScene';
import { MenuBackgroundScene } from './scenes/MenuBackgroundScene';
import { GameScene } from './scenes/GameScene';

import { saveManager } from './systems/SaveManager';
import { AudioManager } from './systems/AudioManager';
import { i18n } from './systems/Localization';
import { UIManager } from './ui/UIManager';
import { HudController } from './ui/HudController';
import { gameBridge, type StartRoundOptions } from './ui/GameBridge';
import { dailySeedNumber } from './core/rng';
import type { PlayerSettings } from './core/types';

function applyAccessibilityClasses(settings: PlayerSettings): void {
  const body = document.body;
  body.classList.toggle('reduced-motion', settings.reducedMotion);
  body.classList.toggle('high-contrast-hits', settings.highContrastHits);
  body.classList.remove('colorblind-protanopia', 'colorblind-deuteranopia', 'colorblind-tritanopia');
  if (settings.colorBlindMode !== 'off') {
    body.classList.add(`colorblind-${settings.colorBlindMode}`);
  }
}

function bootstrap(): void {
  const save = saveManager.load();
  const initialLanguage = save.settings.language ?? i18n.detectBrowserLanguage();
  i18n.setLanguage(initialLanguage);
  applyAccessibilityClasses(save.settings);

  const audio = new AudioManager(save.settings);
  const primeAudio = () => {
    audio.init();
    window.removeEventListener('pointerdown', primeAudio);
    window.removeEventListener('keydown', primeAudio);
  };
  window.addEventListener('pointerdown', primeAudio);
  window.addEventListener('keydown', primeAudio);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0b1410',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MenuBackgroundScene, GameScene],
    render: { antialias: true, pixelArt: false },
    disableContextMenu: true,
  });

  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  const hudRoot = document.getElementById('hud-root') as HTMLElement;
  const uiManager = new UIManager(uiRoot, saveManager, audio);
  const hudController = new HudController(hudRoot, uiManager, audio);

  uiManager.showRoot('mainMenu');

  let lastStartOptions: StartRoundOptions | null = null;

  const stopGameSceneIfActive = () => {
    if (game.scene.isActive('GameScene') || game.scene.isPaused('GameScene')) {
      game.scene.stop('GameScene');
    }
  };

  gameBridge.on('startRound', (opts) => {
    lastStartOptions = opts;
    uiManager.hide();
    uiManager.setBackFallback(null);
    hudController.show(opts.mode, opts.map);
    game.scene.start('GameScene', { ...opts, audio });
  });

  gameBridge.on('restartRequest', () => {
    if (!lastStartOptions) return;
    const seed = lastStartOptions.mode === 'daily' ? dailySeedNumber() : Math.floor(Math.random() * 0xffffffff);
    lastStartOptions = { ...lastStartOptions, seed };
    stopGameSceneIfActive();
    hudController.hide();
    hudController.show(lastStartOptions.mode, lastStartOptions.map);
    game.scene.start('GameScene', { ...lastStartOptions, audio });
  });

  gameBridge.on('quitToMenuRequest', () => {
    stopGameSceneIfActive();
    hudController.hide();
    uiManager.setBackFallback(null);
    uiManager.showRoot('mainMenu');
  });

  gameBridge.on('roundEnded', (payload) => {
    hudController.hide();
    uiManager.setBackFallback(null);
    uiManager.showRoot('results', payload);
  });

  gameBridge.on('settingsChanged', () => {
    applyAccessibilityClasses(saveManager.load().settings);
  });

  window.addEventListener('beforeunload', () => {
    // ensure any in-flight mutation is flushed (SaveManager already persists synchronously,
    // this simply guards against relying on unflushed in-memory-only state)
    saveManager.save(saveManager.load());
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.scene.isActive('GameScene')) {
      gameBridge.emit('pauseRequest', undefined);
    }
  });
}

bootstrap();
