import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { t } from '../../core/i18n';
import { el } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

/** Rolling credits list. */
export function createCreditsScreen(core: GameCoreAPI, _client: GameClient, _router: UIRouter): ScreenHandle {
  const shell = el('div', 'mmf-screen mmf-screen-shell mmf-credits');
  const header = el('header', 'mmf-screen-header');
  const back = el('button', 'mmf-btn btn mmf-btn--ghost mmf-back-btn', `‹ ${t('common.back')}`);
  back.type = 'button';
  back.addEventListener('click', () => {
    core.playUI('back');
    core.back();
  });
  back.addEventListener('mouseenter', () => core.playUI('hover'));
  header.append(back, el('h2', 'mmf-screen-title', t('credits.title')));
  shell.appendChild(header);

  const body = el('div', 'mmf-screen-body');
  const scroller = el('div', 'mmf-credits-scroll');
  const track = el('div', 'mmf-credits-track');

  const blurb = el('p', 'mmf-credits-blurb', t('credits.blurb'));
  track.appendChild(blurb);

  const credit = (roleKey: string, name: string): HTMLElement => {
    const row = el('div', 'mmf-credit-row');
    row.appendChild(el('div', 'mmf-credit-role', t(roleKey)));
    row.appendChild(el('div', 'mmf-credit-name', name));
    return row;
  };
  track.appendChild(credit('credits.design', 'Moorland Interactive'));
  track.appendChild(credit('credits.art', 'Procedural Engine'));
  track.appendChild(credit('credits.audio', 'Web Audio Synthesis'));
  track.appendChild(el('p', 'mmf-credits-thanks', t('credits.thanks')));
  track.appendChild(el('p', 'mmf-credits-note', t('credits.note')));

  scroller.appendChild(track);
  body.appendChild(scroller);
  shell.appendChild(body);
  return { root: shell };
}
