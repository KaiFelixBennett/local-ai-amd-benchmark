import * as THREE from 'three';

// HUD rendering system - HP/AP bars, turn queue, portraits

export class HUD {
  constructor() {
    this.canvas = document.getElementById('overlay');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    this.partyPortraits = [];
    this.enemyBars = [];
    this.turnQueueDisplay = [];
    this.combatants = [];
    
    // Colors
    this.colors = {
      hpGreen: '#4caf50',
      hpRed: '#f44336',
      apGold: '#ffd700',
      apBlue: '#2196f3',
      bgDark: 'rgba(20, 15, 30, 0.85)',
      borderGold: '#c9a',
      textWhite: '#f8f4e8',
      textDim: '#aaa'
    };

    if (this.canvas) {
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  update(combatants) {
    this.combatants = combatants;
  }

  render(deltaTime, battleState) {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (!this.combatants || !this.combatants.party || this.combatants.party.length === 0) {
      return;
    }

    // Render party portraits (bottom left)
    this.renderPartyPortraits(ctx, width, height);

    // Render enemy HP bars (top right)
    this.renderEnemyBars(ctx, width, height);

    // Render turn queue (top center)
    this.renderTurnQueue(ctx, width, height);

    // Render battle state indicators
    if (battleState === 'REACTION' || battleState === 'TELEGRAPH') {
      this.renderReactionPrompt(ctx, width, height);
    }
  }

  renderPartyPortraits(ctx, width, height) {
    const party = this.combatants.party || [];
    if (!Array.isArray(party)) return;
    
    const portraitWidth = 100;
    const portraitHeight = 80;
    const spacing = 10;
    const startX = 20;
    const startY = height - portraitHeight - 20;

    for (let index = 0; index < party.length; index++) {
      const character = party[index];
      const x = startX + index * (portraitWidth + spacing);
      
      // Background
      ctx.fillStyle = this.colors.bgDark;
      roundRect(ctx, x, startY, portraitWidth, portraitHeight, 8);
      ctx.fill();

      // Border
      ctx.strokeStyle = character.isDead ? '#555' : 
                        character.hp < character.stats.maxHP * 0.3 ? this.colors.hpRed :
                        this.colors.borderGold;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Character name
      ctx.fillStyle = this.colors.textWhite;
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillText(character.name, x + 10, startY + 18);

      // HP bar
      const hpBarWidth = portraitWidth - 20;
      const hpPercent = character.getHPPercent();
      
      // Background
      ctx.fillStyle = '#333';
      ctx.fillRect(x + 10, startY + 25, hpBarWidth, 8);
      
      // Fill
      ctx.fillStyle = hpPercent > 0.5 ? this.colors.hpGreen : 
                      hpPercent > 0.25 ? '#ff9800' : this.colors.hpRed;
      ctx.fillRect(x + 10, startY + 25, hpBarWidth * hpPercent, 8);

      // HP text
      ctx.fillStyle = this.colors.textWhite;
      ctx.font = '10px sans-serif';
      ctx.fillText(`${character.hp}/${character.stats.maxHP}`, x + 10, startY + 42);

      // AP bar
      const apBarWidth = portraitWidth - 20;
      const apPercent = character.getAPPercent();
      
      ctx.fillStyle = '#333';
      ctx.fillRect(x + 10, startY + 48, apBarWidth, 6);
      
      ctx.fillStyle = this.colors.apGold;
      ctx.fillRect(x + 10, startY + 48, apBarWidth * apPercent, 6);

      // AP text
      ctx.fillStyle = this.colors.textWhite;
      ctx.fillText(`${Math.floor(character.ap)}/${character.stats.maxAP} AP`, x + 10, startY + 62);

      // Status icons
      if (character.statusEffects && character.statusEffects.length > 0) {
        let iconOffset = 0;
        character.statusEffects.forEach(status => {
          const iconX = x + portraitWidth - 25 - iconOffset;
          const iconY = startY + 10;
          
          ctx.fillStyle = getStatusColor(status.type);
          ctx.beginPath();
          ctx.arc(iconX, iconY, 8, 0, Math.PI * 2);
          ctx.fill();

          iconOffset += 20;
        });
      }

      // Active turn indicator
      if (character.isActive) {
        ctx.strokeStyle = this.colors.apGold;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Glow effect
        ctx.shadowColor = this.colors.apGold;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Dead indicator
      if (character.isDead) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, startY, portraitWidth, portraitHeight);
        
        ctx.fillStyle = '#666';
        ctx.font = 'bold 14px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('DEFATED', x + portraitWidth / 2, startY + portraitHeight / 2);
        ctx.textAlign = 'left';
      }
    }
  }

  renderEnemyBars(ctx, width, height) {
    const enemies = this.combatants.enemies || [];
    if (!Array.isArray(enemies)) return;
    
    const barWidth = 250;
    const barHeight = 25;
    const spacing = 8;
    const startX = width - barWidth - 30;
    const startY = 100;

    for (let index = 0; index < enemies.length; index++) {
      const enemy = enemies[index];
      const y = startY + index * (barHeight + spacing);
      
      // Skip dead enemies
      if (enemy.isDead) return;

      // Background
      ctx.fillStyle = this.colors.bgDark;
      roundRect(ctx, startX, y, barWidth, barHeight, 6);
      ctx.fill();

      // Enemy name
      ctx.fillStyle = this.colors.textWhite;
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillText(enemy.name, startX + 8, y + 16);

      // HP bar background
      const hpBarHeight = 6;
      ctx.fillStyle = '#333';
      ctx.fillRect(startX + 8, y + 18, barWidth - 16, hpBarHeight);

      // HP bar fill
      const hpPercent = enemy.getHPPercent();
      const gradient = ctx.createLinearGradient(
        startX + 8, y + 18,
        startX + 8 + (barWidth - 16) * hpPercent, y + 18
      );
      gradient.addColorStop(0, '#4caf50');
      gradient.addColorStop(0.5, '#ff9800');
      gradient.addColorStop(1, '#f44336');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(
        startX + 8, y + 18, 
        (barWidth - 16) * hpPercent, 
        hpBarHeight
      );

      // HP text
      ctx.fillStyle = this.colors.textWhite;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${enemy.hp}/${enemy.stats.maxHP}`, startX + barWidth - 8, y + 23);
      ctx.textAlign = 'left';

      // Stagger meter (if staggerable)
      if (enemy.getStaggerPercent && enemy.getStaggerPercent() > 0) {
        const staggerY = y + barHeight + spacing / 2;
        
        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(startX + 8, staggerY, barWidth - 16, 4);

        // Fill (purple for stagger)
        ctx.fillStyle = '#9c27b0';
        ctx.fillRect(startX + 8, staggerY, (barWidth - 16) * enemy.getStaggerPercent() / 100, 4);

        // Staggered indicator
        if (enemy.isStaggered) {
          ctx.fillStyle = '#ffeb3b';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('STAGGERED', startX + 8, staggerY - 2);
        }
      }

      // Active enemy indicator
      if (enemy.isActive) {
        ctx.strokeStyle = '#ff5722';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Reset text alignment
    ctx.textAlign = 'left';
  }

  renderTurnQueue(ctx, width, height) {
    const turnQueue = this.combatants.turnQueue || [];
    
    if (!Array.isArray(turnQueue) || turnQueue.length === 0) return;

    const itemHeight = 24;
    const maxWidth = 200;
    const startX = width / 2 - maxWidth / 2;
    const startY = 20;

    // Background
    ctx.fillStyle = this.colors.bgDark;
    roundRect(ctx, startX - 10, startY - 5, maxWidth + 20, turnQueue.length * itemHeight + 10, 8);
    ctx.fill();

    // Title
    ctx.fillStyle = this.colors.textWhite;
    ctx.font = 'bold 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('TURN ORDER', width / 2, startY + 16);

    // Turn items
    for (let index = 0; index < turnQueue.length; index++) {
      const entry = turnQueue[index];
      const y = startY + 30 + index * itemHeight;
      
      // Icon background
      ctx.fillStyle = entry.isPlayer ? '#2196f3' : '#f44336';
      ctx.beginPath();
      ctx.arc(startX + 15, y + 12, 8, 0, Math.PI * 2);
      ctx.fill();

      // Name
      ctx.fillStyle = this.colors.textWhite;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(entry.entity.name, startX + 30, y + 16);

      // Time indicator (opacity based on time until turn)
      const timeUntilTurn = entry.timeUntilTurn || 0;
      const opacity = Math.max(0.3, 1 - timeUntilTurn / 200);
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fillText(`${Math.ceil(timeUntilTurn)}s`, startX + maxWidth - 40, y + 16);
    });

    ctx.textAlign = 'left';
  }

  renderReactionPrompt(ctx, width, height) {
    const telegraphInfo = window.__reactionSystem?.getActiveTelegraphInfo?.();
    
    if (!telegraphInfo) return;

    const promptHeight = 120;
    const promptWidth = 400;
    const centerX = width / 2;
    const centerY = height / 2;

    // Background with gradient
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, promptWidth / 2);
    gradient.addColorStop(0, 'rgba(40, 30, 50, 0.95)');
    gradient.addColorStop(1, 'rgba(20, 15, 30, 0.9)');
    
    ctx.fillStyle = gradient;
    roundRect(ctx, centerX - promptWidth / 2, centerY - promptHeight / 2, promptWidth, promptHeight, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = this.colors.borderGold;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Attack name
    ctx.fillStyle = '#ff5722';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(telegraphInfo.attackName, centerX, centerY - 40);

    // Timing bar
    const barWidth = promptWidth - 60;
    const barHeight = 20;
    const barX = centerX - barWidth / 2;
    const barY = centerY - 5;

    // Background
    ctx.fillStyle = '#333';
    roundRect(ctx, barX, barY, barWidth, barHeight, 4);
    ctx.fill();

    // Perfect zone
    const perfectWidth = telegraphInfo.parryWindow * barWidth / telegraphInfo.telegraphDuration;
    const perfectX = barX + barWidth / 2 - perfectWidth / 2;
    ctx.fillStyle = '#ffeb3b';
    roundRect(ctx, perfectX, barY, perfectWidth, barHeight, 4);
    ctx.fill();

    // Dodge zone (wider)
    const dodgeWidth = telegraphInfo.dodgeWindow * barWidth / telegraphInfo.telegraphDuration;
    const dodgeX = barX + barWidth / 2 - dodgeWidth / 2;
    ctx.fillStyle = 'rgba(33, 150, 243, 0.5)';
    roundRect(ctx, dodgeX, barY, dodgeWidth, barHeight, 4);
    ctx.fill();

    // Current position indicator
    const timePercent = telegraphInfo.timeUntilHit / telegraphInfo.telegraphDuration;
    const indicatorX = barX + barWidth * (1 - Math.max(0, Math.min(1, timePercent)));
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(indicatorX, barY);
    ctx.lineTo(indicatorX - 4, barY + barHeight);
    ctx.lineTo(indicatorX + 4, barY + barHeight);
    ctx.closePath();
    ctx.fill();

    // Instructions
    ctx.fillStyle = this.colors.textWhite;
    ctx.font = '12px sans-serif';
    ctx.fillText('Press SPACE to PARRY', centerX, centerY + 35);
    
    ctx.fillStyle = '#81d4fa';
    ctx.fillText('Press SHIFT to DODGE', centerX, centerY + 52);

    // Combo counter
    if (telegraphInfo.hitsRemaining > 1) {
      ctx.fillStyle = '#ff9800';
      ctx.font = 'bold 14px Georgia, serif';
      ctx.fillText(`Combo: ${telegraphInfo.hitsRemaining}/${telegraphInfo.totalHits}`, centerX, centerY + 80);
    }

    // Flow meter (parry streak bonus)
    const stats = window.__reactionSystem?.getStats?.();
    if (stats && stats.parryStreak > 0) {
      ctx.fillStyle = this.colors.apGold;
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillText(`Flow: ${stats.parryStreak} streak (+${Math.floor(stats.parryStreak * 0.5)} AP)`, centerX, centerY + 100);
    }

    ctx.textAlign = 'left';
  }

  showVictoryMessage() {
    this.showCenterMessage('VICTORY', '#ffd700', 2000);
  }

  showDefeatMessage() {
    this.showCenterMessage('DEFEAT', '#f44336', 2000);
  }

  showCenterMessage(text, color, duration) {
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // Simple flash message (will be rendered on next frame)
    setTimeout(() => {
      ctx.fillStyle = color;
      ctx.font = 'bold 48px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, centerX, centerY);
      ctx.textAlign = 'left';
    }, 100);
  }
}

// Helper: rounded rectangle
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Helper: get status color
function getStatusColor(type) {
  const colors = {
    burn: '#ff5722',
    poison: '#4caf50',
    stun: '#ffeb3b',
    regen: '#8bc34a',
    slow: '#2196f3',
    marked: '#e91e63',
    taunt: '#795548'
  };
  return colors[type] || '#9c27b0';
}

export const hud = new HUD();
