/** Difficulty director tunables. */
export interface DifficultyParams {
  min: number;
  max: number;
  comboRef: number;
  missRef: number;
  scoreRef: number;
  wAccuracy: number;
  wCombo: number;
  wReaction: number;
  wTime: number;
  wScore: number;
  wMiss: number;
  speedScale: number;
  spawnScale: number;
}

export const DIFFICULTY: DifficultyParams = {
  min: 0.1,
  max: 0.95,
  comboRef: 12,
  missRef: 20,
  scoreRef: 9000,
  wAccuracy: 0.22,
  wCombo: 0.18,
  wReaction: 0.14,
  wTime: 0.12,
  wScore: 0.12,
  wMiss: 0.22,
  speedScale: 0.7,
  spawnScale: 0.4
};
