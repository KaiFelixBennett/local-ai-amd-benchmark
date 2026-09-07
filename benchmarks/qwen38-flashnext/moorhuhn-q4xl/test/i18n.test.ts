import { describe, expect, it } from 'vitest';
import { translate } from '../src/core/i18n';

describe('i18n translate', () => {
  it('returns the German canonical string', () => {
    expect(translate('de', 'menu.play')).toBe('Schnellstart');
    expect(translate('de', 'app.title')).toBe('Moorland Mayhem');
  });

  it('returns the English string when available', () => {
    expect(translate('en', 'menu.play')).toBe('Quick play');
    // keys with no EN entry fall back to German, not to the raw key
    expect(translate('en', 'hs.date')).toBe('Date');
  });

  it('falls back to German for keys missing from English', () => {
    // 'result.beat' exists in both; pick a key that only exists in DE by
    // comparing behaviour: same key must resolve identically for EN when the
    // EN dict delegates to DE.
    const de = translate('de', 'app.title');
    expect(translate('en', 'app.title')).toBe(de);
  });

  it('falls back to the placeholder form for completely unknown keys', () => {
    expect(translate('de', 'definitely.not.a.real.key')).toBe('de.definitely.not.a.real.key');
    expect(translate('en', 'definitely.not.a.real.key')).toBe('de.definitely.not.a.real.key');
  });

  it('interpolates {var} placeholders', () => {
    expect(translate('en', 'result.beat', { n: 123 })).toBe('Beat best by 123!');
    expect(translate('de', 'result.beat', { n: 45 })).toBe('Bestwert geschlagen um 45!');
  });

  it('leaves unreplaced braces alone when a var is missing', () => {
    expect(translate('en', 'result.beat')).toBe('Beat best by {n}!');
  });

  it('every English key resolves to something other than the placeholder', () => {
    // A cheap completeness smoke-test on a sample across screens.
    const sample = [
      'app.title',
      'menu.play',
      'menu.settings',
      'result.beat',
      'hs.date',
      'hs.empty',
      'prog.title',
      'stats.time',
    ];
    for (const key of sample) {
      expect(translate('en', key)).not.toBe(`de.${key}`);
    }
  });
});
