/**
 * Story data for the vertical slice.
 *
 * The premise: once a year the Curator descends on a district and *gilds* it —
 * turning everything alive into a monument, "so that it may be preserved".
 * Thirty-two expeditions have been sent to stop it. All thirty-two are still
 * standing in the water of Le Parvis Noyé, facing the gate, in gold.
 *
 * Structure: two Chroma Seals bind the Curator's gate. Break both, the gate
 * opens, the Curator comes down. Each beat is one battle encounter.
 *
 * Camera coordinates are literal world positions; `pos`/`look` may also be
 * functions receiving the live context, for shots that must find the player.
 */

import { PLAZA_HEIGHT } from './terrain.js';

const GATE = { x: Math.cos(Math.PI / 6) * 25, z: Math.sin(Math.PI / 6) * 25 };

export const SPAWN = {
  x: Math.cos((5 * Math.PI) / 6) * 50,
  z: Math.sin((5 * Math.PI) / 6) * 50,
  facing: Math.atan2(-Math.cos((5 * Math.PI) / 6), -Math.sin((5 * Math.PI) / 6)),
};

export const CAMP = {
  x: Math.cos((5 * Math.PI) / 6) * 44,
  z: Math.sin((5 * Math.PI) / 6) * 44,
};

/** The two seals, each guarding one encounter. */
export const SEALS = [
  {
    id: 'seal-bell',
    name: 'Le Bourdon Noyé',
    subtitle: 'The Drowned Bell',
    lore: 'It rang once, when the water came. It has not stopped since.',
    x: 0, z: -54,
    waveIndex: 0,
    color: '#8fd4e8',
  },
  {
    id: 'seal-bramble',
    name: 'La Ronce',
    subtitle: 'The Bramble',
    lore: 'A chapel stood here until the Bourgeon decided otherwise.',
    x: Math.cos(Math.PI / 6) * 56, z: Math.sin(Math.PI / 6) * 56,
    waveIndex: 1,
    color: '#e2803a',
  },
];

export const GATE_ENCOUNTER = {
  id: 'gate-curator',
  name: 'The Gilded Curator',
  x: GATE.x, z: GATE.z,
  waveIndex: 2,
  color: '#d9b262',
};

export const OBJECTIVES = {
  reachParvis: {
    id: 'reachParvis',
    title: 'Cross to the parvis',
    hint: 'Follow the causeway east, across the water.',
  },
  breakSeals: {
    id: 'breakSeals',
    title: 'Break the two Chroma Seals',
    hint: 'They stand out in the flooded parkland. Look for the light.',
  },
  faceCurator: {
    id: 'faceCurator',
    title: 'The gate is open — face the Curator',
    hint: 'It is waiting on the parvis.',
  },
  done: {
    id: 'done',
    title: 'The gilding recedes',
    hint: '',
  },
};

// ---------------------------------------------------------------------------
// Cutscenes
// ---------------------------------------------------------------------------

const A = 'Aurel Lumière';
const V = 'Sœur Vionne';
const C = 'Corvin Roux';

export const CUTSCENES = {
  prologue: {
    id: 'prologue',
    skippable: true,
    music: 'quiet',
    shots: [
      {
        dur: 7.5, ease: 'inOut', fov: 38,
        from: { pos: [78, 62, 78], look: [0, 4, 0] },
        to: { pos: [34, 24, 34], look: [0, 5, 0] },
      },
      {
        dur: 6.5, ease: 'inOut', fov: 34,
        from: { pos: [16, 3.2, 15], look: [0, 6.5, 0] },
        to: { pos: [7.5, 4.6, 7], look: [0, 6.0, 0] },
      },
      {
        dur: 6.0, ease: 'inOut', fov: 40,
        from: { pos: [-6, 5.5, -10], look: [GATE.x, PLAZA_HEIGHT + 5, GATE.z] },
        to: { pos: [6, 4.2, 1], look: [GATE.x, PLAZA_HEIGHT + 4, GATE.z] },
      },
      {
        dur: 4.5, ease: 'out', fov: 46,
        from: { pos: [SPAWN.x - 12, 14, SPAWN.z + 12], look: [SPAWN.x, 1.5, SPAWN.z] },
        to: (ctx) => ({
          pos: [ctx.player.position.x - 5.5, ctx.player.position.y + 3.2, ctx.player.position.z + 5.5],
          look: [ctx.player.position.x, ctx.player.position.y + 1.5, ctx.player.position.z],
        }),
      },
    ],
    lines: [
      { t: 1.0, dur: 4.2, speaker: A, text: 'Thirty-two expeditions came before us.' },
      { t: 5.6, dur: 4.4, speaker: V, text: 'They are all still here. Every one of them.' },
      { t: 10.4, dur: 4.6, speaker: C, text: 'Gilded where they stood. Facing the gate.' },
      { t: 15.6, dur: 4.4, speaker: V, text: 'It preserves us. That is what it believes it is doing.' },
      { t: 20.6, dur: 3.6, speaker: A, text: 'Then we do not stop until that gate opens.' },
    ],
  },

  sealBroken: {
    id: 'sealBroken',
    skippable: true,
    shots: [
      {
        dur: 4.2, ease: 'inOut', fov: 36,
        from: { pos: [GATE.x + 13, PLAZA_HEIGHT + 7, GATE.z + 13], look: [GATE.x, PLAZA_HEIGHT + 4, GATE.z] },
        to: { pos: [GATE.x + 7, PLAZA_HEIGHT + 4.5, GATE.z + 7], look: [GATE.x, PLAZA_HEIGHT + 3.4, GATE.z] },
      },
    ],
    lines: [
      { t: 0.5, dur: 3.4, speaker: V, text: 'The gate felt that. One seal left.' },
    ],
  },

  gateOpens: {
    id: 'gateOpens',
    skippable: true,
    letterbox: 1,
    shots: [
      {
        dur: 5.0, ease: 'inOut', fov: 34,
        from: { pos: [GATE.x + 16, PLAZA_HEIGHT + 2.2, GATE.z + 16], look: [GATE.x, PLAZA_HEIGHT + 3, GATE.z] },
        to: { pos: [GATE.x + 8.5, PLAZA_HEIGHT + 3.0, GATE.z + 8.5], look: [GATE.x, PLAZA_HEIGHT + 7.5, GATE.z] },
      },
      {
        dur: 5.5, ease: 'inOut', fov: 44,
        from: { pos: [10, PLAZA_HEIGHT + 2.0, 10], look: [GATE.x, PLAZA_HEIGHT + 12, GATE.z] },
        to: { pos: [4, PLAZA_HEIGHT + 5.5, 4], look: [GATE.x * 0.5, PLAZA_HEIGHT + 6, GATE.z * 0.5] },
      },
    ],
    lines: [
      { t: 0.6, dur: 3.2, speaker: V, text: 'Both seals are dark. It is opening.' },
      { t: 4.4, dur: 3.4, speaker: C, text: 'Something is coming down through it.' },
      { t: 8.2, dur: 2.6, speaker: A, text: 'Expedition Thirty-Three. Hold the line.' },
    ],
  },

  epilogue: {
    id: 'epilogue',
    skippable: true,
    letterbox: 1,
    shots: [
      {
        dur: 6.0, ease: 'inOut', fov: 40,
        from: { pos: [8, PLAZA_HEIGHT + 2.6, 9], look: [0, PLAZA_HEIGHT + 4.5, 0] },
        to: { pos: [16, PLAZA_HEIGHT + 6.5, 17], look: [0, PLAZA_HEIGHT + 3.5, 0] },
      },
      {
        dur: 7.0, ease: 'inOut', fov: 44,
        from: { pos: [30, 16, 30], look: [0, 3, 0] },
        to: { pos: [64, 46, 64], look: [0, 2, 0] },
      },
    ],
    lines: [
      { t: 0.8, dur: 4.0, speaker: V, text: 'The gold is going out of the water.' },
      { t: 5.4, dur: 4.2, speaker: C, text: 'They are cracking. All of them, at once.' },
      { t: 10.0, dur: 4.6, speaker: A, text: 'Thirty-two names. We carry every one of them out of here.' },
    ],
  },
};
