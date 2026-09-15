import type { GameCoreAPI, HudState } from '../core/api';
import type { GameClient } from '../core/gameClient';
import { bus } from '../core/bus';
import { t } from '../core/i18n';
import { CHALLENGES } from '../config/cosmetics';
import { el } from './components';

interface ActiveChallenge {
  id: string;
  progress: number;
  goal: number;
  done: boolean;
  node: HTMLElement;
  hideAt: number;
}

/**
 * In-game DOM overlay. Anchored to the screen edges so the center playfield
 * stays clear: top bar (time / event / phase), top-right (score + combo),
 * bottom-left (ammo), bottom-center (boss bar / chain / challenges).
 */
export class Hud {
  readonly root: HTMLElement;
  private readonly core: GameCoreAPI;
  private readonly client: GameClient;

  private timeNode!: HTMLElement;
  private timeWarnNode!: HTMLElement;
  private elapsedNode!: HTMLElement;
  private scoreNode!: HTMLElement;
  private comboWrap!: HTMLElement;
  private comboNumNode!: HTMLElement;
  private comboMultNode!: HTMLElement;
  private comboBar!: HTMLElement;
  private ammoPips!: HTMLElement;
  private reserveNode!: HTMLElement;
  private weaponStateNode!: HTMLElement;
  private reloadBar!: HTMLElement;
  private eventBanner!: HTMLElement;
  private eventLabelNode!: HTMLElement;
  private eventIconNode!: HTMLElement;
  private chainNode!: HTMLElement;
  private bossWrap!: HTMLElement;
  private bossNameNode!: HTMLElement;
  private bossFill!: HTMLElement;
  private phaseNode!: HTMLElement;
  private badgesNode!: HTMLElement;
  private challengeRow!: HTMLElement;

  private readonly challenges = new Map<string, ActiveChallenge>();
  private disposers: (() => void)[] = [];

  // animated score + zen elapsed timers
  private displayedScore = 0;
  private targetScore = 0;
  private scoreRaf = 0;
  private lastTick = 0;
  private elapsedSec = 0;
  private lastMag = -1;

  constructor(core: GameCoreAPI, client: GameClient) {
    this.core = core;
    this.client = client;
    this.root = el('div', 'mmf-hud');
    this.root.setAttribute('aria-hidden', 'true');
    this.build();
    this.hide();

    this.disposers.push(
      bus.on('challenge:progress', ({ challengeId, progress, goal }) => {
        this.showChallenge(challengeId, progress, goal, false);
      }),
      bus.on('challenge:complete', ({ challengeId }) => {
        const existing = this.challenges.get(challengeId);
        if (existing) {
          existing.done = true;
          existing.node.classList.add('mmf-challenge-chip--done');
          existing.hideAt = performance.now() + 4000;
        }
      }),
    );
  }

  private build(): void {
    // ---------- top bar ----------
    const top = el('div', 'mmf-hud-top');

    const timeBox = el('div', 'mmf-hud-timebox');
    this.timeNode = el('div', 'mmf-hud-time', '—');
    this.timeWarnNode = el('div', 'mmf-hud-timewarn', t('hud.time_warning'));
    this.elapsedNode = el('div', 'mmf-hud-elapsed', '');
    timeBox.append(this.timeNode, this.timeWarnNode, this.elapsedNode);

    this.phaseNode = el('div', 'mmf-hud-phase', '');

    this.eventBanner = el('div', 'mmf-hud-event');
    this.eventIconNode = el('span', 'mmf-hud-event-icon', '✦');
    this.eventLabelNode = el('span', 'mmf-hud-event-label', '');
    this.eventBanner.append(this.eventIconNode, this.eventLabelNode);

    top.append(timeBox, this.phaseNode, this.eventBanner);
    this.root.appendChild(top);

    // ---------- top right: score + combo ----------
    const right = el('div', 'mmf-hud-right');
    const scoreBox = el('div', 'mmf-hud-scorebox');
    scoreBox.appendChild(el('div', 'mmf-hud-score-label', t('hud.score')));
    this.scoreNode = el('div', 'mmf-hud-score', '0');
    scoreBox.appendChild(this.scoreNode);
    this.badgesNode = el('div', 'mmf-hud-badges');
    scoreBox.appendChild(this.badgesNode);

    this.comboWrap = el('div', 'mmf-hud-combo');
    this.comboNumNode = el('div', 'mmf-hud-combo-num', '0');
    this.comboMultNode = el('div', 'mmf-hud-combo-mult', '×1.0');
    const comboInner = el('div', 'mmf-hud-combo-inner');
    comboInner.append(this.comboNumNode, this.comboMultNode);
    this.comboBar = el('div', 'mmf-hud-combo-barfill');
    const comboTrack = el('div', 'mmf-hud-combo-track');
    comboTrack.appendChild(this.comboBar);
    this.comboWrap.append(el('div', 'mmf-hud-combo-label', t('hud.combo')), comboInner, comboTrack);

    right.append(scoreBox, this.comboWrap);
    this.root.appendChild(right);

    // ---------- bottom left: ammo ----------
    const ammoBox = el('div', 'mmf-hud-ammo');
    ammoBox.appendChild(el('div', 'mmf-hud-ammo-label', t('hud.ammo')));
    this.ammoPips = el('div', 'mmf-hud-pips');
    const reserveWrap = el('div', 'mmf-hud-reserve-wrap');
    this.reserveNode = el('div', 'mmf-hud-reserve', '');
    reserveWrap.appendChild(this.reserveNode);
    this.weaponStateNode = el('div', 'mmf-hud-weaponstate', '');
    const reloadTrack = el('div', 'mmf-hud-reload-track');
    this.reloadBar = el('div', 'mmf-hud-reload-fill');
    reloadTrack.appendChild(this.reloadBar);
    ammoBox.append(this.ammoPips, reserveWrap, this.weaponStateNode, reloadTrack);
    this.root.appendChild(ammoBox);

    // ---------- bottom center: boss / chain / challenges ----------
    const bottom = el('div', 'mmf-hud-bottom');
    this.bossWrap = el('div', 'mmf-hud-boss');
    this.bossNameNode = el('div', 'mmf-hud-boss-name', '');
    const bossTrack = el('div', 'mmf-hud-boss-track');
    this.bossFill = el('div', 'mmf-hud-boss-fill');
    bossTrack.appendChild(this.bossFill);
    this.bossWrap.append(this.bossNameNode, bossTrack);

    this.chainNode = el('div', 'mmf-hud-chain', '');
    this.challengeRow = el('div', 'mmf-hud-challenges');
    bottom.append(this.bossWrap, this.chainNode, this.challengeRow);
    this.root.appendChild(bottom);
  }

  update(state: HudState): void {
    const now = performance.now();

    // ---------- time ----------
    if (state.isZen || !Number.isFinite(state.timeLeft)) {
      if (this.lastTick === 0) this.lastTick = now;
      this.elapsedSec += Math.max(0, (now - this.lastTick) / 1000);
      this.timeNode.textContent = '∞';
      this.timeNode.classList.remove('mmf-hud-time--critical');
      this.timeWarnNode.classList.remove('mmf-visible');
      this.elapsedNode.textContent = `${t('ui.elapsed')} ${this.fmtClock(this.elapsedSec)}`;
      this.elapsedNode.classList.add('mmf-visible');
    } else {
      this.lastTick = now;
      const secs = Math.max(0, Math.ceil(state.timeLeft));
      this.timeNode.textContent = String(secs);
      const critical = secs <= 10;
      this.timeNode.classList.toggle('mmf-hud-time--critical', critical);
      this.timeWarnNode.classList.toggle('mmf-visible', critical);
      this.elapsedNode.classList.remove('mmf-visible');
    }

    // ---------- score (count-up) ----------
    this.targetScore = Number.isFinite(state.scoreDisplay) ? state.scoreDisplay : state.score;
    this.animateScore();

    // ---------- combo ----------
    const comboActive = state.combo > 1 || state.multiplier > 1;
    this.comboWrap.classList.toggle('mmf-hud-combo--active', comboActive);
    this.comboNumNode.textContent = String(state.combo);
    this.comboMultNode.textContent = `×${state.multiplier.toFixed(1)}`;
    const frac = Math.max(0, Math.min(1, state.comboFrac));
    this.comboBar.style.width = `${(frac * 100).toFixed(1)}%`;
    this.comboBar.classList.toggle('mmf-hud-combo-barfill--low', frac < 0.3);
    if (comboActive) {
      this.comboWrap.classList.add('mmf-combo-bump');
      window.setTimeout(() => this.comboWrap.classList.remove('mmf-combo-bump'), 180);
    }

    // ---------- ammo ----------
    this.renderPips(state);
    if (state.reserve < 0) {
      this.reserveNode.textContent = '∞';
      this.reserveNode.classList.remove('mmf-hud-reserve--low');
    } else {
      this.reserveNode.textContent = String(state.reserve);
      this.reserveNode.classList.toggle('mmf-hud-reserve--low', state.reserve <= 6);
    }
    const stateMap: Record<typeof state.weaponState, string> = {
      ready: t('hud.ready'),
      empty: t('hud.empty'),
      reloading: t('hud.reloading'),
    };
    this.weaponStateNode.textContent = stateMap[state.weaponState];
    this.weaponStateNode.className = `mmf-hud-weaponstate mmf-hud-weaponstate--${state.weaponState}`;
    this.reloadBar.style.width =
      state.weaponState === 'reloading' ? `${Math.max(0, Math.min(1, state.reloadFrac)) * 100}%` : '0%';

    // ---------- event banner ----------
    if (state.eventLabel && state.eventActive) {
      this.eventLabelNode.textContent = state.eventLabel;
      this.eventBanner.classList.add('mmf-visible');
      const tint = tintForLabel(state.eventLabel);
      this.eventIconNode.style.color = tint;
      this.eventBanner.style.borderColor = tint;
    } else {
      this.eventBanner.classList.remove('mmf-visible');
    }

    // ---------- chain ----------
    if (state.chainLabel) {
      this.chainNode.textContent = `${t('hud.chain')}: ${state.chainLabel}`;
      this.chainNode.classList.add('mmf-visible');
    } else {
      this.chainNode.classList.remove('mmf-visible');
    }

    // ---------- boss ----------
    if (state.bossActive) {
      this.bossNameNode.textContent = state.bossName ?? t('hud.boss');
      const hp = Math.max(0, Math.min(1, state.bossHp));
      this.bossFill.style.width = `${(hp * 100).toFixed(1)}%`;
      this.bossWrap.classList.add('mmf-visible');
      this.bossFill.classList.toggle('mmf-hud-boss-fill--low', hp < 0.25);
    } else {
      this.bossWrap.classList.remove('mmf-visible');
    }

    // ---------- phase ----------
    if (state.phase) {
      const label = t(`hud.phase.${state.phase}`);
      this.phaseNode.textContent = label === `hud.phase.${state.phase}` ? state.phase : label;
      this.phaseNode.classList.add('mmf-visible');
    } else {
      this.phaseNode.classList.remove('mmf-visible');
    }

    // ---------- status badges ----------
    this.renderBadges(state);

    // ---------- challenge chip housekeeping ----------
    this.pruneChallenges(now);
  }

  private renderPips(state: HudState): void {
    const size = Math.max(1, state.magazineSize);
    if (this.lastMag !== size || this.ammoPips.children.length !== size) {
      this.ammoPips.replaceChildren();
      for (let i = 0; i < size; i++) {
        this.ammoPips.appendChild(el('span', 'mmf-pip'));
      }
      this.lastMag = size;
    }
    const kids = this.ammoPips.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('mmf-pip--empty', i >= state.ammo);
      kids[i].classList.toggle('mmf-pip--spent', state.weaponState === 'reloading' && i < state.ammo);
    }
  }

  private renderBadges(state: HudState): void {
    const want: { cls: string; text: string }[] = [];
    if (state.perfect) want.push({ cls: 'mmf-badge--perfect', text: t('hit.perfect') });
    if (state.noMiss) want.push({ cls: 'mmf-badge--nomiss', text: t('banner.no_miss') });
    if (state.isRecord) want.push({ cls: 'mmf-badge--record', text: t('common.record') });
    const sig = want.map((w) => w.cls).join('|');
    if (this.badgesNode.dataset.sig === sig) return;
    this.badgesNode.dataset.sig = sig;
    this.badgesNode.replaceChildren();
    for (const b of want) {
      this.badgesNode.appendChild(el('span', `mmf-badge ${b.cls}`, b.text));
    }
  }

  private showChallenge(id: string, progress: number, goal: number, done: boolean): void {
    const existing = this.challenges.get(id);
    if (existing) {
      existing.progress = progress;
      existing.goal = goal;
      existing.done = done;
      existing.hideAt = performance.now() + 6000;
      const label = existing.node.querySelector('.mmf-challenge-text');
      if (label) label.textContent = this.challengeText(id, progress, goal);
      if (done) existing.node.classList.add('mmf-challenge-chip--done');
      return;
    }
    const chip = el('div', 'mmf-challenge-chip');
    chip.appendChild(el('span', 'mmf-challenge-name', t(`challenge.${id}.name`)));
    chip.appendChild(el('span', 'mmf-challenge-text', this.challengeText(id, progress, goal)));
    this.challengeRow.appendChild(chip);
    if (this.challengeRow.children.length > 3) {
      const first = this.challengeRow.firstElementChild;
      if (first) {
        first.remove();
        // drop the oldest map entry that is not this one
        for (const [key, val] of this.challenges) {
          if (val.node === first) {
            this.challenges.delete(key);
            break;
          }
        }
      }
    }
    this.challenges.set(id, {
      id,
      progress,
      goal,
      done,
      node: chip,
      hideAt: performance.now() + 6000,
    });
  }

  private challengeText(id: string, progress: number, goal: number): string {
    const def = CHALLENGES.find((c) => c.id === id);
    const denom = def ? def.goal : goal || 1;
    const shown = Math.min(progress, denom);
    return t('ach.progress', { progress: String(Math.round(shown)), goal: String(Math.round(denom)) });
  }

  private pruneChallenges(now: number): void {
    for (const [id, ch] of this.challenges) {
      if (now > ch.hideAt) {
        ch.node.remove();
        this.challenges.delete(id);
      }
    }
  }

  private fmtClock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Count-up toward `targetScore`, honouring reduce-motion. */
  private animateScore(): void {
    if (this.core.getSetting('reduceMotion')) {
      this.displayedScore = this.targetScore;
      this.scoreNode.textContent = this.fmtScore(this.displayedScore);
      return;
    }
    if (this.scoreRaf) return;
    const step = (): void => {
      const diff = this.targetScore - this.displayedScore;
      if (Math.abs(diff) < 1) {
        this.displayedScore = this.targetScore;
        this.scoreNode.textContent = this.fmtScore(this.displayedScore);
        this.scoreRaf = 0;
        return;
      }
      this.displayedScore += diff * 0.18 + Math.sign(diff) * 2;
      if (diff > 0 && this.displayedScore > this.targetScore) this.displayedScore = this.targetScore;
      this.scoreNode.textContent = this.fmtScore(this.displayedScore);
      this.scoreRaf = window.requestAnimationFrame(step);
    };
    this.scoreRaf = window.requestAnimationFrame(step);
  }

  private fmtScore(n: number): string {
    return Math.round(n).toLocaleString(this.client.settings.get('language') === 'de' ? 'de-DE' : 'en-US');
  }

  show(): void {
    this.root.classList.add('mmf-hud--visible');
  }

  hide(): void {
    this.root.classList.remove('mmf-hud--visible');
    this.lastTick = 0;
    this.elapsedSec = 0;
    this.displayedScore = 0;
    this.targetScore = 0;
    this.challenges.clear();
    this.challengeRow.replaceChildren();
    this.badgesNode.replaceChildren();
    this.badgesNode.dataset.sig = '';
  }

  dispose(): void {
    if (this.scoreRaf) window.cancelAnimationFrame(this.scoreRaf);
    this.scoreRaf = 0;
    for (const off of this.disposers) off();
    this.disposers = [];
    this.root.remove();
  }
}

/** Deterministic accent tint per event label, so different events read apart. */
function tintForLabel(label: string): string {
  const palette = ['#ffb84a', '#7fd0e8', '#b8a0ff', '#ff8a5c', '#8ce8d0', '#f4e8d0'];
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length] ?? '#ffb84a';
}
