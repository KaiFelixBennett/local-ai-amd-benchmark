import type { GameCoreAPI } from '../../core/api';
import type { GameClient, CosmeticKind } from '../../core/gameClient';
import { bus } from '../../core/bus';
import { t } from '../../core/i18n';
import { BALANCE } from '../../config/balance';
import { CROSSHAIRS, HUD_SKINS, WEAPON_SKINS, getCosmeticCost } from '../../config/cosmetics';
import { xpForLevel } from '../../logic/achievements';
import { button, el, fmtNum, progressBar } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

interface CosmeticRow {
  kind: CosmeticKind;
  id: string;
  nameKey: string;
  unlockLevel: number;
  cost: number;
  swatch: string[];
}

function buildRows(): CosmeticRow[] {
  const rows: CosmeticRow[] = [];
  for (const c of CROSSHAIRS) {
    const { level, cost } = getCosmeticCost('crosshairs', c.id);
    rows.push({
      kind: 'crosshairs',
      id: c.id,
      nameKey: `crosshair.${c.id}.name`,
      unlockLevel: level,
      cost,
      swatch: [c.color],
    });
  }
  for (const h of HUD_SKINS) {
    const { level, cost } = getCosmeticCost('hudSkins', h.id);
    rows.push({
      kind: 'hudSkins',
      id: h.id,
      nameKey: `hud.${h.id}.name`,
      unlockLevel: level,
      cost,
      swatch: ['#241b33', '#7fd0e8'],
    });
  }
  for (const w of WEAPON_SKINS) {
    const { level, cost } = getCosmeticCost('weaponSkins', w.id);
    rows.push({
      kind: 'weaponSkins',
      id: w.id,
      nameKey: `weapon.${w.id}.name`,
      unlockLevel: level,
      cost,
      swatch: [w.bodyColor, w.accentColor],
    });
  }
  return rows;
}

const SECTIONS: { titleKey: string; kind: CosmeticKind }[] = [
  { titleKey: 'progress.crosshairs', kind: 'crosshairs' },
  { titleKey: 'progress.huds', kind: 'hudSkins' },
  { titleKey: 'progress.weapons', kind: 'weaponSkins' },
];

/** Level, XP bar and the three cosmetic buy/equip sections. */
export function createProgressScreen(core: GameCoreAPI, client: GameClient, _router: UIRouter): ScreenHandle {
  const shell = el('div', 'mmf-screen mmf-screen-shell mmf-progress');
  const header = el('header', 'mmf-screen-header');
  header.append(
    button(`‹ ${t('common.back')}`, () => core.back(), {
      variant: 'ghost',
      cls: 'mmf-back-btn',
      sound: 'back',
    }),
    el('h2', 'mmf-screen-title', t('progress.title')),
  );
  shell.appendChild(header);
  const body = el('div', 'mmf-screen-body');
  shell.appendChild(body);

  function render(): void {
    body.replaceChildren();
    const prog = client.save.progression;
    const level = client.level;
    const need = xpForLevel(level, BALANCE.xp.base, BALANCE.xp.exp, BALANCE.xp.maxLevel);
    const maxed = !Number.isFinite(need);

    // ---- level + xp --------------------------------------------------
    const hero = el('div', 'mmf-prog-hero');
    const levelBadge = el('div', 'mmf-prog-level', String(level));
    levelBadge.appendChild(el('span', 'mmf-prog-level-label', t('progress.level')));
    hero.appendChild(levelBadge);

    const xpCol = el('div', 'mmf-prog-xp');
    xpCol.appendChild(
      el(
        'div',
        'mmf-prog-xp-title',
        maxed
          ? t('ui.level_max')
          : `${t('progress.next')} ${level + 1} — ${t('progress.to_next', { level: level + 1 })}`,
      ),
    );
    const bar = progressBar(maxed ? 1 : prog.xp / need, 'mmf-bar--xp');
    xpCol.appendChild(bar.root);
    xpCol.appendChild(
      el(
        'div',
        'mmf-prog-xp-text',
        maxed ? `${fmtNum(prog.xp)} ${t('common.xp')}` : `${fmtNum(prog.xp)} / ${fmtNum(need)} ${t('common.xp')}`,
      ),
    );
    hero.appendChild(xpCol);

    const coinsBadge = el('div', 'mmf-prog-coins', `${fmtNum(prog.coins)} ${t('common.coins')}`);
    hero.appendChild(coinsBadge);
    body.appendChild(hero);

    // ---- cosmetic sections -------------------------------------------
    const allRows = buildRows();
    for (const section of SECTIONS) {
      const sec = el('section', 'mmf-section mmf-cos-section');
      sec.appendChild(el('h3', 'mmf-section-title', t(section.titleKey)));
      const grid = el('div', 'mmf-cos-grid');
      for (const row of allRows.filter((r) => r.kind === section.kind)) {
        grid.appendChild(cosmeticCard(row, client, core, render));
      }
      sec.appendChild(grid);
      body.appendChild(sec);
    }
  }

  render();
  const off = bus.on('unlock:changed', render);
  const offCoins = bus.on('settings:changed', render);
  return {
    root: shell,
    refresh: render,
    destroy(): void {
      off();
      offCoins();
    },
  };
}

function cosmeticCard(row: CosmeticRow, client: GameClient, _core: GameCoreAPI, rerender: () => void): HTMLElement {
  const owned = client.isCosmeticOwned(row.kind, row.id);
  const equipped = isEquipped(client, row.kind, row.id);
  const levelOk = client.level >= row.unlockLevel;
  const affordable = client.save.progression.coins >= row.cost;

  const cardEl = el('div', 'mmf-card mmf-cos-card');
  if (!levelOk) cardEl.classList.add('mmf-locked');

  const art = el('div', 'mmf-cos-art');
  art.style.background =
    row.swatch.length > 1
      ? `linear-gradient(135deg, ${row.swatch[0]} 0%, ${row.swatch[1] ?? row.swatch[0]} 100%)`
      : row.swatch[0];
  cardEl.appendChild(art);

  const info = el('div', 'mmf-cos-info');
  const top = el('div', 'mmf-cos-top');
  top.appendChild(el('h4', 'mmf-cos-name', t(row.nameKey)));
  if (!levelOk) {
    top.appendChild(el('span', 'mmf-badge mmf-badge--lock', `⬤ ${t('common.locked')}`));
  }
  info.appendChild(top);

  if (!levelOk) {
    info.appendChild(el('p', 'mmf-cos-req', t('progress.unlock_level', { level: row.unlockLevel })));
  } else if (!owned) {
    info.appendChild(
      el(
        'p',
        `mmf-cos-cost ${affordable ? '' : 'mmf-cos-cost--poor'}`.trim(),
        row.cost > 0 ? t('progress.buy', { cost: fmtNum(row.cost) }) : t('common.unlocked'),
      ),
    );
  } else {
    info.appendChild(el('p', 'mmf-cos-owned', t('progress.owned')));
  }
  cardEl.appendChild(info);

  const footer = el('div', 'mmf-cos-actions');
  if (equipped) {
    footer.appendChild(
      button(t('progress.selected'), () => undefined, {
        variant: 'primary',
        cls: 'mmf-cos-btn--equipped',
      }),
    );
  } else if (owned) {
    footer.appendChild(
      button(
        t('progress.select'),
        () => {
          if (client.equipCosmetic(row.kind, row.id)) {
            bus.emit('toast', { message: t('progress.selected'), kind: 'info' });
          }
          rerender();
        },
        { variant: 'secondary' },
      ),
    );
  } else if (levelOk && row.cost > 0) {
    footer.appendChild(
      button(
        t('progress.buy', { cost: fmtNum(row.cost) }),
        () => {
          if (!affordable) {
            bus.emit('toast', { message: t('ui.not_enough_coins'), kind: 'info' });
            return;
          }
          if (client.buyCosmetic(row.kind, row.id)) {
            bus.emit('toast', { message: t('toast.unlocked', { name: t(row.nameKey) }), kind: 'unlock' });
          }
          rerender();
        },
        { variant: 'primary', disabled: !affordable },
      ),
    );
  }
  cardEl.appendChild(footer);
  return cardEl;
}

function isEquipped(client: GameClient, kind: CosmeticKind, id: string): boolean {
  const eq = client.save.equipped as Record<string, string>;
  const key = kind === 'crosshairs' ? 'crosshair' : kind === 'hudSkins' ? 'hudSkin' : 'weaponSkin';
  return eq[key] === id;
}
