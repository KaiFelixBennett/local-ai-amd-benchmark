import Phaser from 'phaser';
import type { GameSettings } from '../types';
import { loadSettings, saveSettings } from '../core/SaveManager';
import { t, setLanguage, getCurrentLang } from '../i18n';
import { getAudioManager } from '../systems/AudioManager';

interface SliderRow {
  label: string;
  value: number;
  setter: (v: number) => void;
}

export class SettingsScene extends Phaser.Scene {
  private settings!: GameSettings;
  private sliders: SliderRow[] = [];

  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0d1a0d');

    this.settings = loadSettings();

    // Title
    this.add.text(width / 2, 50, t('settings_title'), {
      fontSize: '36px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#8fbc8f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const audio = getAudioManager();

    this.sliders = [
      { label: t('settings_master_volume'), value: this.settings.masterVolume, setter: (v) => { this.settings.masterVolume = v; audio.setMasterVolume(v); } },
      { label: t('settings_music_volume'), value: this.settings.musicVolume, setter: (v) => { this.settings.musicVolume = v; audio.setMusicVolume(v); } },
      { label: t('settings_sfx_volume'), value: this.settings.sfxVolume, setter: (v) => { this.settings.sfxVolume = v; audio.setSfxVolume(v); } },
      { label: t('settings_ambient_volume'), value: this.settings.ambientVolume, setter: (v) => { this.settings.ambientVolume = v; audio.setAmbientVolume(v); } },
    ];

    let y = 120;
    for (const slider of this.sliders) {
      this.createSlider(width / 2, y, slider);
      y += 70;
    }

    // Language toggle
    const langLabel = this.add.text(width / 2 - 150, y + 10, t('settings_language'), {
      fontSize: '18px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#a0a0a0',
    }).setOrigin(1, 0.5);

    const langBtn = this.add.rectangle(width / 2 + 100, y + 10, 120, 40, 0x2d5a2d).setInteractive({ useHandCursor: true });
    const currentLang = getCurrentLang();
    const langText = this.add.text(width / 2 + 100, y + 10, currentLang === 'de' ? 'DE → EN' : 'EN → DE', {
      fontSize: '16px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    langBtn.on('pointerover', () => langBtn.setFillStyle(0x3d7a3d));
    langBtn.on('pointerout', () => langBtn.setFillStyle(0x2d5a2d));
    langBtn.on('pointerdown', () => {
      audio.menuClick();
      const newLang = currentLang === 'de' ? 'en' : 'de';
      setLanguage(newLang);
      langLabel.setText(t('settings_language'));
      langText.setText(newLang === 'de' ? 'DE → EN' : 'EN → DE');
    });

    // Fullscreen toggle
    const fsLabel = this.add.text(width / 2 - 150, y + 80, t('settings_fullscreen'), {
      fontSize: '18px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#a0a0a0',
    }).setOrigin(1, 0.5);

    const fsBtn = this.add.rectangle(width / 2 + 100, y + 80, 120, 40, 0x2d5a2d).setInteractive({ useHandCursor: true });
    const fsText = this.add.text(width / 2 + 100, y + 80, this.settings.fullscreen ? t('settings_on') : t('settings_off'), {
      fontSize: '16px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    fsBtn.on('pointerover', () => fsBtn.setFillStyle(0x3d7a3d));
    fsBtn.on('pointerout', () => fsBtn.setFillStyle(0x2d5a2d));
    fsBtn.on('pointerdown', () => {
      audio.menuClick();
      this.settings.fullscreen = !this.settings.fullscreen;
      fsText.setText(this.settings.fullscreen ? t('settings_on') : t('settings_off'));
    });

    // Save & Back buttons
    const saveBtn = this.add.rectangle(width / 2 - 80, height - 80, 140, 50, 0x2d5a2d).setInteractive({ useHandCursor: true });
    const saveText = this.add.text(width / 2 - 80, height - 80, t('settings_save'), {
      fontSize: '18px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    saveBtn.on('pointerover', () => saveBtn.setFillStyle(0x3d7a3d));
    saveBtn.on('pointerout', () => saveBtn.setFillStyle(0x2d5a2d));
    saveBtn.on('pointerdown', () => {
      audio.menuClick();
      saveSettings(this.settings);
    });

    const backBtn = this.add.rectangle(width / 2 + 80, height - 80, 140, 50, 0x4a2d2d).setInteractive({ useHandCursor: true });
    const backText = this.add.text(width / 2 + 80, height - 80, t('common_back'), {
      fontSize: '18px',
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

  private createSlider(cx: number, y: number, slider: SliderRow): void {
    const label = this.add.text(cx - 150, y, slider.label, {
      fontSize: '18px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#a0a0a0',
    }).setOrigin(1, 0.5);

    const trackW = 240;
    const trackH = 8;
    const track = this.add.rectangle(cx, y, trackW, trackH, 0x333333);
    const fill = this.add.rectangle(cx - trackW / 2 + 2, y, (slider.value) * (trackW - 4), trackH - 2, 0x8fbc8f);
    const knob = this.add.circle(cx - trackW / 2 + slider.value * trackW, y, 12, 0x8fbc8f);

    const valueText = this.add.text(cx + 160, y, `${Math.round(slider.value * 100)}%`, {
      fontSize: '16px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0, 0.5);

    let dragging = false;
    const updateKnob = (pointerX: number) => {
      const minX = cx - trackW / 2;
      const maxX = cx + trackW / 2;
      const clamped = Phaser.Math.Clamp(pointerX, minX, maxX);
      const ratio = (clamped - minX) / trackW;
      const clampedRatio = Phaser.Math.Clamp(ratio, 0, 1);

      slider.setter(clampedRatio);
      fill.width = clampedRatio * (trackW - 4);
      knob.x = minX + clampedRatio * trackW;
      valueText.setText(`${Math.round(clampedRatio * 100)}%`);
    };

    knob.setInteractive({ useHandCursor: true }).on('pointerdown', () => { dragging = true; });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (dragging) updateKnob(pointer.x);
    });
    this.input.on('pointerup', () => { dragging = false; });

    // Click on track
    track.setInteractive().on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      updateKnob(pointer.x);
    });
  }
}
