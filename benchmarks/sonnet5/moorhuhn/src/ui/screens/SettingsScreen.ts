import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton } from '../domHelpers';
import type { PlayerSettings } from '../../core/types';
import { gameBridge } from '../GameBridge';

const CROSSHAIR_COLORS = ['#f2c14e', '#ff5c5c', '#5cd6ff', '#6fe38f', '#ffffff', '#d18aff'];

export class SettingsScreen implements Screen<void> {
  private root: HTMLElement | null = null;
  private awaitingKeyFor: 'keybindReload' | 'keybindPause' | 'keybindFullscreen' | null = null;
  private keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);

  mount(root: HTMLElement, ctx: AppContext): void {
    const save = ctx.save.load();
    const s = save.settings;

    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar"><div></div><div></div></div>
        <div class="panel scroll-area" style="max-width:920px; width:92vw;">
          <h2 style="color:var(--accent); text-align:center; margin-top:0;">${i18n.t('settings.title')}</h2>
          <div class="settings-grid">
            <div class="settings-section">
              <h3>${i18n.t('settings.audio')}</h3>
              ${this.slider('masterVolume', i18n.t('settings.masterVolume'), s.masterVolume)}
              ${this.slider('musicVolume', i18n.t('settings.musicVolume'), s.musicVolume)}
              ${this.slider('sfxVolume', i18n.t('settings.sfxVolume'), s.sfxVolume)}
              ${this.slider('ambienceVolume', i18n.t('settings.ambienceVolume'), s.ambienceVolume)}
            </div>
            <div class="settings-section">
              <h3>${i18n.t('settings.display')}</h3>
              <div class="settings-row">
                <label>${i18n.t('settings.fullscreen')}</label>
                <button class="toggle ${s.fullscreen ? 'on' : ''}" data-toggle="fullscreen"><span class="knob"></span></button>
              </div>
              <div class="settings-row">
                <label>${i18n.t('settings.quality')}</label>
                <select data-select="quality">
                  <option value="low" ${s.quality === 'low' ? 'selected' : ''}>${i18n.t('settings.qualityLow')}</option>
                  <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>${i18n.t('settings.qualityMedium')}</option>
                  <option value="high" ${s.quality === 'high' ? 'selected' : ''}>${i18n.t('settings.qualityHigh')}</option>
                </select>
              </div>
              <div class="settings-row">
                <label>${i18n.t('settings.language')}</label>
                <select data-select="language">
                  <option value="de" ${s.language === 'de' ? 'selected' : ''}>Deutsch</option>
                  <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
                </select>
              </div>
            </div>
            <div class="settings-section">
              <h3>${i18n.t('settings.gameplay')}</h3>
              ${this.slider('screenShakeIntensity', i18n.t('settings.screenShake'), s.screenShakeIntensity)}
              ${this.slider('particleDensity', i18n.t('settings.particleDensity'), s.particleDensity)}
              ${this.slider('crosshairSize', i18n.t('settings.crosshairSize'), s.crosshairSize, 0.5, 2)}
              <div class="settings-row">
                <label>${i18n.t('settings.crosshairColor')}</label>
                <div class="color-swatches">
                  ${CROSSHAIR_COLORS.map(
                    (c) =>
                      `<span class="swatch ${c === s.crosshairColor ? 'selected' : ''}" style="background:${c}" data-color="${c}"></span>`,
                  ).join('')}
                </div>
              </div>
            </div>
            <div class="settings-section">
              <h3>${i18n.t('settings.accessibility')}</h3>
              <div class="settings-row">
                <label>${i18n.t('settings.colorBlindMode')}</label>
                <select data-select="colorBlindMode">
                  <option value="off" ${s.colorBlindMode === 'off' ? 'selected' : ''}>${i18n.t('settings.colorBlindOff')}</option>
                  <option value="protanopia" ${s.colorBlindMode === 'protanopia' ? 'selected' : ''}>Protanopia</option>
                  <option value="deuteranopia" ${s.colorBlindMode === 'deuteranopia' ? 'selected' : ''}>Deuteranopia</option>
                  <option value="tritanopia" ${s.colorBlindMode === 'tritanopia' ? 'selected' : ''}>Tritanopia</option>
                </select>
              </div>
              <div class="settings-row">
                <label>${i18n.t('settings.highContrastHits')}</label>
                <button class="toggle ${s.highContrastHits ? 'on' : ''}" data-toggle="highContrastHits"><span class="knob"></span></button>
              </div>
              <div class="settings-row">
                <label>${i18n.t('settings.reducedMotion')}</label>
                <button class="toggle ${s.reducedMotion ? 'on' : ''}" data-toggle="reducedMotion"><span class="knob"></span></button>
              </div>
              <div class="settings-row">
                <label>${i18n.t('settings.reducedFlashing')}</label>
                <button class="toggle ${s.reducedFlashing ? 'on' : ''}" data-toggle="reducedFlashing"><span class="knob"></span></button>
              </div>
            </div>
            <div class="settings-section">
              <h3>${i18n.t('settings.controls')}</h3>
              <div class="settings-row">
                <label>${i18n.t('settings.keybindReload')}</label>
                <button class="key-btn" data-key="keybindReload">${s.keybindReload}</button>
              </div>
              <div class="settings-row">
                <label>${i18n.t('settings.keybindPause')}</label>
                <button class="key-btn" data-key="keybindPause">${s.keybindPause}</button>
              </div>
              <div class="settings-row">
                <label>${i18n.t('settings.keybindFullscreen')}</label>
                <button class="key-btn" data-key="keybindFullscreen">${s.keybindFullscreen}</button>
              </div>
            </div>
          </div>
          <div style="text-align:center; margin-top:20px;">
            <button class="btn danger small" data-action="reset">${i18n.t('settings.reset')}</button>
          </div>
        </div>
      </div>
    `);
    const topBar = el.querySelector('.top-bar') as HTMLElement;
    topBar.prepend(backButton(() => ctx.back()));
    root.appendChild(el);
    this.root = el;

    const persist = (mutator: (settings: PlayerSettings) => void) => {
      const data = ctx.save.update((d) => mutator(d.settings));
      ctx.audio.applyVolumes(data.settings);
      gameBridge.emit('settingsChanged', undefined);
    };

    el.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting as keyof PlayerSettings;
        const value = Number(input.value);
        persist((settings) => {
          (settings[key] as number) = value;
        });
      });
    });

    el.querySelectorAll<HTMLButtonElement>('.toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const key = toggle.dataset.toggle as keyof PlayerSettings;
        const newVal = !toggle.classList.contains('on');
        toggle.classList.toggle('on', newVal);
        persist((settings) => {
          (settings[key] as unknown as boolean) = newVal;
        });
        ctx.audio.playMenuClick();
      });
    });

    el.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
      select.addEventListener('change', () => {
        const key = select.dataset.select as keyof PlayerSettings;
        const value = select.value;
        persist((settings) => {
          (settings[key] as unknown as string) = value;
        });
        if (key === 'language') {
          i18n.setLanguage(select.value as 'de' | 'en');
          ctx.refreshLanguage();
        }
      });
    });

    el.querySelectorAll<HTMLElement>('.swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        el.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
        swatch.classList.add('selected');
        const color = swatch.dataset.color as string;
        persist((settings) => {
          settings.crosshairColor = color;
        });
      });
    });

    el.querySelector('[data-toggle="fullscreen"]')?.addEventListener('click', () => {
      void this.toggleFullscreen();
    });

    el.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.awaitingKeyFor = btn.dataset.key as typeof this.awaitingKeyFor;
        btn.textContent = i18n.t('settings.pressKey');
        window.addEventListener('keydown', this.keydownHandler, { once: true });
      });
    });

    el.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      ctx.save.reset();
      ctx.navigate('settings', undefined, { replace: true });
    });

    el.addEventListener('keybind-set', ((e: CustomEvent<{ field: keyof PlayerSettings; key: string }>) => {
      const { field, key } = e.detail;
      persist((settings) => {
        (settings[field] as unknown as string) = key;
      });
    }) as EventListener);
  }

  private slider(key: keyof PlayerSettings, label: string, value: number, min = 0, max = 1): string {
    return `
      <div class="settings-row">
        <label>${label}</label>
        <input type="range" min="${min}" max="${max}" step="0.01" value="${value}" data-setting="${key}" />
      </div>`;
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // fullscreen may be blocked by the browser/embedding context; fail silently
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.awaitingKeyFor || !this.root) return;
    e.preventDefault();
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    const btn = this.root.querySelector<HTMLButtonElement>(`[data-key="${this.awaitingKeyFor}"]`);
    if (btn) btn.textContent = key;
    const field = this.awaitingKeyFor;
    this.awaitingKeyFor = null;
    // handled via closure over ctx captured at mount-time is not possible here,
    // so persistence is done through a custom event to avoid holding a stale ctx.
    this.root.dispatchEvent(new CustomEvent('keybind-set', { detail: { field, key } }));
  }

  unmount(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    this.root = null;
  }
}
