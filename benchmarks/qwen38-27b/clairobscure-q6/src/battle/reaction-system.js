/**
 * battle/reaction-system.js — THE signature mechanic.
 *
 * While an enemy's turn is active, its attack is NOT auto-resolved. Each hit
 * of the pattern is scheduled on the Timeline with three absolute moments:
 *
 *   start       — wind-up / telegraph begins (enemy anim + rising cue)
 *   center      — the swing lands (impact)
 *   windowEnd   — the last legal moment to react
 *
 * The player supplies ONE input (PARRY = Space/J/K/left-click,
 * DODGE = Shift/L/right-click). The input's wall-clock (logical) timestamp is
 * judged against the window:
 *
 *   parry in [center-70ms, center+70ms]   -> PERFECT parry
 *   parry in [center-tol, center+tol]     -> clean parry
 *   dodge in [center-tol-90, center+tol+90] -> successful dodge (wider)
 *   parry just outside the parry band but inside the dodge band -> degrades to dodge
 *   anything else (or nothing)            -> the hit LANDS (damage)
 *   an input up to 240ms BEFORE windowStart -> "TOO EARLY" whiff: the hit still lands
 *   an input >240ms before                 -> ignored (press again)
 *
 * Rules layered on top:
 *   - GRAB attacks (pattern hit `grab:true`) can ONLY be dodged. A parry on a
 *     grab always fails — this is the "unblockable" tell.
 *   - FEINT hits (pattern hit `feint:true`) show a full telegraph but the
 *     swing is pulled back at impact; reacting to a feint is a wasted input
 *     (a "whiff") and the real hit follows immediately with a short wind-up.
 *     The feint's rising cue peaks a touch lower as a readable tell.
 *   - Multi-hit patterns chain: the next hit's telegraph starts `gap` ms
 *     after the previous impact, so a 3-hit combo is parry-parry-parry in
 *     rhythm. Parrying the FINAL hit of a pattern (when the pattern allows
 *     counters) triggers a counterattack (handled by battle-system, which
 *     listens for 'hit-landed' / 'attack-finished').
 *
 * Fairness: every timestamp is in logical timeline ms (wall-clock-based,
 * slow-mo safe) and windows are judged on the exact input moment, not the
 * frame it was sampled in.
 *
 * This module owns NO damage math and NO combat bookkeeping — it emits
 * events (telegraph-started, hit-landed, attack-finished, reaction-whiff)
 * and battle-system applies consequences (damage, AP, flow, counters).
 */
import { evalWindow, makeWindow } from '../core/easing.js';

// Window geometry (ms). Tuned for readable, fair human reaction.
export const PERFECT_MS = 70;        // half-width of the perfect-parry band
export const PARRY_TOL_DEFAULT = 175; // half-width of the clean-parry window
export const DODGE_EXTRA = 90;        // dodge window extends this far beyond parry
export const EARLY_WHIFF_MS = 240;    // input earlier than this before the window = whiff
export const EARLY_IGNORE_MS = 560;   // input earlier than this = ignored entirely
export const HIT_SETTLE_MS = 400;     // pause after an impact before the next hit

export class ReactionSystem {
  /**
   * @param {import('../core/input.js').Input} input
   * @param {import('../core/timeline.js').Timeline} timeline
   * @param {import('../core/events.js').EventBus} events
   */
  constructor(input, timeline, events) {
    this.input = input;
    this.tl = timeline;
    this.events = events;
    this.attack = null;
  }

  /**
   * Schedule an enemy attack on the timeline.
   *
   * @param {object} o
   * @param {object} o.attacker   enemy combatant (has .element, .atk, .def, ...)
   * @param {object} o.target     party member being attacked
   * @param {object} o.pattern    enemy attack pattern: { id, name, canCounter,
   *   hits: [{ windup, mult, stagger, grab, feint, label }] }
   * @param {number} [o.leadIn=420] ms before the first telegraph
   */
  startAttack({ attacker, target, pattern }, leadIn = 420) {
    const tol = pattern.parryTol ?? PARRY_TOL_DEFAULT;
    let t = this.tl.now() + leadIn;
    const hits = [];
    for (const h of pattern.hits) {
      const windup = h.windup;
      const start = t;
      const center = start + windup;
      const window = makeWindow(center, tol);
      const hit = {
        ...h,
        start,
        center,
        window,
        dodgeWindow: makeWindow(center, tol + DODGE_EXTRA),
        perfectMs: PERFECT_MS,
        judged: false,
        announced: false,
        impactAt: center,
        outcome: null,
        perfect: false,
        quality: null, // 'perfect' | 'good' | 'dodge' | 'early' | 'hit'
      };
      hits.push(hit);
      // Chain: next telegraph starts after this impact + rhythm gap.
      t = center + (h.gap ?? HIT_SETTLE_MS);
    }
    this.attack = { attacker, target, pattern, hits, hitIndex: 0, done: false };
    return this.attack;
  }

  get active() {
    return this.attack && !this.attack.done;
  }

  /** Current hit, if any (for prompts / animation drivers). */
  currentHit() {
    const a = this.attack;
    if (!a || a.done) return null;
    return a.hits[a.hitIndex];
  }

  /** Total hits / current index — for the combo counter UI. */
  comboInfo() {
    const a = this.attack;
    if (!a || a.done) return null;
    // Only count non-feint hits toward the visible combo.
    const real = a.hits.filter((h) => !h.feint);
    const realDone = real.filter((h) => h.judged).length;
    return { index: Math.min(realDone, real.length), total: real.length, totalRaw: a.hits.length };
  }

  /** Cancel the active attack (target died, battle ended). */
  cancel() {
    if (this.attack && !this.attack.done) {
      this.attack.done = true;
    }
    this.attack = null;
  }

  update() {
    const a = this.attack;
    if (!a || a.done) return;
    const now = this.tl.now();

    // Target died mid-combo: stop cleanly.
    if (a.target.hp <= 0 || a.target.dead) {
      a.done = true;
      this.events.emit('attack-finished', { attack: a, allParried: false, targetDead: true });
      this.attack = null;
      return;
    }

    // Advance through hits as their settle time passes.
    if (a.hitIndex >= a.hits.length) {
      a.done = true;
      const allParried = a.hits.every((h) => h.feint || h.quality === 'perfect' || h.quality === 'good' || h.quality === 'dodge');
      this.events.emit('attack-finished', { attack: a, allParried });
      this.attack = null;
      return;
    }

    const hit = a.hits[a.hitIndex];

    // 1) Announce the telegraph.
    if (!hit.announced && now >= hit.start) {
      hit.announced = true;
      this.events.emit('telegraph-started', {
        attack: a,
        hit,
        hitIndex: a.hitIndex,
        phase: {
          start: hit.start,
          windowStart: hit.window.start,
          center: hit.center,
          windowEnd: hit.window.end,
          isGrab: !!hit.grab,
          isFeint: !!hit.feint,
        },
      });
    }

    // 2) Judge fresh input.
    if (!hit.judged) {
      const ri = this.input.reactionInput();
      if (ri) {
        const judged = this._judge(hit, ri);
        if (judged) {
          hit.judged = true;
          // Impact moment: on a successful reaction the swing is deflected
          // the instant the reaction lands; otherwise it lands on schedule.
          hit.impactAt = hit.quality === 'hit' ? Math.max(hit.center, now) : Math.max(ri.t, hit.center - 40);
          this.events.emit('hit-landed', { attack: a, hit, hitIndex: a.hitIndex, target: a.target, attacker: a.attacker });
        }
      }
      // 3) Window expired with no legal reaction.
      if (!hit.judged && now >= hit.window.end) {
        hit.judged = true;
        hit.outcome = 'hit';
        hit.quality = 'hit';
        hit.impactAt = hit.center;
        this.events.emit('hit-landed', { attack: a, hit, hitIndex: a.hitIndex, target: a.target, attacker: a.attacker });
      }
    }

    // 4) Advance: the next hit is pre-scheduled, so move to it exactly when
    //    its telegraph is due (keeps the rhythm gaps exact).
    if (a.hitIndex + 1 < a.hits.length) {
      if (now >= a.hits[a.hitIndex + 1].start) {
        a.hitIndex += 1;
      }
    } else if (hit.judged && now >= Math.max(hit.impactAt, hit.center) + HIT_SETTLE_MS) {
      a.done = true;
      const allParried = a.hits.every((h) => h.feint || h.quality === 'perfect' || h.quality === 'good' || h.quality === 'dodge');
      this.events.emit('attack-finished', { attack: a, allParried });
      this.attack = null;
    }
  }

  /**
   * Judge one input against one hit. Returns true if the input was
   * consumed (window closed for this hit), false if ignored (too early).
   * Sets hit.outcome / hit.quality.
   */
  _judge(hit, ri) {
    const { action, t } = ri;
    const parryW = hit.window;
    const dodgeW = hit.dodgeWindow;

    // Far too early: ignore (the press doesn't consume the window).
    if (t < parryW.start - EARLY_IGNORE_MS) return false;

    // Inside the parry window?
    const inParry = t >= parryW.start && t <= parryW.end;
    const inDodge = t >= dodgeW.start && t <= dodgeW.end;

    // FEINT: the swing is pulled back at impact. There is nothing to deflect,
    // so any in-window reaction is a wasted "whiff" — the input is consumed
    // but grants nothing, and the real strike that follows now catches you.
    if (hit.feint) {
      if (inParry || inDodge) {
        hit.outcome = 'whiff';
        hit.quality = 'whiff';
        hit.perfect = false;
        return true;
      }
      if (t < parryW.start && t >= parryW.start - EARLY_WHIFF_MS) {
        hit.outcome = 'whiff';
        hit.quality = 'whiff';
        return true;
      }
      return false;
    }

    // GRAB attacks: only a dodge in the dodge window works.
    if (hit.grab) {
      if (action === 'dodge' && inDodge) {
        hit.outcome = 'dodged';
        hit.quality = 'dodge';
        hit.perfect = false;
        return true;
      }
      if (inParry || inDodge) {
        // Reacted to a grab with the wrong (or any) input: it lands.
        hit.outcome = 'hit';
        hit.quality = 'hit';
        return true;
      }
      if (t >= parryW.start - EARLY_WHIFF_MS && t < parryW.start) {
        hit.outcome = 'hit';
        hit.quality = 'early';
        return true;
      }
      return false;
    }

    // Normal hit.
    if (action === 'parry' && inParry) {
      const q = evalWindow(t, parryW, hit.perfectMs);
      hit.outcome = 'parried';
      hit.quality = q === 'perfect' ? 'perfect' : 'good';
      hit.perfect = q === 'perfect';
      return true;
    }
    if (action === 'dodge' && inDodge) {
      hit.outcome = 'dodged';
      hit.quality = 'dodge';
      return true;
    }
    // A parry just outside the parry band but inside the wider dodge band
    // degrades into a successful dodge.
    if (action === 'parry' && inDodge && !inParry) {
      hit.outcome = 'dodged';
      hit.quality = 'dodge';
      return true;
    }
    // Early press within the whiff band: consumed, hit lands.
    if (t < parryW.start && t >= parryW.start - EARLY_WHIFF_MS) {
      hit.outcome = 'hit';
      hit.quality = 'early';
      return true;
    }
    // Late press after the parry window but before the dodge window closes
    // and still within it counts as dodge; otherwise it is simply too late
    // to consume (the hit will land when the window expires).
    if (action === 'dodge' && t > parryW.end && t <= dodgeW.end) {
      hit.outcome = 'dodged';
      hit.quality = 'dodge';
      return true;
    }
    return false;
  }
}
