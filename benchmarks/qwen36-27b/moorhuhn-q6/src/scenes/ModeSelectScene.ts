import Phaser from 'phaser';
import { t } from '../i18n';
import { GAME_MODES, DEFAULT_PROGRESS } from '../types';
import { loadProgress } from '../core/SaveManager';
import type { GameModeId, PlayerProgress } from '../types';

export class ModeSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ModeSelectScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Get progress from save manager (always reliable)
    const prog = loadProgress();

    this.add.text(width / 2, 50, t('menu_modes'), {
      fontSize: '36px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const modes = GAME_MODES;
    const cols = 3;
    const cardW = 280;
    const cardH = 140;
    const gap = 20;
    const startX = (width - (cols * cardW + (cols - 1) * gap)) / 2;
    const startY = 90;

    modes.forEach((mode, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap) + cardW / 2;
      const y = startY + row * (cardH + gap) + cardH / 2;

      const unlocked = prog.level >= mode.unlockedAtLevel;

      const card = this.add.graphics();
      card.fillStyle(unlocked ? 0x2a4a2a : 0x1a1a1a, 0.9);
      card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
      card.lineStyle(2, unlocked ? 0x4a7a4a : 0x333333);
      card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);

      this.add.text(x, y - 30, t(mode.nameKey), {
        fontSize: '20px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: unlocked ? '#8fbc8f' : '#555555',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(x, y, t(mode.descriptionKey), {
        fontSize: '13px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: unlocked ? '#aaaaaa' : '#444444',
        align: 'center',
        wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5);

      if (!unlocked) {
        this.add.text(x, y + 35, `${t('env_locked')} ${mode.unlockedAtLevel}`, {
          fontSize: '12px',
          fontFamily: '"Segoe UI", Arial, sans-serif',
          color: '#666666',
        }).setOrigin(0.5);
      }

      if (unlocked) {
        const zone = this.add.zone(x, y, cardW, cardH).setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => {
          card.clear();
          card.fillStyle(0x3a6a3a, 0.95);
          card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
          card.lineStyle(2, 0x6a9a6a);
          card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
        });
        zone.on('pointerout', () => {
          card.clear();
          card.fillStyle(0x2a4a2a, 0.9);
          card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
          card.lineStyle(2, 0x4a7a4a);
          card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
        });
        zone.on('pointerdown', () => {
          // Store selected mode and go to env select or start game
          this.sys.registry.set('selectedMode', mode);
          this.scene.start('EnvSelectScene');
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
}
