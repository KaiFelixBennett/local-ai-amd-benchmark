/** Central, tunable scoring balance values. */

export interface ScoreParams {
  /** px/s used to normalize the speed bonus */
  speedRef: number;
  speedMaxFactor: number;
  speedPointScale: number;
  /** scale for front/back depth bonus */
  depthPointScale: number;
  /** reference radius for small-target bonus */
  sizeRef: number;
  sizePointScale: number;
  /** max points for a dead-center precision hit */
  precisionPointScale: number;
  /** flat bonus for a Perfect Hit */
  perfectBonus: number;
  /** per-combo multiplier increment */
  comboStep: number;
  comboMax: number;
  /** consecutive hits needed to unlock streak bonus */
  streakThreshold: number;
  streakBonus: number;
  /** flat bonus for hitting a swarm member */
  swarmBonus: number;
  /** per-extra-kill multikill bonus */
  multikillBonus: number;
  longshotBonus: number;
  trickBonus: number;
}

export const SCORE_PARAMS: ScoreParams = {
  speedRef: 220,
  speedMaxFactor: 2,
  speedPointScale: 40,
  depthPointScale: 30,
  sizeRef: 34,
  sizePointScale: 45,
  precisionPointScale: 35,
  perfectBonus: 60,
  comboStep: 0.12,
  comboMax: 5,
  streakThreshold: 5,
  streakBonus: 40,
  swarmBonus: 30,
  multikillBonus: 45,
  longshotBonus: 50,
  trickBonus: 80
};
