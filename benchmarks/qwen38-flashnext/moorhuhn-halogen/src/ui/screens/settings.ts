import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { bus } from '../../core/bus';
import { t } from '../../core/i18n';
import { CROSSHAIRS } from '../../config/cosmetics';
import type { QualityLevel, Settings } from '../../types';
import { button, el, segmented, sliderEl, toggleSwitch } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

const CROSSHAIR_COLORS = [
  '#ffd54a',
  '#ff8a5c',
  '#7fd0e8',
  '#8ce8d0',
  '#b8a0ff',
  '#f4e8d0',
  '#ff5c7a',
  '#9ab87a',
] as const;

type BindKey = 'keyFire' | 'keyReload' | 'keyPause' | 'keyDebug';

const BIND_ROWS: { key: BindKey; labelKey: string }[] = [
  { key: 'keyFire', labelKey: 'settings.key_fire' },
  { key: 'keyReload', labelKey: 'settings.key_reload' },
  { key: 'keyPause', labelKey: 'settings.key_pause' },
  { key: 'keyDebug', labelKey: 'settings.key_debug' },
];

/** Turn a KeyboardEvent.code into a human-readable label. */
export function formatKey(code: string): string {
  if (!code) return '—';
  const map: Record<string, string> = {
    Space: '␣',
    Escape: 'ESC',
    Enter: '↵',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    MouseLeft: 'LMB',
    MouseRight: 'RMB',
    MouseMiddle: 'MMB',
  };
  if (map[code]) return map[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

/** Full settings screen: audio, video, crosshair, accessibility, key rebinding. */
export function createSettingsScreen(core: GameCoreAPI, client: GameClient, _router: UIRouter): ScreenHandle {
  const shell = frame(core);
  const { body } = shell;

  // ---------------- audio ----------------
  const audioSection = section(t('settings.audio'));
  audioSection.appendChild(
    sliderEl({
      min: 0,
      max: 1,
      step: 0.05,
      value: core.getSetting('masterVolume'),
      label: t('settings.master'),
      format: pct,
      onChange: (v) => core.setSetting('masterVolume', v),
    }),
  );
  audioSection.appendChild(
    sliderEl({
      min: 0,
      max: 1,
      step: 0.05,
      value: core.getSetting('musicVolume'),
      label: t('settings.music'),
      format: pct,
      onChange: (v) => core.setSetting('musicVolume', v),
    }),
  );
  audioSection.appendChild(
    sliderEl({
      min: 0,
      max: 1,
      step: 0.05,
      value: core.getSetting('sfxVolume'),
      label: t('settings.sfx'),
      format: pct,
      onChange: (v) => core.setSetting('sfxVolume', v),
    }),
  );
  audioSection.appendChild(
    sliderEl({
      min: 0,
      max: 1,
      step: 0.05,
      value: core.getSetting('ambientVolume'),
      label: t('settings.ambient'),
      format: pct,
      onChange: (v) => core.setSetting('ambientVolume', v),
    }),
  );
  body.appendChild(audioSection);

  // ---------------- video ----------------
  const videoSection = section(t('settings.video'));
  const fullscreenRow = row(t('settings.fullscreen'));
  const fullscreenToggle = toggleSwitch(core.getSetting('fullscreen'), (v) => {
    core.setSetting('fullscreen', v);
    const isFs = Boolean(document.fullscreenElement);
    if (v !== isFs) core.toggleFullscreen();
  });
  fullscreenRow.appendChild(fullscreenToggle.root);
  videoSection.appendChild(fullscreenRow);

  const qualityRow = row(t('settings.quality'));
  const quality = segmented<QualityLevel>({
    options: [
      { value: 'low', label: t('settings.quality.low') },
      { value: 'medium', label: t('settings.quality.medium') },
      { value: 'high', label: t('settings.quality.high') },
    ],
    value: core.getSetting('quality'),
    onChange: (v) => core.setSetting('quality', v),
  });
  qualityRow.appendChild(quality.root);
  videoSection.appendChild(qualityRow);

  videoSection.appendChild(
    sliderEl({
      min: 0,
      max: 1,
      step: 0.05,
      value: core.getSetting('screenshake'),
      label: t('settings.shake'),
      format: pct,
      onChange: (v) => core.setSetting('screenshake', v),
    }),
  );
  videoSection.appendChild(
    sliderEl({
      min: 0.25,
      max: 1,
      step: 0.05,
      value: core.getSetting('particleDensity'),
      label: t('settings.particles'),
      format: pct,
      onChange: (v) => core.setSetting('particleDensity', v),
    }),
  );
  body.appendChild(videoSection);

  // ---------------- crosshair ----------------
  const crossSection = section(t('settings.crosshair'));
  const crossLayout = el('div', 'mmf-cross-layout');
  const crossControls = el('div', 'mmf-cross-controls');
  crossControls.appendChild(
    sliderEl({
      min: 0.6,
      max: 1.8,
      step: 0.05,
      value: core.getSetting('crosshairSize'),
      label: t('settings.crosshair_size'),
      format: (v: number) => `×${v.toFixed(2)}`,
      onChange: (v) => {
        core.setSetting('crosshairSize', v);
        paintPreview();
      },
    }),
  );
  const colorWrap = el('div', 'mmf-swatch-grid');
  colorWrap.appendChild(el('span', 'mmf-swatch-grid-label', t('settings.crosshair_color')));
  const swatchRow = el('div', 'mmf-swatch-row');
  for (const color of CROSSHAIR_COLORS) {
    const sw = el('button', 'mmf-color-swatch btn');
    sw.type = 'button';
    sw.style.background = color;
    sw.setAttribute('aria-label', color);
    sw.addEventListener('mouseenter', () => core.playUI('hover'));
    sw.addEventListener('click', () => {
      core.playUI('click');
      core.setSetting('crosshairColor', color);
      paintSwatches();
      paintPreview();
    });
    swatchRow.appendChild(sw);
  }
  colorWrap.appendChild(swatchRow);
  crossControls.appendChild(colorWrap);
  crossLayout.appendChild(crossControls);

  // Live preview, drawn as inline SVG from the equipped style + settings.
  const preview = el('div', 'mmf-cross-preview');
  const previewInner = el('div', 'mmf-cross-preview-inner');
  preview.appendChild(previewInner);
  preview.appendChild(el('div', 'mmf-cross-preview-label', 'Live'));
  crossLayout.appendChild(preview);
  crossSection.appendChild(crossLayout);
  body.appendChild(crossSection);

  // ---------------- accessibility ----------------
  const accessSection = section(t('settings.access'));
  accessSection.appendChild(toggleRow(t('settings.colorblind'), 'colorblind'));
  accessSection.appendChild(toggleRow(t('settings.contrast'), 'highContrast'));
  accessSection.appendChild(toggleRow(t('settings.reduce_motion'), 'reduceMotion'));
  accessSection.appendChild(toggleRow(t('settings.reduce_flash'), 'reduceFlash'));
  body.appendChild(accessSection);

  // ---------------- language ----------------
  const langSection = section(t('settings.language'));
  const langRow = row(t('settings.language'));
  langRow.appendChild(
    segmented({
      options: [
        { value: 'de' as const, label: 'Deutsch' },
        { value: 'en' as const, label: 'English' },
      ],
      value: core.getSetting('language'),
      onChange: (v) => core.setSetting('language', v),
    }).root,
  );
  langSection.appendChild(langRow);
  body.appendChild(langSection);

  // ---------------- keys ----------------
  const keysSection = section(t('settings.keys'));
  const keyRows = el('div', 'mmf-key-rows');
  for (const bind of BIND_ROWS) {
    const rowEl = row(t(bind.labelKey));
    const btn = el('button', 'mmf-key-btn btn', formatKey(core.getSetting(bind.key)));
    btn.type = 'button';
    btn.addEventListener('mouseenter', () => core.playUI('hover'));
    btn.addEventListener('click', () => startCapture(btn, bind.key));
    rowEl.appendChild(btn);
    keyRows.appendChild(rowEl);
  }
  keysSection.appendChild(keyRows);
  body.appendChild(keysSection);

  // ---------------- reset ----------------
  const resetSection = section('');
  resetSection.appendChild(
    button(
      t('settings.reset'),
      () => {
        core.playUI('click');
        const fresh: Partial<Settings> = {
          masterVolume: 0.8,
          musicVolume: 0.7,
          sfxVolume: 0.9,
          ambientVolume: 0.6,
          quality: 'high',
          screenshake: 0.7,
          particleDensity: 1,
          crosshairSize: 1,
          crosshairColor: '#ffd54a',
          colorblind: false,
          highContrast: false,
          reduceMotion: false,
          reduceFlash: false,
          keyFire: 'Space',
          keyReload: 'KeyR',
          keyPause: 'Escape',
          keyDebug: 'F3',
        };
        for (const [k, v] of Object.entries(fresh) as [keyof Settings, Settings[keyof Settings]][]) {
          core.setSetting(k, v as never);
        }
        client.settings.resetTo();
        routerToast(t('settings.reset_done'), 'info');
        rerender();
      },
      { variant: 'danger' },
    ),
  );
  body.appendChild(resetSection);

  // ---------------- capture mode ----------------
  let captureBtn: HTMLButtonElement | null = null;
  let captureKey: BindKey | null = null;
  const previousLabel = { current: '' };

  function startCapture(btn: HTMLButtonElement, key: BindKey): void {
    if (captureBtn) cancelCapture();
    captureBtn = btn;
    captureKey = key;
    previousLabel.current = btn.textContent ?? '';
    btn.textContent = t('settings.press_key');
    btn.classList.add('mmf-key-btn--capturing');
    btn.focus();
    document.addEventListener('keydown', onCapture, true);
    core.playUI('click');
  }

  function cancelCapture(): void {
    if (!captureBtn) return;
    captureBtn.textContent = previousLabel.current;
    captureBtn.classList.remove('mmf-key-btn--capturing');
    captureBtn = null;
    captureKey = null;
    document.removeEventListener('keydown', onCapture, true);
  }

  function onCapture(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      cancelCapture();
      return;
    }
    if (!captureKey) return;
    core.setSetting(captureKey, e.code as never);
    cancelCapture();
    rerender();
  }

  function toggleRow(label: string, key: 'colorblind' | 'highContrast' | 'reduceMotion' | 'reduceFlash'): HTMLElement {
    const r = row(label);
    r.appendChild(toggleSwitch(core.getSetting(key), (v) => core.setSetting(key, v)).root);
    return r;
  }

  // ---------------- painting ----------------
  function paintSwatches(): void {
    const active = core.getSetting('crosshairColor');
    const swatches = swatchRow.querySelectorAll('.mmf-color-swatch');
    swatches.forEach((s) => {
      s.classList.toggle('mmf-color-swatch--active', s.getAttribute('aria-label') === active);
    });
  }

  function paintPreview(): void {
    const color = core.getSetting('crosshairColor');
    const scale = core.getSetting('crosshairSize');
    const equipped = client.save.equipped.crosshair || 'classic';
    const def = CROSSHAIRS.find((c) => c.id === equipped) ?? CROSSHAIRS[0];
    if (!def) return;
    previewInner.innerHTML = crosshairSvg(def.style, color, scale);
  }

  function rerender(): void {
    // Re-render the cheap dynamic bits without rebuilding the whole screen.
    paintSwatches();
    paintPreview();
    for (const bind of BIND_ROWS) {
      const btns = keyRows.querySelectorAll('.mmf-key-btn');
      const idx = BIND_ROWS.indexOf(bind);
      const btn = btns[idx] as HTMLButtonElement | undefined;
      if (btn && !btn.classList.contains('mmf-key-btn--capturing')) {
        btn.textContent = formatKey(core.getSetting(bind.key));
      }
    }
    quality.set(core.getSetting('quality'));
    fullscreenToggle.set(core.getSetting('fullscreen'));
  }

  paintSwatches();
  paintPreview();
  const offSettings = bus.on('settings:changed', rerender);

  return {
    root: shell.root,
    refresh: rerender,
    destroy(): void {
      offSettings();
      cancelCapture();
    },
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function frame(core: GameCoreAPI) {
  // A dedicated back handler that works regardless of router wiring.
  return {
    root: (() => {
      const r = el('div', 'mmf-screen mmf-screen-shell mmf-settings');
      const header = el('header', 'mmf-screen-header');
      const back = button(`‹ ${t('common.back')}`, () => core.back(), {
        variant: 'ghost',
        cls: 'mmf-back-btn',
        sound: 'back',
      });
      header.append(back, el('h2', 'mmf-screen-title', t('settings.title')));
      const body = el('div', 'mmf-screen-body mmf-settings-body');
      r.append(header, body);
      return r;
    })(),
    get body() {
      return this.root.querySelector('.mmf-settings-body') as HTMLElement;
    },
  };
}

function section(title: string): HTMLElement {
  const s = el('section', 'mmf-section');
  if (title) s.appendChild(el('h3', 'mmf-section-title', title));
  return s;
}

function row(label: string): HTMLElement {
  const r = el('div', 'mmf-row');
  r.appendChild(el('span', 'mmf-row-label', label));
  return r;
}

function pct(v: number): string {
  return `${Math.round(v * 100)} %`;
}

/** Static, self-authored SVG for the crosshair style preview. */
function crosshairSvg(style: string, color: string, scale: number): string {
  const size = Math.round(72 * scale);
  const c = 36;
  const stroke = `stroke='${color}' stroke-width='3' fill='none' stroke-linecap='round'`;
  const fill = `fill='${color}'`;
  let inner = '';
  switch (style) {
    case 'ring':
      inner = `<circle cx='${c}' cy='${c}' r='22' ${stroke}/><circle cx='${c}' cy='${c}' r='2.5' ${fill}/>`;
      break;
    case 'dot':
      inner = `<circle cx='${c}' cy='${c}' r='6' ${fill}/>`;
      break;
    case 'reticle':
      inner = `<circle cx='${c}' cy='${c}' r='20' ${stroke}/>
         <line x1='${c}' y1='8' x2='${c}' y2='20' ${stroke}/>
         <line x1='${c}' y1='52' x2='${c}' y2='64' ${stroke}/>
         <line x1='8' y1='${c}' x2='20' y2='${c}' ${stroke}/>
         <line x1='52' y1='${c}' x2='64' y2='${c}' ${stroke}/>
         <circle cx='${c}' cy='${c}' r='1.5' ${fill}/>`;
      break;
    case 'feather':
      inner = `<path d='M ${c} 10 L ${c + 10} ${c} L ${c} ${c + 26} L ${c - 10} ${c} Z' ${stroke}/>
         <line x1='${c}' y1='10' x2='${c}' y2='36' ${stroke}/>`;
      break;
    case 'scope':
      inner = `<circle cx='${c}' cy='${c}' r='24' ${stroke}/>
         <circle cx='${c}' cy='${c}' r='12' ${stroke}/>
         <line x1='${c}' y1='4' x2='${c}' y2='68' ${stroke}/>
         <line x1='4' y1='${c}' x2='68' y2='${c}' ${stroke}/>`;
      break;
    case 'cross':
    default:
      inner = `<line x1='${c}' y1='12' x2='${c}' y2='60' ${stroke}/>
         <line x1='12' y1='${c}' x2='60' y2='${c}' ${stroke}/>
         <circle cx='${c}' cy='${c}' r='2' ${fill}/>`;
  }
  return `<svg width='${size}' height='${size}' viewBox='0 0 72 72' aria-hidden='true'>${inner}</svg>`;
}

/** Toast helper that goes through the bus (router listens to it). */
function routerToast(message: string, kind: 'info' | 'coins' | 'unlock' | 'record'): void {
  bus.emit('toast', { message, kind });
}
