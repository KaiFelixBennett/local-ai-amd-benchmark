import { describe, expect, it } from 'vitest';
import { ComboSystem } from '../src/game/ComboSystem';

function system(): ComboSystem {
  return new ComboSystem({ window: 2, decayPerSec: 3, minComboToKeep: 2, milestoneEvery: 5 });
}

describe('ComboSystem', () => {
  it('starts cold', () => {
    const c = system();
    expect(c.state).toEqual({ combo: 0, mult: 1, timeLeft: 0 });
  });

  it('fires milestones exactly on every 5th hit', () => {
    const c = system();
    const fired: number[] = [];
    for (let i = 1; i <= 12; i++) if (c.hit()) fired.push(i);
    expect(fired).toEqual([5, 10]);
  });

  it('refreshes the warm window on every hit', () => {
    const c = system();
    c.hit();
    c.update(1.5);
    expect(c.state.timeLeft).toBeCloseTo(0.5);
    c.hit();
    expect(c.state.timeLeft).toBe(2);
  });

  it('multiplier step curve: +0.5 per full 5 combo', () => {
    const c = system();
    for (let i = 0; i < 4; i++) c.hit();
    expect(c.mult).toBe(1);
    c.hit();
    expect(c.mult).toBe(1.5);
    for (let i = 0; i < 5; i++) c.hit();
    expect(c.mult).toBe(2);
  });

  it('a normal miss costs max(2, 40%) but never wipes a big streak', () => {
    const c = system();
    for (let i = 0; i < 10; i++) c.hit();
    c.miss();
    expect(c.state.combo).toBe(6); // penalty = max(2, ceil(10*0.4)) = 4
    c.miss();
    expect(c.state.combo).toBe(3); // penalty = max(2, ceil(6*0.4)=3) = 3
    c.miss();
    expect(c.state.combo).toBe(1); // penalty = max(2, ceil(3*0.4)=2) = 2
    c.miss(); // penalty 2 on combo 1 -> floors at 0
    expect(c.state.combo).toBe(0);
    expect(c.state.timeLeft).toBe(0);
  });

  it('a normal miss from 10 lands on 6, from small combos loses at least 2', () => {
    const c = system();
    c.hit();
    c.hit();
    c.miss(); // combo 2 -> penalty max(2, 1) = 2 -> 0
    expect(c.state.combo).toBe(0);
    expect(c.state.timeLeft).toBe(0);
  });

  it('a miss at combo 0 is a no-op', () => {
    const c = system();
    c.miss();
    expect(c.state.combo).toBe(0);
  });

  it('zen misses are gentle (15% penalty)', () => {
    const c = system();
    for (let i = 0; i < 20; i++) c.hit();
    c.miss(true);
    expect(c.state.combo).toBe(17); // 20 - ceil(3) = 17
  });

  it('idle after the window drains the combo and floors it at zero below the keep threshold', () => {
    const c = system();
    for (let i = 0; i < 3; i++) c.hit();
    c.update(2); // window expires, drained = ceil(2*3)=6 -> combo 0
    expect(c.state.combo).toBe(0);
    expect(c.state.timeLeft).toBe(0);
  });

  it('idle drain keeps combos at or above the threshold alive with a re-warm timer', () => {
    const c = new ComboSystem({ window: 1, decayPerSec: 0.4, minComboToKeep: 2, milestoneEvery: 5 });
    for (let i = 0; i < 10; i++) c.hit();
    c.update(1); // expired; drained = ceil(0.4) -> min 1 -> combo 9, timer 0.35
    expect(c.state.combo).toBe(9);
    expect(c.state.timeLeft).toBeCloseTo(0.35);
  });

  it('update while combo is 0 never revives it', () => {
    const c = system();
    c.update(5);
    expect(c.state).toEqual({ combo: 0, mult: 1, timeLeft: 0 });
  });

  it('reset clears everything', () => {
    const c = system();
    for (let i = 0; i < 7; i++) c.hit();
    c.reset();
    expect(c.state).toEqual({ combo: 0, mult: 1, timeLeft: 0 });
  });
});
