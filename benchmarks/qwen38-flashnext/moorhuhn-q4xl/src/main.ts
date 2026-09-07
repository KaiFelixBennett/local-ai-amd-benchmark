import './style.css';
import { bus } from './core/EventBus';
import { createGame } from './app/bootstrap';
import { Overlays } from './ui/overlays';
import { Hud, Toasts } from './ui/Hud';
import { getSettings, loadSave } from './core/Save';

const gameRoot = document.getElementById('game-root');
const uiRoot = document.getElementById('ui-root');
if (!gameRoot || !uiRoot) throw new Error('index.html is missing #game-root or #ui-root');

createGame(gameRoot);

const overlays = new Overlays(uiRoot);
const hud = new Hud(uiRoot);
new Toasts(uiRoot);

// Apply the equipped HUD theme whenever a run begins.
bus.on('run:start', () => {
  hud.setTheme(loadSave().progress.activeHud);
});

// Reflect accessibility settings as CSS classes on <html>.
function applyA11yClasses(): void {
  const s = getSettings();
  document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  document.documentElement.classList.toggle('high-contrast', s.highContrast);
}
applyA11yClasses();
bus.on('settings:changed', applyA11yClasses);

// Browsers require a user gesture before Web Audio may start.
window.addEventListener(
  'pointerdown',
  () => {
    bus.emit('audio:unlock', undefined);
  },
  { passive: true },
);

bus.on('boot:ready', () => {
  document.getElementById('loading-splash')?.remove();
  overlays.open('menu');
});
