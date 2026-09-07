import Phaser from 'phaser';
import type { RoundResult, PlayerProgress } from '../types';
import { loadProgress, saveProgress } from '../core/SaveManager';
import { calculateLevel } from '../core/Scoring';
import { t } from '../i18n';

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultsScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0d1a0d');

    const result = this.sys.registry.get('roundResult') as RoundResult | null;
    if (!result) {
      this.scene.start('MenuScene');
      return;
    }

    const progress = loadProgress();

    // Title
    this.add.text(width / 2, 50, t('results_title'), {
      fontSize: '40px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Rank
    const rankText = `${result.rank}`;
    this.add.text(width / 2, 100, rankText, {
      fontSize: '32px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Score breakdown
    const stats: Array<{ label: string; value: string }> = [
      { label: t('results_total_score'), value: result.totalScore.toLocaleString('de-DE') },
      { label: t('results_hits'), value: `${result.hits}/${result.shots}` },
      { label: t('results_accuracy'), value: `${result.accuracy}%` },
      { label: t('results_max_combo'), value: `${result.maxCombo}x` },
      { label: t('results_event_bonus'), value: `+${result.eventBonuses.toLocaleString('de-DE')}` },
      { label: t('results_xp'), value: `+${result.xpEarned} XP` },
    ];

    let y = 170;
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
      y += 32;
    }

    // New record indicator
    if (result.newRecord) {
      const recordText = this.add.text(width / 2, y + 20, '★ NEUER REKORD! ★', {
        fontSize: '24px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#ffd700',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.tweens.add({
        targets: recordText,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
      y += 50;
    }

    // Level progress
    const newLevel = calculateLevel(progress.totalXp);
    this.add.text(width / 2, y + 60, `${t('results_level')} ${newLevel}`, {
      fontSize: '20px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#87ceeb',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Update progress
    progress.totalXp = result.xpEarned;
    progress.level = newLevel;
    const modeId = (this.sys.registry.get('selectedMode') as { id: string } | null)?.id ?? 'classic';
    (progress.highscores as Record<string, number>)[modeId] = Math.max((progress.highscores as Record<string, number>)[modeId] ?? 0, result.totalScore);
    if (result.newRecord) {
      const dayKey = this.sys.registry.get('dayKey') as string | null;
      progress.dailyRecords[dayKey ?? ''] = result.totalScore;
    }
    saveProgress(progress);

    // Buttons
    const btnW = 240;
    const btnH = 50;
    const btnY = height - 120;

    // Play again
    const playAgainBtn = this.add.rectangle(width / 2, btnY, btnW, btnH, 0x2d5a2d).setInteractive({ useHandCursor: true });
    const playAgainText = this.add.text(width / 2, btnY, t('results_play_again'), {
      fontSize: '20px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    playAgainBtn.on('pointerover', () => playAgainBtn.setFillStyle(0x3d7a3d));
    playAgainBtn.on('pointerout', () => playAgainBtn.setFillStyle(0x2d5a2d));
    playAgainBtn.on('pointerdown', () => {
      getAudioManager().menuClick();
      const mode = this.sys.registry.get('selectedMode') as string | null;
      const env = this.sys.registry.get('selectedEnv') as string | null;
      this.scene.start('EnvSelectScene', { mode, env });
    });

    // Back to menu
    const menuBtn = this.add.rectangle(width / 2, btnY + 70, btnW, btnH, 0x4a2d2d).setInteractive({ useHandCursor: true });
    const menuText = this.add.text(width / 2, btnY + 70, t('results_back_to_menu'), {
      fontSize: '20px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    menuBtn.on('pointerover', () => menuBtn.setFillStyle(0x6a3d3d));
    menuBtn.on('pointerout', () => menuBtn.setFillStyle(0x4a2d2d));
    menuBtn.on('pointerdown', () => {
      getAudioManager().menuClick();
      this.scene.start('MenuScene');
    });
  }
}

// Import here to avoid circular dependency
import { getAudioManager } from '../systems/AudioManager';
