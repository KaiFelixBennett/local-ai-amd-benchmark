/**
 * Geteilte Singleton-Zustände: Save, EventBus, Audio.
 * Werden genau einmal geladen und von allen Szenen geteilt.
 */
import { SaveStore, freshSave, type Settings, type SaveData } from '../core/save';
import { EventBus } from '../core/events';
import { AudioEngine, type AudioVolumes } from './audio';
import { setLang } from '../core/i18n';

export const events = new EventBus();
export const audio = new AudioEngine();

let save: SaveData | null = null;

/** Lädt (oder erstellt) den Spielstand. */
export function loadSave(): SaveData {
  if (!save) {
    const store = new SaveStore();
    save = store.load() ?? freshSave();
  }
  return save;
}

export function persistSave(): void {
  if (save) new SaveStore().save(save);
}

export function getSettings(): Settings {
  return loadSave().settings;
}

/** Sprache anwenden und merken. */
export function applyLang(): void {
  const s = getSettings();
  setLang(s.lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = s.lang === 'de' ? 'de' : 'en';
  }
}

/** Wählt die Audio-Lautstärken aus den Einstellungen ab. */
export function audioVolumes(): AudioVolumes {
  const s = getSettings();
  return { master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, ambient: s.ambientVolume };
}

/** Boot: einmalig nach der ersten Benutzergeste. */
let booted = false;
export function bootOnce(): void {
  if (booted) return;
  booted = true;
  loadSave();
  applyLang();
  audio.setVolumes(audioVolumes());
  audio.ensure();
}
