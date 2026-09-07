// damage-numbers.js — floating damage/heal numbers on the HUD canvas (2D overlay).
import * as THREE from 'three';

export class DamageNumberLayer {
    constructor(hudCanvas, worldToScreen) {
        this.canvas = hudCanvas;
        this.ctx = hudCanvas.getContext('2d');
        this.worldToScreen = worldToScreen; // fn(vector3) -> {x,y}
        this.entries = [];
    }

    spawn(amount, target, opts = {}) {
        // world position from mesh (guard for missing mesh)
        const wp = target.mesh ? target.mesh.position : (target.pos || { x: 0, y: 0, z: 0 });
        const s = this.worldToScreen(wp);
        if (!s) return;
        this.entries.push({
            amount: Math.round(amount),
            x: s.x + (Math.random() - 0.5) * 24,
            y: s.y - 20,
            vy: -34,
            life: 0,
            dur: opts.dur || 1.0,
            crit: !!opts.crit,
            weak: !!opts.weak,
            heal: !!opts.heal,
            color: opts.color || '#ffffff',
        });
    }

    update(dt) {
        if (this.entries.length === 0) return;
        const ctx = this.ctx;
        // clear the strip only where numbers will render is hard; instead re-render all each frame
        // The HUD clears the whole overlay itself; we only draw here.
        ctx.save();
        ctx.font = '700 22px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.entries = this.entries.filter(e => e.life < e.dur);
        for (const e of this.entries) {
            e.life += dt;
            e.y += e.vy * dt;
            e.vy *= (1 - dt * 2);
            const alpha = Math.max(0, 1 - e.life / e.dur);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = e.crit ? '#ffd06a' : (e.heal ? '#7fe07f' : e.color);
            if (e.crit) {
                ctx.font = '700 30px "Georgia", serif';
                ctx.strokeStyle = 'rgba(50,20,0,0.9)';
                ctx.lineWidth = 4;
                ctx.strokeText(String(e.amount), e.x, e.y);
            } else if (e.weak) {
                ctx.strokeStyle = 'rgba(40,40,80,0.9)';
                ctx.lineWidth = 3;
                ctx.strokeText(String(e.amount), e.x, e.y);
            } else {
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 3;
                ctx.strokeText(String(e.amount), e.x, e.y);
            }
            ctx.fillText(String(e.amount), e.x, e.y);
        }
        ctx.restore();
    }
}
