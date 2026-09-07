import { describe, it, expect } from 'vitest';
import { createI18N, detectLanguage } from '../src/core/i18n';

describe('i18n', () => {
  it('provides German and English for core keys', () => {
    const de = createI18N('de');
    const en = createI18N('en');
    expect(de.t('app.title')).toBe('MOORLAND MAYHEM');
    expect(de.t('menu.play')).not.toBe(en.t('menu.play'));
    expect(de.lang).toBe('de');
    expect(en.lang).toBe('en');
  });

  it('falls back to German for DE-only keys, and to the key itself if unknown', () => {
    const en = createI18N('en');
    // 'rank.S' exists only in the DE dict, so EN must fall back to German.
    expect(en.t('rank.S')).toBe(createI18N('de').t('rank.S'));
    // A completely unknown key returns the key itself.
    expect(en.t('does.not.exist')).toBe('does.not.exist');
  });

  it('setLang switches the language', () => {
    const i = createI18N('de');
    expect(i.t('menu.play')).toBe('Spielen');
    i.setLang('en');
    expect(i.t('menu.play')).toBe('Play');
  });

  it('interpolates {vars} into returned strings', () => {
    const i = createI18N('de');
    // Unknown key returns itself, then {name} tokens are substituted.
    expect(i.t('Hello {name}!', { name: 'Moor' })).toBe('Hello Moor!');
    // Multiple vars.
    expect(i.t('{a}+{b}', { a: 1, b: 2 })).toBe('1+2');
    // A token with no provided var is left untouched.
    expect(i.t('Has {missing} here')).toBe('Has {missing} here');
  });

  it('detectLanguage returns a supported language', () => {
    const l = detectLanguage();
    expect(['de', 'en']).toContain(l);
  });
});
