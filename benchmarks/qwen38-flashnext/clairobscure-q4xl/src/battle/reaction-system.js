import { EV } from '../core/events.js';
import { clamp } from '../core/easing.js';

// ---------------------------------------------------------------------------
// THE SIGNATURE SYSTEM — real-time parry / dodge against telegraphed attacks.
//
// Read this file top-to-bottom for the full model:
//
//  1. An enemy attack = a `pattern` (entities/enemy-data.js) = ordered list of
//     hits, each with a landing time `wind` (seconds after telegraph start),
//     a tight `parry` half-window and a wider `dodge` half-window.
//  2. Everything is timed against the shared scaled Clock (`clock.t`), so the
//     rhythm is frame-rate independent and stays honest during slow-mo/hit-stop
//     (visuals, cue bar and windows all share the same timeline).
//  3. Judging, in priority order at the moment the player presses:
//       - grab attack + parry key  -> FAIL (grabs must be dodged)
//       - |now - land| <= perfect  -> PERFECT (no dmg, +AP, +streak, counter)
//       - |now - land| <= parry    -> PARRY   (no dmg, +AP, streak, counter)
//       - |now - land| <= dodge    -> DODGE   (no dmg, no counter)
//       - otherwise                -> the press is committed EARLY and the hit
//         is marked whiffed: it will land for +10% damage. One press per hit:
//         commitment is what makes the windows meaningful.
//  4. If no valid press happens by landing time -> FAIL, the hit lands.
//  5. Feint patterns punish pressers inside their feint window by consuming the
//     press and auto-failing the first hit (you can still react to the rest).
//  6. Any PARRY/PERFECT anywhere in the combo unlocks a single counter for the
//     defender after the combo ends (battle-system runs the counter).
//
// AOE attacks use runGroupCombo: the whole party shares one landing time and
// one press per hit ("guard the line") — a save shields everyone, a fail hits
// everyone. Both variants share the same judgment code path.
// ---------------------------------------------------------------------------

export const JUDGE = {
  PERFECT: 'perfect',
  PARRY: 'parry',
  DODGE: 'dodge',
  FAIL: 'fail',
  GRAB_PARRY: 'grab-parry' // pressed parry on an unparryable grab
};

export class ReactionSystem {
  constructor(clock, bus) {
    this.clock = clock;
    this.bus = bus;
    this.streak = 0;          // consecutive parries/perfects (flow meter level)
    this.maxStreak = 0;       // best flow reached this battle
    this.active = [];         // running combo instances
    this.PERFECT_HALF = 0.06; // centred inside the parry window
  }

  resetFlow() { this.streak = 0; }

  // Run one combo sequence. hooks.onVerdict(hitIndex, verdict, hit) is called
  // at the instant of judgment so the battle layer can apply damage, AP and
  // charge immediately. Returns a promise resolving with the result:
  // { results: [judgement per hit], counter: bool }
  runCombo(defender, pattern, attacker, hooks = {}) {
    const t0 = this.clock.t;
    const hits = pattern.hits.map((h) => ({
      ...h,
      land: t0 + h.wind,
      judged: false,
      judge: null,
      press: null // {time, key}
    }));
    const combo = { defender, attacker, pattern, hits, t0, done: false, hooks, feintFired: false };
    this.active.push(combo);

    this.bus.emit(EV.TELEGRAPH, {
      defender, attacker,
      name: pattern.name, intent: pattern.intent, color: pattern.color,
      unparryable: !!pattern.unparryable, combo: hits.length,
      feint: !!pattern.feint, group: false
    });
    if (pattern.feint) combo.feint = { ...pattern.feint, a: t0 + pattern.feint.punishFrom, b: t0 + pattern.feint.punishTo, tShow: t0 + pattern.feint.t };

    return this._resolveCombo(combo);
  }

  // Group/AOE version: every living member of `defenders` shares one landing
  // time and one shared press per hit ("guard the line"). A valid save shields
  // everyone; a fail hits everyone. Hook signature same as runCombo.
  runGroupCombo(defenders, pattern, attacker, hooks = {}) {
    const t0 = this.clock.t;
    const hits = pattern.hits.map((h) => ({
      ...h,
      land: t0 + h.wind,
      judged: false,
      judge: null,
      press: null
    }));
    const combo = { defender: defenders[0], defenders, attacker, pattern, hits, t0, done: false, hooks, feintFired: false, group: true };
    this.active.push(combo);

    this.bus.emit(EV.TELEGRAPH, {
      defender: defenders[0], defenders, attacker,
      name: pattern.name, intent: pattern.intent, color: pattern.color,
      unparryable: !!pattern.unparryable, combo: hits.length,
      feint: !!pattern.feint, group: true
    });
    if (pattern.feint) combo.feint = { ...pattern.feint, a: t0 + pattern.feint.punishFrom, b: t0 + pattern.feint.punishTo, tShow: t0 + pattern.feint.t };

    return this._resolveCombo(combo);
  }

  async _resolveCombo(combo) {
    const results = [];
    let counter = false;
    for (let i = 0; i < combo.hits.length; i++) {
      const hit = combo.hits[i];
      // Wait until landing time (scaled game clock).
      while (this.clock.t < hit.land && !combo.dead) {
        await frame();
        this._checkEarlyPunish(combo, i);
      }
      if (combo.dead) break;
      const verdict = this._judge(combo, hit);
      hit.judged = true;
      hit.judge = verdict;
      results.push(verdict);
      this._applyVerdict(combo, hit, verdict, results);
      if (combo.hooks && combo.hooks.onVerdict) {
        try { combo.hooks.onVerdict(results.length - 1, verdict, hit); } catch (err) { console.error('[reaction hook]', err); }
      }
      if (verdict === JUDGE.PARRY || verdict === JUDGE.PERFECT) counter = true;
      if (combo.group) {
        if (!combo.defenders.some((d) => d.alive)) break;
      } else if (!combo.defender.alive) break;
    }
    combo.done = true;
    const out = { results, counter, resultsJudged: results.length };
    this.active = this.active.filter((c) => c !== combo);
    this.bus.emit(EV.COMBO_END, { combo, ...out });
    return out;
  }

  // A feint converts any press inside its punish window into an auto-fail of hit 1.
  _checkEarlyPunish(combo, hitIndex) {
    const f = combo.feint;
    if (!f || combo.feintFired) return;
    const now = this.clock.t;
    if (!combo.feintShow && now >= f.tShow) {
      combo.feintShow = true;
      if (combo.attacker && combo.attacker.alive) combo.attacker.beginWindup(false);
      this.bus.emit(EV.FX, { kind: 'feint', attacker: combo.attacker });
    }
  }

  _consumePunish(combo) {
    const f = combo.feint;
    if (!f || combo.feintFired) return false;
    const now = this.clock.t;
    if (now >= f.a && now <= f.b) {
      combo.feintFired = true;
      this.bus.emit(EV.FLASH, { color: 'rgba(161,45,51,0.25)', ms: 220 });
      this.bus.emit(EV.LOG, { text: `${combo.defender.name} reacts to the feint!` });
      return true;
    }
    return false;
  }

  // Called by input routing whenever the player presses during any enemy combo.
  // key: 'parry' | 'dodge'. For AOE combos pass the focused member (or null —
  // any live group combo will take the press). Returns true if consumed.
  press(defender, key) {
    if (!this.active.length) return false;
    let combo = this.active.find((c) => !c.done && !c.dead && (
      c.group ? (c.defenders.includes(defender) || !defender) : c.defender === defender
    ));
    if (!combo) combo = this.active.find((c) => !c.done && !c.dead);
    if (!combo || combo.dead) return false;
    if (!combo.group && !combo.defender.alive) return false;
    const now = this.clock.t;

    if (this._consumePunish(combo)) {
      // mark next unjudged hit as feint-punished (auto fail)
      const nxt = combo.hits.find((h) => !h.judged && !h.press);
      if (nxt) nxt.feintPunished = true;
      return true;
    }

    const hit = combo.hits.find((h) => !h.judged);
    if (!hit) return false;
    if (hit.press) return false; // already committed (early whiff) — one shot per hit

    const dpar = Math.abs(now - hit.land);
    const ddodge = Math.abs(now - hit.land);
    if (dpar <= hit.parry + 0.02 && key === 'parry' && !combo.pattern.unparryable) {
      hit.press = { time: now, key };
      return true;
    }
    if (ddodge <= hit.dodge + 0.02) {
      hit.press = { time: now, key };
      return true;
    }
    // Parry attempt on a grab outside window — still just whiffed.
    hit.press = { time: now, key, whiffedEarly: true };
    this.bus.emit(EV.FX, { kind: 'whiff', defender, t: now });
    return true;
  }

  _judge(combo, hit) {
    if (hit.feintPunished) return JUDGE.FAIL;
    const p = hit.press;
    if (!p) return JUDGE.FAIL;
    if (p.whiffedEarly) return JUDGE.FAIL;
    const dt = Math.abs(p.time - hit.land);
    if (combo.pattern.unparryable) {
      // grabs: only a DODGE key in window saves you — and pressing parry
      // inside the dodge window still whiffs the grab (the intent matters).
      if (p.key === 'parry') return dt <= hit.dodge + 0.02 ? JUDGE.GRAB_PARRY : JUDGE.FAIL;
      if (dt <= hit.dodge + 0.02) return JUDGE.DODGE;
      return JUDGE.FAIL;
    }
    if (p.key === 'parry') {
      if (dt <= this.PERFECT_HALF && dt <= hit.parry) return JUDGE.PERFECT;
      if (dt <= hit.parry + 0.02) return JUDGE.PARRY;
      if (dt <= hit.dodge + 0.02) return JUDGE.DODGE;
      return JUDGE.FAIL;
    }
    // dodge key
    if (dt <= hit.dodge + 0.02) return JUDGE.DODGE;
    return JUDGE.FAIL;
  }

  _applyVerdict(combo, hit, verdict, results) {
    const d = combo.defender;
    const b = this.bus;
    const land = Math.max(0, this.clock.t - hit.land);
    switch (verdict) {
      case JUDGE.PERFECT:
        this.streak += 1;
        this.maxStreak = Math.max(this.maxStreak, this.streak);
        d.flashGuard(); d.setPose('guard', 0.5);
        this.clock.hitstop(0.055);
        b.emit(EV.PERFECT, { defender: d, attacker: combo.attacker, hitIndex: results.length - 1 });
        break;
      case JUDGE.PARRY:
        this.streak += 1;
        this.maxStreak = Math.max(this.maxStreak, this.streak);
        d.flashGuard(); d.setPose('guard', 0.45);
        b.emit(EV.PARRY, { defender: d, attacker: combo.attacker });
        break;
      case JUDGE.DODGE:
        d.setPose('dodge', 0.45);
        b.emit(EV.DODGE, { defender: d, attacker: combo.attacker });
        break;
      case JUDGE.GRAB_PARRY:
        b.emit(EV.LOG, { text: 'Grabs must be DODGED — parry will not save you!' });
        this.streak = 0;
        d.setPose('hit', 0.34); d.flashHit();
        b.emit(EV.FAIL, { defender: d });
        break;
      default: // FAIL
        this.streak = 0;
        d.setPose('hit', 0.34); d.flashHit();
        b.emit(EV.FAIL, { defender: d });
    }
    b.emit(EV.REACT_HIT, { defender: d, attacker: combo.attacker, verdict, hitTime: hit.land, land, hitIndex: results.length - 1 });
  }

  // Kill a defender mid-combo so it stops reacting.
  invalidate(defender) {
    for (const c of this.active) if (c.defender === defender) c.dead = true;
  }

  get inReaction() { return this.active.length > 0; }
}

// One animation frame, as a promise.
function frame() {
  return new Promise((res) => requestAnimationFrame(() => res()));
}
