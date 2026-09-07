/**
 * i18n-Tests: DE/EN Übersetzungen, Fallback DE -> EN -> Key, Platzhalter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t, tRaw, setLang, getLang, detectLang, type StringKey } from '../src/core/i18n';

// i18n nutzt window.dispatchEvent in setLang; im Node-Test-Env emulieren wir ein Minimal-Eventsystem.
let dispatched: string[] = [];
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    dispatchEvent: (e: { type: string }) => {
      dispatched.push(e.type);
      return true;
    },
  } as unknown as Window;
}

beforeEach(() => {
  dispatched = [];
  setLang('de');
});

afterEach(() => {
  setLang('de');
});

describe('t() — Grundübersetzung', () => {
  it('Deutsch als Standard', () => {
    expect(t('menu.play')).toBe('Spiel starten');
  });

  it('Englisch nach setLang(en)', () => {
    setLang('en');
    expect(t('menu.play')).toBe('Start game');
    expect(getLang()).toBe('en');
  });

  it('bekannter Key liefert den übersetzten Wert in beiden Sprachen', () => {
    expect(t('game.title')).toBe('Moorland Mayhem');
    setLang('en');
    expect(t('game.title')).toBe('Moorland Mayhem');
  });
});

describe('t() — Platzhalter', () => {
  it('ersetzt {n}, {s}, {m}, {level}', () => {
    expect(t('combo.milestone', { n: 10 })).toBe('Combo 10!');
    expect(t('multikill', { n: 4 })).toBe('MultiKill x4!');
    expect(t('bonusTime', { s: 5 })).toBe('+5 s');
    expect(t('eventMult', { m: 2 })).toBe('Event x2');
    expect(t('unlockHint.level', { level: 3 })).toBe('Erreiche Stufe 3');
  });

  it('Platzhalter in EN', () => {
    setLang('en');
    expect(t('combo.milestone', { n: 10 })).toBe('Combo 10!');
    expect(t('unlockHint.level', { level: 3 })).toBe('Reach level 3');
  });
});

describe('t() — Fallback', () => {
  it('unbekannter Key liefert den Key selbst zurück', () => {
    const out = t('does.not.exist' as StringKey);
    expect(out).toBe('does.not.exist');
  });
});

describe('tRaw() — dynamische Keys', () => {
  it('auflöst target.* in beiden Sprachen', () => {
    expect(tRaw('target.moorflatterer')).toBe('Moorflatterer');
    setLang('en');
    expect(tRaw('target.moorflatterer')).toBe('Moor Flitterer');
  });

  it('auflöst mode.*', () => {
    expect(tRaw('mode.classic')).toBe('Classic Hunt');
    setLang('en');
    expect(tRaw('mode.classic')).toBe('Classic Hunt');
  });

  it('unbekannter dynamischer Key -> Key selbst', () => {
    expect(tRaw('target.unbekannt')).toBe('target.unbekannt');
  });

  it('unterstützt Platzhalter', () => {
    expect(tRaw('xp.earned', { n: 42 })).toBe('+42 XP');
  });
});

describe('setLang — Event', () => {
  it('sendet mm-lang-changed-Event', () => {
    setLang('en');
    expect(dispatched).toContain('mm-lang-changed');
  });
});

describe('detectLang', () => {
  it('liefert eine der beiden Sprachen', () => {
    const l = detectLang();
    expect(['de', 'en']).toContain(l);
  });
});
