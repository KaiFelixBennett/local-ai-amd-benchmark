/**
 * battle/battle-system.js — Top-level combat state machine.
 *
 * Owns the turn queue, delegates reactive defense to ReactionSystem, expands
 * actions into presentable steps (entities/skill.js), drives the enemy AI,
 * and books the economy: AP, Lumina (ultimate), flow, stagger, XP/levels.
 *
 * States (explicit, no scattered booleans):
 *
 *   loadout   -> intro -> turn-start -> menu-open  (party actor)
 *                              |-> turn-skip       (stunned)
 *                              |-> action-anim     (enemy AI / player step playback)
 *                              |-> enemy-attack    (ReactionSystem live)
 *   menu-open -> aim-mode    (ranged free-aim)
 *   action-anim / enemy-aim -> resolve-end -> turn-end -> turn-start
 *   any       -> victory | defeat (terminal)
 *
 * The class is engine-agnostic: it holds no THREE objects. It talks to the
 * rest of the game through `events` and a `presentation` field that fx/ui
 * read each frame: { step, start, dur, index, total } while a step plays.
 *
 * Timeline contract: all scheduling goes through `timeline.absIn()`.
 */
import { TurnQueue } from './turn-queue.js';
import {
  computeHit,
  addStagger,
  tickStatuses,
  hasStatus,
  AP_BUILD_ON_BASIC,
  AP_BUILD_ON_PARRY,
  AP_BUILD_ON_PERFECT_PARRY,
  AP_BUILD_ON_WEAKPOINT,
  ULT_MAX,
  ULT_ON_PERFECT_PARRY,
  ULT_ON_PARRY,
  ULT_ON_WEAKPOINT,
  ULT_ON_CRIT,
} from './action-resolver.js';
import { executeSkill } from '../entities/skill.js';
import { clamp } from '../core/rng.js';

const STEP_DUR = { hit: 640, multi: 500, heal: 720, status: 560, shield: 560, death: 1250, note: 340 };
const TURN_TICK_MS = 420;
const TURN_END_MS = 520;
const INTRO_MS = 1500;

export class BattleSystem {
  /**
   * @param {object} ctx { rng, events, timeline, reaction, party, enemies, audio }
   */
  constructor(ctx) {
    this.rng = ctx.rng;
    this.events = ctx.events;
    this.tl = ctx.timeline;
    this.reaction = ctx.reaction;
    this.audio = ctx.audio;
    this.party = ctx.party;
    this.enemies = ctx.enemies;
    this.queue = new TurnQueue();
    this.state = 'loadout';
    this.pictos = {};

    this.ultimate = 0;
    this.flow = 0;
    this.maxFlow = 5;
    this.roundStart = this.tl.now();
    this._stepStart = 0;
    this._steps = [];
    this._stepIndex = 0;
    this.pendingCounter = null;
    this._turnActor = null;
    this._nextAt = 0;
    this.victory = false;
    this.defeat = false;
    this._endAt = 0;
    this.aimTarget = null;
    this._bindEvents();
  }

  get combatants() {
    return [...this.party, ...this.enemies];
  }

  get partyAlive() {
    return this.party.filter((c) => c.hp > 0);
  }

  get enemiesAlive() {
    return this.enemies.filter((c) => c.hp > 0);
  }

  _bindEvents() {
    // Bind the prototype methods to this instance (do NOT assign arrow
    // functions that call `this._onHitLanded` — that shadows the method
    // with a self-recursive closure and blows the call stack).
    this._onHitLanded = this._onHitLanded.bind(this);
    this._onAttackFinished = this._onAttackFinished.bind(this);
    this.events.on('hit-landed', this._onHitLanded);
    this.events.on('attack-finished', this._onAttackFinished);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Begin the encounter from the loadout screen. */
  begin(pictos = {}) {
    this.pictos = pictos;
    this._applyPictos();
    this.state = 'intro';
    this._nextAt = this.tl.absIn(INTRO_MS);
    this.events.emit('battle-started', { party: this.party, enemies: this.enemies });
  }

  /** Player chose an action from the menu. */
  playerChoose(choice) {
    if (this.state !== 'menu-open') return;
    const actor = this.queue.current;
    if (!actor || !actor.isParty) return;

    if (choice.type === 'aim') {
      this.state = 'aim-mode';
      this.events.emit('aim-mode', { active: true });
      return;
    }
    if (choice.type === 'ultimate') {
      if (this.ultimateReady) this._playUltimate(actor);
      return;
    }
    if (choice.type === 'item') {
      this._applyItem(actor, choice.item);
      return;
    }
    if (choice.type === 'basic') {
      this.state = 'action-anim';
      this._playSteps(actor, actor.basic, choice.target ? [choice.target] : []);
      return;
    }
    // Skill: resolve against the chosen target(s).
    const skill = choice.skill;
    if (!skill) return;
    if (skill.apCost > actor.ap) return;
    this.state = 'action-anim';
    this._playSteps(actor, skill, this._candidatesFor(skill, choice.target));
  }

  /** Candidate list per targeting mode (the menu pre-picks single targets). */
  _candidatesFor(skill, chosen) {
    if (skill.targets === 'enemies') return this.enemiesAlive;
    if (skill.targets === 'party' || skill.type === 'buff') return this.partyAlive;
    return chosen ? [chosen] : [];
  }

  /** Aim-mode confirmation (from targeting.confirm()). */
  aimConfirm(result) {
    if (this.state !== 'aim-mode') return;
    const actor = this.queue.current;
    const { enemy, weak, weakPoint } = result;
    this.state = 'action-anim';
    this.events.emit('aim-mode', { active: false });
    if (weak) {
      this._addLumina(ULT_ON_WEAKPOINT);
      this._addAp(actor, AP_BUILD_ON_WEAKPOINT);
      this.events.emit('weak-point-hit', { enemy, weakPoint, actor });
    }
    // Ranged shot: precision mult, +15% when the weak point is pierced.
    const skill = { ...actor.basic, mult: actor.basic.mult * (weak ? 1.35 : 1.05), stagger: (actor.basic.stagger || 20) + (weak ? 18 : 0) };
    if (weak) this.events.emit('aim-hit', { enemy, actor });
    this._playSteps(actor, skill, [enemy], { ranged: true });
  }

  aimCancel() {
    if (this.state !== 'aim-mode') return;
    this.state = 'menu-open';
    this.events.emit('aim-mode', { active: false });
    // Re-open the turn menu (aim is chosen from it, and it was closed).
    if (this._turnActor && this._turnActor.isParty) {
      this.events.emit('menu-opened', { actor: this._turnActor });
    }
  }

  restart() {
    this.events.clear();
    this._bindEvents();
  }

  // ------------------------------------------------------------------
  // Pictos (equippable passive modifiers)
  // ------------------------------------------------------------------

  _applyPictos() {
    for (const c of this.party) {
      if (this.pictos.gold) { c.atk = Math.round(c.atk * 1.15); c.maxAtk = c.atk; }
      if (this.pictos.teal) { c.maxHp = Math.round(c.maxHp * 1.18); c.hp = c.maxHp; }
      if (this.pictos.bone) { c.ap = Math.min(c.maxAp, c.ap + 1); }
    }
  }

  /** Encounter supplies: Elixir heals 40% max HP, Focus Draught grants +2 AP. */
  _applyItem(actor, itemId) {
    if (!actor || actor.hp <= 0) return;
    if (itemId === 'elixir') {
      const amount = Math.max(1, Math.round(actor.maxHp * 0.4));
      actor.hp = Math.min(actor.maxHp, actor.hp + amount);
      this._steps = [{ kind: 'heal', target: actor, amount, hpAfter: actor.hp }];
      this._stepIndex = 0;
      this.state = 'action-anim';
      this._playStep({});
      return;
    }
    if (itemId === 'focus') {
      this._addAp(actor, 2);
      this.events.emit('ap-changed', { character: actor, ap: actor.ap, maxAp: actor.maxAp });
    }
    this._finishAction();
  }

  // ------------------------------------------------------------------
  // Per-frame update — the state machine
  // ------------------------------------------------------------------

  update() {
    const now = this.tl.now();
    switch (this.state) {
      case 'intro':
        if (now >= this._nextAt) this._beginTurnPhase();
        break;
      case 'turn-start':
        if (now >= this._nextAt) this._resolveTurnStart();
        break;
      case 'menu-open':
      case 'aim-mode':
        // waiting for player input
        break;
      case 'action-anim':
        this._advancePresentation(now);
        break;
      case 'enemy-attack':
        this.reaction.update();
        break;
      case 'turn-end':
        if (now >= this._nextAt) this._advanceTurn();
        break;
      case 'victory':
      case 'defeat':
        break;
      default:
        break;
    }
  }

  _beginTurnPhase() {
    if (this.queue.empty || !this.queue.current) {
      // Round complete: tick is per-turn, so just rebuild.
      this.queue.build(this.combatants);
      if (this.queue.empty) { this._checkEnd(); return; }
    }
    this._turnActor = this.queue.current;
    this.state = 'turn-start';
    this._nextAt = this.tl.absIn(TURN_TICK_MS);
    this.events.emit('turn-started', { actor: this._turnActor, round: this.queue.roundNumber });
    if (this.audio) this.audio.turnTick();
  }

  _resolveTurnStart() {
    const actor = this._turnActor;
    // Status ticks at the owner's turn start.
    if (actor && actor.hp > 0) {
      const ticks = tickStatuses(actor);
      for (const t of ticks) {
        if (t.damage > 0) this.events.emit('status-ticked', { character: actor, status: t.id, damage: t.damage });
        this.events.emit('hp-changed', { character: actor, hp: actor.hp, maxHp: actor.maxHp, source: t.id });
      }
      if (actor.hp <= 0) {
        actor.dead = true;
        this.events.emit('character-dead', { character: actor });
        this.queue.remove(actor);
        this._checkEnd();
        if (this.victory || this.defeat) return; // a DoT kill ends the battle
        this.state = 'turn-end';
        this._nextAt = this.tl.absIn(900);
        return;
      }
    }
    if (hasStatus(actor, 'stun')) {
      actor.statuses.delete('stun');
      this.events.emit('turn-skipped', { actor, reason: 'stun' });
      this.state = 'turn-end';
      this._nextAt = this.tl.absIn(900);
      return;
    }
    if (actor.isParty) {
      this.state = 'menu-open';
      this.events.emit('menu-opened', { actor });
    } else {
      this._enemyChooseAttack(actor);
    }
  }

  _advanceTurn() {
    const next = this.queue.advance();
    if (!next) {
      // Round over: refresh order (speed may have changed) and continue.
      this.queue.build(this.combatants);
      if (this.queue.empty) { this._checkEnd(); return; }
    }
    this._beginTurnPhase();
  }

  // ------------------------------------------------------------------
  // Enemy AI
  // ------------------------------------------------------------------

  _enemyChooseAttack(enemy) {
    // Staggered enemies: extra wind-up (readable), reduced damage.
    const staggered = enemy.staggered;
    const table = (enemy.staggered ? (enemy.patternsStaggered || enemy.patterns) : enemy.patterns) || [];
    if (!table.length) return;
    // rng.weighted expects [{value, weight}] and returns the value.
    const pattern = this.rng.weighted(table.map((p) => ({ value: p, weight: p.weight ?? 1 })));
    // Target selection.
    let target = enemy.aiTarget ? enemy.aiTarget(pattern, this) : this._pickEnemyTarget(enemy, pattern);
    if (!target || target.hp <= 0) target = this.partyAlive[0];
    if (!target) return;

    this._turnActor = enemy;
    this.state = 'enemy-attack';
    this.events.emit('enemy-attacking', { enemy, target, pattern });
    const leadIn = staggered ? 760 : 520;
    this.reaction.startAttack({ attacker: enemy, target, pattern }, leadIn);
  }

  _pickEnemyTarget(enemy, pattern) {
    const alive = this.partyAlive;
    if (!alive.length) return null;
    if (pattern && pattern.id && pattern.id.includes('grab')) {
      // Grab the least shielded, front-row first.
      return alive.reduce((a, b) => ((a.shield || 0) <= (b.shield || 0) && a.row === 'front') ? a : b, alive[0]);
    }
    // Prefer low-HP front-row for heavy hits; random otherwise.
    if (pattern && pattern.heavy) {
      const front = alive.filter((c) => c.row === 'front');
      const pool = front.length ? front : alive;
      return pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
    }
    return this.rng.pick(alive);
  }

  /** Enemy hit landed (from ReactionSystem): apply damage / reward. */
  _onHitLanded({ attack, hit, target, attacker }) {
    const q = hit.quality;
    if (q === 'perfect' || q === 'good' || q === 'dodge') {
      this._onCleanReaction(attack, hit, target, attacker);
      return;
    }
    if (q === 'whiff' || hit.feint) {
      // Feint: the swing was pulled back at impact (whether the player
      // reacted and wasted the input, or let the window lapse). No damage —
      // the real strike that follows is what actually lands.
      return;
    }
    // The hit connects.
    const mult = hit.mult * (attacker.staggered ? 0.7 : 1);
    const res = computeHit(attacker, target, { mult, rng: this.rng });
    this._applyDamage(target, res, { source: attacker, canShield: true });
    this.flow = 0;
    this.events.emit('flow-changed', { amount: this.flow });
    this.events.emit('hit-resolved', { source: attacker, target, damage: res.damage, outcome: 'hit', comboIndex: attack.hits.indexOf(hit), crit: res.crit, weakness: res.weakness });
  }

  _onCleanReaction(attack, hit, target, attacker) {
    const perfect = hit.quality === 'perfect';
    const dodged = hit.quality === 'dodge';
    this.flow = Math.min(this.maxFlow, this.flow + 1);
    const flowBonus = this.flow >= 3;
    const apGain = (perfect ? AP_BUILD_ON_PERFECT_PARRY : AP_BUILD_ON_PARRY) + (flowBonus ? 1 : 0);
    this._addAp(target, apGain);
    this._addLumina(perfect ? ULT_ON_PERFECT_PARRY : ULT_ON_PARRY);
    if (perfect && this.flow >= this.maxFlow) this._addLumina(6);
    this.events.emit('flow-changed', { amount: this.flow });
    this.events.emit('parry-success', {
      target, attacker,
      perfect, dodged,
      comboIndex: attack.hits.filter((h) => !h.feint).findIndex((h) => h === hit),
      isLast: attack.hits[attack.hitIndex + 1] ? false : true,
      quality: hit.quality,
    });
    if (this.audio) this.audio.parry(perfect);
    // Stagger the attacker a bit for a clean combo parry (defensive pressure).
    if (!dodged) addStagger(attacker, perfect ? 24 : 12);
  }

  _onAttackFinished({ attack, allParried, targetDead }) {
    if (this.state !== 'enemy-attack') return;
    const { attacker, target } = attack;
    if (attacker.staggered) attacker.staggered = false; // window ends with its turn
    if (allParried && !targetDead && attack.pattern.canCounter && target.hp > 0) {
      this.pendingCounter = { source: target, target: attacker };
    }
    this.state = 'turn-end';
    this._nextAt = this.tl.absIn(640);
  }

  // ------------------------------------------------------------------
  // Step playback (player actions)
  // ------------------------------------------------------------------

  _playSteps(actor, skill, targets, opts = {}) {
    if (skill.apCost > 0) {
      // AP already validated; executeSkill deducts.
    } else if (skill.id && skill.id.endsWith('_basic')) {
      this._addAp(actor, AP_BUILD_ON_BASIC);
    }
    const steps = executeSkill(actor, skill, targets, { rng: this.rng });
    // Basic attacks also trickle Lumina a little.
    if (skill.apCost === 0) this._addLumina(2);
    this._steps = steps;
    this._stepIndex = 0;
    this.state = 'action-anim';
    this._playStep(opts);
  }

  _playStep(opts = {}) {
    const step = this._steps[this._stepIndex];
    if (!step) { this._finishAction(); return; }
    let dur = STEP_DUR[step.kind] ?? 500;
    if (step.kind === 'hit' && step.hitIndex != null) dur = STEP_DUR.multi;
    // Ultimate hits resolve damage the moment their step plays (the numbers
    // and flash track the animation), not on a separate impact call.
    if (step.kind === 'hit' && step.ultimate && step.hpAfter == null) {
      this._applyDamage(step.target, { damage: step.damage, crit: step.crit, weakness: step.weakness }, { source: step.member, canShield: true });
      step.hpAfter = step.target.hp;
    } else {
      // Player skill/basic steps applied damage when executeSkill ran; emit
      // the bookkeeping events the UI and end-checks depend on. (Ultimate
      // steps already went through _applyDamage above.)
      this._bookkeepStep(step);
    }
    this._stepStart = this.tl.now();
    this.presentation = {
      step, start: this._stepStart, dur,
      index: this._stepIndex, total: this._steps.length,
      actor: this._turnActor, opts,
    };
    this._nextAt = this.tl.absIn(dur + (opts.ranged ? 120 : 0));
    this.events.emit('presentation-started', { step, start: this._stepStart, dur });
    this._cueForStep(step);
  }

  /**
   * Bookkeeping for steps whose damage was already applied by executeSkill
   * (player skills / basics): HP change events, status applications, deaths
   * (queue removal + enemy XP) and the win/lose check. Ultimate steps skip
   * this — they route through _applyDamage, which already does all of it.
   */
  _bookkeepStep(step) {
    switch (step.kind) {
      case 'hit': {
        this.events.emit('hp-changed', { character: step.target, hp: step.target.hp, maxHp: step.target.maxHp, source: this._turnActor });
        if (step.weakness) this.events.emit('weakness-hit', { target: step.target, source: this._turnActor });
        if (step.crit && this._turnActor && this._turnActor.isParty) this._addLumina(ULT_ON_CRIT);
        if (step.target.hp <= 0 && !step.target.dead) {
          step.target.dead = true;
          this.events.emit('character-dead', { character: step.target });
          this.queue.remove(step.target);
          if (step.target.isEnemy) this._awardXp(step.target);
        }
        break;
      }
      case 'heal':
        this.events.emit('hp-changed', { character: step.target, hp: step.target.hp, maxHp: step.target.maxHp, source: this._turnActor });
        break;
      case 'status':
        this.events.emit('status-changed', { character: step.target, id: step.id, stacks: step.stacks });
        break;
      case 'shield':
        this.events.emit('hp-changed', { character: step.target, hp: step.target.hp, maxHp: step.target.maxHp, source: this._turnActor });
        break;
      case 'death':
        if (!step.target.dead) step.target.dead = true;
        this.events.emit('character-dead', { character: step.target });
        this.queue.remove(step.target);
        if (step.target.isEnemy) this._awardXp(step.target);
        break;
      default:
        break;
    }
    this._checkEnd();
  }

  _cueForStep(step) {
    if (!this.audio) return;
    switch (step.kind) {
      case 'hit': this.audio.hit({ crit: step.crit, weakness: step.weakness }); break;
      case 'heal': this.audio.heal(); break;
      case 'shield': this.audio.buff(); break;
      case 'status':
        if (['burn', 'poison', 'atkDown', 'defDown', 'stun'].includes(step.id)) this.audio.debuff();
        else this.audio.buff();
        break;
      default: break;
    }
  }

  _advancePresentation(now) {
    if (now < this._nextAt) return;
    this._stepIndex += 1;
    if (this._stepIndex >= this._steps.length) {
      this._finishAction();
    } else {
      this._playStep(this.presentation ? this.presentation.opts : {});
    }
  }

  _finishAction() {
    this.presentation = null;
    // Counter queued from a fully-parried enemy attack fires now.
    if (this.pendingCounter) {
      const c = this.pendingCounter;
      this.pendingCounter = null;
      this._playCounter(c);
      return;
    }
    this._checkEnd();
    if (this.victory || this.defeat) return;
    this.state = 'turn-end';
    this._nextAt = this.tl.absIn(TURN_END_MS);
  }

  _playCounter({ source, target }) {
    const res = computeHit(source, target, { mult: 1.25, rng: this.rng });
    this._steps = [{ kind: 'hit', target, damage: res.damage, crit: res.crit, weakness: res.weakness, resisted: res.resisted, hpAfter: null, staggered: false, counter: true }];
    this._stepIndex = 0;
    this._turnActor = source;
    this.state = 'action-anim';
    this.events.emit('counter-fired', { source, target });
    if (this.audio) this.audio.counter();
    this._applyDamage(target, res, { source, canShield: true, counter: true });
    this._stepStart = this.tl.now();
    this.presentation = { step: this._steps[0], start: this._stepStart, dur: 760, index: 0, total: 1, actor: source, opts: { counter: true } };
    this._nextAt = this.tl.absIn(760);
    this.events.emit('presentation-started', { step: this._steps[0], start: this._stepStart, dur: 760 });
  }

  // ------------------------------------------------------------------
  // Damage / healing bookkeeping
  // ------------------------------------------------------------------

  _applyDamage(target, res, { source, canShield = true, counter = false } = {}) {
    let dmg = res.damage;
    if (canShield && target.shield > 0) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed;
      dmg -= absorbed;
    }
    target.hp = Math.max(0, target.hp - dmg);
    this.events.emit('hp-changed', { character: target, hp: target.hp, maxHp: target.maxHp, source });
    if (res.weakness) this.events.emit('weakness-hit', { target, source });
    if (res.crit) this._addLumina(ULT_ON_CRIT * (source.isParty ? 1 : 0));
    if (target.hp <= 0 && !target.dead) {
      target.dead = true;
      this.events.emit('character-dead', { character: target });
      this.queue.remove(target);
      if (target.isEnemy) this._awardXp(target);
    }
    this._checkEnd();
  }

  _checkEnd() {
    if (this.victory || this.defeat) return;
    if (this.enemiesAlive.length === 0) {
      this.victory = true;
      this.state = 'victory';
      this._endAt = this.tl.absIn(1600);
      this.events.emit('battle-won');
      if (this.audio) this.audio.victory();
    } else if (this.partyAlive.length === 0) {
      this.defeat = true;
      this.state = 'defeat';
      this._endAt = this.tl.absIn(1600);
      this.events.emit('battle-lost');
      if (this.audio) this.audio.defeat();
    }
  }

  // ------------------------------------------------------------------
  // Ultimate (Lumina)
  // ------------------------------------------------------------------

  get ultimateReady() {
    return this.ultimate >= ULT_MAX;
  }

  _addLumina(n) {
    if (n === 0) return;
    this.ultimate = clamp(this.ultimate + n, 0, ULT_MAX);
    this.events.emit('ultimate-changed', { amount: this.ultimate, max: ULT_MAX });
  }

  _addAp(char, n) {
    char.ap = clamp(char.ap + n, 0, char.maxAp);
    this.events.emit('ap-changed', { character: char, ap: char.ap, maxAp: char.maxAp });
  }

  _playUltimate(actor) {
    this.ultimate = 0;
    this.events.emit('ultimate-changed', { amount: 0, max: ULT_MAX });
    this.events.emit('ultimate-cast', { actor });
    if (this.audio) this.audio.ultimateRiser();
    this.state = 'action-anim';
    this._turnActor = actor;
    this._steps = [];
    this._stepIndex = 0;
    // Each living party member lands a combined blow on a live enemy.
    const caster = this.partyAlive[0] || actor;
    const targets = this.enemiesAlive;
    const order = this.rng.sample(targets, Math.min(2, targets.length));
    const targetsToHit = order.length ? order : targets.slice(0, 1);
    for (const member of this.partyAlive) {
      for (const t of targetsToHit) {
        const res = computeHit(member, t, { mult: 2.2, rng: this.rng, canCrit: true });
        this._steps.push({ kind: 'hit', target: t, damage: res.damage, crit: res.crit, weakness: res.weakness, resisted: res.resisted, hpAfter: null, staggered: false, ultimate: true, member });
      }
    }
    this._steps.push({ kind: 'note', text: 'Lumina unleashed' });
    this._playStep({ ultimate: true });
    // The big boom lands shortly after the first strike's animation.
    this._ultimateBoomAt = this.tl.absIn(700);
  }

  /** Per-frame: fire the impact boom once, when the ultimate strike lands. */
  maybeUltimateBoom() {
    if (this._ultimateBoomAt != null && this.tl.now() >= this._ultimateBoomAt) {
      this._ultimateBoomAt = null;
      if (this.audio) this.audio.ultimateImpact();
    }
  }

  // ------------------------------------------------------------------
  // XP / leveling
  // ------------------------------------------------------------------

  _awardXp(enemy) {
    const share = Math.round(enemy.xp / Math.max(1, this.partyAlive.length));
    for (const c of this.partyAlive) {
      c.xp += share;
      let leveled = false;
      while (c.xp >= c.xpNext && c.level < 20) {
        c.xp -= c.xpNext;
        c.level += 1;
        c.xpNext = Math.round(c.xpNext * 1.35);
        c.maxHp = Math.round(c.maxHp * 1.12);
        c.hp = c.maxHp;
        c.atk = Math.round(c.atk * 1.1);
        c.def = Math.round(c.def * 1.08);
        leveled = true;
      }
      if (leveled) this.events.emit('level-up', { character: c, level: c.level });
      // Unlock level-gated skills
      for (const sk of c.skillList) {
        if (sk.unlockLevel && sk.unlockLevel <= c.level && !c.unlockedSkills.includes(sk.id)) {
          c.unlockedSkills.push(sk.id);
          this.events.emit('skill-unlocked', { character: c, skillId: sk.id });
        }
      }
    }
  }
}
