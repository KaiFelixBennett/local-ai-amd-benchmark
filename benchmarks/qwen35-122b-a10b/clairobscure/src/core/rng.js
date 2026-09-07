// Seedable PCG (Permuted Congruential Generator) RNG for reproducible combat
export class RNG {
  constructor(seed = 12345) {
    this.state = seed || 1;
    this.inc = ((this.state << 1) | 1) >>> 0;
    this._next();
  }

  _next() {
    const oldState = this.state;
    // Use multiplication with proper type handling
    this.state = ((oldState * 6364136223846793005) + this.inc) >>> 0;
    return oldState;
  }

  // Returns a number between 0 and 1
  next() {
    const oldState = this._next();
    const xorshifted = (((oldState >>> 18) ^ oldState) >>> 27) >>> 0;
    const rot = (oldState >>> 59) & 31;
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) / 0x100000000;
  }

  // Integer in [min, max] inclusive
  range(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Choose random element from array
  choice(arr) {
    return arr[this.range(0, arr.length - 1)];
  }

  // Boolean with probability p (0-1)
  chance(p) {
    return this.next() < p;
  }

  // Float in [min, max]
  float(min, max) {
    return this.next() * (max - min) + min;
  }

  // Shuffle array in place (Fisher-Yates)
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.range(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Clone RNG state for reproducibility
  clone() {
    const rng = new RNG();
    rng.state = this.state;
    rng.inc = this.inc;
    return rng;
  }
}

// Global RNG instance for combat
const combatRNG = new RNG(Date.now());
export function getCombatRNG() { return combatRNG; }
export function setCombatSeed(seed) { Object.assign(combatRNG, new RNG(seed)); }
