// hud.js — HUD overlay canvas: bars, portraits, turn queue, status icons, banners, grain/vignette.
export class HudLayer {
    constructor(overlayCanvas, worldToScreen) {
        this.canvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d');
        this.worldToScreen = worldToScreen;
        this.party = [];
        this.enemies = [];
        this.turnQueue = [];
        this.statusText = '';
        this.banners = [];
        this.grain = this._makeGrain();
        this.time = 0;
        this.prompts = null;   // set by game
        this.dmg = null;       // set by game
        this.desaturation = 0;
        this.size = { w: overlayCanvas.width, h: overlayCanvas.height };
        this.clear = this.clear.bind(this);
    }

    _makeGrain() {
        const c = document.createElement('canvas');
        c.width = 200; c.height = 200;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(200, 200);
        for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
            const v = Math.random() * 255;
            const i = (y * 200 + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 40;
        }
        ctx.putImageData(img, 0, 0);
        const t = document.createElement('canvas');
        t.width = 200; t.height = 200;
        const tctx = t.getContext('2d');
        tctx.drawImage(c, 0, 0);
        // store as pattern
        return tctx.createPattern(t, 'repeat');
    }

    setActors(party, enemies) {
        this.party = party;
        this.enemies = enemies;
    }

    setTurnQueue(arr) {
        this.turnQueue = (arr || []).map(a => {
            if (typeof a === 'string') return { id: a, name: a };
            return a && (a.name || a.id) ? a : { id: String(a), name: String(a) };
        });
    }

    setStatusText(s) { this.statusText = s || ''; }

    // Returns a Promise that resolves when the banner has been shown long enough.
    pushBanner(text) {
        return new Promise(res => {
            this.banners.push({ text, t: 0, dur: 1.4 });
            setTimeout(res, 1300);
        });
    }

    clear() {
        this.ctx.clearRect(0, 0, this.size.w, this.size.h);
    }

    _bar(ctx, x, y, w, h, frac, fill, back) {
        ctx.fillStyle = back;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = fill;
        const f = Math.max(0, Math.min(1, frac));
        ctx.fillRect(x, y, w * f, h);
    }

    drawSide(ctx, actor, x, y, w) {
        if (!actor || actor.dead) return;
        const hp = actor.hp / actor.maxHp;
        const ap = Math.min(1, actor.ap / actor.apMax);
        // portrait
        ctx.fillStyle = 'rgba(30,40,50,0.75)';
        ctx.fillRect(x, y - 20, 16, 16);
        ctx.fillStyle = actor.accent || '#cfc0a0';
        ctx.fillRect(x + 3, y - 17, 10, 10);
        // name
        ctx.fillStyle = '#f4e7cf';
        ctx.font = '600 14px "Georgia", serif';
        ctx.textAlign = 'left';
        ctx.fillText(actor.name, x + 20, y - 6);
        // HP bar
        this._bar(ctx, x, y, w, 9, hp, hp > 0.5 ? '#7fd07f' : hp > 0.25 ? '#e0b04f' : '#e05f5f', 'rgba(20,28,34,0.9)');
        ctx.fillStyle = '#dfe8ee';
        ctx.font = '600 11px "Consolas", monospace';
        ctx.fillText(`${Math.ceil(actor.hp)}/${actor.maxHp}`, x + w - 60, y + 6);
        // AP bar
        this._bar(ctx, x, y + 13, w, 6, ap, 'rgba(255,210,106,0.85)', 'rgba(20,28,34,0.9)');
        ctx.fillStyle = 'rgba(255,210,106,0.9)';
        ctx.font = '600 10px "Consolas", monospace';
        ctx.fillText(`AP ${Math.floor(actor.ap)}/${actor.apMax}`, x + w - 70, y + 16);
        // statuses (icons)
        if (actor.statuses && actor.statuses.length) {
            let ix = x;
            for (let i = 0; i < Math.min(4, actor.statuses.length); i++) {
                const s = actor.statuses[i];
                ctx.fillStyle = this._statusColor(s.type);
                ctx.beginPath();
                ctx.arc(ix + 5, y + 26, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#101820';
                ctx.font = '700 8px "Consolas", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(s.type[0], ix + 5, y + 27);
                ix += 13;
            }
        }
    }

    _statusColor(type) {
        switch (type) {
            case 'BURN': return '#ff7a45';
            case 'POISON': return '#8fe06f';
            case 'STUN': return '#ffd06a';
            case 'MARK': return '#d97fd9';
            case 'WEAK': return '#9fdcff';
            case 'GRIEF': return '#aabbcc';
            default: return '#cfc0a0';
        }
    }

    setDesaturation(v) { this.desaturation = v; }

    // main draw (called per frame by game after clear)
    draw(dt, renderer) {
        const ctx = this.ctx;
        this.time += dt;
        const w = this.size.w, h = this.size.h;
        const ow = 200;

        // party top-left
        let y = 44;
        for (const a of this.party) {
            this.drawSide(ctx, a, 24, y, ow);
            y += 52;
        }
        // enemies top-right
        let ex = w - 24 - ow;
        for (const a of this.enemies) {
            this.drawSide(ctx, a, ex, 30, ow);
            ex -= ow + 16;
        }

        // turn queue preview (bottom center strip)
        if (this.turnQueue.length) {
            const n = Math.min(5, this.turnQueue.length);
            const qw = 420;
            const x0 = w / 2 - qw / 2;
            const yq = h - 150;
            ctx.fillStyle = 'rgba(10,16,22,0.6)';
            ctx.fillRect(x0, yq, qw, 26);
            ctx.fillStyle = '#e9dcc3';
            ctx.font = '600 15px "Georgia", serif';
            ctx.textAlign = 'center';
            for (let i = 0; i < n; i++) {
                const u = this.turnQueue[i];
                const name = u && (u.name || u.id) && String(u.name || u.id);
                const px = x0 + 20 + i * (qw / 5);
                ctx.fillStyle = i === 0 ? '#ffd06a' : '#cfc4ac';
                ctx.fillText(name, px, yq + 16);
            }
        }

        // status text
        if (this.statusText) {
            ctx.fillStyle = 'rgba(24,34,44,0.85)';
            ctx.font = 'italic 600 22px "Georgia", serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.statusText, w / 2, 88);
        }

        // banners centered-right
        for (const b of this.banners) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, b.t < 0.15 ? b.t / 0.15 : 1 - (b.t - 1.1) / 0.3);
            ctx.fillStyle = 'rgba(16,22,28,0.8)';
            ctx.strokeStyle = 'rgba(255,210,106,0.5)';
            ctx.lineWidth = 2;
            const tw = ctx.measureText(b.text).width + 60;
            ctx.beginPath();
            ctx.roundRect(w / 2 - tw / 2, 64, tw, 44, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffd9a0';
            ctx.font = 'italic 700 24px "Georgia", serif';
            ctx.fillText(b.text, w / 2, 90);
            ctx.restore();
        }
        this.banners = this.banners.filter(b => b.t < 1.4);

        // vignette
        const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(8,12,16,0.62)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // grain
        ctx.save();
        ctx.globalAlpha = 0.16 + this.desaturation * 0.1;
        ctx.fillStyle = this.grain;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // desaturation overlay (whole-screen wash) when slow-mo
        if (this.desaturation > 0.02) {
            ctx.save();
            ctx.globalAlpha = this.desaturation * 0.5;
            ctx.fillStyle = '#9aa6b0';
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }
    }
}
