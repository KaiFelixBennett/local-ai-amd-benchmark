/**
 * HP/AP bars, turn queue, character portraits, status icons.
 * All drawn on a 2D canvas overlay.
 */

import { createHPBarTexture, createAPBarTexture, createStaggerBarTexture,
         createPortraitFrame, createStatusIcon, createElementIcon } from '../engine/textures.js';

export class HUD {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.party = [];
        this.enemies = [];
        this.turnQueue = [];
        this.activeCharacter = null;
        this.activeEnemy = null;
        this.battleState = 'idle';
        this.damageNumbers = [];
        this.flashAlpha = 0;
        this.flashColor = '#ffffff';
        this.slowMoTimer = 0;
        this.grainOffset = 0;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
    }

    /** Trigger a screen flash */
    flash(color = '#ffffff', alpha = 0.3, duration = 0.15) {
        this.flashColor = color;
        this.flashAlpha = alpha;
        this.flashDuration = duration;
        this.flashTimer = 0;
    }

    /** Trigger slow motion effect */
    slowMo(duration = 0.3) {
        this.slowMoTimer = duration;
    }

    /** Add a floating damage number */
    addDamageNumber(x, y, value, type = 'damage', isCrit = false) {
        this.damageNumbers.push({
            x, y, value, type, isCrit,
            life: 1.5,
            vy: -60, // pixels per second upward
            alpha: 1
        });
    }

    update(dt) {
        // Update flash
        if (this.flashAlpha > 0) {
            this.flashTimer += dt;
            this.flashAlpha *= 0.9;
            if (this.flashTimer > this.flashDuration) {
                this.flashAlpha = 0;
            }
        }

        // Update slow-mo
        if (this.slowMoTimer > 0) {
            this.slowMoTimer -= dt;
        }

        // Update damage numbers
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dn = this.damageNumbers[i];
            dn.y += dn.vy * dt;
            dn.life -= dt;
            dn.alpha = Math.max(0, dn.life / 1.5);
            if (dn.life <= 0) {
                this.damageNumbers.splice(i, 1);
            }
        }

        // Update grain
        this.grainOffset += dt * 100;
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);

        // Draw all HUD elements
        this.drawPortraits();
        this.drawTurnQueue();
        this.drawDamageNumbers();

        // Post-processing overlays
        this.drawVignette();
        this.drawFilmGrain();
        this.drawFlash();
    }

    drawPortraits() {
        const ctx = this.ctx;
        const portraitSize = 52;
        const barWidth = 140;
        const barHeight = 10;
        const staggerHeight = 4;
        const startY = 20;
        const spacing = portraitSize + 12;

        // Party portraits on left
        for (let i = 0; i < this.party.length; i++) {
            const ch = this.party[i];
            const x = 16 + i * spacing;
            const y = startY;

            // Portrait frame
            ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
            ctx.strokeStyle = ch === this.activeCharacter ? '#c4a35a' : '#444455';
            ctx.lineWidth = ch === this.activeCharacter ? 2 : 1;
            ctx.beginPath();
            ctx.roundRect(x, y, portraitSize, portraitSize, 4);
            ctx.fill();
            ctx.stroke();

            // Character color indicator
            ctx.fillStyle = ch.color || '#666688';
            ctx.beginPath();
            ctx.arc(x + portraitSize / 2, y + portraitSize / 2 - 4, 12, 0, Math.PI * 2);
            ctx.fill();

            // Name
            ctx.fillStyle = ch.isAlive ? '#e8dcc8' : '#666666';
            ctx.font = '10px Georgia';
            ctx.textAlign = 'center';
            ctx.fillText(ch.name, x + portraitSize / 2, y + portraitSize + 12);

            // HP bar
            const hpCanvas = createHPBarTexture(barWidth, barHeight, ch.getHpRatio());
            ctx.drawImage(hpCanvas, x + portraitSize / 2 - barWidth / 2, y + portraitSize + 16);

            // HP text
            ctx.fillStyle = '#ffffff';
            ctx.font = '9px Georgia';
            ctx.fillText(`${ch.hp}/${ch.maxHp}`, x + portraitSize / 2, y + portraitSize + 24);

            // AP bar
            const apCanvas = createAPBarTexture(barWidth * 0.7, barHeight * 0.7, ch.getApRatio());
            ctx.drawImage(apCanvas, x + portraitSize / 2 - barWidth * 0.35, y + portraitSize + 28);

            // AP text
            ctx.fillStyle = '#aa88ff';
            ctx.font = '8px Georgia';
            ctx.fillText(`AP ${ch.ap}/${ch.maxAp}`, x + portraitSize / 2, y + portraitSize + 42);

            // Stagger bar
            const staggerCanvas = createStaggerBarTexture(barWidth * 0.6, staggerHeight, ch.staggerBar / 100);
            ctx.drawImage(staggerCanvas, x + portraitSize / 2 - barWidth * 0.3, y + portraitSize + 46);

            // Status icons
            let statusX = x + portraitSize + 4;
            for (const status of ch.statuses) {
                const iconCanvas = createStatusIcon(status.type, 20);
                ctx.drawImage(iconCanvas, statusX, y + 10);
                statusX += 22;
            }

            // Buff icons
            for (const buff of ch.buffs) {
                const iconCanvas = createStatusIcon('buff', 20);
                ctx.drawImage(iconCanvas, statusX, y + 34);
                statusX += 22;
            }

            // Staggered indicator
            if (ch.isStaggered) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = 'bold 10px Georgia';
                ctx.textAlign = 'left';
                ctx.fillText('⚡ STAGGERED', x, y - 4);
            }

            // Dead indicator
            if (!ch.isAlive) {
                ctx.fillStyle = 'rgba(100, 0, 0, 0.6)';
                ctx.beginPath();
                ctx.roundRect(x, y, portraitSize, portraitSize, 4);
                ctx.fill();
                ctx.fillStyle = '#ff4444';
                ctx.font = 'bold 14px Georgia';
                ctx.textAlign = 'center';
                ctx.fillText('✝', x + portraitSize / 2, y + portraitSize / 2 + 5);
            }
        }

        // Enemy portraits on right
        for (let i = 0; i < this.enemies.length; i++) {
            const en = this.enemies[i];
            const x = this.W - 16 - (this.enemies.length - i) * spacing;
            const y = startY;

            // Portrait frame
            ctx.fillStyle = 'rgba(20, 10, 10, 0.85)';
            ctx.strokeStyle = en === this.activeEnemy ? '#cc4444' : '#444455';
            ctx.lineWidth = en === this.activeEnemy ? 2 : 1;
            ctx.beginPath();
            ctx.roundRect(x, y, portraitSize, portraitSize, 4);
            ctx.fill();
            ctx.stroke();

            // Enemy color indicator
            ctx.fillStyle = en.color || '#884444';
            ctx.beginPath();
            ctx.arc(x + portraitSize / 2, y + portraitSize / 2 - 4, 12, 0, Math.PI * 2);
            ctx.fill();

            // Name
            ctx.fillStyle = en.isAlive ? '#e8c8c8' : '#666666';
            ctx.font = '10px Georgia';
            ctx.textAlign = 'center';
            ctx.fillText(en.name, x + portraitSize / 2, y + portraitSize + 12);

            // HP bar
            const hpCanvas = createHPBarTexture(barWidth, barHeight, en.getHpRatio());
            ctx.drawImage(hpCanvas, x + portraitSize / 2 - barWidth / 2, y + portraitSize + 16);

            // HP text
            ctx.fillStyle = '#ffffff';
            ctx.font = '9px Georgia';
            ctx.fillText(`${en.hp}/${en.maxHp}`, x + portraitSize / 2, y + portraitSize + 24);

            // Stagger bar
            const staggerCanvas = createStaggerBarTexture(barWidth * 0.6, staggerHeight, en.staggerBar / 100);
            ctx.drawImage(staggerCanvas, x + portraitSize / 2 - barWidth * 0.3, y + portraitSize + 28);

            // Weakness indicators
            let elemX = x + portraitSize + 4;
            for (const weak of en.weaknesses) {
                const iconCanvas = createElementIcon(weak, 16);
                ctx.drawImage(iconCanvas, elemX, y + 10);
                elemX += 18;
            }

            // Boss indicator
            if (en.isBoss) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = 'bold 10px Georgia';
                ctx.textAlign = 'left';
                ctx.fillText('★ BOSS', x, y - 4);
            }

            // Staggered indicator
            if (en.isStaggered) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = 'bold 10px Georgia';
                ctx.textAlign = 'left';
                ctx.fillText('⚡ STAGGERED', x, y - 4);
            }

            // Dead indicator
            if (!en.isAlive) {
                ctx.fillStyle = 'rgba(100, 0, 0, 0.6)';
                ctx.beginPath();
                ctx.roundRect(x, y, portraitSize, portraitSize, 4);
                ctx.fill();
                ctx.fillStyle = '#ff4444';
                ctx.font = 'bold 14px Georgia';
                ctx.textAlign = 'center';
                ctx.fillText('✝', x + portraitSize / 2, y + portraitSize / 2 + 5);
            }
        }
    }

    drawTurnQueue() {
        const ctx = this.ctx;
        const queue = this.turnQueue || [];
        if (queue.length === 0) return;

        const iconSize = 24;
        const spacing = 32;
        const totalWidth = queue.length * spacing;
        const startX = this.W / 2 - totalWidth / 2;
        const y = this.H - 40;

        // Background
        ctx.fillStyle = 'rgba(10, 10, 20, 0.7)';
        ctx.beginPath();
        ctx.roundRect(startX - 10, y - 16, totalWidth + 20, iconSize + 24, 8);
        ctx.fill();
        ctx.strokeStyle = '#444455';
        ctx.lineWidth = 1;
        ctx.stroke();

        for (let i = 0; i < queue.length; i++) {
            const combatant = queue[i];
            const x = startX + i * spacing;

            // Dim non-active
            const alpha = i === 0 ? 1.0 : (0.6 - i * 0.08);
            ctx.globalAlpha = Math.max(0.3, alpha);

            // Icon circle
            ctx.fillStyle = combatant.isEnemy ? '#884444' : (combatant.color || '#4466aa');
            ctx.beginPath();
            ctx.arc(x + iconSize / 2, y, iconSize / 2, 0, Math.PI * 2);
            ctx.fill();

            // Highlight active
            if (i === 0) {
                ctx.strokeStyle = '#c4a35a';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Name below
            ctx.fillStyle = '#e8dcc8';
            ctx.font = '9px Georgia';
            ctx.textAlign = 'center';
            ctx.fillText(combatant.name, x + iconSize / 2, y + iconSize + 12);

            ctx.globalAlpha = 1;
        }
    }

    drawDamageNumbers() {
        const ctx = this.ctx;

        for (const dn of this.damageNumbers) {
            ctx.globalAlpha = dn.alpha;

            let color;
            switch (dn.type) {
                case 'damage':
                    color = dn.isCrit ? '#ff4422' : '#ff8866';
                    break;
                case 'heal':
                    color = '#44ff88';
                    break;
                case 'ap':
                    color = '#aa88ff';
                    break;
                case 'stagger':
                    color = '#ffaa22';
                    break;
                case 'miss':
                    color = '#888888';
                    break;
                default:
                    color = '#ffffff';
            }

            const fontSize = dn.isCrit ? 22 : 16;
            ctx.font = `bold ${fontSize}px Georgia`;
            ctx.textAlign = 'center';

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillText(`${dn.value}`, dn.x + 1, dn.y + 1);

            // Main text
            ctx.fillStyle = color;
            ctx.fillText(`${dn.value}`, dn.x, dn.y);

            if (dn.isCrit) {
                ctx.font = 'bold 11px Georgia';
                ctx.fillStyle = '#ffcc00';
                ctx.fillText('CRIT!', dn.x, dn.y + 16);
            }

            ctx.globalAlpha = 1;
        }
    }

    drawVignette() {
        const ctx = this.ctx;
        const grad = ctx.createRadialGradient(
            this.W / 2, this.H / 2, this.W * 0.3,
            this.W / 2, this.H / 2, this.W * 0.75
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.W, this.H);
    }

    drawFilmGrain() {
        const ctx = this.ctx;
        ctx.globalAlpha = 0.03;
        for (let i = 0; i < 200; i++) {
            const x = (Math.random() * this.W + this.grainOffset) % this.W;
            const y = (Math.random() * this.H + this.grainOffset * 0.7) % this.H;
            ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
            ctx.fillRect(x, y, 1, 1);
        }
        ctx.globalAlpha = 1;
    }

    drawFlash() {
        if (this.flashAlpha <= 0) return;
        const ctx = this.ctx;
        ctx.globalAlpha = this.flashAlpha;
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.globalAlpha = 1;
    }
}
