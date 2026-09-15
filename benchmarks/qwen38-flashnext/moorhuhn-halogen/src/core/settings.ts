import { bus } from './bus';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { setLanguage } from './i18n';

/**
 * Settings store backed by the SaveDataV3.settings object. Emits `settings:changed`
 * so the engine/audio can react. Lives for the whole app.
 */
export class SettingsStore {
  private data: Settings;

  constructor(initial: Settings) {
    this.data = { ...DEFAULT_SETTINGS, ...initial };
    setLanguage(this.data.language);
  }

  get all(): Settings {
    return this.data;
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.data[key];
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    if (key === 'language') setLanguage(value as Settings['language']);
    bus.emit('settings:changed', { keys: [key as string] });
  }

  patch(partial: Partial<Settings>): void {
    let changed = false;
    const keys: string[] = [];
    for (const [k, v] of Object.entries(partial) as [keyof Settings, Settings[keyof Settings]][]) {
      if (this.data[k] !== v) {
        this.data[k] = v as never;
        keys.push(k as string);
        changed = true;
      }
    }
    if (keys.includes('language')) setLanguage(this.data.language);
    if (changed) bus.emit('settings:changed', { keys });
  }

  resetTo(): void {
    this.data = { ...DEFAULT_SETTINGS, language: this.data.language };
    bus.emit('settings:changed', { keys: ['*'] });
  }
}
