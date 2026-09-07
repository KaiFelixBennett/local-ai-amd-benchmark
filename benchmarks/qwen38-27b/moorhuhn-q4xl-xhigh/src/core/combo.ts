/**
 * Combo- und Streak-Logik — deterministisch, frei von Phaser.
 */
import { clamp01 } from './scoring';

export interface ComboConfig {
  /** Zeitfenster in ms, innerhalb dessen die nächste Treffer die Combo hält. */
  windowMs: number;
  /** Nach einem Fehlschuss: Combo wird auf diesen Faktor reduziert (0 = beendet). */
  missRetainFactor: number;
  /** Bei 0 bleibt die Combo bei Fehlschuss komplett stehen (Zen-Modus). */
  zen: boolean;
}

export const DEFAULT_COMBO_CONFIG: ComboConfig = {
  windowMs: 4000,
  missRetainFactor: 0.5,
  zen: false,
};

export class ComboTracker {
  private _combo = 0;
  private _streak = 0;
  private _maxCombo = 0;
  private _lastHitAt = 0;
  private windowMs: number;
  private missRetainFactor: number;
  private zen: boolean;
  /** Wird vom Spiel gesetzt: true, wenn das Fenster abgelaufen ist. */
  onWindowExpired: ((comboBefore: number) => void) | null = null;
  onMiss: ((comboAfter: number, remaining: number) => void) | null = null;
  onMilestone: ((combo: number) => void) | null = null;

  constructor(config: Partial<ComboConfig> = {}) {
    this.windowMs = config.windowMs ?? DEFAULT_COMBO_CONFIG.windowMs;
    this.missRetainFactor = config.missRetainFactor ?? DEFAULT_COMBO_CONFIG.missRetainFactor;
    this.zen = config.zen ?? DEFAULT_COMBO_CONFIG.zen;
  }

  get combo(): number {
    return this._combo;
  }

  get streak(): number {
    return this._streak;
  }

  get maxCombo(): number {
    return this._maxCombo;
  }

  /** Setzt die Zeitbasis (z. B. bei Rundenstart oder Unpause). */
  reset(nowMs: number): void {
    this._combo = 0;
    this._streak = 0;
    this._maxCombo = 0;
    this._lastHitAt = nowMs;
  }

  /**
   * Registriert einen Treffer.
   * @returns true, wenn durch den Treffer ein Meilenstein (5, 10, 20, 30, 50) erreicht wurde.
   */
  registerHit(nowMs: number): boolean {
    const gap = nowMs - this._lastHitAt;
    if (gap > this.windowMs && this._combo > 0) {
      // Fenster abgelaufen: Combo wird sanft zurückgesetzt (nicht hart bestraft).
      if (this.onWindowExpired) this.onWindowExpired(this._combo);
      this._combo = 0;
    }
    this._lastHitAt = nowMs;
    this._combo += 1;
    this._streak += 1;
    if (this._combo > this._maxCombo) this._maxCombo = this._combo;

    const milestone = this._combo % 10 === 0 || this._combo === 5;
    if (milestone && this.onMilestone) this.onMilestone(this._combo);
    return milestone;
  }

  /**
   * Registriert einen Fehlschuss.
   * @returns verbleibende Combo.
   */
  registerMiss(nowMs: number): number {
    this._streak = 0;
    if (this.zen) {
      // Zen: Fehlschüsse beenden die Combo nicht, verlängern aber das Fenster nicht.
      this._lastHitAt = nowMs;
      return this._combo;
    }
    if (this.missRetainFactor <= 0) {
      this._combo = 0;
    } else {
      this._combo = Math.floor(this._combo * this.missRetainFactor);
    }
    this._lastHitAt = nowMs;
    if (this.onMiss) this.onMiss(this._combo, this._combo);
    return this._combo;
  }

  /**
   * Prüft, ob die Combo abgelaufen ist. Muss vom Update-Loop aufgerufen werden.
   */
  tick(nowMs: number): boolean {
    if (this._combo > 0 && nowMs - this._lastHitAt > this.windowMs) {
      const before = this._combo;
      this._combo = 0;
      if (this.onWindowExpired) this.onWindowExpired(before);
      return true;
    }
    return false;
  }

  /** Anteil der Fensterzeit, der noch übrig ist (0..1). */
  windowRemaining(nowMs: number): number {
    if (this._combo <= 0) return 0;
    return clamp01(1 - (nowMs - this._lastHitAt) / this.windowMs);
  }
}
