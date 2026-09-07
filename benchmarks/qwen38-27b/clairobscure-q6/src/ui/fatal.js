/**
 * ui/fatal.js — Minimal, dependency-free fatal-error overlay.
 *
 * Used by main.js (module load failure) and by game.js (WebGL constructor
 * failure). No imports — this file must work even if the rest of the game
 * failed to load.
 */
export function showFatal(err) {
  let el = document.getElementById('fatal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal';
    el.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      background:#0c0f14;color:#e9e2cf;
      font-family:Georgia,'Times New Roman',serif;
      text-align:center;padding:24px;`;
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = `
    max-width:520px;
    border:1px solid rgba(201,162,75,0.5);
    background:rgba(14,18,24,0.97);
    padding:28px 32px;
    box-shadow:0 0 60px rgba(201,162,75,0.12);`;
  const h = document.createElement('div');
  h.textContent = 'THE EXPEDITION COULD NOT BEGIN';
  h.style.cssText = 'font-size:20px;letter-spacing:0.08em;color:#e8c979;margin-bottom:14px;';
  const p = document.createElement('div');
  p.textContent =
    (err && err.message) || String(err);
  p.style.cssText = 'font-size:13px;line-height:1.6;color:rgba(233,226,207,0.75);word-break:break-word;';
  const tip = document.createElement('div');
  tip.textContent =
    'This game loads three.js from unpkg. If you are offline, reconnect and reload. ' +
    'If WebGL is unavailable, try a browser with hardware acceleration enabled.';
  tip.style.cssText = 'margin-top:16px;font-size:11px;line-height:1.5;color:rgba(233,226,207,0.45);';
  box.appendChild(h);
  box.appendChild(p);
  box.appendChild(tip);
  el.appendChild(box);
}
