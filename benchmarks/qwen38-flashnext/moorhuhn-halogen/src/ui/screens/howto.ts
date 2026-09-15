import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { t } from '../../core/i18n';
import { button, el } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

interface Step {
  key: string;
}

const STEPS: Step[] = [
  { key: 'move' },
  { key: 'reload' },
  { key: 'combo' },
  { key: 'perfect' },
  { key: 'env' },
  { key: 'events' },
];

/** Short instruction pages with a looping animated crosshair demo. */
export function createHowToScreen(core: GameCoreAPI, _client: GameClient, _router: UIRouter): ScreenHandle {
  const root = el('div', 'mmf-screen mmf-screen-shell mmf-howto');
  const header = el('header', 'mmf-screen-header');
  header.appendChild(el('h2', 'mmf-screen-title', t('howto.title')));
  root.appendChild(header);

  const body = el('div', 'mmf-screen-body');
  const layout = el('div', 'mmf-howto-layout');

  // --- animated crosshair demo -----------------------------------------
  const demo = el('div', 'mmf-howto-demo');
  const track = el('div', 'mmf-howto-track');
  const duck = el('span', 'mmf-howto-duck');
  duck.setAttribute('aria-hidden', 'true');
  const cross = el('span', 'mmf-howto-cross');
  cross.setAttribute('aria-hidden', 'true');
  const burst = el('span', 'mmf-howto-burst');
  burst.setAttribute('aria-hidden', 'true');
  track.append(duck, cross, burst);
  demo.appendChild(track);
  demo.appendChild(el('div', 'mmf-howto-demo-caption', t('howto.move_body')));
  layout.appendChild(demo);

  // --- step cards ------------------------------------------------------
  const list = el('div', 'mmf-howto-steps');
  for (const step of STEPS) {
    const item = el('article', 'mmf-howto-step');
    item.appendChild(el('h3', 'mmf-howto-step-title', t(`howto.${step.key}_title`)));
    item.appendChild(el('p', 'mmf-howto-step-body', t(`howto.${step.key}_body`)));
    list.appendChild(item);
  }
  layout.appendChild(list);
  body.appendChild(layout);
  root.appendChild(body);

  const footer = el('div', 'mmf-howto-footer');
  footer.appendChild(button(t('howto.gotcha'), () => core.go('main'), { variant: 'primary' }));
  root.appendChild(footer);

  return { root };
}
