/** Global game-feel tuning in one place (view layer reads only these). */

export const BALANCE = {
  /** story phases for a finite round: name key + relative weight */
  phases: [
    'phase.warmup',
    'phase.buildup',
    'phase.mid',
    'phase.rest',
    'phase.climax',
    'phase.finale',
  ] as const,
  hitstop: { normalMs: 26, perfectMs: 46, bossMs: 70 },
  screenshake: { fire: 2.4, hit: 1.2, perfect: 3.2, thunder: 7, chain: 5, bossHit: 3.6 },
  recoil: 14,
  decoyPenalty: 450,
  comboMilestonePopups: [5, 10, 15, 25] as const,
  eventBannerSec: 2.6,
  phaseBannerSec: 2.4,
  /** Endless mode: raise scheduled phase every N seconds */
  endlessPhaseEvery: 80,
  /** grace: shots this many px over target still count as edge hit */
  pelletSpread: 26,
  envRespawnSec: 9,
  chainWindowSec: 7,
  swarmGroupWindowSec: 3,
  bossIntroSec: 2.2,
} as const;
