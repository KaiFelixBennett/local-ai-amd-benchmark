import Phaser from 'phaser';
import { ProceduralAssets } from '../assets/ProceduralAssets';
import { getAudioManager } from '../systems/AudioManager';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Generate all procedural assets
    const assets = new ProceduralAssets(this);
    assets.generateAll();

    // Initialize audio on first click
    this.input.once('pointerdown', () => {
      getAudioManager().init();
    });

    // Also init on key press
    this.input.keyboard?.once('keydown', () => {
      getAudioManager().init();
    });

    // Show loading screen
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Title
    this.add.text(width / 2, height / 2 - 40, 'Moorland Mayhem', {
      fontSize: '56px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, 'Featherstorm', {
      fontSize: '28px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#d4a574',
    }).setOrigin(0.5);

    // Loading bar
    const barBg = this.add.graphics();
    barBg.fillStyle(0x333333, 1);
    barBg.fillRoundedRect(width / 2 - 150, height / 2 + 60, 300, 12, 6);

    const barFill = this.add.graphics();
    barFill.fillStyle(0x8fbc8f, 1);
    barFill.fillRoundedRect(width / 2 - 150, height / 2 + 60, 300, 12, 6);

    this.add.text(width / 2, height / 2 + 100, 'Loading...', {
      fontSize: '16px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#888888',
    }).setOrigin(0.5);

    // Transition to menu
    this.time.delayedCall(800, () => {
      // Hide the HTML loading overlay
      const overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
        // Remove from DOM after transition
        setTimeout(() => overlay.remove(), 500);
      }
      this.scene.start('MenuScene');
    });
  }
}
