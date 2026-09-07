import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ModeSelectScene } from './scenes/ModeSelectScene';
import { EnvSelectScene } from './scenes/EnvSelectScene';
import { GameScene } from './scenes/GameScene';
import { ResultsScene } from './scenes/ResultsScene';
import { SettingsScene } from './scenes/SettingsScene';
import { StatsScene } from './scenes/StatsScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#0d1a0d',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    MenuScene,
    ModeSelectScene,
    EnvSelectScene,
    GameScene,
    ResultsScene,
    SettingsScene,
    StatsScene,
  ],
  input: {
    activePointers: 1,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
  },
};

const game = new Phaser.Game(config);
