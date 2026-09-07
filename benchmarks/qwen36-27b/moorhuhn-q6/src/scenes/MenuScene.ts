import Phaser from 'phaser';
import { t, setLanguage, getCurrentLang } from '../i18n';
import { loadProgress, saveProgress } from '../core/SaveManager';
import { getAudioManager } from '../systems/AudioManager';
import type { GameModeId, EnvironmentId, Language } from '../types';
import { GAME_MODES, ENVIRONMENTS, DEFAULT_PROGRESS } from '../types';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  private progress = loadProgress();

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Apply saved settings
    setLanguage(this.progress.settings.language);

    // Background pattern
    const bg = this.add.graphics();
    bg.fillStyle(0x1a2a1a, 1);
    bg.fillRect(0, 0, width, height);
    // Subtle pattern
    bg.fillStyle(0x223322, 0.3);
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 12; j++) {
        if ((i + j) % 3 === 0) {
          bg.fillRect(i * 100, j * 100, 100, 100);
        }
      }
    }

    // Title
    this.add.text(width / 2, height * 0.15, t('title'), {
      fontSize: '64px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
      stroke: '#0a1a0a',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.22, t('subtitle'), {
      fontSize: '32px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#d4a574',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Level display
    this.add.text(width / 2, height * 0.28, `${t('level')} ${this.progress.level}`, {
      fontSize: '18px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Menu buttons
    const buttons = [
      { text: t('menu_play'), action: () => this.startModeSelect(), y: 0.40 },
      { text: t('menu_modes'), action: () => this.startModeSelect(), y: 0.48 },
      { text: t('menu_environments'), action: () => this.startEnvSelect(), y: 0.56 },
      { text: t('menu_stats'), action: () => this.scene.start('StatsScene', { progress: this.progress }), y: 0.64 },
      { text: t('menu_settings'), action: () => this.scene.start('SettingsScene', { progress: this.progress }), y: 0.72 },
      { text: t('menu_credits'), action: () => this.showCredits(), y: 0.80 },
    ];

    for (const b of buttons) {
      this.createMenuButton(width / 2, height * b.y, b.text, b.action);
    }

    // Language toggle
    const langKey = getCurrentLang() === 'de' ? 'EN' : 'DE';
    this.createMenuButton(width - 60, 30, langKey, () => {
      const newLang: Language = getCurrentLang() === 'de' ? 'en' : 'de';
      setLanguage(newLang);
      this.progress.settings.language = newLang;
      saveProgress(this.progress);
      this.scene.restart();
    }, 50, 24);
  }

  private createMenuButton(x: number, y: number, text: string, onClick: () => void, w = 300, h = 48): void {
    const btn = this.add.graphics();
    btn.fillStyle(0x2a4a2a, 0.9);
    btn.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    btn.lineStyle(2, 0x4a7a4a);
    btn.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);

    const txt = this.add.text(x, y, text, {
      fontSize: '20px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#e0e0e0',
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      btn.clear();
      btn.fillStyle(0x3a6a3a, 0.95);
      btn.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      btn.lineStyle(2, 0x6a9a6a);
      btn.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      txt.setScale(1.05);
      getAudioManager().init();
      getAudioManager().menuHover();
    });

    zone.on('pointerout', () => {
      btn.clear();
      btn.fillStyle(0x2a4a2a, 0.9);
      btn.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      btn.lineStyle(2, 0x4a7a4a);
      btn.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      txt.setScale(1.0);
    });

    zone.on('pointerdown', () => {
      getAudioManager().init();
      getAudioManager().menuClick();
      onClick();
    });
  }

  private startModeSelect(): void {
    this.scene.start('ModeSelectScene', { progress: this.progress });
  }

  private startEnvSelect(): void {
    this.scene.start('EnvSelectScene', { progress: this.progress });
  }

  private showCredits(): void {
    const { width, height } = this.scale;
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, width, height);

    this.add.text(width / 2, height * 0.15, 'Credits', {
      fontSize: '36px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const credits = [
      'Moorland Mayhem – Featherstorm',
      '',
      'A Moorhuhn-inspired arcade shooter',
      'Built with Phaser 3, TypeScript & Vite',
      '',
      'All assets are procedurally generated.',
      'No external assets used.',
      '',
      '© 2025 – Independent project',
    ];

    credits.forEach((line, i) => {
      this.add.text(width / 2, height * 0.25 + i * 28, line, {
        fontSize: '16px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#cccccc',
      }).setOrigin(0.5);
    });

    this.createMenuButton(width / 2, height * 0.85, t('menu_back'), () => {
      overlay.destroy();
      credits.forEach((_, i) => {
        // texts auto-cleaned on scene switch
      });
    });
  }
}
