/**
 * story/story.js — "The Unwritten" — all narrative data, pure and engine-free.
 *
 * No THREE, no runtime logic, no DOM. This is the spine: the Director
 * (src/fx/director.js) reads `INTRO` and `CHARACTERS`; the overworld
 * (src/world/overworld.js) reads `AREAS` and `POIS`; the game orchestrator
 * (src/game.js) reads `ACTS`, `ENCOUNTERS` and `ENDINGS`.
 *
 * The three characters map 1:1 onto the verified combat core
 * (entities/party-data.js ids: mae, lune, gustave) so the story and the
 * battle share the same people. The two Pictos-from-memory keep the exact
 * stat values already defined in game.js — only their meaning changes here.
 */
import { ENEMY_DATA } from '../entities/enemy-data.js';

// ---------------------------------------------------------------------------
// The party. `id` MUST match entities/party-data.js so the battle reuses them.
// ---------------------------------------------------------------------------
export const CHARACTERS = {
  mae: {
    id: 'mae',
    name: 'Mae',
    role: 'The Scout',
    element: 'arcane',
    motif: 'She is the only one who keeps noticing what the Veil takes — because she refuses to forget.',
    color: '#3f8f83',
    accent: '#7fd8cf',
    intro: 'She counts the empty places so the rest of them don\u2019t have to.',
  },
  lune: {
    id: 'lune',
    name: 'Lune',
    role: 'The Scholar',
    element: 'fire',
    motif: 'She has been repainting the same lost street for years, trying to keep it in one place.',
    color: '#5b4a8a',
    accent: '#b48aff',
    intro: 'Her maps are of a city that no longer exists, and she corrects them every dawn.',
  },
  gustave: {
    id: 'gustave',
    name: 'Gustave',
    role: 'The Wall',
    element: 'gold',
    motif: 'He joined the expedition to protect the two of them. He never says why — the reveal is that he is the last one the Eraser cannot paint away, because he keeps choosing to remember out loud.',
    color: '#8a6d2f',
    accent: '#e8c979',
    intro: 'Big sword, bigger heart. He says the names of the missing so they are still said.',
  },
};

// ---------------------------------------------------------------------------
// The Eraser + the Curator (the two "villains" who are neither quite).
// ---------------------------------------------------------------------------
export const FIGURES = {
  eraser: {
    id: 'eraser',
    name: 'The Eraser',
    title: 'Grief, made into a brush',
    motif: 'It is not the monster the city sent Expeditions to kill. It has been *delaying* something worse — each dawn it paints the Veil a shade brighter to buy a little more time, erasing the small things first so the great ones hold.',
    color: '#cfd8dc',
    accent: '#e9e2cf',
  },
  curator: {
    id: 'curator',
    name: 'The Curator',
    title: 'The hand behind the paint',
    motif: 'The being that would erase the *whole* canvas — everyone, everything — to end the pain all at once. The Eraser is the only thing standing between the Curator and the last stroke.',
    color: '#7c2d3a',
    accent: '#ff8a6a',
  },
};

// ---------------------------------------------------------------------------
// The recovered-memory Pictos (loadout). EXACT stat values from game.js;
// only the meaning is now in-story. The glyph/color are cosmetic here.
// ---------------------------------------------------------------------------
export const PICTOS = [
  {
    id: 'gold',
    name: 'Gilded Picto',
    meaning: 'The wedding ring, still warm.',
    effect: '+15% attack for the whole expedition',
    color: '#e8c979',
    glyph: '\u2726',
  },
  {
    id: 'teal',
    name: 'Tide Picto',
    meaning: 'A page of Lune\u2019s map, salt-stained.',
    effect: '+18% maximum HP for the whole expedition',
    color: '#7fd8cf',
    glyph: '\u2756',
  },
  {
    id: 'bone',
    name: 'Bone Picto',
    meaning: 'Gustave\u2019s last word, said before the fall.',
    effect: 'Begin each encounter with +1 AP',
    color: '#e9e2cf',
    glyph: '\u25C6',
  },
];

// ---------------------------------------------------------------------------
// ACTS — the flow / difficulty ramp. Each act is an overworld beat that
// releases an area, adds one new idea, and ends on a gate/encounter that
// hands off to the verified battle core.
// ---------------------------------------------------------------------------
export const ACTS = [
  {
    id: 1,
    title: 'The Dusk City',
    sub: 'A Veil brightens; a street vanishes; no one else can see the gap.',
    idea: 'Learn the parry and the dodge. Read the telegraphs.',
    objective: 'Reach the edge of the Dusk City and witness a Gommage.',
    area: 'dusk_city',
    reward: 'A memory recovered — the Gilded Picto.',
    encounter: null, // Act I is a light ambush only, resolved as wave 0 below
  },
  {
    id: 2,
    title: 'The Veiled Hills',
    sub: 'The Veil lies: enemies feint before they strike. Cross the ford.',
    idea: 'Feints enter the dance — do not parry a swing that was never real.',
    objective: 'Cross the ford and open the Painted Gate.',
    area: 'veiled_hills',
    reward: 'A second memory — a page of Lune\u2019s map (the Tide Picto).',
    encounter: 'gate', // the Painted Knight (cindervane_knight) guards the gate
  },
  {
    id: 3,
    title: 'The Spire',
    sub: 'Climb the Chiaroscuro Spire into the light shafts and the thin air.',
    idea: 'The Eraser fights in phases — feints, then an unblockable grab, then faster.',
    objective: 'Climb the Spire and face the Eraser.',
    area: 'spire',
    reward: 'The truth: the Eraser is grief, and it has been buying time.',
    encounter: 'boss', // the Nameless / Eraser (nameless)
  },
  {
    id: 4,
    title: 'The Choice',
    sub: 'At the top, the brush asks the only question the city never dared.',
    idea: 'Who gets to be remembered? Choose. There is no wrong answer the game will confirm for you.',
    objective: 'Choose an ending.',
    area: 'summit',
    reward: 'An ending.',
    encounter: 'choice',
  },
];

// ---------------------------------------------------------------------------
// INTRO — the opening cinematic. A beat sheet: each beat has an optional
// `shot` (consumed by the Director to move the CameraRig), `sfx`, and a
// `subtitle` line. The intro is narrative (seed-independent) and skippable.
// `dur` is the beat length in seconds at timescale 1 (the Director may
// scale it); the total is kept short and legible.
// ---------------------------------------------------------------------------
export const INTRO = [
  {
    dur: 4.5,
    shot: { kind: 'sky', fade: 1 },
    sfx: 'bed_low',
    subtitle: { text: 'A generation ago the Veil fell, and the city of Clair-Obscur was frozen in a beautiful, wrong dusk.' },
  },
  {
    dur: 4.0,
    shot: { kind: 'street', pan: 'x' },
    sfx: 'veil_shift',
    subtitle: { speaker: 'Mae', text: 'Every dawn it gets a little brighter. Every dawn, something small is gone.' },
  },
  {
    dur: 4.5,
    shot: { kind: 'gap' },
    sfx: 'erase',
    subtitle: { speaker: 'Mae', text: 'Watch. That street\u2026 it was here yesterday. I counted it.' },
  },
  {
    dur: 3.5,
    shot: { kind: 'crowd' },
    sfx: 'none',
    subtitle: { speaker: 'Passer-by', text: 'There is no street. There was never a street. What are you looking at?' },
  },
  {
    dur: 4.5,
    shot: { kind: 'spire', push: 1 },
    sfx: 'swell',
    subtitle: { speaker: 'Lune', text: 'At the top of the Spire stands the Eraser. The city keeps sending Expeditions to kill it.' },
  },
  {
    dur: 4.0,
    shot: { kind: 'trio', rise: 1 },
    sfx: 'none',
    subtitle: { speaker: 'Gustave', text: 'Expedition thirty-two never came down. We are number thirty-three. So — what do we do?' },
  },
  {
    dur: 4.0,
    shot: { kind: 'close_mae' },
    sfx: 'bed_swelling',
    subtitle: { speaker: 'Mae', text: 'We go up. And this time, we make the Veil remember.' },
  },
  {
    dur: 3.0,
    shot: { kind: 'title' },
    sfx: 'title',
    card: 'THE UNWRITTEN',
    sub: 'an Expedition 33 tale',
  },
];

// ---------------------------------------------------------------------------
// AREAS — overworld regions. Each has a palette (fog/sky/light/accent), a
// center + radius (overworld space), and a line of description. The overworld
// uses these to build terrain, set the atmosphere, and keep the player legibly
// oriented (fixes the "disorientation / no mini-map" critique).
// Coordinates are overworld units; the Spire landmark sits at (0,0,0).
// ---------------------------------------------------------------------------
export const AREAS = [
  {
    id: 'dusk_city',
    name: 'The Dusk City Edge',
    center: [26, 0, 20],
    radius: 22,
    palette: { fog: 0x1a2430, skyTop: 0x2a3550, skyBot: 0x5a4a5a, light: 0xffd9a0, accent: 0xe8c979 },
    desc: 'The lit rim of the city, its lamps burning under a Veil that is a shade too bright.',
  },
  {
    id: 'veiled_hills',
    name: 'The Veiled Hills',
    center: [-6, 0, -2],
    radius: 26,
    palette: { fog: 0x18262a, skyTop: 0x22303a, skyBot: 0x3a4a4a, light: 0x9fd8cf, accent: 0x7fd8cf },
    desc: 'Open, rolling hills gone quiet, the ford cutting a pale line to the Painted Gate.',
  },
  {
    id: 'spire',
    name: 'The Chiaroscuro Spire',
    center: [-22, 0, -24],
    radius: 24,
    palette: { fog: 0x101820, skyTop: 0x1a2233, skyBot: 0x2a2f45, light: 0xb48aff, accent: 0xb48aff },
    desc: 'The base of the Spire, where the air thins and the light shafts burn through the fog.',
  },
  {
    id: 'summit',
    name: 'The Summit',
    center: [0, 0, 0],
    radius: 10,
    palette: { fog: 0x0e141c, skyTop: 0x141a26, skyBot: 0x2a3340, light: 0xe9e2cf, accent: 0xe9e2cf },
    desc: 'The top of the world. The brush is waiting.',
  },
];

// ---------------------------------------------------------------------------
// POIS — the points of interest that make exploration reward, not grind.
// `kind`:
//   memory  — a recovered Picto (collectible; equips a loadout Picto)
//   ambush  — walking in triggers a battle (ENCOUNTERS[encounter])
//   gate    — the Painted Gate; guarded, then opens to release the Spire
//   boss    — the Eraser (the Nameless) at the Spire
//   camp    — the expedition flag: heal + allocate
//   secret  — a hidden beat (Gustave's name), no combat
// Positions are overworld units.
// ---------------------------------------------------------------------------
export const POIS = [
  { id: 'mem_gold', kind: 'memory', picto: 'gold', name: 'The Wedding Ring', pos: [20, 0, 8], act: 1 },
  { id: 'mem_tide', kind: 'memory', picto: 'teal', name: 'Lune\u2019s Map Page', pos: [-4, 0, 10], act: 2 },
  { id: 'mem_bone', kind: 'memory', picto: 'bone', name: 'Gustave\u2019s Word', pos: [-18, 0, -14], act: 3 },

  { id: 'ambush_1', kind: 'ambush', encounter: 'ambush_1', name: 'A painted patrol', pos: [14, 0, 4], act: 1 },
  { id: 'ambush_2', kind: 'ambush', encounter: 'ambush_2', name: 'The ford ambush', pos: [-12, 0, -6], act: 2 },

  { id: 'gate', kind: 'gate', encounter: 'gate', name: 'The Painted Gate', pos: [-16, 0, -10], act: 2 },
  { id: 'boss', kind: 'boss', encounter: 'boss', name: 'The Eraser', pos: [-20, 0, -22], act: 3 },

  { id: 'camp_1', kind: 'camp', name: 'Expedition Flag', pos: [18, 0, 14], act: 1 },
  { id: 'camp_2', kind: 'camp', name: 'Ford Camp', pos: [-2, 0, -14], act: 2 },

  { id: 'secret_name', kind: 'secret', name: 'The Name Said Aloud', pos: [-10, 0, -18], act: 2 },
];

// ---------------------------------------------------------------------------
// ENCOUNTERS — which combat setup each overworld beat hands to the battle
// core. `wave` maps to the existing WAVES (0 = nox_hound+cindervane_knight,
// 1 = nameless boss) and `solo` lets an encounter use a single enemy. The
// game wiring (P4) uses these to `_spawnWave`/build the enemy list, then
// `battle.begin` exactly as the verified core already does.
// ---------------------------------------------------------------------------
export const ENCOUNTERS = {
  ambush_1: {
    name: 'The Painted Patrol',
    intro: 'A pair of painted figures peel out of the fog — they do not remember being people.',
    // The light Act I fight: the hound + a single knight (a trimmed wave 0).
    enemies: [
      { data: ENEMY_DATA.nox_hound, pos: [-1.6, 0, -5.2] },
      { data: ENEMY_DATA.cindervane_knight, pos: [1.8, 0, -6.2] },
    ],
  },
  ambush_2: {
    name: 'The Ford Ambush',
    intro: 'The water stills. Something on the far bank is already swinging.',
    enemies: [
      { data: ENEMY_DATA.cindervane_knight, pos: [-2.0, 0, -5.6] },
      { data: ENEMY_DATA.cindervane_knight, pos: [2.0, 0, -6.4] },
    ],
  },
  gate: {
    name: 'The Painted Knight',
    intro: 'The gate is guarded by a knight of gilded paint, still standing the watch it was given a generation ago.',
    enemies: [
      { data: ENEMY_DATA.cindervane_knight, pos: [0, 0, -6.0] },
    ],
  },
  boss: {
    name: 'The Eraser',
    intro: 'The brush lifts. The light goes white for a moment — and then the Eraser begins to speak your names.',
    enemies: [
      { data: ENEMY_DATA.nameless, pos: [0, 0, -6.4] },
    ],
  },
  choice: {
    name: 'The Choice',
    intro: 'At the top of the Spire, the brush asks the only question the city never dared.',
    enemies: [],
  },
};

// ---------------------------------------------------------------------------
// ENDINGS — the COE33 two-ending structure, re-skinned. Both reachable,
// both "correct". The choice is made at Act IV.
// ---------------------------------------------------------------------------
export const ENDINGS = {
  A: {
    id: 'A',
    title: 'Remember Everything',
    side: 'with the party',
    choice: 'Keep the pain. Keep the memories. Stop the erasure and let the city choose to remember.',
    lines: [
      { speaker: 'Mae', text: 'Then we keep them. All of them. The ones who are gone stay in what we carry.' },
      { speaker: 'Gustave', text: 'I\u2019ll say their names. Every dawn, out loud, until the city learns to say them too.' },
      { speaker: 'Lune', text: 'I\u2019ll draw the streets back in. It will take years. It will be worth it.' },
    ],
    card: 'THE VEIL HOLDS. THE ERASURE STOPS. SOME ARE ALREADY GONE — AND THE CITY BEGINS, SLOWLY, TO CHOOSE TO REMEMBER.',
  },
  B: {
    id: 'B',
    title: 'Let Them Rest',
    side: 'with the Eraser',
    choice: 'Release the canvas. End the grief — and with it the memories, so gently no one even notices.',
    lines: [
      { speaker: 'The Eraser', text: 'You are kinder than the city. They wanted to hold it forever. You will let it rest.' },
      { speaker: 'Lune', text: 'My map\u2026 it\u2019s going blank. That\u2019s all right. That\u2019s all right.' },
      { speaker: 'Mae', text: 'I counted so many empty places. At least no one will have to count anymore.' },
    ],
    card: 'THE CANVAS IS RELEASED. THE VEIL LIFTS. THE GRIEF ENDS — AND WITH IT, THE MEMORY OF IT, SO GENTLY THAT NO ONE EVEN NOTICES.',
  },
};

// ---------------------------------------------------------------------------
// Convenience: a flat lookup of characters by id (matches party-data ids).
// ---------------------------------------------------------------------------
export const CHARACTER_LIST = [CHARACTERS.mae, CHARACTERS.lune, CHARACTERS.gustave];

export default { CHARACTERS, FIGURES, PICTOS, ACTS, INTRO, AREAS, POIS, ENCOUNTERS, ENDINGS, CHARACTER_LIST };
