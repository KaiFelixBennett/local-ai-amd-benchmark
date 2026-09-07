/**
 * Bootstrap: dynamic-import everything, construct Game, start loop.
 * Top-level try/catch around init + module load.
 */

import { Game } from './game.js';

async function main() {
  const container = document.getElementById('game-container');
  if (!container) {
    showError('Game container not found in DOM.');
    return;
  }

  try {
    const game = new Game(container);
    // Debug/E2E-Hook: erlaubt agent-browser/Tests, den Spielzustand auszulesen
    // (z.B. window.__game.enemies[0].hp vor/nach einem Angriff). Noetig, weil das
    // HUD als Canvas-Pixel gezeichnet wird und per DOM-Snapshot nicht lesbar ist.
    // Harmlos in Produktion: nur eine Referenz auf die bestehende Game-Instanz.
    window.__game = game;
    await game.init();
    game.start();
  } catch (err) {
    console.error('Failed to initialize game:', err);
    showError(`Failed to start game: ${err.message}`);
  }
}

function showError(message) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: #ff6666; font: bold 20px serif; text-align: center;
    background: rgba(0,0,0,0.9); padding: 30px 40px; border-radius: 10px;
    border: 2px solid #ff4444; z-index: 9999; max-width: 500px;
  `;
  el.innerHTML = `
    <div style="font-size: 28px; margin-bottom: 10px;">⚠ Error</div>
    <div>${message}</div>
    <div style="font-size: 12px; color: #888; margin-top: 15px;">Check the browser console for details.</div>
  `;
  document.body.appendChild(el);
}

// Start
main().catch(err => {
  console.error('Unhandled error in main:', err);
  showError(`Fatal error: ${err.message}`);
});
