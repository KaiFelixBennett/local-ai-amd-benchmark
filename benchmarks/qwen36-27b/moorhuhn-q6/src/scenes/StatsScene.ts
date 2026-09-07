import Phaser from 'phaser';
import type { PlayerProgress } from '../types';
import { loadProgress } from '../core/SaveManager';
import { t } from '../i18n';
import { getAudioManager } from '../systems/AudioManager';

export class StatsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StatsScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0d1a0d');

    const progress = loadProgress();

    // Title
    this.add.text(width / 2, 50, t('stats_title'), {
      fontSize: '36px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const stats: Array<{ label: string; value: string }> = [
      { label: t('stats_level'), value: `${progress.level}` },
      { label: t('stats_xp'), value: `${progress.totalXp.toLocaleString('de-DE')} XP` },
      { label: t('stats_total_rounds'), value: `${progress.totalRounds}` },
      { label: t('stats_total_shots'), value: `${progress.totalShots.toLocaleString('de-DE')}` },
      { label: t('stats_total_hits'), value: `${progress.totalHits.toLocaleString('de-DE')}` },
      { label: t('stats_total_perfect_hits'), value: `${progress.totalPerfectHits}` },
      { label: t('stats_high_score'), value: `${Object.values(progress.highscores).reduce((a, b) => Math.max(a, b), 0).toLocaleString('de-DE')}` },
    ];

    let y = 120;
    for (const stat of stats) {
      const labelX = width / 2 - 150;
      const valX = width / 2 + 150;
      this.add.text(labelX, y, stat.label, {
        fontSize: '18px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#a0a0a0',
      }).setOrigin(1, 0.5);
      this.add.text(valX, y, stat.value, {
        fontSize: '18px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      y += 36;
    }

    // Mode stats
    y += 20;
    this.add.text(width / 2, y, t('stats_mode_stats'), {
      fontSize: '24px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    y += 40;

    for (const [modeKey, score] of Object.entries(progress.highscores)) {
      this.add.text(width / 2 - 200, y, modeKey, {
        fontSize: '16px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#a0a0a0',
      }).setOrigin(1, 0.5);
      this.add.text(width / 2 + 200, y, `${(score as number).toLocaleString('de-DE')} pts`, {
        fontSize: '14px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#ffffff',
      }).setOrigin(0, 0.5);
      y += 24;
    }

    // Back button
    const audio = getAudioManager();
    const backBtn = this.add.rectangle(width / 2, height - 80, 200, 50, 0x4a2d2d).setInteractive({ useHandCursor: true });
    const backText = this.add.text(width / 2, height - 80, t('common_back'), {
      fontSize: '20px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    backBtn.on('pointerover', () => backBtn.setFillStyle(0x6a3d3d));
    backBtn.on('pointerout', () => backBtn.setFillStyle(0x4a2d2d));
    backBtn.on('pointerdown', () => {
      audio.menuClick();
      this.scene.start('MenuScene');
    });
  }
}
