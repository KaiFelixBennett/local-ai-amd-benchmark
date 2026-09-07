/**
 * Cinematic intro overlay — fades in text lines with dramatic timing.
 * Plays once per session, then fades out to reveal the battle.
 */

export class IntroSequence {
  constructor(container) {
    this.container = container;
    this._playing = false;
    this._finished = false;
    this._onComplete = null;
    this._elapsed = 0;
    this._lines = [];
    this._currentLine = -1;
    this._fadeAlpha = 0;
    this._building = true; // true = text appearing, false = text disappearing

    this._buildDOM();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.95); z-index: 9999; pointer-events: auto;
      transition: opacity 1.5s ease;
    `;

    // Title
    this.titleEl = document.createElement('h1');
    this.titleEl.style.cssText = `
      color: #c8a84e; font: bold 42px serif; text-align: center;
      text-shadow: 0 0 30px rgba(200,170,78,0.5); margin-bottom: 40px;
      opacity: 0; transition: opacity 2s ease;
      letter-spacing: 4px;
    `;
    this.titleEl.textContent = 'CLAIR OBSCUR';
    this.el.appendChild(this.titleEl);

    // Subtitle
    this.subtitleEl = document.createElement('h2');
    this.subtitleEl.style.cssText = `
      color: #887755; font: italic 18px serif; text-align: center;
      margin-bottom: 60px; opacity: 0; transition: opacity 2s ease;
      letter-spacing: 2px;
    `;
    this.subtitleEl.textContent = 'Expedition 33';
    this.el.appendChild(this.subtitleEl);

    // Story lines container
    this.linesContainer = document.createElement('div');
    this.linesContainer.style.cssText = `
      max-width: 600px; text-align: center; display: flex;
      flex-direction: column; align-items: center; gap: 16px;
    `;
    this.el.appendChild(this.linesContainer);

    // Skip hint
    this.skipEl = document.createElement('p');
    this.skipEl.style.cssText = `
      position: absolute; bottom: 40px; color: #665544;
      font: 12px sans-serif; opacity: 0; transition: opacity 1s ease;
    `;
    this.skipEl.textContent = '[ESC] Überspringen';
    this.el.appendChild(this.skipEl);

    this.container.appendChild(this.el);

    // Skip handler
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this._playing && !this._finished) {
        this._skip();
      }
    });
  }

  play(lines, onComplete) {
    this._lines = lines;
    this._onComplete = onComplete;
    this._playing = true;
    this._finished = false;
    this._elapsed = 0;
    this._currentLine = -1;
    this._building = true;
    this.linesContainer.innerHTML = '';
    this.el.style.display = 'flex';
    this.el.style.opacity = '1';

    // Fade in title first
    setTimeout(() => { this.titleEl.style.opacity = '1'; }, 300);
    setTimeout(() => { this.subtitleEl.style.opacity = '1'; }, 1200);

    // Start showing story lines
    setTimeout(() => { this._showNextLine(); }, 2500);

    // Show skip hint after 4 seconds
    setTimeout(() => { this.skipEl.style.opacity = '1'; }, 4000);
  }

  _showNextLine() {
    if (!this._playing) return;
    this._currentLine++;
    if (this._currentLine >= this._lines.length) {
      // All lines shown — wait, then fade out
      setTimeout(() => this._fadeOut(), 2500);
      return;
    }

    const line = this._lines[this._currentLine];
    const p = document.createElement('p');
    p.style.cssText = `
      color: ${line.color || '#c8b888'}; font: ${line.bold ? 'bold ' : ''}${line.size || 16}px serif;
      text-shadow: 0 0 10px rgba(200,180,100,0.3); opacity: 0;
      transition: opacity ${line.fadeDuration || 1.5}s ease;
      line-height: 1.6; max-width: 500px;
    `;
    p.textContent = line.text;
    this.linesContainer.appendChild(p);

    // Fade in
    requestAnimationFrame(() => { p.style.opacity = '1'; });

    // Schedule next line
    const delay = line.pause || 2500;
    setTimeout(() => this._showNextLine(), delay);
  }

  _fadeOut() {
    this._finished = true;
    this.el.style.opacity = '0';
    setTimeout(() => {
      this.el.style.display = 'none';
      this._playing = false;
      if (this._onComplete) this._onComplete();
    }, 1600);
  }

  _skip() {
    this._playing = false;
    this._fadeOut();
  }

  get isPlaying() { return this._playing; }
}

/** Default story lines for the game. */
export const defaultStoryLines = [
  { text: 'Im Jahr 1893. Die Welt steht am Rande des Unbekannten.', color: '#aa9977', size: 15, pause: 3000 },
  { text: 'Eine Expedition bricht auf — dreißig Seelen, bewaffnet mit Mut und Magie.', color: '#aa9977', size: 15, pause: 3000 },
  { text: 'Ihr Ziel: Das Herz der Schattenwelt finden...', color: '#aa9977', size: 15, pause: 3000 },
  { text: 'Doch die Dunkelheit wartet.', color: '#cc8844', bold: true, size: 18, pause: 3500 },
  { text: 'Und sie hungrt.', color: '#dd5533', bold: true, size: 20, pause: 2500 },
];
