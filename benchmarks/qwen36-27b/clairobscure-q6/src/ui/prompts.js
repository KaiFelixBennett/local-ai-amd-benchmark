/**
 * Parry/dodge timing prompts — linear timing bar (no circles).
 * Canvas overlay for real-time reaction UI.
 */

export class ReactionPrompts {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._active = false;
    this._telegraphProgress = 0;
    this._hitCount = 0;
    this._currentHit = 0;
    this._attackType = 'normal';
    this._lastResult = null;
    this._resultTimer = 0;
    this._warningFlash = 0;
    this._hitMarkers = []; // positions of upcoming hits on the bar
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
  }

  startTelegraph(hitCount, attackType) {
    this._active = true;
    this._hitCount = hitCount;
    this._currentHit = 0;
    this._attackType = attackType;
    this._lastResult = null;
    this._warningFlash = 1;
    // Build hit marker positions (evenly spaced along the bar)
    this._hitMarkers = [];
    for (let i = 0; i < hitCount; i++) {
      this._hitMarkers.push((i + 1) / hitCount);
    }
  }

  onHit(result, hitIndex) {
    this._currentHit = hitIndex + 1;
    this._lastResult = result;
    this._resultTimer = 0.6;
  }

  end() {
    this._active = false;
    this._lastResult = null;
  }

  hide() {
    this._active = false;
    this._lastResult = null;
    this.canvas.style.display = 'none';
  }

  show() {
    this.canvas.style.display = 'block';
  }

  update(deltaTime) {
    if (this._warningFlash > 0) this._warningFlash -= deltaTime * 2;
    if (this._resultTimer > 0) this._resultTimer -= deltaTime;
  }

  setProgress(v) { this._telegraphProgress = v; }

  render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    if (!this._active) return;

    // Linear timing bar
    this._drawTimingBar(ctx, w, h);

    // Attack type indicator
    if (this._attackType === 'grab') {
      this._drawGrabWarning(ctx, w, h);
    } else if (this._attackType === 'feint') {
      this._drawFeintWarning(ctx, w, h);
    }

    // Last result flash
    if (this._resultTimer > 0) {
      this._drawResultFlash(ctx, w, h);
    }

    // Key prompts
    this._drawKeyPrompts(ctx, w, h);
  }

  _drawTimingBar(ctx, w, h) {
    const barW = Math.min(w * 0.6, 600);
    const barH = 8;
    const x = (w - barW) / 2;
    const y = h / 2 - 40;

    // Background track
    ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
    this._roundRect(ctx, x - 2, y - 2, barW + 4, barH + 4, 4);
    ctx.fill();

    // Track line
    ctx.fillStyle = 'rgba(60, 60, 80, 0.9)';
    this._roundRect(ctx, x, y, barW, barH, 2);
    ctx.fill();

    // Hit markers
    for (let i = 0; i < this._hitMarkers.length; i++) {
      const mx = x + barW * this._hitMarkers[i];
      const isPast = i < this._currentHit;
      const isCurrent = i === this._currentHit;

      // Marker diamond
      ctx.save();
      ctx.translate(mx, y + barH / 2);
      ctx.rotate(Math.PI / 4);
      const size = isCurrent ? 8 : 6;
      ctx.fillStyle = isPast
        ? 'rgba(100, 100, 120, 0.5)'
        : (isCurrent
          ? `rgba(255, 200, 50, ${0.7 + Math.sin(Date.now() / 100) * 0.3})`
          : 'rgba(200, 150, 50, 0.6)');
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }

    // Progress fill
    const progressX = x + barW * this._telegraphProgress;
    const grad = ctx.createLinearGradient(x, y, progressX, y);
    grad.addColorStop(0, 'rgba(255, 150, 50, 0.8)');
    grad.addColorStop(1, 'rgba(255, 220, 80, 0.9)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, y, barW * this._telegraphProgress, barH, 2);
    ctx.fill();

    // Moving cursor (current time position)
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(progressX, y - 6);
    ctx.lineTo(progressX + 6, y + barH / 2);
    ctx.lineTo(progressX, y + barH + 6);
    ctx.lineTo(progressX - 6, y + barH / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Danger zone indicators around current hit
    if (this._currentHit < this._hitMarkers.length) {
      const hitX = x + barW * this._hitMarkers[this._currentHit];
      const zoneW = barW * 0.08; // timing window width

      // Perfect zone (narrow, gold)
      ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
      ctx.fillRect(hitX - zoneW * 0.3, y - 4, zoneW * 0.6, barH + 8);

      // Good zone (wider, orange)
      ctx.fillStyle = 'rgba(255, 150, 50, 0.1)';
      ctx.fillRect(hitX - zoneW, y - 4, zoneW * 2, barH + 8);
    }
  }

  _drawGrabWarning(ctx, w, h) {
    const y = h / 2 - 80;
    ctx.fillStyle = `rgba(255, 50, 50, ${0.6 + this._warningFlash * 0.4})`;
    ctx.font = 'bold 18px serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 8;
    ctx.fillText('⚠ UNBLOCKABLE — DODGE ONLY ⚠', w / 2, y);
    ctx.shadowBlur = 0;
  }

  _drawFeintWarning(ctx, w, h) {
    const y = h / 2 - 80;
    ctx.fillStyle = `rgba(180, 120, 255, ${0.5 + this._warningFlash * 0.3})`;
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('Finte — Warte auf den echten Schlag!', w / 2, y);
  }

  _drawResultFlash(ctx, w, h) {
    const alpha = Math.min(this._resultTimer * 2, 1);
    const colors = {
      parry: `rgba(255, 215, 0, ${alpha})`,
      dodge: `rgba(100, 200, 255, ${alpha})`,
      miss: `rgba(255, 50, 50, ${alpha})`,
      blocked: `rgba(255, 100, 50, ${alpha})`,
    };

    ctx.fillStyle = colors[this._lastResult] || colors.miss;
    ctx.font = 'bold 40px serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    const labels = {
      parry: '★ PARRY ★',
      dodge: 'DODGE',
      miss: 'MISS',
      blocked: 'BLOCKED — Dodge!',
    };
    ctx.fillText(labels[this._lastResult] || '', w / 2, h / 2 + 40);
    ctx.shadowBlur = 0;
  }

  _drawKeyPrompts(ctx, w, h) {
    // Zentriert unter der Timing-Bar, genug Abstand zum HUD unten
    const y = h / 2 + 80;
    const x = w / 2;
    const gap = 140;

    // Parry prompt
    ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText('[SPACE] PARRY', x - gap, y);

    // Dodge prompt
    ctx.fillStyle = 'rgba(100, 200, 255, 0.85)';
    ctx.fillText('[SHIFT] DODGE', x + gap, y);
    ctx.shadowBlur = 0;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
