/**
 * One-time generation of shared particle / FX textures. Called from the Menu
 * scene create() so every scene (game, boss, etc.) has them available.
 * Guarded so it only runs once.
 */

import Phaser from 'phaser';
import {
  generateTargetTextures,
  makeFeatherTexture,
  makeGlowTexture,
  makeMuzzleTexture,
  makeBalloonTexture
} from './generator';

let done = false;

export function ensureCommonArt(scene: Phaser.Scene): void {
  if (done) return;
  done = true;
  generateTargetTextures(scene);
  makeFeatherTexture(scene, 'feather', 0xffffff);
  makeGlowTexture(scene, 'glow', 0xffffff);
  makeGlowTexture(scene, 'spark', 0xffffff, 16);
  makeGlowTexture(scene, 'smoke', 0xffffff, 24);
  makeMuzzleTexture(scene, 'muzzle');
  makeBalloonTexture(scene, 'balloon', 0xff8fb0);
}
