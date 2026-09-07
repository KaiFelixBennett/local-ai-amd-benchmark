import { describe, expect, it, beforeEach } from 'vitest';
import { i18n } from '../src/systems/Localization';
import { en } from '../src/locales/en';
import { de } from '../src/locales/de';

describe('Localization fallback', () => {
  beforeEach(() => {
    i18n.setLanguage('de');
  });

  it('resolves a key that exists in the German dictionary', () => {
    expect(i18n.t('menu.play')).toBe(de['menu.play']);
  });

  it('resolves a key present in English when language is en', () => {
    i18n.setLanguage('en');
    expect(i18n.t('menu.play')).toBe(en['menu.play']);
  });

  it('falls back to German for a key missing from the English dictionary', () => {
    // pick a German-only key: something not present in the trimmed `en` partial dictionary
    const germanOnlyKey = Object.keys(de).find((k) => !(k in en));
    expect(germanOnlyKey).toBeDefined();
    i18n.setLanguage('en');
    const key = germanOnlyKey as keyof typeof de;
    expect(i18n.t(key)).toBe(de[key]);
  });

  it('interpolates {placeholder} parameters', () => {
    i18n.setLanguage('de');
    expect(i18n.t('menu.unlockAtLevel', { level: 5 })).toBe('Ab Level 5');
  });

  it('detectBrowserLanguage falls back to German for non-English locales', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true });
    expect(i18n.detectBrowserLanguage()).toBe('de');
    if (original) Object.defineProperty(window.navigator, 'language', original);
  });

  it('detectBrowserLanguage picks English for en-* locales', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
    expect(i18n.detectBrowserLanguage()).toBe('en');
    if (original) Object.defineProperty(window.navigator, 'language', original);
  });
});
