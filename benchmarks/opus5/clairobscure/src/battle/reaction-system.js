/**
 * THE REACTIVE DEFENCE LAYER — the mechanic this whole game is built around.
 *
 * ── Timing model ───────────────────────────────────────────────────────────
 * Every enemy hit has three instants on a single wall-clock timeline:
 *
 *   telegraphAt ......... wind-up begins; the ring appears and starts closing
 *   cueAt ............... the ring closes onto the marker. THE reference beat.
 *   contactAt ........... cueAt + RESOLVE_DELAY; the weapon connects and the
 *                         hit resolves. Always later than every input window,
 *                         so a hit is never resolved while an input could still
 *                         legally arrive.
 *
 * Input windows are centred on `cueAt` and are asymmetric — humans reliably
 * press slightly early, so the early side is wider:
 *
 *   PARRY  [cue - 0.130s, cue + 0.110s]   240ms
 *   DODGE  [cue - 0.220s, cue + 0.150s]   370ms   (strictly contains parry)
 *
 * A parry negates all damage, grants AP, builds flow and queues a counter.
 * A dodge negates damage only. A mistimed press whiffs and locks input out for
 * LOCKOUT seconds, so mashing both keys is strictly worse than reading the cue.
 * "Grab" hits are unblockable: a parry attempt on one always whiffs.
 *
 * ── Fairness ───────────────────────────────────────────────────────────────
 * The clock is advanced from real elapsed time (never frame counts), capped per
 * frame so a hitch cannot skip a window, and offset when the tab is hidden.
 * Slow-motion scales the clock so the reward is real extra reaction time.
 *
 * This module deliberately knows nothing about THREE, the DOM, or damage math.
 */

import { EV } from '../core/events.js';
import { clamp01, invLerp, windowQuality, gradeFor } from '../core/easing.js';

/** Base window half-widths in seconds, before difficulty scaling. */
export const WINDOWS = {
  PARRY_EARLY: 0.130,
  PARRY_LATE: 0.110,
  DODGE_EARLY: 0.220,
  DODGE_LATE: 0.150,
};

/**
 * Minimum gap between the timing cue and the moment the hit resolves. The
 * effective gap is always at least the widest input window plus a margin, so a
 * legal press can never arrive after its hit has already been decided — see
 * `setDifficulty`, which widens this on the easier settings.
 */
export const RESOLVE_DELAY = 0.16;

/** Base input lockout after a whiffed reaction; escalates while mashing. */
export const LOCKOUT = 0.26;
export const LOCKOUT_MAX = 0.85;
export const LOCKOUT_ESCALATION = 0.7;

/**
 * How far from the cue (in multiples of the dodge window) a whiffed press still
 * counts as a commitment that forfeits the hit. Presses well before this are
 * treated as nerves rather than a decision and only cost a short lockout.
 */
export const COMMIT_ZONE = 1.8;

/** How much of the timeline the on-screen timing bar shows. */
export const BAR_PRE = 0.62;
export const BAR_POST = 0.26;

/** Largest per-frame clock advance; guards against tab hitches. */
const MAX_STEP = 0.1;

export const DIFFICULTY = {
  story: { label: 'LUMINA', scale: 1.45 },
  expedition: { label: 'EXPEDITION', scale: 1.0 },
  requiem: { label: 'REQUIEM', scale: 0.76 },
};

/**
 * Non-linear mapping from raw wind-up progress to displayed ring progress.
 * The ring always reaches 1.0 exactly at `cueAt`, so reading the ring is always
 * correct — but a feint stalls it, punishing players who guess from rhythm.
 */
export function telegraphCurve(u, curve) {
  const x = clamp01(u);
  switch (curve) {
    case 'feint': {
      if (x < 0.5) return (x / 0.5) * 0.7;
      if (x < 0.76) return 0.7;               // the stall — hold your nerve
      return 0.7 + ((x - 0.76) / 0.24) * 0.3;
    }
    case 'accel':
      return Math.pow(x, 1.75);               // heavy, slow lift then a drop
    case 'decel':
      return Math.pow(x, 0.6);                // fast snap then a drift in
    case 'double': {
      if (x < 0.4) return (x / 0.4) * 0.55;
      if (x < 0.58) return 0.55 - ((x - 0.4) / 0.18) * 0.16;  // fake retreat
      return 0.39 + ((x - 0.58) / 0.42) * 0.61;
    }
    default:
      return x;
  }
}

export class ReactionSystem {
  /**
   * @param {import('../core/events.js').EventBus} bus
   * @param {keyof typeof DIFFICULTY} difficulty
   */
  constructor(bus, difficulty = 'expedition') {
    this.bus = bus;
    this.setDifficulty(difficulty);

    this.active = false;
    this.t = 0;
    this.sequence = null;
    this.hits = [];
    this.cursorIndex = 0;
    this.lockoutUntil = -1;
    this.lockoutSpan = LOCKOUT;
    this.whiffStreak = 0;
    this.armed = null;           // successful input awaiting its contact frame
    this.lastResult = null;      // for UI feedback text
    this.lastResultAt = -10;
    this.flow = 0;
    this.bestFlow = 0;
    this.counters = [];
    this.timeScale = 1;

    /** Injected by the battle system so hits on a fallen ally can be redirected. */
    this.retarget = null;
  }

  setDifficulty(key) {
    this.difficulty = DIFFICULTY[key] ? key : 'expedition';
    const s = DIFFICULTY[this.difficulty].scale;
    this.win = {
      parryEarly: WINDOWS.PARRY_EARLY * s,
      parryLate: WINDOWS.PARRY_LATE * s,
      dodgeEarly: WINDOWS.DODGE_EARLY * s,
      dodgeLate: WINDOWS.DODGE_LATE * s,
    };
    // Easier settings widen the late windows; the contact must move with them,
    // otherwise a still-legal press would land after the hit had been decided.
    this.resolveDelay = Math.max(RESOLVE_DELAY, this.win.parryLate, this.win.dodgeLate) + 0.02;
  }

  // -------------------------------------------------------------------------
  // Sequence lifecycle
  // -------------------------------------------------------------------------

  /**
   * Schedule an attack.
   * @param {{attacker:object, name:string, hits:Array}} sequence
   *   Each raw hit: { target, damage, element, kind:'parry'|'grab',
   *                   windup:number, gap:number, curve:string, splash:number,
   *                   status:object|null, drain:number }
   */
  begin(sequence) {
    this.active = true;
    this.t = 0;
    this.cursorIndex = 0;
    this.lockoutUntil = -1;
    this.lockoutSpan = LOCKOUT;
    this.whiffStreak = 0;
    this.armed = null;
    this.counters = [];
    this.sequence = sequence;

    let clock = 0.35; // brief beat so the player registers who is acting
    this.hits = sequence.hits.map((raw, i) => {
      const windup = Math.max(0.32, raw.windup);
      const telegraphAt = clock + (raw.gap || 0);
      const cueAt = telegraphAt + windup;
      clock = cueAt + this.resolveDelay;
      return {
        index: i,
        raw,
        target: raw.target,
        move: raw.move || null,
        element: raw.element || 'physical',
        kind: raw.kind || 'parry',
        curve: raw.curve || 'linear',
        splash: raw.splash || 0,
        status: raw.status || null,
        drain: raw.drain || 0,
        windup,
        telegraphAt,
        cueAt,
        contactAt: cueAt + this.resolveDelay,
        announced: false,
        resolved: false,
        outcome: null,      // 'parry' | 'dodge' | 'hit'
        quality: 0,
        attempts: 0,
        committed: false,   // a mistimed press near the beat spends the hit
      };
    });
    this.endsAt = clock + 0.42;
    this.bus.emit(EV.HIT_INCOMING, { attacker: sequence.attacker, name: sequence.name, hits: this.hits.length });
  }

  abort() {
    if (!this.active) return;
    this.active = false;
    this.sequence = null;
    this.hits = [];
    this.armed = null;
  }

  // -------------------------------------------------------------------------
  // Per-frame advance
  // -------------------------------------------------------------------------

  /**
   * @param {number} rawDt real elapsed seconds. Capped at MAX_STEP, which also
   *        makes a backgrounded tab safe: the clock simply stops advancing
   *        instead of skipping every pending window at once on return.
   */
  update(rawDt) {
    if (!this.active) return;
    this.t += Math.min(rawDt, MAX_STEP) * this.timeScale;

    for (let i = 0; i < this.hits.length; i++) {
      const hit = this.hits[i];
      if (!hit.announced && this.t >= hit.telegraphAt) {
        hit.announced = true;
        this.cursorIndex = i;
        this._resolveDeadTarget(hit);
        this.bus.emit(EV.TELEGRAPH_START, {
          hit, attacker: this.sequence.attacker, name: this.sequence.name,
          index: i, count: this.hits.length,
        });
      }
      if (hit.announced && !hit.resolved && this.t >= hit.contactAt) {
        this._resolve(hit);
      }
    }

    if (this.t >= this.endsAt) this._finish();
  }

  /** If the intended target fell earlier in this same combo, pick a new one. */
  _resolveDeadTarget(hit) {
    if (hit.target && hit.target.alive) return;
    const sub = this.retarget ? this.retarget(hit) : null;
    if (sub) hit.target = sub;
  }

  _resolve(hit) {
    hit.resolved = true;
    const armed = this.armed && this.armed.hitIndex === hit.index ? this.armed : null;
    this.armed = null;
    // Mash punishment is per-hit: the streak clears once a hit is decided.
    this.whiffStreak = 0;

    if (armed && armed.type === 'parry') {
      hit.outcome = 'parry';
      hit.quality = armed.quality;
      this.flow++;
      this.bestFlow = Math.max(this.bestFlow, this.flow);
      this.counters.push({ defender: hit.target, quality: armed.quality, hitIndex: hit.index });
      this._flag('PARRY', gradeFor(armed.quality));
      this.bus.emit(EV.PARRY_PERFECT, {
        hit, defender: hit.target, attacker: this.sequence.attacker,
        quality: armed.quality, flow: this.flow,
      });
      this.bus.emit(EV.FLOW_CHANGED, { flow: this.flow });
      return;
    }

    if (armed && armed.type === 'dodge') {
      hit.outcome = 'dodge';
      hit.quality = armed.quality;
      this._flag('DODGE', gradeFor(armed.quality));
      this.bus.emit(EV.DODGE_SUCCESS, {
        hit, defender: hit.target, attacker: this.sequence.attacker, quality: armed.quality,
      });
      return;
    }

    hit.outcome = 'hit';
    if (this.flow > 0) {
      this.flow = 0;
      this.bus.emit(EV.FLOW_CHANGED, { flow: 0 });
    }
    this._flag('HIT', '');
    this.bus.emit(EV.HIT_LANDED, {
      hit, defender: hit.target, attacker: this.sequence.attacker,
      move: hit.move, element: hit.element, splash: hit.splash,
      status: hit.status, drain: hit.drain,
    });
  }

  _finish() {
    const total = this.hits.length;
    const parried = this.hits.filter((h) => h.outcome === 'parry').length;
    const dodged = this.hits.filter((h) => h.outcome === 'dodge').length;
    const clean = parried === total && total > 0;
    const summary = {
      attacker: this.sequence.attacker,
      name: this.sequence.name,
      total, parried, dodged, clean,
      counters: this.counters.slice(),
      flow: this.flow,
    };
    this.active = false;
    this.sequence = null;
    this.bus.emit(EV.COMBO_COMPLETE, summary);
  }

  // -------------------------------------------------------------------------
  // Player input
  // -------------------------------------------------------------------------

  /**
   * @param {'parry'|'dodge'} type
   * @returns {'armed'|'whiff'|'locked'|'ignored'}
   */
  input(type) {
    if (!this.active) return 'ignored';
    if (this.t < this.lockoutUntil) return 'locked';
    if (this.armed) return 'ignored';       // already committed for this hit

    const hit = this._pendingHit();
    if (!hit) {
      this._whiff(null, type, 'early');
      return 'whiff';
    }
    // A mistimed press made near the beat is a commitment: this hit is spent.
    if (hit.committed) return 'locked';

    hit.attempts++;
    const delta = this.t - hit.cueAt;

    if (type === 'parry' && hit.kind === 'grab') {
      this._whiff(hit, type, 'unblockable');
      return 'whiff';
    }

    const early = type === 'parry' ? this.win.parryEarly : this.win.dodgeEarly;
    const late = type === 'parry' ? this.win.parryLate : this.win.dodgeLate;
    const quality = windowQuality(delta, early, late);

    if (quality <= 0) {
      this._whiff(hit, type, delta < 0 ? 'early' : 'late');
      return 'whiff';
    }

    this.armed = { hitIndex: hit.index, type, quality, at: this.t };
    this.whiffStreak = 0;
    this.bus.emit(EV.TELEGRAPH_TICK, {
      phase: 'armed', type, quality, hit, defender: hit.target,
      grade: gradeFor(quality),
    });
    return 'armed';
  }

  _whiff(hit, type, reason) {
    // Two layers of mash punishment:
    //  1. a whiff thrown near the beat commits the character — that hit is lost;
    //  2. whiffs far from the beat merely lock input out, for longer each time.
    this.whiffStreak++;
    if (hit && Math.abs(this.t - hit.cueAt) <= this.win.dodgeEarly * COMMIT_ZONE) {
      hit.committed = true;
    }
    this.lockoutSpan = Math.min(
      LOCKOUT_MAX,
      LOCKOUT * (1 + LOCKOUT_ESCALATION * (this.whiffStreak - 1)),
    );
    this.lockoutUntil = this.t + this.lockoutSpan;
    if (this.flow > 0) {
      this.flow = 0;
      this.bus.emit(EV.FLOW_CHANGED, { flow: 0 });
    }
    this._flag(reason === 'unblockable' ? 'UNBLOCKABLE' : 'MISS', '');
    this.bus.emit(EV.REACTION_WHIFF, { hit, type, reason, defender: hit ? hit.target : null });
  }

  _flag(text, grade) {
    this.lastResult = { text, grade };
    this.lastResultAt = this.t;
  }

  /** The hit currently accepting input: announced, unresolved, nearest in time. */
  _pendingHit() {
    for (let i = 0; i < this.hits.length; i++) {
      const h = this.hits[i];
      if (h.resolved) continue;
      if (this.t >= h.telegraphAt - 0.02) return h;
      // Not yet telegraphed: allow input only if it is within the dodge window,
      // which can only happen for absurdly short wind-ups.
      if (h.cueAt - this.t <= this.win.dodgeEarly) return h;
      return null;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Read-only view for the HUD
  // -------------------------------------------------------------------------

  /** Everything `prompts.js` needs to draw the reaction UI, or null when idle. */
  getPrompt() {
    if (!this.active) return null;
    const hit = this._displayHit();
    if (!hit) return null;

    const u = clamp01(invLerp(hit.telegraphAt, hit.cueAt, this.t));
    const early = hit.kind === 'grab' ? this.win.dodgeEarly : this.win.parryEarly;
    const late = hit.kind === 'grab' ? this.win.dodgeLate : this.win.parryLate;
    const span = BAR_PRE + BAR_POST;
    const toBar = (tt) => clamp01((tt - (hit.cueAt - BAR_PRE)) / span);

    return {
      attackName: this.sequence.name,
      attacker: this.sequence.attacker,
      target: hit.target,
      kind: hit.kind,
      hitIndex: hit.index,
      hitCount: this.hits.length,
      ringProgress: telegraphCurve(u, hit.curve),
      timeToCue: hit.cueAt - this.t,
      cursor: toBar(this.t),
      parryZone: [toBar(hit.cueAt - this.win.parryEarly), toBar(hit.cueAt + this.win.parryLate)],
      dodgeZone: [toBar(hit.cueAt - this.win.dodgeEarly), toBar(hit.cueAt + this.win.dodgeLate)],
      centre: toBar(hit.cueAt),
      idealZone: [toBar(hit.cueAt - early), toBar(hit.cueAt + late)],
      lockedOut: this.t < this.lockoutUntil || hit.committed,
      lockoutFrac: hit.committed ? 1 : clamp01((this.lockoutUntil - this.t) / this.lockoutSpan),
      committed: hit.committed,
      armed: this.armed ? this.armed.type : null,
      armedGrade: this.armed ? gradeFor(this.armed.quality) : null,
      resolved: hit.resolved,
      outcome: hit.outcome,
      flow: this.flow,
      result: this.lastResult,
      resultAge: this.t - this.lastResultAt,
      visible: this.t >= hit.telegraphAt - 0.05,
    };
  }

  /** Prefer the unresolved hit; briefly keep showing the last one afterwards. */
  _displayHit() {
    for (const h of this.hits) {
      if (!h.resolved && h.announced) return h;
    }
    for (const h of this.hits) {
      if (!h.resolved) return h;
    }
    const last = this.hits[this.hits.length - 1];
    return last && this.t - last.contactAt < 0.5 ? last : null;
  }

  /** All hits whose telegraph is live, for placing ground rings in the world. */
  liveTelegraphs() {
    const out = [];
    if (!this.active) return out;
    for (const h of this.hits) {
      if (h.resolved || !h.announced) continue;
      const u = clamp01(invLerp(h.telegraphAt, h.cueAt, this.t));
      out.push({
        hit: h,
        target: h.target,
        progress: telegraphCurve(u, h.curve),
        kind: h.kind,
        armed: this.armed && this.armed.hitIndex === h.index ? this.armed.type : null,
      });
    }
    return out;
  }

  /**
   * Normalised swing progress for the attacker's strike animation.
   * 0 while winding up, 1 at contact — so the enemy's weapon meets the target
   * exactly when the hit resolves.
   */
  attackerSwing() {
    if (!this.active) return null;
    for (const h of this.hits) {
      if (h.resolved) continue;
      if (this.t < h.telegraphAt) continue;
      return {
        windup: clamp01(invLerp(h.telegraphAt, h.cueAt, this.t)),
        strike: clamp01(invLerp(h.cueAt, h.contactAt, this.t)),
        curve: h.curve,
        kind: h.kind,
        target: h.target,
      };
    }
    return null;
  }
}
