/**
 * main.js — Tiny bootstrap. Dynamic-imports game.js inside a try/catch so
 * that a failed module load (network error on unpkg, bad path, etc.) shows
 * a visible message instead of a blank page.
 */
import { showFatal } from './ui/fatal.js';

try {
  const { Game } = await import('./game.js');
  new Game();
} catch (err) {
  console.error(err);
  showFatal(err);
}
