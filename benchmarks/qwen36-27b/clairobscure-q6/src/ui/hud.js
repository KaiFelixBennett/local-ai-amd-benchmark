/**
 * HUD: HP/AP bars, turn queue, character portraits, status icons, damage numbers overlay.
 * Renders on a 2D canvas overlay.
 */

export class HUD {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    // Defer resize to next frame so the browser has laid out the canvas at 100%/100%
    requestAnimationFrame(() => {
      this._resize();
      window.addEventListener('resize', () => this._resize());
    });

    this._party = [];
    this._enemies = [];
    this._turnQueue = [];
    this._currentActor = null;
    this._damageNumbers = [];
    this._statusMessages = [];
    this._ultimateMeter = 0;
    this._comboCount = 0;
    this._showBattleUI = true;  // Toggle for open world vs battle
    this._screenFlash = 0;
    this._flashColor = '#ffffff';
    this._grainTime = 0;
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
  }

  setParty(party) { this._party = party; }
  setEnemies(enemies) { this._enemies = enemies; }
  setTurnQueue(queue) { this._turnQueue = queue; }
  setCurrentActor(actor) { this._currentActor = actor; }
  setUltimateMeter(v) { this._ultimateMeter = v; }
  setComboCount(v) { this._comboCount = v; }

  hideBattleUI() { this._showBattleUI = false; }
  showBattleUI() { this._showBattleUI = true; }

  addDamageNumber(x, y, value, color, isCrit) {
    this._damageNumbers.push({
      x, y, value: String(value), color, isCrit: !!isCrit,
      isHeal: false,
      life: 1.2, vy: -70, vx: (Math.random() - 0.5) * 20,
    });
  }

  addStatusMessage(text) {
    this._statusMessages.push({ text, life: 2.0 });
  }

  screenFlash(color, duration) {
    this._flashColor = color;
    this._screenFlash = duration;
  }

  update(deltaTime) {
    // Update damage numbers
    for (let i = this._damageNumbers.length - 1; i >= 0; i--) {
      const dn = this._damageNumbers[i];
      dn.life -= deltaTime;
      dn.y += dn.vy * deltaTime;
      dn.x += (dn.vx || 0) * deltaTime;
      dn.vy *= 0.96;
      if (dn.life <= 0) this._damageNumbers.splice(i, 1);
    }

    // Update status messages
    for (let i = this._statusMessages.length - 1; i >= 0; i--) {
      this._statusMessages[i].life -= deltaTime;
      if (this._statusMessages[i].life <= 0) this._statusMessages.splice(i, 1);
    }

    // Screen flash decay
    if (this._screenFlash > 0) this._screenFlash -= deltaTime;
  }

  render() {
    const ctx = this.ctx;
    // Ensure canvas is sized — if not, resize now and bail this frame
    if (!this.w || !this.h || this.w === 0 || this.h === 0) {
      this._resize();
      if (!this.w || !this.h) return;
    }
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    // Vignette
    this._drawVignette(ctx, w, h);

    // Film grain (subtle)
    this._drawGrain(ctx, w, h);

    // Battle UI — hidden in open world mode
    if (this._showBattleUI) {
      // Party status bars (bottom-left)
      this._drawPartyBars(ctx, w, h);

      // Enemy status bars (top area)
      this._drawEnemyBars(ctx, w, h);

      // Turn queue (right side)
      this._drawTurnQueue(ctx, w, h);

      // Ultimate meter (bottom center)
      this._drawUltimateMeter(ctx, w, h);

      // Combo counter
      if (this._comboCount > 1) {
        this._drawCombo(ctx, w, h);
      }

      // Damage numbers
      this._drawDamageNumbers(ctx);
    }

    // Status messages
    this._drawStatusMessages(ctx, w, h);

    // Screen flash
    if (this._screenFlash > 0) {
      const alpha = Math.min(this._screenFlash * 3, 0.4);
      ctx.fillStyle = this._flashColor;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  _drawVignette(ctx, w, h) {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.7);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  _drawGrain(ctx, w, h) {
    // Very subtle grain — just a few random dots
    ctx.globalAlpha = 0.03;
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  _drawPartyBars(ctx, w, h) {
    const startX = 16;
    const startY = h - 115;
    const panelW = 180;
    const panelH = 95;
    const gap = 10;

    this._party.forEach((char, i) => {
      const x = startX + i * (panelW + gap);
      const y = startY;

      // Background panel — dark with gold border
      ctx.fillStyle = 'rgba(8, 8, 25, 0.9)';
      ctx.strokeStyle = 'rgba(200, 170, 100, 0.5)';
      ctx.lineWidth = 1.5;
      this._roundRect(ctx, x - 4, y - 4, panelW + 8, panelH + 8, 6);
      ctx.fill();
      ctx.stroke();

      // Portrait circle (top-left)
      const portraitX = x + 18;
      const portraitY = y + 16;
      const portraitR = 14;

      ctx.beginPath();
      ctx.arc(portraitX, portraitY, portraitR, 0, Math.PI * 2);
      ctx.fillStyle = this._getPartyPortraitColor(char);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 170, 100, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Initial in portrait
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.name.substring(0, 1).toUpperCase(), portraitX, portraitY + 1);
      ctx.textBaseline = 'alphabetic';

      // Name (right of portrait)
      ctx.fillStyle = '#e8d5a3';
      ctx.font = 'bold 12px serif';
      ctx.textAlign = 'left';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(char.name, x + 36, y + 14);
      ctx.shadowBlur = 0;

      // HP bar
      const hpBarX = x + 4;
      const hpBarY = y + 30;
      const hpBarW = panelW - 8;
      const hpBarH = 14;
      const hpRatio = Math.max(0, char.hp / char.maxHp);

      // HP label
      ctx.fillStyle = '#bbb';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('HP', hpBarX, hpBarY + 10);

      // HP bar background
      ctx.fillStyle = '#1a1a1a';
      this._roundRect(ctx, hpBarX + 22, hpBarY, hpBarW - 22, hpBarH, 3);
      ctx.fill();

      // HP fill with gradient
      const hpR = hpRatio > 0.5 ? 40 : (1 - hpRatio) * 2 * 200 + 40;
      const hpG = hpRatio > 0.5 ? 200 : hpRatio * 2 * 140;
      const hpGradient = ctx.createLinearGradient(hpBarX + 22, hpBarY, hpBarX + 22, hpBarY + hpBarH);
      hpGradient.addColorStop(0, `rgb(${Math.min(255, hpR + 40)}, ${Math.min(255, hpG + 40)}, 80)`);
      hpGradient.addColorStop(1, `rgb(${hpR}, ${hpG}, 50)`);
      ctx.fillStyle = hpGradient;
      if (hpRatio > 0) {
        const fillW = Math.max(hpBarH, (hpBarW - 22) * hpRatio);
        this._roundRect(ctx, hpBarX + 22, hpBarY, fillW, hpBarH, 3);
        ctx.fill();
      }

      // HP text
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 2;
      ctx.fillText(`${char.hp}/${char.maxHp}`, hpBarX + hpBarW / 2, hpBarY + 10);
      ctx.shadowBlur = 0;

      // AP bar
      const apY = y + 48;
      const apHeight = 12;
      const apRatio = Math.max(0, char.ap / (char.maxAp || 1));

      // AP label
      ctx.fillStyle = '#88aadd';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('AP', hpBarX, apY + 9);

      // AP bar background
      ctx.fillStyle = '#0e0e28';
      this._roundRect(ctx, hpBarX + 22, apY + 1, hpBarW - 22, apHeight, 3);
      ctx.fill();

      // AP fill with gradient
      const apGradient = ctx.createLinearGradient(hpBarX + 22, apY + 1, hpBarX + 22, apY + 1 + apHeight);
      apGradient.addColorStop(0, '#99ccff');
      apGradient.addColorStop(1, '#5588dd');
      ctx.fillStyle = apGradient;
      if (apRatio > 0) {
        const fillW = Math.max(apHeight, (hpBarW - 22) * apRatio);
        this._roundRect(ctx, hpBarX + 22, apY + 1, fillW, apHeight, 3);
        ctx.fill();
      }

      // AP text
      ctx.fillStyle = '#ccddff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 2;
      ctx.fillText(`${char.ap}/${char.maxAp}`, hpBarX + hpBarW / 2, apY + 9);
      ctx.shadowBlur = 0;

      // Stagger bar
      if (char.stagger > 0) {
        const stY = y + 64;
        ctx.fillStyle = '#1a1a1a';
        this._roundRect(ctx, hpBarX, stY, hpBarW, 4, 1);
        ctx.fill();
        ctx.fillStyle = '#ffaa44';
        this._roundRect(ctx, hpBarX, stY, hpBarW * (char.stagger / 100), 4, 1);
        ctx.fill();
      }

      // Status effect icons (bottom row)
      if (char.statusEffects && char.statusEffects.length > 0) {
        const statusY = y + 72;
        char.statusEffects.forEach((se, si) => {
          const sx = hpBarX + 4 + si * 18;
          ctx.fillStyle = this._statusColor(se.type);
          ctx.beginPath();
          ctx.arc(sx + 5, statusY + 5, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 7px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(se.type.substring(0, 2).toUpperCase(), sx + 5, statusY + 8);
        });
      }

      // Active indicator — golden glow border
      if (this._currentActor === char) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 10;
        this._roundRect(ctx, x - 6, y - 6, panelW + 12, panelH + 12, 8);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });
  }

  _getPartyPortraitColor(char) {
    const colors = {
      valerius: '#4a6fa5',
      elara: '#c8a84e',
      lucien: '#6a3d7d',
    };
    return colors[char.id] || '#555';
  }

  _drawEnemyBars(ctx, w, h) {
    const aliveEnemies = this._enemies.filter(e => !e.isDead);
    const panelW = 200;
    const panelH = 50;
    const gap = 10;
    const totalW = aliveEnemies.length * panelW + (aliveEnemies.length - 1) * gap;
    let startX = (w - totalW) / 2;
    const y = 8;

    aliveEnemies.forEach((enemy, idx) => {
      const x = startX + idx * (panelW + gap);

      // Panel — dark with strong gold/red border
      ctx.fillStyle = 'rgba(20, 5, 5, 0.9)';
      ctx.strokeStyle = 'rgba(220, 80, 80, 0.6)';
      ctx.lineWidth = 1.5;
      this._roundRect(ctx, x - 4, y - 2, panelW + 8, panelH + 4, 6);
      ctx.fill();
      ctx.stroke();

      // Portrait circle (left side)
      const portraitX = x + 20;
      const portraitY = y + panelH / 2 + 2;
      const portraitR = 16;

      ctx.beginPath();
      ctx.arc(portraitX, portraitY, portraitR, 0, Math.PI * 2);
      ctx.fillStyle = this._getEnemyPortraitColor(enemy);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 80, 80, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Initial in portrait
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(enemy.name.substring(0, 1).toUpperCase(), portraitX, portraitY + 1);
      ctx.textBaseline = 'alphabetic';

      // Name (right of portrait)
      const nameX = x + 42;
      ctx.fillStyle = '#ffcccc';
      ctx.font = 'bold 13px serif';
      ctx.textAlign = 'left';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(enemy.name, nameX, y + 14);
      ctx.shadowBlur = 0;

      // HP bar
      const hpBarX = x + 4;
      const hpBarY = y + 28;
      const hpBarW = panelW - 8;
      const hpBarH = 12;
      const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);

      // HP bar background
      ctx.fillStyle = '#1a1010';
      this._roundRect(ctx, hpBarX, hpBarY, hpBarW, hpBarH, 3);
      ctx.fill();

      // HP fill with gradient
      const barColor = hpRatio > 0.3 ? '#dd4444' : '#ff2222';
      const hpGrad = ctx.createLinearGradient(hpBarX, hpBarY, hpBarX, hpBarY + hpBarH);
      hpGrad.addColorStop(0, '#ff7777');
      hpGrad.addColorStop(1, barColor);
      ctx.fillStyle = hpGrad;
      if (hpRatio > 0) {
        this._roundRect(ctx, hpBarX, hpBarY, hpBarW * hpRatio, hpBarH, 3);
        ctx.fill();
      }

      // HP text overlay
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 2;
      ctx.fillText(`${enemy.hp}/${enemy.maxHp}`, hpBarX + hpBarW / 2, hpBarY + 9);
      ctx.shadowBlur = 0;

      // Stagger bar
      if (enemy.stagger > 0) {
        const stY = y + 42;
        ctx.fillStyle = '#1a1010';
        this._roundRect(ctx, hpBarX, stY, hpBarW, 4, 1);
        ctx.fill();
        ctx.fillStyle = '#ffaa44';
        this._roundRect(ctx, hpBarX, stY, hpBarW * (enemy.stagger / 100), 4, 1);
        ctx.fill();
      }
    });
  }

  _getEnemyPortraitColor(enemy) {
    const colors = {
      iron_golem: '#5a5a6a',
      shadow_weaver: '#3a1a4a',
    };
    return colors[enemy.id] || '#444';
  }

  _drawTurnQueue(ctx, w, h) {
    // Position: rechts aber mit gutem Margin — nicht am Rand kleben
    const margin = 56;
    const x = w - margin;
    let y = 60;
    const iconSize = 28;
    const gap = 6;
    const panelW = 48;
    const panelH = this._turnQueue.length * (iconSize + gap) + 20;

    // Panel background
    ctx.fillStyle = 'rgba(10, 10, 30, 0.7)';
    ctx.strokeStyle = 'rgba(200, 170, 100, 0.35)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x - panelW / 2, y - 18, panelW, panelH, 6);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.fillStyle = '#c8a84e';
    ctx.font = 'bold 9px serif';
    ctx.textAlign = 'center';
    ctx.fillText('TURN', x, y - 3);

    this._turnQueue.forEach((entity, i) => {
      const isCurrent = entity === this._currentActor;
      const isParty = this._party.includes(entity);
      const cy = y + i * (iconSize + gap) + iconSize / 2;

      // Portrait circle
      const color = isCurrent
        ? '#ffd700'
        : (isParty ? '#6688bb' : '#aa5555');
      const dimColor = isCurrent
        ? '#ffd700'
        : (isParty ? '#4466aa' : '#884444');

      // Glow for current actor
      if (isCurrent) {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 12;
      }

      // Outer ring
      ctx.beginPath();
      ctx.arc(x, cy, iconSize / 2 + 2, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? 'rgba(255,215,0,0.15)' : 'rgba(30,30,50,0.5)';
      ctx.fill();

      // Inner circle with character color
      ctx.beginPath();
      ctx.arc(x, cy, iconSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = dimColor;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = isCurrent ? 2.5 : 1.5;
      ctx.stroke();

      // Initial
      ctx.shadowBlur = 0;
      ctx.fillStyle = isCurrent ? '#fff' : '#ddd';
      ctx.font = `bold ${iconSize - 6}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entity.name.substring(0, 1).toUpperCase(), x, cy + 1);
      ctx.textBaseline = 'alphabetic';

      // Name label below
      ctx.fillStyle = isCurrent ? '#ffd700' : 'rgba(200,180,150,0.6)';
      ctx.font = `${isCurrent ? 'bold ' : ''}8px sans-serif`;
      ctx.fillText(entity.name.substring(0, 7), x, cy + iconSize / 2 + 10);
    });
  }

  _drawUltimateMeter(ctx, w, h) {
    const barW = 220;
    const barH = 12;
    const x = w / 2 - barW / 2;
    const y = h - 135;

    // Panel background
    ctx.fillStyle = 'rgba(10, 10, 30, 0.75)';
    ctx.strokeStyle = 'rgba(155, 89, 182, 0.4)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x - 4, y - 16, barW + 8, barH + 22, 5);
    ctx.fill();
    ctx.stroke();

    const ratio = this._ultimateMeter / 100;

    // Bar background
    ctx.fillStyle = '#1a1020';
    this._roundRect(ctx, x, y, barW, barH, 3);
    ctx.fill();

    // Bar fill with rich gradient
    const gradient = ctx.createLinearGradient(x, y, x + barW, y);
    gradient.addColorStop(0, '#4a2060');
    gradient.addColorStop(0.3, '#7b3fa0');
    gradient.addColorStop(0.7, '#9b59b6');
    gradient.addColorStop(1, '#ffd700');
    ctx.fillStyle = gradient;
    if (ratio > 0) {
      this._roundRect(ctx, x, y, barW * ratio, barH, 3);
      ctx.fill();
    }

    // Glow effect when ready
    if (ratio >= 1) {
      const pulse = 0.5 + Math.sin(performance.now() * 0.005) * 0.3;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 15 * pulse;
      ctx.strokeStyle = `rgba(255, 215, 0, ${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      this._roundRect(ctx, x - 2, y - 2, barW + 4, barH + 4, 4);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Label
    ctx.fillStyle = ratio >= 1 ? '#ffd700' : '#9988aa';
    ctx.font = ratio >= 1 ? 'bold 11px serif' : '9px serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(ratio >= 1 ? '★ ULTIMATE READY [U] ★' : 'ULTIMATE', w / 2, y - 5);
    ctx.shadowBlur = 0;
  }

  _drawCombo(ctx, w, h) {
    const x = w / 2;
    const y = h / 2 - 80;
    const scale = 1 + Math.min(this._comboCount, 10) * 0.05;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 10;
    ctx.fillText(`${this._comboCount}x PARRY`, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawDamageNumbers(ctx) {
    for (const dn of this._damageNumbers) {
      const alpha = Math.min(dn.life * 2, 1);
      const scale = dn.isHeal ? 1 : (dn.isCrit ? 1.4 : 1);
      const fontSize = dn.isCrit ? Math.round(26 * scale) : Math.round(18 * scale);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(dn.x, dn.y);

      // Scale animation — numbers grow slightly as they rise
      const riseScale = 1 + (1 - dn.life) * 0.15;
      ctx.scale(riseScale, riseScale);

      // Dark outline for readability
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.font = `bold ${fontSize}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dn.value, 1, 1);

      // Main text with glow
      ctx.fillStyle = dn.color;
      ctx.shadowColor = dn.isCrit ? '#ff8800' : '#000';
      ctx.shadowBlur = dn.isCrit ? 8 : 4;
      ctx.fillText(dn.value, 0, 0);
      ctx.shadowBlur = 0;

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _drawStatusMessages(ctx, w, h) {
    const y = h / 2 + 40;
    for (let i = 0; i < this._statusMessages.length; i++) {
      const msg = this._statusMessages[i];
      ctx.globalAlpha = Math.min(msg.life, 1);
      ctx.fillStyle = '#e8d5a3';
      ctx.font = '14px serif';
      ctx.textAlign = 'center';
      ctx.fillText(msg.text, w / 2, y + i * 22);
    }
    ctx.globalAlpha = 1;
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

  _statusColor(type) {
    const colors = {
      burn: '#ff6600', poison: '#44aa44', stun: '#ffdd00',
      mark: '#9b59b6', weak: '#888888', vuln: '#ff4444',
    };
    return colors[type] || '#888';
  }
}
