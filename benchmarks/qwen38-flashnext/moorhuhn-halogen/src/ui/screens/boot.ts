import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { t } from '../../core/i18n';
import { el } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

/** Animated title screen; the click also unlocks the Web Audio context. */
export function createBootScreen(core: GameCoreAPI, _client: GameClient, router: UIRouter): ScreenHandle {
  const root = el('div', 'mmf-screen mmf-boot');
  const glow = el('div', 'mmf-boot-glow');
  const title = el('h1', 'mmf-boot-title', t('game.title'));
  const subtitle = el('div', 'mmf-boot-subtitle', t('game.subtitle'));
  const tagline = el('div', 'mmf-boot-tagline', t('game.tagline'));
  const cta = el('button', 'mmf-boot-cta btn mmf-btn mmf-btn--primary', t('boot.tap'));
  cta.type = 'button';
  const feathers = el('div', 'mmf-boot-feathers');
  for (let i = 0; i < 14; i++) {
    const f = el('span', 'mmf-boot-feather');
    f.style.left = `${(i * 7.1) % 100}%`;
    f.style.animationDuration = `${6 + (i % 5) * 1.7}s`;
    f.style.animationDelay = `${-(i * 0.9)}s`;
    f.style.opacity = String(0.25 + (i % 4) * 0.12);
    feathers.appendChild(f);
  }
  root.append(glow, feathers, title, subtitle, tagline, cta);

  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    core.unlockAudio();
    core.playUI('click');
    root.classList.add('mmf-boot--gone');
    core.go('main');
    // In case the engine does not route through the bus, force the swap locally.
    window.setTimeout(() => {
      if (router.current === 'boot') router.show('main');
    }, 60);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      start();
    }
  };
  cta.addEventListener('click', start);
  root.addEventListener('click', start);
  document.addEventListener('keydown', onKey);

  return {
    root,
    destroy(): void {
      document.removeEventListener('keydown', onKey);
    },
  };
}
