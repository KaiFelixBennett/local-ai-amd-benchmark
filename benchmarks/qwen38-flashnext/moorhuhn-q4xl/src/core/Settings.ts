import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.85,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  ambientVolume: 0.55,
  quality: 'high',
  shakeIntensity: 1,
  particleDensity: 1,
  crosshairSize: 1,
  crosshairColor: '#ffe66d',
  colorblind: 'off',
  highContrast: false,
  reduceMotion: false,
  reduceFlashes: false,
  language: 'auto',
  leftCanFire: true,
  keyReload: 'KeyR',
  keyPause: 'Escape',
  keySlow: 'Backquote',
};

/** Clamp / sanitise unknown persisted values so a corrupt save can never crash the game. */
export function sanitizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return s;
  const o = raw as Record<string, unknown>;
  const num = (key: keyof Settings, min: number, max: number) => {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (s[key] as number) = Math.min(max, Math.max(min, v));
    }
  };
  num('masterVolume', 0, 1);
  num('musicVolume', 0, 1);
  num('sfxVolume', 0, 1);
  num('ambientVolume', 0, 1);
  num('shakeIntensity', 0, 1.5);
  num('particleDensity', 0, 1.5);
  num('crosshairSize', 0.7, 1.6);
  if (o.quality === 'low' || o.quality === 'medium' || o.quality === 'high') {
    s.quality = o.quality;
  }
  if (
    o.colorblind === 'off' ||
    o.colorblind === 'protanopia' ||
    o.colorblind === 'deuteranopia' ||
    o.colorblind === 'tritanopia'
  ) {
    s.colorblind = o.colorblind;
  }
  if (typeof o.crosshairColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(o.crosshairColor)) {
    s.crosshairColor = o.crosshairColor;
  }
  for (const key of [
    'highContrast',
    'reduceMotion',
    'reduceFlashes',
    'leftCanFire',
  ] as const) {
    if (typeof o[key] === 'boolean') s[key] = o[key];
  }
  if (o.language === 'de' || o.language === 'en' || o.language === 'auto') {
    s.language = o.language;
  }
  for (const key of ['keyReload', 'keyPause', 'keySlow'] as const) {
    if (typeof o[key] === 'string' && o[key].length < 24) s[key] = o[key];
  }
  return s;
}

/** Resolve 'auto' language from the browser, falling back to German. */
export function resolveLanguage(pref: Settings['language']): 'de' | 'en' {
  if (pref === 'de' || pref === 'en') return pref;
  const nav = typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
  return nav.toLowerCase().startsWith('en') ? 'en' : 'de';
}
