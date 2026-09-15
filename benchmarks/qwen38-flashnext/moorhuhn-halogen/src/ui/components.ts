import type { GameCoreAPI } from '../core/api';
import { getLanguage, t } from '../core/i18n';

/* ------------------------------------------------------------------ */
/* Sound hook (router wires this to core.playUI at startup)              */
/* ------------------------------------------------------------------ */

export type UiSoundName = 'click' | 'hover' | 'back';

let playSound: (name: UiSoundName) => void = () => {};

export function setUiSoundHook(core: Pick<GameCoreAPI, 'playUI'>): void {
  playSound = (name: UiSoundName): void => core.playUI(name);
}

/* ------------------------------------------------------------------ */
/* Tiny DOM helpers                                                    */
/* ------------------------------------------------------------------ */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Format a number with the active language locale. */
export function fmtNum(n: number): string {
  return n.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US');
}

/** Format a 0..1 fraction as a localized percent string. */
export function fmtPct(v: number): string {
  return `${Math.round(v * 100)} %`;
}

/** Format seconds as m:ss. */
export function fmtClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '\u221E';
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return m > 0 ? `${m}:${String(rest).padStart(2, '0')}` : `${rest}${t('common.seconds_short')}`;
}

/** Format seconds as hh:mm:ss (no units, locale-neutral). */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export interface ButtonOptions {
  cls?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'menu';
  disabled?: boolean;
  ariaLabel?: string;
  /** sound played on click (default: 'click') */
  sound?: UiSoundName;
}

export function button(label: string, onClick: () => void, opts: ButtonOptions = {}): HTMLButtonElement {
  const btn = el('button', 'mmf-btn btn');
  btn.type = 'button';
  if (opts.variant) btn.classList.add(`mmf-btn--${opts.variant}`);
  if (opts.cls) btn.classList.add(...opts.cls.split(/\s+/).filter(Boolean));
  btn.textContent = label;
  if (opts.disabled) {
    btn.disabled = true;
    btn.classList.add('mmf-disabled');
  }
  if (opts.ariaLabel) btn.setAttribute('aria-label', opts.ariaLabel);
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) playSound('hover');
  });
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    playSound(opts.sound ?? 'click');
    onClick();
  });
  return btn;
}

/* ------------------------------------------------------------------ */
/* Progress bar                                                        */
/* ------------------------------------------------------------------ */

export interface ProgressBar {
  root: HTMLDivElement;
  fill: HTMLDivElement;
  set(frac: number, color?: string): void;
}

export function progressBar(frac: number, cls = ''): ProgressBar {
  const root = el('div', `mmf-bar ${cls}`.trim());
  root.setAttribute('role', 'progressbar');
  const fill = el('div', 'mmf-bar-fill');
  root.appendChild(fill);
  const api: ProgressBar = {
    root,
    fill,
    set(v: number, color?: string): void {
      const clamped = Math.min(1, Math.max(0, v));
      fill.style.width = `${(clamped * 100).toFixed(2)}%`;
      root.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
      if (color) fill.style.background = color;
    },
  };
  api.set(frac);
  return api;
}

/* ------------------------------------------------------------------ */
/* Card / layout blocks                                                */
/* ------------------------------------------------------------------ */

export function card(cls: string, children: readonly (Node | string)[]): HTMLDivElement {
  const node = el('div', `mmf-card ${cls}`.trim());
  for (const child of children) {
    if (typeof child === 'string') node.appendChild(el('span', undefined, child));
    else node.appendChild(child);
  }
  return node;
}

export interface ScreenShell {
  root: HTMLElement;
  header: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
}

/** Standard screen frame: header with optional back button + scrollable body. */
export function screenShell(title: string, onBack: (() => void) | null, cls = ''): ScreenShell {
  const root = el('div', `mmf-screen-shell ${cls}`.trim());
  const header = el('header', 'mmf-screen-header');
  if (onBack) {
    const back = button(`\u2039 ${t('common.back')}`, onBack, {
      variant: 'ghost',
      cls: 'mmf-back-btn',
      sound: 'back',
    });
    header.appendChild(back);
  }
  const titleEl = el('h2', 'mmf-screen-title', title);
  header.appendChild(titleEl);
  const body = el('div', 'mmf-screen-body');
  root.appendChild(header);
  root.appendChild(body);
  return { root, header, title: titleEl, body };
}

/* ------------------------------------------------------------------ */
/* Modal / confirm                                                     */
/* ------------------------------------------------------------------ */

export interface ModalHandle {
  root: HTMLElement;
  close(): void;
}

export function modal(opts: {
  title: string;
  body?: readonly Node[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose?: () => void;
  mountTo?: HTMLElement;
}): ModalHandle {
  const backdrop = el('div', 'mmf-modal-backdrop');
  const panel = el('div', 'mmf-modal');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.appendChild(el('h3', 'mmf-modal-title', opts.title));
  if (opts.body) for (const n of opts.body) panel.appendChild(n);
  const actions = el('div', 'mmf-modal-actions');
  const cancelBtn = button(opts.cancelLabel ?? t('common.cancel'), () => close(), {
    variant: 'ghost',
  });
  actions.appendChild(cancelBtn);
  if (opts.onConfirm) {
    actions.appendChild(
      button(
        opts.confirmLabel ?? t('common.confirm'),
        () => {
          close();
          opts.onConfirm?.();
        },
        { variant: 'primary' },
      ),
    );
  }
  panel.appendChild(actions);
  backdrop.appendChild(panel);

  function close(): void {
    backdrop.remove();
    opts.onClose?.();
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  (opts.mountTo ?? document.body).appendChild(backdrop);
  cancelBtn.focus();
  return { root: backdrop, close };
}

export function showConfirm(title: string, message: string, onConfirm: () => void): ModalHandle {
  return modal({
    title,
    body: [el('p', 'mmf-modal-text', message)],
    confirmLabel: t('common.confirm'),
    cancelLabel: t('common.cancel'),
    onConfirm,
  });
}

/* ------------------------------------------------------------------ */
/* Toggle switch                                                       */
/* ------------------------------------------------------------------ */

export interface Toggle {
  root: HTMLButtonElement;
  set(v: boolean): void;
}

export function toggleSwitch(initial: boolean, onChange: (v: boolean) => void, cls = ''): Toggle {
  const btn = el('button', `mmf-toggle ${cls}`.trim());
  btn.type = 'button';
  btn.setAttribute('role', 'switch');
  const knob = el('span', 'mmf-toggle-knob');
  btn.appendChild(knob);
  btn.addEventListener('mouseenter', () => playSound('hover'));
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    api.set(next);
    playSound('click');
    onChange(next);
  });
  const api: Toggle = {
    root: btn,
    set(v: boolean): void {
      btn.setAttribute('aria-checked', String(v));
      btn.classList.toggle('mmf-toggle--on', v);
    },
  };
  api.set(initial);
  return api;
}

/* ------------------------------------------------------------------ */
/* Slider                                                              */
/* ------------------------------------------------------------------ */

export interface Slider {
  root: HTMLElement;
  input: HTMLInputElement;
  set(v: number): void;
}

/** Build a slider and return its root element directly (for appendChild use). */
export function sliderEl(opts: Parameters<typeof slider>[0]): HTMLElement {
  return slider(opts).root;
}

export function slider(opts: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  label?: string;
  format?: (v: number) => string;
  cls?: string;
}): Slider {
  const root = el('div', `mmf-slider ${opts.cls ?? ''}`.trim());
  const valueEl = el('span', 'mmf-slider-value', (opts.format ?? ((v: number) => String(v)))(opts.value));
  if (opts.label) {
    const labelRow = el('div', 'mmf-slider-labelrow');
    labelRow.appendChild(el('span', 'mmf-slider-label', opts.label));
    labelRow.appendChild(valueEl);
    root.appendChild(labelRow);
  }
  const input = el('input', 'mmf-slider-input');
  input.type = 'range';
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.value);
  if (opts.label) input.setAttribute('aria-label', opts.label);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    valueEl.textContent = (opts.format ?? ((x: number) => String(x)))(v);
    opts.onChange(v);
  });
  root.appendChild(input);
  return {
    root,
    input,
    set(v: number): void {
      input.value = String(v);
      valueEl.textContent = (opts.format ?? ((x: number) => String(x)))(v);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface Segmented<T extends string> {
  root: HTMLDivElement;
  set(v: T): void;
}

export function segmented<T extends string>(opts: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  cls?: string;
}): Segmented<T> {
  const root = el('div', `mmf-segmented ${opts.cls ?? ''}`.trim());
  root.setAttribute('role', 'group');
  const buttons = new Map<T, HTMLButtonElement>();
  for (const option of opts.options) {
    const btn = el('button', 'mmf-segmented-item', option.label);
    btn.type = 'button';
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) playSound('hover');
    });
    btn.addEventListener('click', () => {
      playSound('click');
      opts.onChange(option.value);
      api.set(option.value);
    });
    buttons.set(option.value, btn);
    root.appendChild(btn);
  }
  const api: Segmented<T> = {
    root,
    set(v: T): void {
      for (const [value, btn] of buttons) {
        const active = value === v;
        btn.classList.toggle('mmf-segmented-item--active', active);
        btn.setAttribute('aria-pressed', String(active));
      }
    },
  };
  api.set(opts.value);
  return api;
}

/* ------------------------------------------------------------------ */
/* Keyed list reconcile (keeps DOM nodes across data updates)            */
/* ------------------------------------------------------------------ */

export function keyed<T>(
  container: HTMLElement,
  items: readonly T[],
  keyOf: (item: T) => string,
  create: (item: T) => HTMLElement,
): void {
  const existing = new Map<string, HTMLElement>();
  for (let i = 0; i < container.children.length; i++) {
    const node = container.children[i] as HTMLElement;
    const k = node.dataset.mmfKey;
    if (k !== undefined) existing.set(k, node);
  }
  const next: HTMLElement[] = [];
  for (const item of items) {
    const k = keyOf(item);
    const node = existing.get(k) ?? create(item);
    node.dataset.mmfKey = k;
    next.push(node);
  }
  container.replaceChildren(...next);
}
