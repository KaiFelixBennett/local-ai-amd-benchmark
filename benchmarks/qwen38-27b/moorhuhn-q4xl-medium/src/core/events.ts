/**
 * Dynamic round events. Each event changes gameplay, colors, weather and/or
 * flight behavior while active, and is announced via a HUD banner.
 * Pure data — the scene applies the visual/mechanical effects.
 */

export interface EventEffect {
  /** score multiplier while active (>=1) */
  multiplier: number;
  /** global speed multiplier applied to targets */
  speed: number;
  /** spawn interval multiplier (lower = faster) */
  spawn: number;
  /** visual overlay tint + opacity */
  tint: string;
  tintOpacity: number;
  /** weather override */
  weather: 'none' | 'mist' | 'rain' | 'fog' | 'stars' | 'lightning';
  /** time scale (1 = normal, <1 = slow-motion) */
  timeScale: number;
  /** which target kinds get a spawn boost */
  boost: string[];
  /** special particles */
  particle: 'none' | 'feather' | 'rain' | 'spark' | 'lightning' | 'firefly' | 'gold';
  /** banner key */
  bannerKey: string;
}

export interface EventDef {
  id: string;
  /** duration range ms */
  duration: [number, number];
  /** minimum phase (0..1) at which it may trigger */
  minPhase: number;
  /** weight */
  weight: number;
  /** maps it can occur on (empty = all) */
  maps: string[];
  effect: EventEffect;
}

export const EVENTS: Record<string, EventDef> = {
  mist: {
    id: 'mist',
    duration: [8000, 12000],
    minPhase: 0.2,
    weight: 5,
    maps: [],
    effect: {
      multiplier: 1.3,
      speed: 1,
      spawn: 1,
      tint: '#cfd6df',
      tintOpacity: 0.28,
      weather: 'fog',
      timeScale: 1,
      boost: ['nebelfluesterer'],
      particle: 'none',
      bannerKey: 'event.mist'
    }
  },
  wind: {
    id: 'wind',
    duration: [7000, 10000],
    minPhase: 0.25,
    weight: 4,
    maps: [],
    effect: {
      multiplier: 1.2,
      speed: 1.25,
      spawn: 0.9,
      tint: '#bcd0e0',
      tintOpacity: 0.12,
      weather: 'rain',
      timeScale: 1,
      boost: ['sturmvogel', 'schnellfeder'],
      particle: 'rain',
      bannerKey: 'event.wind'
    }
  },
  storm: {
    id: 'storm',
    duration: [9000, 13000],
    minPhase: 0.4,
    weight: 3,
    maps: ['sturmklippen'],
    effect: {
      multiplier: 1.5,
      speed: 1.3,
      spawn: 0.85,
      tint: '#20283a',
      tintOpacity: 0.4,
      weather: 'lightning',
      timeScale: 1,
      boost: ['sturmvogel'],
      particle: 'lightning',
      bannerKey: 'event.storm'
    }
  },
  goldenswarm: {
    id: 'goldenswarm',
    duration: [6000, 9000],
    minPhase: 0.5,
    weight: 4,
    maps: [],
    effect: {
      multiplier: 1.8,
      speed: 1.1,
      spawn: 0.8,
      tint: '#ffcf4a',
      tintOpacity: 0.18,
      weather: 'none',
      timeScale: 1,
      boost: ['goldschnabel', 'schwarmvogel'],
      particle: 'gold',
      bannerKey: 'event.goldenswarm'
    }
  },
  fullmoon: {
    id: 'fullmoon',
    duration: [10000, 14000],
    minPhase: 0.3,
    weight: 3,
    maps: ['mondbruch'],
    effect: {
      multiplier: 1.4,
      speed: 1,
      spawn: 1,
      tint: '#8fb0ff',
      tintOpacity: 0.2,
      weather: 'stars',
      timeScale: 1,
      boost: ['nebelfluesterer', 'boss_nacht'],
      particle: 'firefly',
      bannerKey: 'event.fullmoon'
    }
  },
  masslaunch: {
    id: 'masslaunch',
    duration: [6000, 9000],
    minPhase: 0.3,
    weight: 4,
    maps: [],
    effect: {
      multiplier: 1.2,
      speed: 1.1,
      spawn: 0.5,
      tint: '#7a9a5a',
      tintOpacity: 0.1,
      weather: 'none',
      timeScale: 1,
      boost: ['moorflatterer', 'schwarmvogel'],
      particle: 'feather',
      bannerKey: 'event.masslaunch'
    }
  },
  balloon: {
    id: 'balloon',
    duration: [7000, 10000],
    minPhase: 0.2,
    weight: 4,
    maps: [],
    effect: {
      multiplier: 1.2,
      speed: 1,
      spawn: 0.95,
      tint: '#ff8fb0',
      tintOpacity: 0.1,
      weather: 'none',
      timeScale: 1,
      boost: ['goldschnabel'],
      particle: 'spark',
      bannerKey: 'event.balloon'
    }
  },
  frogs: {
    id: 'frogs',
    duration: [6000, 9000],
    minPhase: 0.25,
    weight: 3,
    maps: ['nebelmoor'],
    effect: {
      multiplier: 1.1,
      speed: 0.95,
      spawn: 1,
      tint: '#5a8a5a',
      tintOpacity: 0.1,
      weather: 'none',
      timeScale: 1,
      boost: ['moorflatterer'],
      particle: 'none',
      bannerKey: 'event.frogs'
    }
  },
  fireflies: {
    id: 'fireflies',
    duration: [8000, 12000],
    minPhase: 0.3,
    weight: 4,
    maps: ['mondbruch'],
    effect: {
      multiplier: 1.3,
      speed: 1,
      spawn: 1,
      tint: '#cfff7a',
      tintOpacity: 0.15,
      weather: 'stars',
      timeScale: 1,
      boost: ['nebelfluesterer'],
      particle: 'firefly',
      bannerKey: 'event.fireflies'
    }
  },
  timeslip: {
    id: 'timeslip',
    duration: [5000, 7000],
    minPhase: 0.4,
    weight: 3,
    maps: [],
    effect: {
      multiplier: 1.6,
      speed: 0.5,
      spawn: 1,
      tint: '#6a4aff',
      tintOpacity: 0.22,
      weather: 'none',
      timeScale: 0.45,
      boost: ['schnellfeder', 'kurvensegler'],
      particle: 'spark',
      bannerKey: 'event.timeslip'
    }
  },
  featherstorm: {
    id: 'featherstorm',
    duration: [10000, 14000],
    minPhase: 0.75,
    weight: 5,
    maps: [],
    effect: {
      multiplier: 2,
      speed: 1.4,
      spawn: 0.6,
      tint: '#ffffff',
      tintOpacity: 0.12,
      weather: 'none',
      timeScale: 1,
      boost: ['schnellfeder', 'korkenzieher', 'schwarmvogel'],
      particle: 'feather',
      bannerKey: 'event.featherstorm'
    }
  }
};

export const EVENT_IDS = Object.keys(EVENTS);
