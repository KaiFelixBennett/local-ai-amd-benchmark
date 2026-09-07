// prompts.js — real-time parry/dodge timing prompts on the HUD overlay canvas.
export class PromptLayer {
    constructor(hudCanvas, worldToScreen) {
        this.canvas = hudCanvas;
        this.ctx = hudCanvas.getContext('2d');
        this.worldToScreen = worldToScreen; // fn(vector3)->{x,y}
        this.sequence = null;      // {hits, index}
        this.windows = null;       // array of WindowTiming objects
        this.progress = null;      // {p, kind, done, flashAt}
        this.last = { kind: null, result: null, t: 0 };
        this.messages = [];

        this.PARRY_KEYS = new Set(['j', 'J', 'ArrowLeft', ' ']);
        this.DODGE_KEYS = new Set(['k', 'K', 'ArrowDown', ';', 'd', 'D']);
    }

    begin(sequence, windows) {
        this.sequence = sequence;
        this.windows = windows;
        this.flash = 0;
    }

    setProgress(p) {
        this.progress = p;
    }

    result(kind, res) {
        this.last = { kind, result: res, t: performance.now() / 1000 };
    }

    message(text, dur = 0.9) {
        this.messages.push({ text, t: 0, dur });
    }

    update(dt) {
        this.flash = Math.max(0, (this.flash || 0) - dt * 3);
        // age side-banner messages
        for (const m of this.messages) m.t += dt;
        this.messages = this.messages.filter(m => m.t < m.dur);
        if (!this.progress || !this.progress.active || this.progress.total === 0) {
            this.sequence = null;
            return;
        }

        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        const wnd = this.progress.waiting;
        if (!wnd) return;

        // position the ring over the attacking enemy when a projector is available
        const enemyPos = this.progress.enemyPos;
        let labelY = h * 0.42;
        if (this.worldToScreen && enemyPos) {
            const sc = this.worldToScreen(enemyPos);
            if (sc && isFinite(sc.y)) labelY = sc.y - 90;
        }
        const cx = w / 2;

        // the timing ring: value 0..1 from wnd.progress()
        const c = this.progress.progress || 0;
        const p = Math.max(0, Math.min(1, c));

        // Window indicator
        ctx.save();
        ctx.strokeStyle = wnd.kind === 'parry' ? 'rgba(255, 210, 106, 0.9)' : 'rgba(110, 230, 255, 0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, labelY, 52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = wnd.kind === 'parry' ? 'rgba(255, 210, 106, 0.25)' : 'rgba(110, 230, 255, 0.25)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, labelY, 52, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();

        // label
        ctx.fillStyle = wnd.kind === 'parry' ? '#ffd26a' : '#9fe8ff';
        ctx.font = 'italic 700 34px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8;
        ctx.fillText(wnd.kind === 'parry' ? 'PARRY!' : 'DODGE!', cx, labelY - 90);
        ctx.shadowBlur = 0;
        ctx.font = '600 22px "Georgia", serif';
        ctx.fillStyle = '#fff8e0';
        ctx.fillText('J / SPACE  ·  K / D', cx, labelY + 92);
        ctx.restore();

        // hit combo counter: "2 / 3"
        const total = this.progress.total || 0;
        const index = this.progress.index || 0;
        if (total > 1) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 240, 200, 0.95)';
            ctx.font = 'italic 700 26px "Georgia", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${index + 1} / ${total}`, cx, labelY + 128);
            ctx.restore();
        }
    }

    // Conservative keyboard-capture helper used by game.js only; game routes keys itself.
    keyFor(event) {
        if (this.PARRY_KEYS.has(event.key)) return 'parry';
        if (this.DODGE_KEYS.has(event.key)) return 'dodge';
        return null;
    }
}
