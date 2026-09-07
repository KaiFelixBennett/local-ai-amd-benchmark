// battle-menu.js — turn-based action menu (Attack / Skills / Free-Aim / Ultimate).
export class BattleMenu {
    constructor(container) {
        this.container = container;
        this.root = null;
        this.onAction = null;        // fn(action: string, skillId?, targetId?)
        this.open = false;
        this.currentActor = null;
        this.col = 0;               // 0 attack, 1 skills, 2 freeaim, 3 ult
        this.skillIdx = 0;
        this.targetIdx = 0;
        this.state = null;          // 'main' | 'skills' | 'target'
        this.lastSkill = null;
        this.build();
        this.hide();
    }

    build() {
        this.root = document.createElement('div');
        this.root.id = 'battle-menu';
        this.root.style.cssText = `
            position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
            min-width:520px; padding:14px 22px; background:rgba(18,26,34,0.82);
            border:1px solid rgba(196,168,106,0.35); border-radius:10px;
            font:600 17px "Georgia",serif; color:#f4e7cf; text-align:center;
            box-shadow:0 6px 22px rgba(0,0,0,0.5); user-select:none; z-index:30;
        `;
        this.cols = document.createElement('div');
        this.cols.style.cssText = 'display:flex; gap:22px; justify-content:center; margin-top:6px;';
        this.colEls = {};
        const labels = {
            col_attack: '⚔ Attack',
            col_skills: '✦ Skills',
            col_freeaim: '◎ Free-Aim',
            col_ult: '✦ Ultimate',
        };
        for (const key of Object.keys(labels)) {
            const el = document.createElement('div');
            el.textContent = labels[key];
            el.style.cssText = 'padding:6px 14px; border-radius:6px; border:1px solid transparent;';
            el.dataset.key = key;
            this.cols.appendChild(el);
            this.colEls[key.replace('col_', '')] = el;
        }
        this.detail = document.createElement('div');
        this.detail.style.cssText = 'margin-top:8px; min-height:20px; color:#cbb98e; font-size:15px;';
        this.root.appendChild(this.cols);
        this.root.appendChild(this.detail);
        this.container.appendChild(this.root);
    }

    openFor(actor, skills) {
        this.currentActor = actor;
        this.skills = skills || [];
        this.col = 0; this.skillIdx = 0; this.targetIdx = 0;
        this.state = 'main';
        this.open = true;
        this.root.style.display = 'block';
        this.render();
    }

    hide() {
        if (!this.root) return;
        this.open = false;
        this.root.style.display = 'none';
    }

    setTargets(targets) {
        this.targets = targets || [];
        this.targetIdx = 0;
    }

    render() {
        const els = this.colEls;
        const self = this;
        Object.keys(els).forEach(key => {
            const el = els[key];
            const disabled = (key === 'ult') && !(self.currentActor && self.currentActor.ultiReady);
            el.style.opacity = disabled ? '0.3' : '1';
            el.style.borderColor = 'transparent';
        });
        if (this.state === 'main') {
            const activeKey = ['attack', 'skills', 'freeaim', 'ult'][this.col];
            const el = els[activeKey];
            if (el) {
                el.style.borderColor = 'rgba(255,210,106,0.9)';
                el.style.background = 'rgba(255,210,106,0.12)';
            }
            this.detail.textContent = `Ready — press Enter to confirm · Tab to switch`;
        } else if (this.state === 'skills') {
            this.detail.textContent = '';
            const s = this.skills[this.skillIdx];
            this.detail.textContent = s ? `${s.name}  [${s.apCost} AP] — ${s.desc || ''}` : 'No skills';
        } else if (this.state === 'target') {
            const t = (this.targets || [])[this.targetIdx];
            this.detail.textContent = t ? `Target: ${t.name || t.id}  (←/→ to cycle, Enter to confirm)` : 'No targets';
        }
    }

    skillList() {
        return (this.skills && this.currentActor) ? this.skills : [];
    }

    // ---- controller interface used by game.js ----
    // returns an action descriptor or null
    keyDir(dir, shift) {
        if (this.state === 'main') {
            if (shift) this.col = (this.col + 4 + dir) % 4;
            else this.col = Math.max(0, Math.min(3, this.col + dir));
            this.render();
            return null;
        }
        if (this.state === 'skills') {
            if (dir !== 0) this.skillIdx = Math.max(0, Math.min(this.skillList().length - 1, this.skillIdx + dir));
            this.render();
            return null;
        }
        if (this.state === 'target') {
            const n = (this.targets || []).length;
            if (n > 0 && dir !== 0) this.targetIdx = (this.targetIdx + n + dir) % n;
            this.render();
            return null;
        }
        return null;
    }

    confirm() {
        if (this.state === 'main') {
            if (this.col === 1) { this.state = 'skills'; this.render(); return null; }
            this.state = 'target';
            this.render();
            return null;
        }
        if (this.state === 'skills') {
            this.lastSkill = this.skillList()[this.skillIdx];
            this.state = 'target';
            this.render();
            return null;
        }
        if (this.state === 'target') {
            const t = (this.targets || [])[this.targetIdx];
            if (!t) { this.state = 'main'; this.render(); return null; }
            const action = this.col === 0 ? 'attack' : this.col === 2 ? 'freeaim' : this.col === 3 ? 'ult' : 'skill';
            const skillId = this.col === 1 ? this.lastSkill && this.lastSkill.id : null;
            this.open = false;
            this.root.style.display = 'none';
            return { action, skillId, targetId: t.id };
        }
        return null;
    }

    cancel() {
        if (this.state === 'target') { this.state = this.col === 1 ? 'skills' : 'main'; this.render(); return true; }
        if (this.state === 'skills') { this.state = 'main'; this.render(); return true; }
        return false;
    }

    // Called by battle-system when free-aim begins (mouse aim + click confirm instead of menu).
    startFreeAim() {
        this.state = 'aim';
        this.freeAimPos = { x: 0, y: 0 };
        this.root.style.display = 'block';
        this.detail.textContent = 'Move the reticle (mouse) — click to fire, ESC to cancel';
    }

    aimMove(x, y) {
        this.freeAimPos = { x, y };
    }

    aimConfirm(targets) {
        // choose nearest target to reticle
        let best = null, bestD = Infinity;
        for (const t of targets || []) {
            if (!t.mesh) continue;
            const dx = t.mesh.position.x - this.freeAimPos.x;
            const dy = (t.mesh.position.y + 1) - this.freeAimPos.y;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = t; }
        }
        this.open = false;
        this.root.style.display = 'none';
        return best ? { action: 'freeaim', skillId: null, targetId: best.id, weak: bestD < 1.2 } : null;
    }

    isAimming() { return this.state === 'aim'; }

    destroy() {
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }
}
