import { describe, expect, it } from 'vitest';
import { addTranslations, hasKey, keyCount, setLanguage, t, translate } from '../src/core/i18n';

describe('i18n core', () => {
  it('translates known German keys', () => {
    setLanguage('de');
    expect(t('menu.play')).toBe('Spielen');
  });

  it('translates known English keys', () => {
    setLanguage('en');
    expect(t('menu.play')).toBe('Play');
  });

  it('falls back to German for keys missing in English', () => {
    addTranslations('de', { 'test.only_de': 'Nur Deutsch' });
    setLanguage('en');
    expect(t('test.only_de')).toBe('Nur Deutsch');
  });

  it('returns the raw key when nothing resolves', () => {
    setLanguage('en');
    expect(t('definitely.missing.key.xyz')).toBe('definitely.missing.key.xyz');
  });

  it('interpolates {vars} multiple times', () => {
    addTranslations('en', { 'test.vars': '{a} and {a} and {b}' });
    setLanguage('en');
    expect(translate('test.vars', { a: 1, b: 'two' })).toBe('1 and 1 and two');
  });

  it('leaves unknown placeholders untouched', () => {
    addTranslations('en', { 'test.keep': 'Hello {name}' });
    setLanguage('en');
    expect(translate('test.keep', {})).toBe('Hello {name}');
  });

  it('hasKey reports per-language presence', () => {
    addTranslations('de', { 'test.hk': 'x' });
    expect(hasKey('test.hk', 'de')).toBe(true);
    expect(hasKey('test.hk', 'en')).toBe(false);
  });

  it('keyCount grows with registered translations', () => {
    const before = keyCount('de');
    addTranslations('de', { 'test.count_extra': 'z' });
    expect(keyCount('de')).toBe(before + 1);
  });

  it('de and en share the same core key surface', () => {
    // Every core key that exists in de must exist in en too (except test-only keys).
    const coreKeys = ['menu.play', 'settings.title', 'hud.score', 'mode.classic.name', 'map.nebelmoor.name'];
    for (const k of coreKeys) {
      expect(hasKey(k, 'de')).toBe(true);
      expect(hasKey(k, 'en')).toBe(true);
    }
  });

  it('language switching is instant', () => {
    setLanguage('de');
    const de = t('menu.play');
    setLanguage('en');
    const en = t('menu.play');
    expect(de).not.toBe(en);
  });
});
