/**
 * Difficulty-Director-Tests: Clamp 0.75..1.5, erklärebare Anpassung,
 * Reaktionsverhalten auf Spielerverhalten.
 */
import { describe, it, expect } from 'vitest';
import { DifficultyDirector, type DirectorInput } from '../src/core/difficulty';

function input(over: Partial<DirectorInput> = {}): DirectorInput {
  return {
    accuracy: 0.5,
    combo: 0,
    reactionMs: 0,
    timeLeft: 60,
    roundLength: 120,
    misses: 0,
    score: 0,
    ...over,
  };
}

describe('DifficultyDirector', () => {
  it('startet mit dem eingestellten Start-Faktor', () => {
    const d = new DifficultyDirector(1.2);
    expect(d.state.factor).toBe(1.2);
  });

  it('Start-Faktor wird geclampt in [0.75, 1.5]', () => {
    expect(new DifficultyDirector(0.1).state.factor).toBe(0.75);
    expect(new DifficultyDirector(9.9).state.factor).toBe(1.5);
  });

  it('bleibt IMMER innerhalb von 0.75..1.5', () => {
    const d = new DifficultyDirector(1.0);
    // Viel zu einfach -> soll auf Minimum gehen
    for (let i = 0; i < 200; i++) {
      d.update(i * 2000, input({ accuracy: 0.1, misses: 20 }));
      expect(d.state.factor).toBeGreaterThanOrEqual(0.75);
      expect(d.state.factor).toBeLessThanOrEqual(1.5);
    }
    expect(d.state.factor).toBe(0.75);
    // Viel zu schwer -> soll auf Maximum gehen
    const d2 = new DifficultyDirector(1.0);
    for (let i = 0; i < 200; i++) {
      d2.update(i * 2000, input({ accuracy: 0.95, combo: 30, reactionMs: 200 }));
      expect(d2.state.factor).toBeGreaterThanOrEqual(0.75);
      expect(d2.state.factor).toBeLessThanOrEqual(1.5);
    }
    expect(d2.state.factor).toBe(1.5);
  });

  it('hohe Trefferquote + schnelle Reaktion macht schwerer', () => {
    const d = new DifficultyDirector(1.0);
    d.update(0, input());
    for (let i = 1; i < 10; i++) {
      d.update(i * 2000, input({ accuracy: 0.9, combo: 20, reactionMs: 250 }));
    }
    expect(d.state.factor).toBeGreaterThan(1.0);
  });

  it('niedrige Trefferquote + viele Fehlschüsse macht leichter', () => {
    const d = new DifficultyDirector(1.0);
    d.update(0, input());
    for (let i = 1; i < 10; i++) {
      d.update(i * 2000, input({ accuracy: 0.2, misses: 15 }));
    }
    expect(d.state.factor).toBeLessThan(1.0);
  });

  it('liefert eine nicht-leere Begründung nach einer Anpassung', () => {
    const d = new DifficultyDirector(1.0);
    // Erstes Update erst ab t=1500 wirksam (letzte Anpassung bei t=0)
    d.update(1500, input({ accuracy: 0.9, combo: 20 }));
    expect(d.state.reason.length).toBeGreaterThan(0);
    expect(d.state.reason).not.toBe('start');
  });

  it('passt nur alle intervalMs an (Throttling)', () => {
    const d = new DifficultyDirector(1.0);
    // Letztes Update bei t=0: erste echte Anpassung erst ab t=1500
    d.update(0, input());
    expect(d.state.factor).toBe(1.0);
    // Erste Anpassung bei t=1500 (hohe Quote -> schwerer)
    d.update(1500, input({ accuracy: 0.95, combo: 20 }));
    const afterFirst = d.state.factor;
    expect(afterFirst).toBeGreaterThan(1.0);
    // Innerhalb des Intervalls: keine weitere Änderung, egal welche Eingabe
    d.update(2000, input({ accuracy: 0.1, misses: 20 }));
    expect(d.state.factor).toBe(afterFirst);
  });
});
