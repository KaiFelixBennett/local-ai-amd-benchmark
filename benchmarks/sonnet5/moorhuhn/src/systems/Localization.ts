import { de, type LocaleKey } from '../locales/de';
import { en } from '../locales/en';
import { TypedEmitter } from '../core/EventBus';

export type Language = 'de' | 'en';

const DICTIONARIES: Record<Language, Partial<Record<LocaleKey, string>>> = { de, en };

interface LocalizationEvents {
  change: Language;
}

/**
 * Simple key/value localization service with German as the always-complete
 * fallback dictionary — any key missing from a non-German locale resolves to
 * the German string instead of surfacing a raw key to the player.
 */
class LocalizationService {
  private language: Language = 'de';
  readonly events = new TypedEmitter<LocalizationEvents>();

  detectBrowserLanguage(): Language {
    const nav = typeof navigator !== 'undefined' ? navigator.language : 'de';
    return nav.toLowerCase().startsWith('en') ? 'en' : 'de';
  }

  setLanguage(lang: Language): void {
    this.language = lang;
    this.events.emit('change', lang);
  }

  getLanguage(): Language {
    return this.language;
  }

  /** Translates a key, with {placeholder} interpolation, falling back to German then the key itself. */
  t(key: LocaleKey, params?: Record<string, string | number>): string {
    const dict = DICTIONARIES[this.language];
    const fallback = DICTIONARIES.de;
    let str = dict[key] ?? fallback[key] ?? key;
    if (params) {
      for (const [paramKey, value] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
      }
    }
    return str;
  }
}

export const i18n = new LocalizationService();
export type { LocaleKey };
