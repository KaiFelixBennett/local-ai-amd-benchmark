/**
 * ui/subtitles.js — the cinematic text layer.
 *
 * Owns: 2.39:1 letterbox bars, a speaker-attributed subtitle line (bottom,
 * above the lower bar), and a centred title card (the end-card of the intro,
 * and reusable for the two endings). It injects its own <style> so the page
 * CSS in index.html is untouched, and mounts on the existing #ui layer.
 *
 * Everything is gilded Art-Nouveau to match the rest of the UI. All methods
 * are idempotent (calling with null clears) so the Director can drive it
 * safely.
 */
export class Subtitles {
  /** @param {HTMLElement} uiEl  the existing #ui container */
  constructor(uiEl) {
    this.uiEl = uiEl;
    this._injected = false;
    this.root = null;
    this._build();
  }

  _injectStyles() {
    if (this._injected) return;
    const css = `
      .sub-root { position:absolute; inset:0; pointer-events:none; z-index:30; }
      .sub-bar { position:absolute; left:0; right:0; height:0; background:#000; transition:height .6s cubic-bezier(.4,0,.2,1); }
      .sub-bar.top { top:0; }
      .sub-bar.bottom { bottom:0; }
      .sub-root.on .sub-bar { height:11.111vh; }
      .sub-line {
        position:absolute; left:50%; bottom:14vh; transform:translateX(-50%);
        width:min(760px,86vw); text-align:center;
        color:#e9e2cf; font-size:20px; line-height:1.5; font-style:italic;
        text-shadow:0 2px 14px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.8);
        opacity:0; transition:opacity .35s;
      }
      .sub-line.show { opacity:1; }
      .sub-speaker {
        display:block; font-style:normal; font-size:11px; letter-spacing:.28em;
        text-transform:uppercase; color:#e8c979; margin-bottom:6px;
        text-shadow:0 0 14px rgba(232,201,121,.5);
      }
      .sub-card {
        position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        width:min(860px,90vw); text-align:center; opacity:0; transition:opacity .8s;
      }
      .sub-card.show { opacity:1; }
      .sub-card-title {
        font-size:clamp(34px,7vw,74px); letter-spacing:.22em; color:#e8c979;
        text-shadow:0 0 40px rgba(232,201,121,.55), 0 4px 30px rgba(0,0,0,.8);
        font-family:Georgia, serif;
      }
      .sub-card-sub { margin-top:10px; font-size:14px; letter-spacing:.4em; text-transform:uppercase; color:rgba(233,226,207,.7); }
      .sub-card-text {
        margin-top:26px; font-size:clamp(13px,2vw,17px); line-height:1.7; font-style:italic;
        color:#e9e2cf; text-shadow:0 2px 12px rgba(0,0,0,.9);
        border-top:1px solid rgba(201,162,75,.4); border-bottom:1px solid rgba(201,162,75,.4);
        padding:18px 8px;
      }
      .sub-skip {
        position:absolute; right:16px; bottom:12.5vh; font-size:10px; letter-spacing:.24em;
        text-transform:uppercase; color:rgba(233,226,207,.4);
        opacity:0; transition:opacity .3s;
      }
      .sub-skip.show { opacity:1; }
    `;
    const tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
    this._injected = true;
  }

  _build() {
    this._injectStyles();
    const root = document.createElement('div');
    root.className = 'sub-root';
    root.innerHTML = `
      <div class="sub-bar top"></div>
      <div class="sub-bar bottom"></div>
      <div class="sub-line"><span class="sub-speaker"></span><span class="sub-text"></span></div>
      <div class="sub-card"><div class="sub-card-title"></div><div class="sub-card-sub"></div><div class="sub-card-text"></div></div>
      <div class="sub-skip">skip &rarr;</div>
    `;
    this.root = root;
    this._line = root.querySelector('.sub-line');
    this._speaker = root.querySelector('.sub-speaker');
    this._text = root.querySelector('.sub-text');
    this._card = root.querySelector('.sub-card');
    this._cardTitle = root.querySelector('.sub-card-title');
    this._cardSub = root.querySelector('.sub-card-sub');
    this._cardText = root.querySelector('.sub-card-text');
    this._skip = root.querySelector('.sub-skip');
    this.uiEl.appendChild(root);
  }

  /** Toggle 2.39:1 letterbox bars. */
  setLetterbox(on) {
    if (!this.root) return;
    this.root.classList.toggle('on', !!on);
  }

  /** Show a subtitle line: { speaker?, text } or null to hide. */
  setSubtitle(line) {
    if (!this.root) return;
    if (!line || !line.text) {
      this._line.classList.remove('show');
      return;
    }
    this._speaker.textContent = line.speaker || '';
    this._speaker.style.display = line.speaker ? 'block' : 'none';
    this._text.textContent = line.text;
    this._line.classList.add('show');
  }

  /** Show a title/ending card. `text` is optional (used for ending prose). */
  setCard(title, sub, text) {
    if (!this.root) return;
    if (!title) {
      this._card.classList.remove('show');
      return;
    }
    this._cardTitle.textContent = title;
    this._cardSub.textContent = sub || '';
    this._cardSub.style.display = sub ? 'block' : 'none';
    this._cardText.textContent = text || '';
    this._cardText.style.display = text ? 'block' : 'none';
    this._card.classList.add('show');
  }

  /** Show the "skip" hint (bottom-right, above the lower bar). */
  setSkipHint(on) {
    if (!this.root) return;
    this._skip.classList.toggle('show', !!on);
  }

  hideAll() {
    if (!this.root) return;
    this.setLetterbox(false);
    this.setSubtitle(null);
    this.setCard(null);
    this.setSkipHint(false);
  }

  destroy() {
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }
}

export default Subtitles;
