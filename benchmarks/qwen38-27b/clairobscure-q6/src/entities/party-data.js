/**
 * entities/party-data.js — The three playable expedition members.
 *
 * Pure data: stats, elements, skills, and a `look` object that
 * entities/character.js turns into a procedural mesh + portrait. No THREE,
 * no runtime logic.
 *
 * Row rules: `front` takes +15% damage from back-row attackers (and back
 * attackers get their own bonus); `back` attackers take 15% less damage
 * (see action-resolver backMul).
 */
import { SKILLS, makeBasicAttack } from './skill.js';

export const PARTY_DATA = [
  {
    id: 'mae',
    name: 'Mae',
    role: 'Ranger',
    row: 'front',
    hp: 212, atk: 33, def: 17,
    critChance: 0.17,
    speed: 96,
    element: 'arcane',
    ranged: true,
    backAttackBonus: 1.18, // ranged: +18% from the back row
    basic: makeBasicAttack('mae_basic', 'Bolt', 'A single arrow. Costs no AP and builds 1 AP.', 'arcane', 1.0, { ranged: true, stagger: 22 }),
    skills: [
      SKILLS.mae_precision_shot,
      SKILLS.mae_triple_salvo,
      { ...SKILLS.mae_barrage, unlockLevel: 2 },
    ],
    look: {
      skin: '#e9c9a5',
      hair: '#2e6f6c',
      hairStyle: 'long',
      eye: '#3a2c22',
      accent: '#3f8f83',
      cloak: '#245c56',
      mood: 'calm',
      seed: 11,
      backdrop: '#20444a',
      backdropDeep: '#0e2126',
    },
  },
  {
    id: 'lune',
    name: 'Lune',
    role: 'Mage',
    row: 'back',
    hp: 168, atk: 38, def: 12,
    critChance: 0.15,
    speed: 78,
    element: 'fire',
    ranged: true,
    backAttackBonus: 1.15, // spells from the back row
    basic: makeBasicAttack('lune_basic', 'Spark', 'A jolt of flame. Costs no AP and builds 1 AP.', 'fire', 0.9, { ranged: true, stagger: 20 }),
    skills: [
      SKILLS.lune_cinder,
      SKILLS.lune_frost_veil,
      { ...SKILLS.lune_glacial_lance, unlockLevel: 2 },
    ],
    look: {
      skin: '#e8cbb0',
      hair: '#5b4a8a',
      hairStyle: 'bun',
      eye: '#2c2440',
      accent: '#5b4a8a',
      cloak: '#332a56',
      mood: 'melancholy',
      seed: 23,
      backdrop: '#2c2450',
      backdropDeep: '#120e24',
    },
  },
  {
    id: 'gustave',
    name: 'Gustave',
    role: 'Knight',
    row: 'front',
    hp: 296, atk: 29, def: 24,
    critChance: 0.10,
    speed: 64,
    element: 'gold',
    basic: makeBasicAttack('gustave_basic', 'Slash', 'A greatsword swing. Costs no AP and builds 1 AP.', 'gold', 1.0, { stagger: 26 }),
    skills: [
      SKILLS.gustave_ward,
      SKILLS.gustave_rend,
      { ...SKILLS.gustave_judgement, unlockLevel: 2 },
    ],
    look: {
      skin: '#e3bd96',
      hair: '#8a6d2f',
      hairStyle: 'short',
      eye: '#2a2018',
      accent: '#7c8a94',
      cloak: '#4a5560',
      mood: 'fierce',
      seed: 37,
      backdrop: '#33424e',
      backdropDeep: '#141c24',
    },
  },
];

/** Build fresh party combatant data objects (before Character meshes). */
export function makePartyData() {
  return PARTY_DATA.map((d, i) => ({
    ...d,
    maxHp: d.hp,
    hp: d.hp,
    isParty: true,
    isEnemy: false,
    level: 1,
    xp: 0,
    xpNext: 60,
    ap: 0,
    maxAp: 6,
    shield: 0,
    stagger: 0,
    staggerMax: 0, // party members are not staggered by hits (only by debuffs)
    staggered: false,
    statuses: new Map(),
    dead: false,
    queueIndex: i,
    skillList: d.skills,
    unlockedSkills: d.skills.filter((s) => !s.unlockLevel).map((s) => s.id),
  }));
}
