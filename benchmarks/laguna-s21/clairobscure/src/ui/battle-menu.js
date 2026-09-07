/**
 * Attack / skill / free-aim / item selection menu.
 * Drawn on the 2D canvas overlay.
 */

export class BattleMenu {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.visible = false;
        this.selectedIndex = 0;
        this.items = [];
        this.onSelect = null;
        this.onCancel = null;
        this.mode = 'main'; // 'main', 'skills', 'items', 'target_select'
        this.targetMode = null; // 'enemy', 'ally', 'self'
        this.targetCandidates = [];
        this.previousMode = null;
    }

    /** Show the main action menu */
    showMain(character) {
        this.visible = true;
        this.mode = 'main';
        this.selectedIndex = 0;
        this.items = [
            { id: 'attack', label: '⚔  Attack', desc: 'Basic attack (builds AP)', action: 'attack' },
            ...character.skills.map(s => ({
                id: s.id,
                label: `✦  ${s.name}`,
                desc: `${s.cost} AP - ${s.description}`,
                action: 'skill',
                skill: s,
                disabled: character.ap < s.cost
            })),
            { id: 'aim', label: '◎  Free Aim', desc: 'Aim for weak points', action: 'aim' },
            { id: 'item', label: '⚕  Items', desc: 'Use an item', action: 'item' },
            { id: 'wait', label: '⏳  Wait', desc: 'End turn without acting', action: 'wait' }
        ];
    }

    /** Show target selection */
    showTargetSelect(candidates, mode = 'enemy') {
        this.visible = true;
        this.mode = 'target_select';
        this.targetMode = mode;
        this.targetCandidates = candidates;
        this.selectedIndex = 0;
        this.items = candidates.map(c => ({
            id: c.id || c.name,
            label: `${c.isEnemy ? '👹' : '🛡'}  ${c.name}`,
            desc: `HP: ${c.hp}/${c.maxHp}`,
            action: 'target',
            target: c,
            disabled: !c.isAlive
        }));
    }

    hide() {
        this.visible = false;
    }

    /** Navigate up */
    moveUp() {
        if (this.items.length === 0) return;
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        // Skip disabled items
        let attempts = 0;
        while (this.items[this.selectedIndex]?.disabled && attempts < this.items.length) {
            this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
            attempts++;
        }
    }

    /** Navigate down */
    moveDown() {
        if (this.items.length === 0) return;
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        let attempts = 0;
        while (this.items[this.selectedIndex]?.disabled && attempts < this.items.length) {
            this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
            attempts++;
        }
    }

    /** Confirm selection */
    confirm() {
        const item = this.items[this.selectedIndex];
        if (!item || item.disabled) return;
        if (this.onSelect) this.onSelect(item);
    }

    /** Cancel/back */
    cancel() {
        if (this.onCancel) this.onCancel();
    }

    render() {
        if (!this.visible) return;
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        // Menu position (bottom center)
        const menuW = 380;
        const itemH = 40;
        const headerH = 36;
        const descH = 24;
        const totalH = headerH + this.items.length * itemH + descH + 20;
        const menuX = W / 2 - menuW / 2;
        const menuY = H - totalH - 20;

        // Background
        ctx.fillStyle = 'rgba(8, 8, 18, 0.92)';
        ctx.beginPath();
        ctx.roundRect(menuX, menuY, menuW, totalH, 8);
        ctx.fill();

        // Gold border
        ctx.strokeStyle = '#c4a35a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(menuX, menuY, menuW, totalH, 8);
        ctx.stroke();

        // Header
        ctx.fillStyle = '#c4a35a';
        ctx.font = 'bold 16px Georgia';
        ctx.textAlign = 'center';
        const titles = {
            main: '— Action Menu —',
            target_select: this.targetMode === 'enemy' ? '— Select Target —' : '— Select Ally —'
        };
        ctx.fillText(titles[this.mode] || '— Menu —', W / 2, menuY + 24);

        // Separator line
        ctx.strokeStyle = '#665533';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(menuX + 16, menuY + headerH);
        ctx.lineTo(menuX + menuW - 16, menuY + headerH);
        ctx.stroke();

        // Items
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const y = menuY + headerH + i * itemH;
            const isSelected = i === this.selectedIndex;

            // Background highlight
            if (isSelected) {
                ctx.fillStyle = 'rgba(196, 163, 90, 0.2)';
                ctx.beginPath();
                ctx.roundRect(menuX + 4, y + 2, menuW - 8, itemH - 4, 4);
                ctx.fill();
            }

            // Item text
            ctx.fillStyle = item.disabled ? '#444455' : (isSelected ? '#e8dcc8' : '#a89880');
            ctx.font = `${isSelected ? 'bold ' : ''}14px Georgia`;
            ctx.textAlign = 'left';
            ctx.fillText(item.label, menuX + 16, y + 25);

            // Disabled indicator
            if (item.disabled) {
                ctx.fillStyle = '#664444';
                ctx.font = '10px Georgia';
                ctx.textAlign = 'right';
                ctx.fillText('(locked)', menuX + menuW - 16, y + 25);
            }
        }

        // Description of selected item
        const selected = this.items[this.selectedIndex];
        if (selected && !selected.disabled) {
            ctx.fillStyle = '#887766';
            ctx.font = '12px Georgia';
            ctx.textAlign = 'center';
            ctx.fillText(selected.desc || '', W / 2, menuY + headerH + this.items.length * itemH + 14);
        }

        // Control hints
        ctx.fillStyle = '#555566';
        ctx.font = '10px Georgia';
        ctx.textAlign = 'right';
        ctx.fillText('↑↓ Navigate  ·  ENTER Confirm  ·  ESC Cancel', menuX + menuW - 10, menuY + totalH - 6);
    }
}
