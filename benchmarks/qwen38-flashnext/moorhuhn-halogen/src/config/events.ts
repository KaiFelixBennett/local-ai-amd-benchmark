import type { EventDef } from './schema';

/** Dynamic round events. Activated by the Round Director. */
export const EVENTS: EventDef[] = [
  {
    id: 'nebel',
    durationSec: 14,
    fog: 0.8,
    spawnRateMult: 0.85,
    scoreMult: 1.4,
    weight: 1,
    allowedMaps: ['nebelmoor', 'mondbruch'],
    minPhase: 'ramp',
  },
  {
    id: 'wind',
    durationSec: 16,
    wind: 0.75,
    speedMult: 1.25,
    scoreMult: 1.2,
    weight: 1.1,
    allowedMaps: ['sturmklippen', 'nebelmoor'],
    minPhase: 'ramp',
  },
  {
    id: 'gewitter',
    durationSec: 18,
    darkness: 0.35,
    wind: 0.55,
    spawnRateMult: 1.15,
    speedMult: 1.15,
    scoreMult: 2,
    weatherOnly: true,
    weight: 0.8,
    allowedMaps: ['sturmklippen', 'nebelmoor'],
    minPhase: 'mid',
  },
  {
    id: 'goldener_schwarm',
    durationSec: 12,
    spawnRateMult: 2.2,
    scoreMult: 1.5,
    golden: true,
    weight: 0.7,
    minPhase: 'mid',
  },
  {
    id: 'vollmond',
    durationSec: 20,
    darkness: 0.45,
    scoreMult: 1.6,
    allowedMaps: ['mondbruch'],
    weight: 1.2,
    minPhase: 'mid',
  },
  {
    id: 'massenstart',
    durationSec: 10,
    spawnRateMult: 3,
    scoreMult: 1.3,
    weight: 1,
    minPhase: 'intense',
  },
  {
    id: 'ballons',
    durationSec: 14,
    spawnRateMult: 0.6,
    scoreMult: 1.25,
    weight: 0.8,
    minPhase: 'rest',
  },
  {
    id: 'regenfront',
    durationSec: 15,
    darkness: 0.25,
    wind: 0.4,
    spawnRateMult: 0.9,
    scoreMult: 1.3,
    weatherOnly: true,
    weight: 0.9,
    allowedMaps: ['sturmklippen', 'nebelmoor'],
    minPhase: 'mid',
  },
  {
    id: 'froschkonzert',
    durationSec: 12,
    spawnRateMult: 1.4,
    scoreMult: 1.15,
    weight: 0.8,
    allowedMaps: ['nebelmoor', 'mondbruch'],
    minPhase: 'ramp',
  },
  {
    id: 'gluehwuermchen',
    durationSec: 16,
    darkness: 0.5,
    scoreMult: 1.35,
    allowedMaps: ['mondbruch'],
    weight: 1.1,
    minPhase: 'mid',
  },
  {
    id: 'zeitriss',
    durationSec: 8,
    timeScale: 0.55,
    scoreMult: 2.5,
    weight: 0.5,
    minPhase: 'intense',
  },
  {
    id: 'boss',
    durationSec: 34,
    spawnRateMult: 0.25,
    scoreMult: 1,
    weight: 1,
    minPhase: 'mid',
  },
  {
    id: 'featherstorm',
    durationSec: 16,
    spawnRateMult: 4,
    speedMult: 1.4,
    scoreMult: 1.8,
    weight: 1,
    minPhase: 'finale',
  },
];

const eventById = new Map(EVENTS.map((e) => [e.id, e]));

export function getEventDef(id: string): EventDef {
  const def = eventById.get(id);
  if (!def) throw new Error(`Unknown event id: ${id}`);
  return def;
}

/** Events that count as "weather" (needed by weather-only targets like Sturmvogel). */
export const WEATHER_EVENT_IDS = EVENTS.filter((e) => e.weatherOnly).map((e) => e.id);
