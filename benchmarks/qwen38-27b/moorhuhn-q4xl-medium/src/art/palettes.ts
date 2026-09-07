/**
 * Color palettes for every target kind + bosses. Kept separate so the art
 * generator and any UI swatches share one source of truth.
 */

export interface BirdPalette {
  body: string;
  body2: string;
  belly: string;
  wing: string;
  beak: string;
  tail: string;
  eye: string;
  accent: string;
  glow?: string;
  /** optional: armor plates color for panzerpelz */
  armor?: string;
}

export const PALETTES: Record<string, BirdPalette> = {
  flatterer: {
    body: '#7a5a44',
    body2: '#5f4535',
    belly: '#e8d3b0',
    wing: '#4a3526',
    beak: '#e8944a',
    tail: '#4a3526',
    eye: '#20140c',
    accent: '#c98a4a'
  },
  feder: {
    body: '#d8dee6',
    body2: '#b7c2cf',
    belly: '#f4f7fb',
    wing: '#8fa0b4',
    beak: '#f0a020',
    tail: '#8fa0b4',
    eye: '#1c2430',
    accent: '#e8503a'
  },
  korken: {
    body: '#c98a3a',
    body2: '#a86f28',
    belly: '#f0d090',
    wing: '#8a5a1e',
    beak: '#e0702a',
    tail: '#8a5a1e',
    eye: '#241408',
    accent: '#e8c04a'
  },
  panzer: {
    body: '#8a6a4a',
    body2: '#6f533a',
    belly: '#c9b090',
    wing: '#5a4028',
    beak: '#d8862a',
    tail: '#5a4028',
    eye: '#1c1208',
    accent: '#a0a8b0',
    armor: '#9aa2ad'
  },
  gold: {
    body: '#f0c040',
    body2: '#d8a020',
    belly: '#fff0b0',
    wing: '#c08818',
    beak: '#ffe060',
    tail: '#c08818',
    eye: '#2a1a04',
    accent: '#fff0a0',
    glow: '#ffe890'
  },
  mist: {
    body: '#9aa6c0',
    body2: '#7c88a6',
    belly: '#d0d8ec',
    wing: '#646f8c',
    beak: '#b0689a',
    tail: '#646f8c',
    eye: '#222838',
    accent: '#b8c4e0',
    glow: '#c8d4f0'
  },
  taeuscher: {
    body: '#e0a03a',
    body2: '#c0802a',
    belly: '#f5d898',
    wing: '#a06418',
    beak: '#e0782a',
    tail: '#a06418',
    eye: '#1c0f04',
    accent: '#fff0a0',
    glow: '#ffe890'
  },
  schwarm: {
    body: '#6a8a5a',
    body2: '#4f6a42',
    belly: '#c0d8a8',
    wing: '#3f5434',
    beak: '#e8a03a',
    tail: '#3f5434',
    eye: '#141c10',
    accent: '#90b878'
  },
  segler: {
    body: '#5a7a9a',
    body2: '#405e7a',
    belly: '#c8d8e8',
    wing: '#324a62',
    beak: '#d88a3a',
    tail: '#324a62',
    eye: '#101820',
    accent: '#88aacc'
  },
  sturm: {
    body: '#c8ccd4',
    body2: '#a4aab6',
    belly: '#eef1f5',
    wing: '#7e848f',
    beak: '#f0b020',
    tail: '#7e848f',
    eye: '#1c2028',
    accent: '#4a90d0'
  },
  boss_moor: {
    body: '#5a4a3a',
    body2: '#3f3226',
    belly: '#b89a70',
    wing: '#2e2418',
    beak: '#d8862a',
    tail: '#2e2418',
    eye: '#f0c030',
    accent: '#8a7a5a',
    armor: '#7a828c'
  },
  boss_akrobat: {
    body: '#e05a7a',
    body2: '#b83a5a',
    belly: '#ffc8d8',
    wing: '#8a1e3a',
    beak: '#ffd040',
    tail: '#8a1e3a',
    eye: '#ffffff',
    accent: '#ff88aa',
    glow: '#ff90b0'
  },
  boss_nacht: {
    body: '#2a2440',
    body2: '#1c1830',
    belly: '#5a4a80',
    wing: '#141024',
    beak: '#9a7ad0',
    tail: '#141024',
    eye: '#c8e0ff',
    accent: '#8a70c0',
    glow: '#a890e0'
  }
};
