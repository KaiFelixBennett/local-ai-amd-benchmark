// game.js — orchestrator: owns renderer, audio, fx, HUD, menu, battle.
// Per-frame delta-time loop; routes input by battle phase.
import * as THREE from 'three';
import { BattleSystem } from './battle/battle-system.js';
import { makeFx } from './fx/particles.js';
import { DamageNumberLayer } from './fx/damage-numbers.js';
import { PromptLayer } from './ui/prompts.js';
import { BattleMenu } from './ui/battle-menu.js';
import { HudLayer } from './ui/hud.js';

export class Game {
    constructor(opts) {
        this.container = opts.container;
        this.renderer = opts.renderer;
        this.scene = opts.renderer.scene;
        this.camera = opts.renderer.camera;
        this.audio = opts.audio;
        this.hudCanvas = opts.hudCanvas;
        this.overlayCanvas = opts.overlayCanvas;
        this.events = opts.events;

        // worldToScreen helper
        const canvas = opts.renderer.domElement;
        this.worldToScreen = (v) => {
            const p = v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z);
            const q = p.clone().project(this.camera);
            return {
                x: (q.x * 0.5 + 0.5) * canvas.clientWidth,
                y: (-q.y * 0.5 + 0.5) * canvas.clientHeight,
            };
        };

        // fx systems
        this.fx = makeFx(this.scene);
        this.dmgLayer = new DamageNumberLayer(this.overlayCanvas, this.worldToScreen);
        this.promptLayer = new PromptLayer(this.overlayCanvas, this.worldToScreen);
        this.hud = new HudLayer(this.overlayCanvas, this.worldToScreen);
        this.menu = new BattleMenu(this.container);

        this.hudPrompts = this.promptLayer;
        // wire hud + dmg into hud layer for drawing
        this.hud.dmg = this.dmgLayer;
        this.hud.prompts = this.promptLayer;

        // patch fx.spawnDamageNumber to delegate
        const dmg = this.dmgLayer;
        this.fx.spawnDamageNumber = (v, target, opts) => dmg.spawn(v, target, opts);

        // clock
        this.clock = new THREE.Clock();
        this.time = 0;
        this.dt = 0;
        this.running = false;
        this.slowmo = 0;

        // input
        this.keys = new Set();
        this.mouse = { x: 0, y: 0 };

        // battle
        this.battle = new BattleSystem({
            events: this.events,
            clock: () => this.time,
            renderer: this.renderer,
            fx: this.fx,
            audio: this.audio,
            ui: this.hud,
            menu: this.menu,
        });
        // reaction results are wired inside BattleSystem (constructor) — do not overwrite here.

        // events
        this.events.on('victory', ({ xp }) => this._onVictory(xp));
        this.events.on('battle-end-shown', (d) => this._onEndShown(d));
        this.battle.ui.pushBanner = (s) => this.hud.pushBanner(s);

        this.overlayCtx = this.overlayCanvas.getContext('2d');
    }

    start() {
        // audio requires gesture; start on first key/click
        this._startAudioOnce = () => {
            this.audio.start();
        };
        this._bindInput();
        this._resizeHandler = () => { };
        window.addEventListener('resize', () => this.renderer._handleResize());
        this.reset();
        this.running = true;
        requestAnimationFrame(this._tick);
    }

    reset() {
        this.battle.resetToStart('clair-obscur-42');
        this.hud.setActors(this.battle.party, this.battle.enemies);
        this.menu.hide();
    }

    _tick = () => {
        if (!this.running) return;
        const rawDt = Math.min(0.05, this.clock.getDelta());
        this.dt = rawDt * (this.slowmo > 0 ? 0.35 : 1);
        if (this.slowmo > 0) this.slowmo -= rawDt;
        this.time += this.dt;

        this.renderer.update(this.dt, this.time);
        // camera drift handled by renderer already
        this.fx.update(this.dt);
        this.dmgLayer.update(this.dt);
        this.battle.update(this.dt);

        // render the 3D scene (composer or plain, chosen by postfx)
        this.renderer.render();

        // feed the reaction prompt HUD from the live reaction snapshot
        const snap = this.battle.reaction ? this.battle.reaction.snapshot(this.time) : null;
        this.promptLayer.setProgress(snap);
        this.promptLayer.update(this.dt);

        this.hud.time = this.time;
        this.hud.setDesaturation(this.renderer.desaturation);
        this.hud.draw(this.dt, this.renderer);

        requestAnimationFrame(this._tick);
    };

    _bindInput() {
        window.addEventListener('keydown', (e) => {
            if (this.audio && !this.audio._ctx) this._startAudioOnce();
            this.keys.add(e.key);
            const phase = this.battle.state ? this.battle.state.current : null;
            // menu interactions (phases are lowercase; see BattlePhase)
            if (phase === 'action-select' && this.menu.open) {
                this._menuKey(e);
                return;
            }
            // free-aim cancel
            if (this.menu.isAimming && this.menu.isAimming() && e.key === 'Escape') {
                this.battle.onFreeAimCancel && this.battle.onFreeAimCancel();
                return;
            }
            // reactions
            if (this.battle.reaction && this.battle.reaction.active) {
                const k = this.promptLayer.keyFor(e);
                if (k === 'parry') this.battle.reaction.inputParry();
                if (k === 'dodge') this.battle.reaction.inputDodge();
                if (k) e.preventDefault();
                return;
            }
            // ultimate
            if (e.key === 'u' || e.key === 'U') {
                this.battle.triggerUltimate && this.battle.triggerUltimate();
                return;
            }
            // restart (after victory/defeat)
            if (this._restartReady && (e.key === 'r' || e.key === 'R')) {
                this._restartReady = false;
                this.reset();
                return;
            }
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.key));
        window.addEventListener('mousemove', (e) => {
            const r = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = (e.clientX - r.left) / r.width;
            this.mouse.y = (e.clientY - r.top) / r.height;
            if (this.menu.isAimming && this.menu.isAimming()) {
                const c = this.overlayCanvas.getBoundingClientRect();
                this.menu.aimMove((e.clientX - c.left) / c.width * c.width, (e.clientY - c.top) / c.height * c.height);
            }
        });
        this.renderer.domElement.addEventListener('click', (e) => {
            if (this.audio && !this.audio._ctx) this._startAudioOnce();
            if (this.menu.isAimming && this.menu.isAimming()) {
                const r = this.renderer.domElement.getBoundingClientRect();
                const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
                const ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
                const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
                // keep at approximate battle plane: z scaled down
                this.menu.freeAimPos.x = v.x * 8;
                this.menu.freeAimPos.y = v.y * 4 + 2;
                this.battle.onFreeAimClick && this.battle.onFreeAimClick();
            }
        });
    }

    _menuKey(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            const act = this.menu.confirm();
            if (act) {
                this.battle.onActionChosen && this.battle.onActionChosen(act.action, act.skillId, act.targetId);
            }
            e.preventDefault();
            return;
        }
        if (e.key === 'Escape') { this.menu.cancel(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
            this.menu.keyDir(dir);
            e.preventDefault();
        }
    }

    _onVictory(xp) {
        this.hud.pushBanner('VICTORY!');
        this.audio.victory && this.audio.victory();
        // apply XP through save system (handled inside battle-system? battle emits with computed xp)
        // We grant XP via save-system here:
        const { grantXp } = this._loadSaveCtx();
        grantXp(this.battle.party, xp);
        this.hud.pushBanner(`+${xp} XP`);
    }

    _loadSaveCtx() {
        // defer import to avoid cycle (save-system has no deps, safe)
        if (!this._save) {
            // dynamic require is not available; use static import at top would cause loop? no: save-system imports nothing from game.
        }
        return this._save || (this._save = { grantXp: (party, xp) => {
            // minimal grantXp: heal some, bump level
            for (const a of party) {
                a.xp = (a.xp || 0) + xp;
                // simple level check: every 100 xp
                const nl = Math.floor(a.xp / 100);
                if (nl > (a.level || 1)) {
                    a.level = Math.min(9, nl);
                    a.maxHp += 8 * (nl - (a.level - 1));
                    a.atk += 2;
                    a.def += 1;
                    a.hp = Math.min(a.maxHp, a.hp + 30);
                }
            }
            this.hud.pushBanner('LEVEL UP!');
        }});
    }

    _onEndShown(d) {
        if (d && d.victory) {
            this.hud.pushBanner('Press R to restart');
        } else {
            this.hud.pushBanner('Press R to retry');
        }
        this._restartReady = true;
    }

    // Public: called from main.js
    dispose() {
        this.running = false;
        this.menu.destroy();
    }
}
