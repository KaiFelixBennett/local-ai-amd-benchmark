// battle-system.js — top-level combat state machine.
// Owns: party/enemy entities, turn queue, phase machine, reaction wiring, free-aim,
// enemy AI, victory/defeat, restart. game.js calls update(dt) and routes input here.
import { BattlePhase, BattleStateMachine } from '../core/battle-state.js';
import { makeRng } from '../core/rng.js';
import { EventBus, Evt } from '../core/events.js';
import { buildTurnQueue, previewActors } from './turn-queue.js';
import { resolveBasicAttack, resolveSkill, resolveRangedAttack, resolveCounter, resolveEnemyHit } from './action-resolver.js';
import { ReactionSystem } from './reaction-system.js';
import { makeCombatantStats, buildPartyMemberMesh } from '../entities/character.js';
import { makeEnemy, ENEMY_TEMPLATES } from '../entities/enemy.js';
import { StatusType, addStatus } from '../entities/skill.js';

// Party roster + skill loadouts (id = stable across runs)
export const PARTY_ROSTER = [
    {
        id: 'maude', name: 'Maude', archetype: 'guardian',
        attrs: { maxHp: 150, atk: 18, def: 18, spd: 7, crit: 0.05, apMax: 5 },
        color: 0x948a78,
        skills: [
            { id: 'maude-ram', name: 'Bulwark Ram', type: 'damage', apCost: 2, element: 'physical', power: 14, effects: [{ kind: 'damage', base: 14, element: 'physical' }] },
            { id: 'maude-guard', name: 'Iron Cloak', type: 'buff', apCost: 2, element: 'physical', power: 0, effects: [{ kind: 'buff', stat: 'def-up', duration: 3, mult: 1.4 }] },
            { id: 'maude-smite', name: 'Aegis Smite', type: 'damage', apCost: 3, element: 'light', power: 18, effects: [{ kind: 'damage', base: 18, element: 'light' }] },
        ],
    },
    {
        id: 'pierre', name: 'Pierre', archetype: 'duelist',
        attrs: { maxHp: 110, atk: 24, def: 10, spd: 13, crit: 0.15, apMax: 6 },
        color: 0xc0a050,
        skills: [
            { id: 'pierre-flurry', name: 'Rapier Flurry', type: 'multi', apCost: 2, element: 'physical', hits: 3, power: 8, effects: [{ kind: 'damage', base: 8, element: 'physical', mult: 0.7 }] },
            { id: 'pierre-mark', name: 'Eviscerate Mark', type: 'debuff', apCost: 1, element: 'physical', power: 0, effects: [{ kind: 'debuff', status: 'mark', duration: 3, power: 1 }] },
            { id: 'pierre-rush', name: 'Sevenfold Rush', type: 'multi', apCost: 3, element: 'physical', hits: 7, power: 6, effects: [{ kind: 'damage', base: 6, element: 'physical', mult: 0.8 }] },
        ],
    },
    {
        id: 'livie', name: 'Livie', archetype: 'mage',
        attrs: { maxHp: 95, atk: 20, def: 8, spd: 10, crit: 0.1, apMax: 7 },
        color: 0x9db8ff,
        skills: [
            { id: 'livie-ember', name: 'Ember Veil', type: 'damage', apCost: 2, element: 'fire', power: 16, effects: [{ kind: 'damage', base: 16, element: 'fire' }, { kind: 'debuff', status: 'burn', duration: 3, power: 0.8 }] },
            { id: 'livie-frost', name: 'Frost Lace', type: 'damage', apCost: 2, element: 'ice', power: 14, effects: [{ kind: 'damage', base: 14, element: 'ice' }] },
            { id: 'livie-mend', name: 'Mending Ray', type: 'heal', apCost: 3, element: 'light', power: 0, effects: [{ kind: 'heal', base: 45 }] },
        ],
    },
];

// ── BattleSystem ────────────────────────────────────────────────
export class BattleSystem {
    constructor(opts) {
        this.events = opts.events || new EventBus();
        this.clock = opts.clock || (() => performance.now() / 1000);
        this.renderer = opts.renderer;
        this.fx = opts.fx;
        this.audio = opts.audio;

        this.rng = makeRng(opts.seed || 'clair-obscur-42');
        this.state = new BattleStateMachine();
        this.queue = [];
        this.party = [];
        this.enemies = [];
        this.allActors = [];
        this.turnCount = 0;

        this.reaction = new ReactionSystem(this.events, this.clock);
        this.reaction.onResult = (result, index, seq) => {
            if (result === null && seq === 'done') {
                // sequence finished — enqueue a done marker to trigger resolution
                this._reactionResolutions.push({ result: null, index, seq });
                return;
            }
            this._reactionResolutions.push({ result, index });
        };
        this._reactionResolutions = [];

        this.ui = opts.ui;
        this.freeAimActive = false;
        this.selectedFromFreeAim = null;
        this._menu = opts.menu;

        this.ulti = 0;      // 0..100
        this.ultiReady = false;

        this.time = 0;      // seconds since battle start
        this.over = false;
        this.victory = false;
        this._pendingEndAt = -1;
    }

    // ---- setup ----
    setupParty() {
        this.party = PARTY_ROSTER.map((def, i) => {
            const s = makeCombatantStats({
                name: def.name,
                archetype: def.archetype,
                side: 'party',
                team: 'party',
                maxHp: def.attrs.maxHp,
                atk: def.attrs.atk,
                def: def.attrs.def,
                spd: def.attrs.spd,
                crit: def.attrs.crit,
                apMax: def.attrs.apMax,
                ap: 0,
                hp: def.attrs.maxHp,
                affinity: { fire: 'resist', ice: 'resist' },
                maxStagger: 40,
                skills: def.skills,
                id: def.id,
                color: def.color,
                tieId: i,
            });
            s.mesh = buildPartyMemberMesh(def.archetype, this.rng);
            s.pos = { x: -6 + i * 2.4, y: 0, z: 2 - (i % 2) };
            return s;
        });
    }

    setupEnemies(roster) {
        const list = roster || ['revenantCrawler', 'gildedPraetor', 'bossOfTheVault'];
        this.enemies = list.map((tpl, i) => {
            const e = makeEnemy(tpl, this.rng, 1);
            e.pos = { x: 5 + (i % 3) * 2.4, y: 0, z: -1 + (i % 2) * 1.6 };
            e.tieId = 100 + i;
            e.targetSeen = null;
            return e;
        });
    }

    // Full reset for restart.
    resetToStart(seed) {
        this.rng = makeRng(seed || 'clair-obscur-42');
        this.setupParty();
        this.setupEnemies();
        this.queue = buildTurnQueue([...this.party, ...this.enemies]);
        this.turnCount = 0;
        this.ulti = 0;
        this.ultiReady = false;
        this.over = false;
        this.victory = false;
        this.time = 0;
        this.freeAimActive = false;
        this.selectedFromFreeAim = null;
        // timers/state that live as class fields must be re-zeroed for a fresh run
        this._introTimer = -1;
        this._resolveAt = -1;
        this._counterAt = undefined;
        this._ultTimer = -1;
        this._pendingEndAt = -1;
        this._endShown = false;
        this._reactionResolutions.length = 0;
        this.enemyActing = null;
        this._enemyRecycle = null;
        this.menuOpen = false;
        this.reaction && this.reaction.reset();
        this._menu && this._menu.hide();
        // VICTORY -> INTRO and DEFEAT -> INTRO are the only legal exits back to INTRO;
        // on a fresh boot the machine already sits at INTRO, so skip the self-transition.
        if (this.state.phase !== BattlePhase.INTRO) this.state.transition(BattlePhase.INTRO);
        // place meshes
        for (const p of this.party) this.fx.spawnCombatant(p.mesh, p.pos, 'party');
        for (const e of this.enemies) this.fx.spawnCombatant(e.mesh, e.pos, 'enemy');
    }

    // ---- orchestration ----
    update(dt) {
        this.time += dt;
        // VICTORY/DEFEAT phases must keep running (`_updateEnded` shows the restart prompt),
        // so only stop advancing battle logic once end has been *shown*.
        if (this.over && this.state.phase !== BattlePhase.VICTORY && this.state.phase !== BattlePhase.DEFEAT) return;
        // battle feel: intensify as party HP drops
        const partyHpFrac = this.party.length
            ? this.party.reduce((s, c) => s + (c.hp / c.maxHp), 0) / this.party.length
            : 1;
        this.renderer?.updateBattleFeel(Math.max(0, 1 - partyHpFrac * 1.4));
        this.audio?.updateIntensity(Math.max(0, 1 - partyHpFrac * 1.4));
        if (partyHpFrac < 0.3) this.audio?.setLowHp(true);
        switch (this.state.phase) {
            case BattlePhase.INTRO:
                this._updateIntro(dt);
                break;
            case BattlePhase.PLAYER_TURN:
                break; // wait for menu input
            case BattlePhase.ACTION_SELECT:
                break; // free-aim handled via renderer input
            case BattlePhase.RESOLVING:
                this._updateResolving(dt);
                break;
            case BattlePhase.ENEMY_TURN:
                this._updateEnemyTurn(dt);
                break;
            case BattlePhase.REACTION:
                this._updateReaction(dt);
                break;
            case BattlePhase.COUNTER:
                this._updateCounter(dt);
                break;
            case BattlePhase.ULT:
                this._updateUlt(dt);
                break;
            case BattlePhase.VICTORY:
            case BattlePhase.DEFEAT:
                this._updateEnded(dt);
                break;
        }
    }

    // ---- intro: show title, then set first turn ----
    _introTimer = -1;
    _updateIntro(dt) {
        if (this._introTimer < 0) this._introTimer = this.time + 1.2;
        if (this.time > this._introTimer) {
            this.state.transition(BattlePhase.PLAYER_TURN);
            this.startTurn();
            this._introTimer = -1;
        }
    }

    // ---- turn progression ----
    startTurn() {
        // drop dead (or zero-HP) actors from the queue
        this.queue = this.queue.filter(a => !a.dead && a.hp > 0);

        // if no actors remain alive, end the battle
        if (!this.queue.length || (!this.party.some(c => !c.dead && c.hp > 0) || !this.enemies.some(e => !e.dead && e.hp > 0))) {
            this._checkEnd();
            return;
        }

        // reduce statuses (poison/burn/grief) at the START of each party turn
        for (const c of this.party) {
            if (c.dead) continue;
            const st = this._tickMine(c);
            if (st.damage > 0) {
                this.fx?.spawnDamageNumber(st.damage, c, { color: '#b064a0' });
            }
        }
        this.turnCount++;
        this._updateQueueDisplay();

        const head = this.queue[0];
        if (!head) { this._checkEnd(); return; }
        if (head.side === 'enemy') {
            this.state.transition(BattlePhase.ENEMY_TURN);
        } else {
            // Party turn: route through PLAYER_TURN so every phase can legally
            // reach ACTION_SELECT (e.g. REACTION -> PLAYER_TURN -> ACTION_SELECT).
            if (this.state.phase === BattlePhase.REACTION ||
                this.state.phase === BattlePhase.COUNTER ||
                this.state.phase === BattlePhase.ENEMY_TURN ||
                this.state.phase === BattlePhase.RESOLVING ||
                this.state.phase === BattlePhase.ULT) {
                this.state.transition(BattlePhase.PLAYER_TURN);
            }
            this.ui.setStatusText(`Turn ${this.turnCount} — ${head.name}'s action`);
            this.state.transition(BattlePhase.ACTION_SELECT);
            this._openMenuFor(head);
        }
    }

    _tickMine(actor) {
        const out = { damage: 0 };
        const kept = [];
        for (const st of actor.statuses) {
            st.duration -= 1;
            if (st.duration <= 0) continue;
            kept.push(st);
            if (st.type === StatusType.POISON) out.damage += Math.max(1, Math.floor(st.power * 0.015 * actor.maxHp));
            if (st.type === StatusType.BURN) out.damage += Math.max(1, Math.floor(st.power * 0.02 * actor.maxHp));
        }
        actor.statuses = kept;
        if (out.damage) actor.hp -= out.damage;
        if (actor.hp <= 0 && !actor.dead) this._onDefeated(actor);
        return out;
    }

    // ---- player action entry points (called from UI/menu) ----
    actBasic(targetId) {
        const caster = this.currentActor();
        const target = this.findActor(targetId);
        if (!caster || !target || caster.dead) return;
        this.state.transition(BattlePhase.RESOLVING);
        const res = resolveBasicAttack(caster, target, (k) => this.rng.next(k));
        this.fx.spawnDamageNumber(res.damage, target, { crit: res.crit, color: res.crit ? '#ffd06a' : '#fff' });
        this.audio.hit();
        this.fx.impact(target, 'basic');
        if (res.crit) this.audio.crit();
        const armL = caster.mesh && caster.mesh._armL;
        if (armL) armL.rotation.x = -1.2; // attack swing anim
        this._afterAction();
    }

    actSkill(skillId, targetId) {
        const caster = this.currentActor();
        const target = this.findActor(targetId);
        const skill = (caster.skills || []).find(s => s.id === skillId);
        if (!caster || !target || !skill) return;
        this.state.transition(BattlePhase.RESOLVING);
        const res = resolveSkill(caster, target, skill, (k) => this.rng.next(k));

        for (const ev of res.events || []) {
            if (ev.type === 'damage') {
                this.fx.spawnDamageNumber(ev.value, target, { crit: res.crit, color: res.crit ? '#ffd06a' : '#fff' });
                this.audio.hit();
                this.fx.impact(target, 'skill');
            } else if (ev.type === 'heal') {
                this.fx.spawnDamageNumber(ev.value, caster, { heal: true, color: '#7fe07f' });
                this.audio.crit();
            } else if (ev.type === 'buff') {
                this.ui?.pushBanner(`${caster.name}: ${skill.name}`);
                this.audio.menuConfirm();
            } else if (ev.type === 'debuff') {
                this.audio.menuConfirm();
            }
        }
        this._checkDefeated(target, caster);
        if (this.over) return;
        this._afterAction();
    }

    actFreeAim(weakHit, targetId) {
        const caster = this.currentActor();
        const target = this.findActor(targetId);
        if (!caster || !target) return;
        this.state.transition(BattlePhase.RESOLVING);
        const res = resolveRangedAttack(caster, target, weakHit, (k) => this.rng.next(k));
        this.fx.spawnDamageNumber(res.damage, target, { crit: res.crit, weak: res.weak, color: res.crit ? '#ffd06a' : '#ffd0a0' });
        if (res.weakSpotHit) {
            this.audio.weakspot();
            this.ulti = Math.min(100, this.ulti + 12);
            this._checkUltReady();
        } else {
            this.audio.hit();
        }
        this.fx.impact(target, 'shot');
        this._checkDefeated(target);
        if (this.over) return;
        this._afterAction();
    }

    // ---- enemy AI ----
    _updateEnemyTurn(dt) {
        const next = this.queue[0];
        if (!next || next.side !== 'enemy') { this.startTurn(); return; }
        // pick pattern based on template/boss phase
        this._enemyAct(next);
    }

    // Called when a player action resolves; advances the queue and starts the next segment.
    _afterAction() {
        // pop the acting party member off the queue, put back at end
        const first = this.queue.shift();
        if (first) this.queue.push(first);
        this._updateQueueDisplay();
        this.startTurn();
    }

    _enemyAct(enemy) {
        // choose target (weighted): often the lowest HP party member
        const targets = this.party.filter(c => !c.dead);
        if (!targets.length) return;
        const target = this.rng.pick('target', targets);

        const pat = this._choosePattern(enemy);
        if (!pat) { this.startTurn(); return; }

        // pop from queue — recycled at the end of the pattern
        this.queue.shift();
        this._enemyRecycle = enemy;

        // PATTERN -> telegraph -> reaction (or buff/direct)
        if (pat.type === 'buff') {
            enemy.buffs['atk-up'] = (enemy.buffs['atk-up'] || 1) * 1.25;
            this.ui.pushBanner(`${enemy.name} rallies`).then(() => {
                if (this._enemyRecycle && !this._enemyRecycle.dead && this._enemyRecycle.hp > 0) {
                    this.queue.push(this._enemyRecycle);
                }
                this._enemyRecycle = null;
                this.startTurn();
            });
            return;
        }

        // build the hit(s) sequence with timing
        const hits = this._buildHits(enemy, pat, target);
        this.enemyActing = { enemy, pat, target };

        // phase: REACTION with seeded timeline
        // t0 = now + 0.4 (telegraph begins after a short pause)
        const t0 = this.clock() + 0.4;
        // mutate hits timing: each hit's window at `end` = t0 + telegraphTime * (hitIndex+1)
        let acc = 0;
        for (let h = 0; h < hits.length; h++) {
            const teleg = pat.telegraphTime + h * 0.45; // spaced combos
            acc += teleg;
            hits[h].t_end = t0 + acc - teleg * 0.4;    // window slides with telegraph
            hits[h].t_start = hits[h].t_end - teleg;
        }
        this.reaction.beginSequence(target, hits);
        this.state.transition(BattlePhase.REACTION);
        this.audio.telegraphCue(pat.damageMult);
    }

    _choosePattern(enemy) {
        const pats = enemy.patterns || [];
        if (!pats.length) return null;

        // boss low-HP phase shifts move set / adds risk
        const hpFrac = enemy.hp / enemy.maxHp;
        let pool = pats;
        if (enemy.boss && hpFrac < 0.35) {
            // add a dangerous void cleave variant
            pool = pats.concat([{
                id: 'berserk', name: 'Berserk Collapse', element: 'void',
                type: 'cleave', damageMult: 2.2, telegraphTime: 1.2,
                window: { perfect: 0.11, loose: 0.3 }, counterable: true, unblockable: false,
            }]);
        }
        // weighted: prefer non-buff patterns
        const weighted = pool.filter(p => !p.canBuff).concat(pool.filter(p => p.canBuff).slice(0, 1));
        const chosen = this.rng.pick('pattern', weighted);
        // turn-count bias: every 3rd enemy action is a combo if available
        if (this.turnCount % 3 === 0 && chosen.type !== 'combo') {
            const combo = pool.find(p => p.type === 'combo');
            if (combo) return combo;
        }
        return chosen;
    }

    _buildHits(enemy, pat, target) {
        const count = pat.type === 'combo' ? (pat.hits || 3) : (pat.type === 'cleave' ? (pat.hits || 2) : 1);
        const hits = [];
        for (let i = 0; i < count; i++) {
            hits.push({
                pattern: pat,
                attacker: enemy,
                target,
                t_start: 0,   // filled later
                t_end: 0,
            });
        }
        return hits;
    }

    // ---- reaction phase ----
    _updateReaction(dt) {
        const now = this.clock();
        this.reaction.update(now, dt);

        if (this.enemyActing && !this.over) {
            const { enemy, pat, target } = this.enemyActing;
            // drain resolutions one-per-frame to keep pacing visible
            if (this._reactionResolutions.length) {
                const res = this._reactionResolutions.shift();
                if (res && res.result === null && res.seq === 'done') {
                    // sequence complete — resolve streaks and move on
                    this.enemyActing = null;
                    if (this.over) return;
                    // recycle the enemy back into the queue (skip if it died to a counter)
                    if (this._enemyRecycle && !this._enemyRecycle.dead && this._enemyRecycle.hp > 0) {
                        this.queue.push(this._enemyRecycle);
                    }
                    this._enemyRecycle = null;
                    if (this.reaction.streak > 0) {
                        this.state.transition(BattlePhase.COUNTER);
                        this.counterTarget = enemy;
                        this.counterBy = target;
                        this.reaction.streak = 0;
                    } else {
                        this.startTurn();
                    }
                    return;
                }
                this._applyReactionResult(res, enemy, pat, target);
            }
        }
    }

    _applyReactionResult(res, enemy, pat, target) {
        // Perfect parry / successful dodge: brief slow-mo flash.
        if (res && res.result === 'parry-perfect') {
            this.renderer?.triggerParryFlash();
            this.renderer?.setSlowmo(0.6);
            this.audio?.parry(true);
        } else if (res && res.result === 'dodge') {
            this.audio?.dodge();
        }
        // A FAIL/UNBLOCKABLE_MISSED hit lands — apply pattern damage now.
        if (res && (res.result === 'fail' || res.result === 'unblockable-missed')) {
            const hit = resolveEnemyHit(enemy, target, pat);
            this.fx.spawnDamageNumber(hit.damage, target, { color: '#e06a6a' });
            this.audio.hit();
            this.fx.impact(target, 'enemy');
            if (target.hp <= 0) this._onDefeated(target);
        }
        // if enemy got parried away / struck, maybe enemy is defeated
        if (enemy.hp <= 0 && !enemy.dead) this._onDefeated(enemy);
        if (enemy.dead || this.over) { this._checkEnd(); return; }
        // per-hit: nothing else to do — counter resolution happens on the 'done' marker
    }

    _onReactionResult(result, index) {
        // called by reaction callbacks — push into resolution queue
        this._reactionResolutions.push({ result, index });
    }

    _updateCounter(dt) {
        // brief cinematic pause, then fire counter
        if (this._counterAt === undefined) this._counterAt = this.time + 0.35;
        if (this.time < this._counterAt) return;
        this._counterAt = undefined;

        const caster = this.counterBy;
        const target = this.counterTarget;
        if (caster && target && !caster.dead) {
            const res = resolveCounter(caster, target);
            this.fx.spawnDamageNumber(res.damage, target, { crit: true, color: '#ffd06a' });
            this.audio.counterspark();
            this.fx.impact(target, 'counter');
            caster.ap = Math.min(caster.apMax, caster.ap + 1); // parry counter AP bonus
            this.ulti = Math.min(100, this.ulti + 10);
            this._checkUltReady();
        }
        if (target && target.hp <= 0) this._onDefeated(target);
        this._checkEnd();
        if (!this.over) this.startTurn();
    }

    // ---- resolving ----
    _resolveAt = -1;
    _updateResolving(dt) {
        if (this._resolveAt < 0) {
            this._checkEnd();
            this._resolveAt = this.time + 0.6;
        }
        if (this.time > this._resolveAt) {
            this._resolveAt = -1;
            if (!this.over) this.startTurn();
        }
    }

    // ---- free-aim input ----
    setFreeAim(active) {
        this.freeAimActive = active;
        this.state.transition(BattlePhase.ACTION_SELECT);
        if (active) this._menu.startFreeAim();
    }

    // Bridge methods called from game.js input handlers.
    onActionChosen(action, skillId, targetId) {
        const actor = this.currentActor();
        if (!actor) return;
        const targets = this.allTargets();
        const chosen = targetId ? this.findActor(targetId) : null;
        this.menuOpen = false;
        this._menu.hide();
        switch (action) {
            case 'attack': {
                const t = chosen || this.enemies.find(e => !e.dead && e.hp > 0) || targets[0];
                if (t) this.actBasic(t.id);
                break;
            }
            case 'skill': {
                const t = chosen || this.enemies.find(e => !e.dead && e.hp > 0) || targets[0];
                if (t && skillId) this.actSkill(skillId, t.id);
                break;
            }
            case 'freeaim':
                this.setFreeAim(true);
                break;
            case 'ult':
                this.triggerUltimate();
                break;
        }
    }

    onFreeAimCancel() {
        this.setFreeAim(false);
        this._menu.hide();
        // return to the action menu for the same actor
        this.state.transition(BattlePhase.ACTION_SELECT);
        const actor = this.currentActor();
        this._openMenuFor(actor);
    }

    onFreeAimClick() {
        const targets = this.enemies.filter(e => !e.dead);
        const act = this._menu.aimConfirm(targets);
        if (act) {
            this.actFreeAim(!!act.weak, act.targetId);
        }
    }

    allTargets() {
        return [...this.party, ...this.enemies].filter(a => !a.dead);
    }

    _openMenuFor(actor) {
        if (!actor || !this._menu) return;
        // surface battle-level ulti readiness to the menu (the menu reads actor.ultiReady)
        actor.ultiReady = this.ultiReady;
        this._menu.setTargets(this.enemies.filter(e => !e.dead));
        this._menu.openFor(actor, actor.skills || []);
        this.menuOpen = true;
    }

    // ---- ultimate ----
    _checkUltReady() {
        if (this.ulti >= 100 && !this.ultiReady) {
            this.ultiReady = true;
            this.events.emit(Evt.ULT_READY, {});
            this.ui?.pushBanner('Ultimate ready — press U');
        }
    }

    triggerUltimate() {
        if (!this.ultiReady) return;
        this.ultiReady = false;
        this.ulti = 0;
        this.state.transition(BattlePhase.ULT);
        this._ultTimer = this.time + 1.1;
        this.audio.ultimate();
        // hit all enemies hard
        const targets = this.enemies.filter(e => !e.dead);
        for (const t of targets) {
            const res = resolveCounter(this.party[0], t); // reuse counter resolver (pure)
            t.hp -= res.damage * 1.4;
            this.fx.spawnDamageNumber(Math.floor(res.damage * 1.4), t, { crit: true, color: '#ffe0a0' });
            this.fx.impact(t, 'ult');
        }
        this._checkEnd();
    }


    _updateUlt(dt) {
        if (this.time > this._ultTimer) {
            this._checkEnd();
            if (!this.over) this.startTurn();
        }
    }

    // ---- shared helpers ----
    currentActor() {
        const q = this.queue[0];
        return q && q.side === 'party' ? q : null;
    }
    nextActor() {
        const q = this.queue[0];
        return q || null;
    }
    findActor(id) {
        const all = [...this.party, ...this.enemies];
        return all.find(a => a.id === id || a === id || a.name === id) || null;
    }

    _updateQueueDisplay() {
        if (this.ui) this.ui.setTurnQueue(buildTurnQueue([...this.party, ...this.enemies]).map(a => a.name || a.id));
    }

    _onDefeated(actor) {
        if (actor.dead) return;
        actor.dead = true;
        actor.hp = 0;
        this.fx.death(actor);
        this.audio.defeat(); // brief stinger
    }

    // Mark any actor whose HP hit 0 as defeated; then evaluate end conditions.
    _checkDefeated(...actors) {
        for (const a of actors) {
            if (a && !a.dead && a.hp <= 0) this._onDefeated(a);
        }
        this._checkEnd();
    }

    _checkEnd() {
        const partyAlive = this.party.some(c => !c.dead && c.hp > 0);
        const enemiesAlive = this.enemies.some(e => !e.dead && e.hp > 0);
        if (!partyAlive && !this.over) {
            this.over = true;
            this.victory = false;
            this.state.transition(BattlePhase.DEFEAT);
            this.ui?.pushBanner('The expedition falls to the paint.');
            this.audio.defeat();
        } else if (!enemiesAlive && !this.over) {
            this.over = true;
            this.victory = true;
            this.state.transition(BattlePhase.VICTORY);
            this.audio.victory();
            this.events.emit('victory', { xp: this._xpAward(), party: this.party });
        }
    }

    _xpAward() {
        return 80 + this.turnCount * 5;
    }

    _updateEnded(dt) {
        if (this._endShown) return;
        if (this._pendingEndAt < 0) this._pendingEndAt = this.time + 2.5;
        if (this.time > this._pendingEndAt) {
            this._endShown = true;
            this.events.emit('battle-end-shown', { victory: this.victory });
            this._pendingEndAt = -1;
        }
    }

    // ---- accessibility / debug ----
    get phase() { return this.state.phase; }
    preview() { return previewActors(this.queue, 5); }
}
