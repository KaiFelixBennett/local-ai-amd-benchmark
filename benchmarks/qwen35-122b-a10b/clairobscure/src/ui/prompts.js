// Parry/dodge timing prompts and combat feedback UI

export class Prompts {
  constructor() {
    this.canvas = document.getElementById('overlay');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    this.activePrompts = [];
    this.damageNumbers = [];
    this.comboCounter = 0;
    this.lastParryTime = 0;

    // Colors
    this.colors = {
      parryPerfect: '#ffeb3b',
      parryGood: '#4caf50',
      dodge: '#2196f3',
      hit: '#f44336',
      crit: '#ff5722',
      heal: '#8bc34a',
      weakPoint: '#e91e63',
      textWhite: '#f8f4e8'
    };

    if (this.canvas) {
      this.setupInput();
    }
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.attemptParry();
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.attemptDodge();
      }
    });
  }

  attemptParry() {
    const reactionSystem = window.__reactionSystem;
    if (!reactionSystem) return;

    const result = reactionSystem.attemptParry();
    
    if (result) {
      if (result.success && result.perfect) {
        this.showParryPrompt('PERFECT!', true);
        this.triggerSlowMo(0.3, 400);
        window.__playParrySound?.();
      } else if (result.success && result.blocked) {
        this.showParryPrompt('PARRY', false);
        window.__playParrySound?.();
      } else if (result.reason === 'unblockable') {
        this.showPrompt('DODGE THIS!', 'warning');
      }
    }
  }

  attemptDodge() {
    const reactionSystem = window.__reactionSystem;
    if (!reactionSystem) return;

    const result = reactionSystem.attemptDodge();
    
    if (result && result.success) {
      this.showParryPrompt('DODGE', false);
      window.__playDodgeSound?.();
    }
  }

  showParryPrompt(text, isPerfect) {
    const prompt = {
      text,
      type: isPerfect ? 'perfect' : 'good',
      x: window.innerWidth / 2,
      y: window.innerHeight / 2 - 50,
      scale: 0.5,
      alpha: 1,
      lifetime: 1.0,
      maxLifetime: 1.0
    };

    this.activePrompts.push(prompt);
  }

  showPrompt(text, type = 'info') {
    const colors = {
      info: '#2196f3',
      warning: '#ff9800',
      error: '#f44336'
    };

    const prompt = {
      text,
      type,
      color: colors[type] || colors.info,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      scale: 1.0,
      alpha: 1,
      lifetime: 1.5,
      maxLifetime: 1.5
    };

    this.activePrompts.push(prompt);
  }

  showDamageNumber(entity, damage, isCrit = false, isWeakness = false) {
    const rect = this.getEntityScreenPosition(entity);
    
    const number = {
      value: damage,
      x: rect.x + (Math.random() - 0.5) * 40,
      y: rect.y,
      vx: (Math.random() - 0.5) * 2,
      vy: -2,
      alpha: 1,
      scale: isCrit ? 1.5 : 1.0,
      lifetime: 1.2,
      maxLifetime: 1.2,
      isCrit,
      isWeakness
    };

    this.damageNumbers.push(number);
  }

  showHealNumber(entity, amount) {
    const rect = this.getEntityScreenPosition(entity);
    
    const number = {
      value: amount,
      x: rect.x,
      y: rect.y - 30,
      vx: 0,
      vy: -1.5,
      alpha: 1,
      scale: 1.0,
      lifetime: 1.2,
      maxLifetime: 1.2,
      isHeal: true
    };

    this.damageNumbers.push(number);
  }

  showWeakPointHit(entity) {
    const rect = this.getEntityScreenPosition(entity);
    
    const prompt = {
      text: 'WEAK POINT!',
      type: 'weakpoint',
      x: rect.x,
      y: rect.y - 50,
      scale: 1.2,
      alpha: 1,
      lifetime: 0.8,
      maxLifetime: 0.8
    };

    this.activePrompts.push(prompt);
  }

  incrementCombo() {
    this.comboCounter++;
    
    if (this.comboCounter > 1) {
      this.showPrompt(`${this.comboCounter} HIT COMBO!`, 'info');
    }
  }

  resetCombo() {
    this.comboCounter = 0;
  }

  triggerSlowMo(factor, duration) {
    window.__slowMoFactor = factor;
    window.__slowMoDuration = duration / 1000;
    
    // Desaturate effect
    const canvas = document.getElementById('overlay');
    canvas.style.filter = 'grayscale(80%)';
    
    setTimeout(() => {
      canvas.style.filter = '';
    }, duration);
  }

  getEntityScreenPosition(entity) {
    // Project 3D position to screen space
    if (!entity.mesh) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    const scene = window.__game?.renderer?.scene;
    const camera = window.__game?.renderer?.camera;
    
    if (!scene || !camera) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    const vector = entity.mesh.position.clone();
    vector.project(camera);

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

    return { x, y };
  }

  update(deltaTime) {
    // Update prompts
    this.activePrompts = this.activePrompts.filter(prompt => {
      prompt.lifetime -= deltaTime;
      prompt.alpha = prompt.lifetime / prompt.maxLifetime;
      
      if (prompt.type === 'perfect') {
        prompt.scale = 0.5 + (1 - prompt.alpha) * 1.0; // Scale down
      }
      
      return prompt.lifetime > 0;
    });

    // Update damage numbers
    this.damageNumbers = this.damageNumbers.filter(number => {
      number.lifetime -= deltaTime;
      number.y += number.vy * deltaTime * 60;
      number.alpha = number.lifetime / number.maxLifetime;
      
      return number.lifetime > 0;
    });

    // Slow-mo decay
    if (window.__slowMoDuration) {
      window.__slowMoDuration -= deltaTime;
      if (window.__slowMoDuration <= 0) {
        window.__slowMoFactor = 1.0;
      }
    }
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    
    // Render prompts
    if (!this.activePrompts || !Array.isArray(this.activePrompts)) return;
    
    for (let index = 0; index < this.activePrompts.length; index++) {
      const prompt = this.activePrompts[index];
      ctx.save();
      ctx.translate(prompt.x, prompt.y);
      ctx.scale(prompt.scale, prompt.scale);
      ctx.globalAlpha = prompt.alpha;

      if (prompt.type === 'perfect') {
        ctx.fillStyle = this.colors.weakPoint;
        ctx.font = 'bold 28px Georgia, serif';
        ctx.textAlign = 'center';
        
        ctx.shadowColor = this.colors.weakPoint;
        ctx.shadowBlur = 15;
        ctx.fillText(prompt.text, 0, 0);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = prompt.color || this.colors.textWhite;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(prompt.text, 0, 0);
      }

      ctx.restore();
    });

    // Render damage numbers
    this.damageNumbers.forEach(number => {
      ctx.save();
      ctx.globalAlpha = number.alpha;
      ctx.scale(number.scale, number.scale);

      if (number.isHeal) {
        ctx.fillStyle = this.colors.heal;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(`+${Math.round(number.value)}`, number.x, number.y);
      } else if (number.isCrit) {
        ctx.fillStyle = this.colors.crit;
        ctx.font = 'bold 32px Georgia, serif';
        
        ctx.shadowColor = this.colors.crit;
        ctx.shadowBlur = 10;
        ctx.fillText(`${Math.round(number.value)}!`, number.x, number.y);
        ctx.shadowBlur = 0;
      } else if (number.isWeakness) {
        ctx.fillStyle = this.colors.weakPoint;
        ctx.font = 'bold 28px Georgia, serif';
        ctx.fillText(`${Math.round(number.value)}`, number.x, number.y);
      } else {
        ctx.fillStyle = this.colors.hit;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(Math.round(number.value), number.x, number.y);
      }

      ctx.restore();
    });
  }
}

// Audio helpers (will be initialized by audio.js)
function playParrySound() {
  if (window.__audioInitialized) {
    // Called from audio.js
  }
}

function playDodgeSound() {
  if (window.__audioInitialized) {
    // Called from audio.js
  }
}

export const prompts = new Prompts();
