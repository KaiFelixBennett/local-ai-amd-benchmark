/**
 * Parry/dodge timing prompts, hit flashes, combo counters.
 * Drawn on the 2D canvas overlay.
 */

export class ReactionPrompts {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.active = false;
        this.state = null; // 'windup', 'warning', 'striking'
        this.hitType = 'normal';
        this.isGrab = false;
        this.progress = 0; // 0-1 progress through telegraph
        this.timeToHit = 0;
        this.hitIndex = 0;
        this.totalHits = 0;
        this.result = null; // 'parry', 'dodge', 'miss'
        this.resultTimer = 0;
        this.comboCount = 0;
        this.flowMeter = 0;
    }

    updateFromReactionSystem(reactionProgress) {
        if (!reactionProgress) {
            this.active = false;
            return;
        }
        this.active = true;
        this.state = reactionProgress.state;
        this.hitType = reactionProgress.hitType;
        this.isGrab = reactionProgress.isGrab;
        this.timeToHit = reactionProgress.timeToHit;
        this.hitIndex = reactionProgress.hitIndex;
        this.totalHits = reactionProgress.totalHits;

        // Calculate progress through current hit's telegraph
        this.progress = Math.max(0, Math.min(1, 1 - reactionProgress.timeToHit / 1.0));
    }

    setResult(result, combo, flow) {
        this.result = result;
        this.resultTimer = 0.8;
        if (combo !== undefined) this.comboCount = combo;
        if (flow !== undefined) this.flowMeter = flow;
    }

    clearResult() {
        this.result = null;
    }

    update(dt) {
        if (this.resultTimer > 0) {
            this.resultTimer -= dt;
            if (this.resultTimer <= 0) {
                this.result = null;
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        if (!this.active) return;

        // Draw timing prompt
        this.drawTimingPrompt(ctx, W, H);

        // Draw result feedback
        if (this.result && this.resultTimer > 0) {
            this.drawResultFeedback(ctx, W, H);
        }

        // Draw combo counter
        if (this.comboCount > 1) {
            this.drawComboCounter(ctx, W, H);
        }

        // Draw flow meter
        if (this.flowMeter > 0) {
            this.drawFlowMeter(ctx, W, H);
        }
    }

    drawTimingPrompt(ctx, W, H) {
        const promptY = H / 2 - 60;
        const promptW = 300;
        const promptX = W / 2 - promptW / 2;

        // Background
        ctx.fillStyle = 'rgba(5, 5, 15, 0.7)';
        ctx.beginPath();
        ctx.roundRect(promptX - 10, promptY - 20, promptW + 20, 80, 8);
        ctx.fill();

        // Timing bar
        const barX = promptX;
        const barY = promptY;
        const barW = promptW;
        const barH = 16;

        // Bar background
        ctx.fillStyle = 'rgba(30, 25, 20, 0.9)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 4);
        ctx.fill();

        // Parry window (center, narrow)
        const parryCenter = barX + barW / 2;
        const parryWidth = 20;
        ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.fillRect(parryCenter - parryWidth / 2, barY, parryWidth, barH);

        // Dodge window (wider)
        const dodgeWidth = 50;
        ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.fillRect(parryCenter - dodgeWidth / 2, barY, dodgeWidth, barH);

        // Timing indicator (moves across bar)
        const indicatorX = barX + barW * this.progress;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(indicatorX - 2, barY - 4, 4, barH + 8);

        // State text
        let stateText, stateColor;
        if (this.isGrab) {
            stateText = '⚠ GRAB - DODGE ONLY!';
            stateColor = '#ff4444';
        } else if (this.hitType === 'heavy') {
            stateText = '⚠ HEAVY ATTACK';
            stateColor = '#ff8844';
        } else if (this.hitType === 'feint') {
            stateText = '⚠ FEINT ATTACK';
            stateColor = '#cc44cc';
        } else {
            stateText = 'INCOMING ATTACK';
            stateColor = '#ffaa44';
        }

        ctx.fillStyle = stateColor;
        ctx.font = 'bold 14px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(stateText, W / 2, promptY - 28);

        // Combo hit counter
        if (this.totalHits > 1) {
            ctx.fillStyle = '#a89880';
            ctx.font = '12px Georgia';
            ctx.fillText(`Hit ${this.hitIndex + 1}/${this.totalHits}`, W / 2, promptY + barH + 20);
        }

        // Key hints
        ctx.fillStyle = '#887766';
        ctx.font = '11px Georgia';
        ctx.fillText('[SPACE] PARRY  ·  [SHIFT] DODGE', W / 2, promptY + barH + 40);
    }

    drawResultFeedback(ctx, W, H) {
        const alpha = Math.min(1, this.resultTimer / 0.3);
        ctx.globalAlpha = alpha;

        let text, color, size;
        switch (this.result) {
            case 'parry':
                text = '✦ PERFECT PARRY ✦';
                color = '#ffd700';
                size = 32;
                break;
            case 'dodge':
                text = '↻ DODGED';
                color = '#66ccff';
                size = 26;
                break;
            case 'miss':
                text = '✗ HIT';
                color = '#ff4444';
                size = 24;
                break;
            default:
                ctx.globalAlpha = 1;
                return;
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = `bold ${size}px Georgia`;
        ctx.textAlign = 'center';
        ctx.fillText(text, W / 2 + 2, H / 2 + 2);

        // Main text
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, H / 2);

        ctx.globalAlpha = 1;
    }

    drawComboCounter(ctx, W, H) {
        const x = W - 120;
        const y = H / 2 - 40;

        ctx.fillStyle = 'rgba(5, 5, 15, 0.7)';
        ctx.beginPath();
        ctx.roundRect(x - 30, y - 15, 120, 50, 6);
        ctx.fill();

        ctx.fillStyle = '#c4a35a';
        ctx.font = 'bold 20px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.comboCount}x`, x + 30, y + 12);

        ctx.fillStyle = '#a89880';
        ctx.font = '10px Georgia';
        ctx.fillText('COMBO', x + 30, y + 28);
    }

    drawFlowMeter(ctx, W, H) {
        const meterW = 160;
        const meterH = 12;
        const x = W / 2 - meterW / 2;
        const y = H - 80;

        // Background
        ctx.fillStyle = 'rgba(15, 15, 25, 0.8)';
        ctx.beginPath();
        ctx.roundRect(x - 4, y - 4, meterW + 8, meterH + 20, 6);
        ctx.fill();

        // Label
        ctx.fillStyle = '#c4a35a';
        ctx.font = '10px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('FLOW', W / 2, y - 2);

        // Bar
        ctx.fillStyle = 'rgba(30, 25, 20, 0.9)';
        ctx.beginPath();
        ctx.roundRect(x, y + 8, meterW, meterH, 3);
        ctx.fill();

        // Fill
        const fillW = meterW * (this.flowMeter / 100);
        const isMaxed = this.flowMeter >= 100;
        const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
        if (isMaxed) {
            grad.addColorStop(0, '#ffcc00');
            grad.addColorStop(1, '#ff6600');
        } else {
            grad.addColorStop(0, '#c4a35a');
            grad.addColorStop(1, '#886633');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y + 8, fillW, meterH, 3);
        ctx.fill();

        // Ultimate ready indicator
        if (isMaxed) {
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 11px Georgia';
            ctx.fillText('★ ULTIMATE READY [U] ★', W / 2, y + meterH + 16);
        }
    }
}
