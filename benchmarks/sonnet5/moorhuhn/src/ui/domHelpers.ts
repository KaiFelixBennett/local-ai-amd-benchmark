/** Creates a detached DOM element tree from an HTML string (single root element expected). */
export function fromHtml(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const el = template.content.firstElementChild;
  if (!el) throw new Error('fromHtml: no root element produced');
  return el as HTMLElement;
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatPlaytime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function backButton(onClick: () => void, label = '←'): HTMLElement {
  const btn = fromHtml(`<button class="icon-btn" aria-label="back">${label}</button>`);
  btn.addEventListener('click', onClick);
  return btn;
}
