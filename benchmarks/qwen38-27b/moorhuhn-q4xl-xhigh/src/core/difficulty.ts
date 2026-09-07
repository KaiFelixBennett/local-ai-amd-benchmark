/**
 * Difficulty Director — reagiert dynamisch auf Spielerverhalten.
 * Anpassungen sind begrenzt (Clamp) und nachvollziehbar (feste Faktoren).
 */
import { clamp01 } from './scoring';

export interface DirectorInput {
  /** Trefferquote 0..1. */
  accuracy: number;
  /** Aktuelle Combo. */
  combo: number;
  /** Letzte Reaktionszeit in ms (0 = unbekannt). */
  reactionMs: number;
  /** Verbleibende Zeit in s. */
  timeLeft: number;
  /** Rundenlänge in s. */
  roundLength: number;
  /** Anzahl der Fehlschüsse. */
  misses: number;
  /** Bisherige Punktzahl. */
  score: number;
}

export interface DirectorState {
  /** 0.75 .. 1.5 — beeinflusst Spawnrate, Geschwindigkeit, seltene Ziele. */
  factor: number;
  /** Begründung der letzten Anpassung (für Debug-Modus). */
  reason: string;
}

export interface DirectorConfig {
  min: number;
  max: number;
  /** Anpassung pro Update in ±Schritten. */
  step: number;
  /** Anpassung nur alle X ms. */
  intervalMs: number;
}

export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  min: 0.75,
  max: 1.5,
  step: 0.03,
  intervalMs: 1500,
};

export class DifficultyDirector {
  private factor: number;
  private lastUpdate = 0;
  private readonly config: DirectorConfig;
  private _reason = 'start';

  constructor(startFactor = 1.0, config: Partial<DirectorConfig> = {}) {
    this.config = { ...DEFAULT_DIRECTOR_CONFIG, ...config };
    this.factor = this.clamp(this.config.min, this.config.max, startFactor);
  }

  get state(): DirectorState {
    return { factor: this.factor, reason: this._reason };
  }

  /**
   * Update im Runden-Update-Loop.
   * Logik:
   *  - hohe Trefferquote + schnelle Reaktion + hohe Combo -> schwerer
   *  - viele Fehlschüsse oder niedrige Trefferquote -> leichter
   *  - in der letzten Phase (Endspurt) moderat schwerer
   */
  update(nowMs: number, input: DirectorInput): DirectorState {
    if (nowMs - this.lastUpdate < this.config.intervalMs) return this.state;
    this.lastUpdate = nowMs;

    let delta = 0;
    const reasons: string[] = [];

    const acc = input.accuracy;
    if (acc >= 0.8 && input.misses < 5) {
      delta += this.config.step * 2;
      reasons.push('hohe Trefferquote');
    } else if (acc >= 0.6) {
      delta += this.config.step;
      reasons.push('gute Trefferquote');
    } else if (acc < 0.35 && input.misses >= 4) {
      delta -= this.config.step * 2;
      reasons.push('niedrige Trefferquote');
    } else if (acc < 0.45) {
      delta -= this.config.step;
      reasons.push('unsicher');
    }

    if (input.reactionMs > 0 && input.reactionMs < 450 && acc >= 0.55) {
      delta += this.config.step;
      reasons.push('schnelle Reaktion');
    }

    if (input.combo >= 15) {
      delta += this.config.step;
      reasons.push('hohe Combo');
    }

    if (input.misses >= 10) {
      delta -= this.config.step * 2;
      reasons.push('viele Fehlschüsse');
    }

    const progress = 1 - clamp01(input.timeLeft / Math.max(1, input.roundLength));
    if (progress > 0.75 && this.factor < this.config.max) {
      delta += this.config.step * 0.5;
      reasons.push('Endspurt');
    }

    if (delta !== 0) {
      this.factor = this.clamp(this.config.min, this.config.max, this.factor + delta);
      this._reason = reasons.join(', ') || 'stabil';
    }
    return this.state;
  }

  private clamp(min: number, max: number, v: number): number {
    return Math.min(max, Math.max(min, v));
  }
}
