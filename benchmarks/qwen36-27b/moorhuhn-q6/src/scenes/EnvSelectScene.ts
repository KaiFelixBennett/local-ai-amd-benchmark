import Phaser from 'phaser';
import { t } from '../i18n';
import { ENVIRONMENTS, GAME_MODES } from '../types';
import type { Environment, EnvironmentId, GameMode, PlayerProgress } from '../types';
import { loadProgress } from '../core/SaveManager';
import { getDailySeed, getDayKey } from '../core/SeededRng';

export class EnvSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EnvSelectScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a2a1a');

    const progress = loadProgress();
    const selectedMode = this.sys.registry.get('selectedMode') as GameMode | null;
    const mode = selectedMode ?? GAME_MODES[0];

    this.add.text(width / 2, 50, t('menu_environments'), {
      fontSize: '36px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const envs = ENVIRONMENTS;
    const cardW = 340;
    const cardH = 160;
    const gap = 20;
    const totalW = envs.length * cardW + (envs.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const startY = height / 2 - 10;

    envs.forEach((env, i) => {
      const x = startX + i * (cardW + gap) + cardW / 2;
      const y = startY;

      const unlocked = progress.level >= env.unlockedAtLevel;

      // Preview background
      const card = this.add.graphics();
      const bgColor = unlocked ? env.skyColors[0] : 0x111111;
      card.fillStyle(bgColor, 0.6);
      card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
      card.lineStyle(2, unlocked ? 0x4a7a4a : 0x333333);
      card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);

      this.add.text(x, y - 35, t(env.nameKey), {
        fontSize: '22px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: unlocked ? '#ffffff' : '#555555',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(x, y, t(env.descriptionKey), {
        fontSize: '14px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: unlocked ? '#cccccc' : '#444444',
        align: 'center',
        wordWrap: { width: cardW - 30 },
      }).setOrigin(0.5);

      if (!unlocked) {
        this.add.text(x, y + 45, `🔒 ${t('env_locked')} ${env.unlockedAtLevel}`, {
          fontSize: '14px',
          fontFamily: '"Segoe UI", Arial, sans-serif',
          color: '#666666',
        }).setOrigin(0.5);
      }

      if (unlocked) {
        const zone = this.add.zone(x, y, cardW, cardH).setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => {
          card.clear();
          card.fillStyle(bgColor, 0.8);
          card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
          card.lineStyle(2, 0x6a9a6a);
          card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
        });
        zone.on('pointerout', () => {
          card.clear();
          card.fillStyle(bgColor, 0.6);
          card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
          card.lineStyle(2, 0x4a7a4a);
          card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
        });
        zone.on('pointerdown', () => {
          this.startGame(mode, env);
        });
      }
    });

    // Back button
    const backBtn = this.add.text(60, height - 40, '← ' + t('menu_back'), {
      fontSize: '18px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#888888',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });

    backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerout', () => backBtn.setColor('#888888'));
    backBtn.on('pointerdown', () => this.scene.start('MenuScene'));
  }

  private startGame(mode: GameMode, env: Environment): void {


    const seed = mode.id === 'daily' ? getDailySeed() : Math.floor(Math.random() * 999999);

    this.scene.start('GameScene', {
      mode,
      environment: env,
      seed,
      dayKey: mode.id === 'daily' ? getDayKey() : null,
    });
  }
}
