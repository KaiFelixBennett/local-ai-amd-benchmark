import type { TargetDef } from './schema';

/**
 * All target definitions. Everything about a target (points, hitbox, trajectory
 * menu, spawn weights per map, flags) is data-driven from here.
 */
export const TARGETS: TargetDef[] = [
  {
    id: 'moorflatterer',
    basePoints: 100,
    hp: 1,
    speed: [140, 230],
    rx: 52,
    ry: 34,
    perfectRatio: 0.45,
    weights: { any: 1.0 },
    allowedTrajectories: ['line', 'bezier', 'sine', 'zigzag', 'hover'],
    depthRange: [0.75, 1.25],
  },
  {
    id: 'schnellfeder',
    basePoints: 250,
    hp: 1,
    speed: [380, 520],
    rx: 26,
    ry: 20,
    perfectRatio: 0.5,
    weights: { any: 0.55 },
    allowedTrajectories: ['zigzag', 'line', 'bezier', 'flee'],
    depthRange: [0.7, 1.1],
  },
  {
    id: 'korkenzieher',
    basePoints: 180,
    hp: 1,
    speed: [200, 300],
    rx: 42,
    ry: 28,
    perfectRatio: 0.42,
    weights: { any: 0.6 },
    allowedTrajectories: ['sine', 'spiral', 'bezier', 'line'],
    depthRange: [0.8, 1.2],
  },
  {
    id: 'panzerpelz',
    basePoints: 150,
    hp: 3,
    armor: 3,
    speed: [90, 150],
    rx: 58,
    ry: 40,
    perfectRatio: 0.5,
    weights: { any: 0.35 },
    allowedTrajectories: ['line', 'sine', 'hover', 'bezier'],
    depthRange: [0.9, 1.35],
  },
  {
    id: 'goldschnabel',
    basePoints: 1000,
    hp: 1,
    speed: [260, 380],
    rx: 44,
    ry: 30,
    perfectRatio: 0.4,
    weights: { any: 0.05 },
    allowedTrajectories: ['bezier', 'line', 'sine', 'flee'],
    depthRange: [0.8, 1.15],
    rare: true,
  },
  {
    id: 'nebelfluesterer',
    basePoints: 350,
    hp: 1,
    speed: [160, 260],
    rx: 46,
    ry: 32,
    perfectRatio: 0.45,
    weights: { nebelmoor: 0.5, mondbruch: 0.45, sturmklippen: 0.15 },
    allowedTrajectories: ['sine', 'bezier', 'hover', 'line'],
    depthRange: [0.65, 1.05],
    flags: { fogHidden: true },
  },
  {
    id: 'taeuscher',
    basePoints: 500,
    hp: 1,
    speed: [180, 260],
    rx: 46,
    ry: 32,
    perfectRatio: 0.45,
    weights: { any: 0.16 },
    allowedTrajectories: ['line', 'bezier', 'hover'],
    depthRange: [0.85, 1.2],
    // Deceptive: looks like a golden prize but breaks combo / triggers a gag.
    flags: { deceptive: true },
  },
  {
    id: 'schwarmvogel',
    basePoints: 120,
    hp: 1,
    speed: [220, 320],
    rx: 24,
    ry: 18,
    perfectRatio: 0.5,
    weights: { any: 0.3 },
    allowedTrajectories: ['formation', 'line', 'bezier'],
    depthRange: [0.8, 1.1],
    flags: { swarm: { min: 4, max: 8, bonusWindowSec: 3.5, bonus: 600 } },
  },
  {
    id: 'kurvensegler',
    basePoints: 200,
    hp: 1,
    speed: [180, 280],
    rx: 46,
    ry: 30,
    perfectRatio: 0.45,
    weights: { any: 0.35 },
    allowedTrajectories: ['depth', 'bezier', 'line'],
    depthRange: [0.4, 1.6],
    depthScoring: true,
  },
  {
    id: 'sturmvogel',
    basePoints: 300,
    hp: 1,
    speed: [300, 460],
    rx: 44,
    ry: 28,
    perfectRatio: 0.45,
    weights: { sturmklippen: 0.7, nebelmoor: 0.35, mondbruch: 0.2 },
    allowedTrajectories: ['line', 'bezier', 'zigzag', 'dive'],
    depthRange: [0.7, 1.2],
    flags: { weatherOnly: true },
  },
  /* ---- Map-exclusive variants ---- */
  {
    id: 'schilfgeist',
    basePoints: 420,
    hp: 1,
    speed: [240, 340],
    rx: 38,
    ry: 26,
    perfectRatio: 0.42,
    weights: { nebelmoor: 0.22 },
    allowedTrajectories: ['dive', 'bezier', 'flee'],
    depthRange: [0.6, 1.1],
    phases: ['mid', 'intense', 'finale'],
  },
  {
    id: 'wellenreiter',
    basePoints: 380,
    hp: 1,
    speed: [420, 560],
    rx: 30,
    ry: 22,
    perfectRatio: 0.45,
    weights: { sturmklippen: 0.4 },
    allowedTrajectories: ['sine', 'zigzag', 'bezier'],
    depthRange: [0.6, 1.3],
    depthScoring: true,
    phases: ['ramp', 'mid', 'intense', 'finale'],
  },
  {
    id: 'mondglider',
    basePoints: 520,
    hp: 1,
    speed: [150, 240],
    rx: 48,
    ry: 32,
    perfectRatio: 0.4,
    weights: { mondbruch: 0.35 },
    allowedTrajectories: ['hover', 'sine', 'bezier', 'depth'],
    depthRange: [0.5, 1.4],
    depthScoring: true,
    rare: true,
  },
];

const byId = new Map(TARGETS.map((t) => [t.id, t]));

export function getTargetDef(id: string): TargetDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown target id: ${id}`);
  return def;
}

export const TARGET_IDS = TARGETS.map((t) => t.id);

/** Boss definitions (kept separate — spawned only by the event/boss system). */
export interface BossDef {
  id: string;
  name: string;
  hp: number;
  armorPhases: number; // number of armor layers before the core is hittable
  points: number;
  size: number; // base radius
  speed: [number, number];
  /** phase durations in seconds */
  phaseTimes: number[];
  minPhase: 'mid' | 'intense' | 'finale';
  allowedMaps: ('nebelmoor' | 'sturmklippen' | 'mondbruch')[];
  weight: number;
  behavior: 'armored' | 'acrobat' | 'phantom';
}

export const BOSSES: BossDef[] = [
  {
    id: 'boss_eisenmoor',
    name: 'Eisenmoor',
    hp: 12,
    armorPhases: 2,
    points: 5000,
    size: 150,
    speed: [110, 170],
    phaseTimes: [10, 10, 8],
    minPhase: 'mid',
    allowedMaps: ['nebelmoor', 'sturmklippen'],
    weight: 1,
    behavior: 'armored',
  },
  {
    id: 'boss_blitzschnabel',
    name: 'Blitzschnabel',
    hp: 9,
    armorPhases: 1,
    points: 6500,
    size: 110,
    speed: [520, 700],
    phaseTimes: [8, 8, 7],
    minPhase: 'intense',
    allowedMaps: ['nebelmoor', 'sturmklippen', 'mondbruch'],
    weight: 1,
    behavior: 'acrobat',
  },
  {
    id: 'boss_nachtschatten',
    name: 'Nachtschatten',
    hp: 10,
    armorPhases: 2,
    points: 7500,
    size: 130,
    speed: [200, 320],
    phaseTimes: [9, 9, 8],
    minPhase: 'finale',
    allowedMaps: ['mondbruch', 'nebelmoor'],
    weight: 1,
    behavior: 'phantom',
  },
];

const bossById = new Map(BOSSES.map((b) => [b.id, b]));

export function getBossDef(id: string): BossDef {
  const def = bossById.get(id);
  if (!def) throw new Error(`Unknown boss id: ${id}`);
  return def;
}
