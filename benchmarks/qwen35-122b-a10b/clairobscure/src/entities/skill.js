// Skill definitions and effect application

export class Skill {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.apCost = config.apCost || 1;
    this.power = config.power || 0;
    this.effect = config.effect || 'damage'; // damage, heal, buff, debuff
    this.targetType = config.targetType || 'enemy'; // enemy, ally, self, all_enemies, all_allies
    this.element = config.element || null; // fire, water, wind, earth, light, dark
    this.status = config.status || null; // burn, poison, stun, etc.
    this.duration = config.duration || 3; // turns for status effects
    this.isMultiHit = config.isMultiHit || false;
    this.hitCount = config.hitCount || 1;
    this.accuracy = config.accuracy || 1.0;
    this.critRate = config.critRate || 0.05;
  }

  canUse(entity) {
    return entity.ap >= this.apCost && !entity.isStunned;
  }
}

// Skill database
export const Skills = {
  // Warrior skills
  'warrior_slash': new Skill({
    id: 'warrior_slash',
    name: 'Cleave',
    description: 'Powerful slash dealing damage to one enemy',
    apCost: 2,
    power: 1.5,
    effect: 'damage',
    targetType: 'enemy'
  }),

  'warrior_taunt': new Skill({
    id: 'warrior_taunt',
    name: 'Taunt',
    description: 'Force enemies to target you, gain AP',
    apCost: 1,
    effect: 'buff',
    targetType: 'self',
    status: 'taunt'
  }),

  'warrior_bash': new Skill({
    id: 'warrior_bash',
    name: 'Shield Bash',
    description: 'Chance to stun enemy',
    apCost: 2,
    power: 1.0,
    effect: 'damage',
    targetType: 'enemy',
    status: 'stun',
    duration: 2
  }),

  // Mage skills
  'mage_fireball': new Skill({
    id: 'mage_fireball',
    name: 'Fireball',
    description: 'Explosive fire damage, may burn',
    apCost: 2,
    power: 1.4,
    effect: 'damage',
    targetType: 'enemy',
    element: 'fire',
    status: 'burn',
    duration: 3
  }),

  'mage_frostbolt': new Skill({
    id: 'mage_frostbolt',
    name: 'Frostbolt',
    description: 'Ice damage, slows enemy',
    apCost: 2,
    power: 1.2,
    effect: 'damage',
    targetType: 'enemy',
    element: 'water',
    status: 'slow'
  }),

  'mage_arcane': new Skill({
    id: 'mage_arcane',
    name: 'Arcane Blast',
    description: 'Pure magical damage',
    apCost: 3,
    power: 2.0,
    effect: 'damage',
    targetType: 'enemy'
  }),

  // Healer skills
  'healer_heal': new Skill({
    id: 'healer_heal',
    name: 'Healing Light',
    description: 'Restore HP to an ally',
    apCost: 2,
    power: 80,
    effect: 'heal',
    targetType: 'ally'
  }),

  'healer_blessing': new Skill({
    id: 'healer_blessing',
    name: 'Blessing',
    description: 'Regen HP over time',
    apCost: 3,
    power: 0,
    effect: 'buff',
    targetType: 'ally',
    status: 'regen',
    duration: 4
  }),

  'healer_purify': new Skill({
    id: 'healer_purify',
    name: 'Purify',
    description: 'Remove negative status effects',
    apCost: 2,
    effect: 'purify',
    targetType: 'ally'
  }),

  // Ranger skills
  'ranger_shot': new Skill({
    id: 'ranger_shot',
    name: 'Precision Shot',
    description: 'High crit chance ranged attack',
    apCost: 2,
    power: 1.3,
    effect: 'damage',
    targetType: 'enemy',
    critRate: 0.3
  }),

  'ranger_multishot': new Skill({
    id: 'ranger_multishot',
    name: 'Multi-Shot',
    description: 'Hit multiple enemies',
    apCost: 3,
    power: 1.0,
    effect: 'damage',
    targetType: 'all_enemies',
    isMultiHit: true,
    hitCount: 3
  }),

  'ranger_aim': new Skill({
    id: 'ranger_aim',
    name: 'Target Lock',
    description: 'Mark enemy for bonus damage',
    apCost: 1,
    effect: 'debuff',
    targetType: 'enemy',
    status: 'marked'
  }),

  // Ultimate skills
  'warrior_ultimate': new Skill({
    id: 'warrior_ultimate',
    name: 'Annihilate',
    description: 'Devastating single-target attack',
    apCost: 5,
    power: 3.0,
    effect: 'damage',
    targetType: 'enemy'
  }),

  'mage_ultimate': new Skill({
    id: 'mage_ultimate',
    name: 'Meteor Storm',
    description: 'Massive fire damage to all enemies',
    apCost: 5,
    power: 2.0,
    effect: 'damage',
    targetType: 'all_enemies',
    element: 'fire'
  }),

  'healer_ultimate': new Skill({
    id: 'healer_ultimate',
    name: 'Divine Restoration',
    description: 'Fully heal all allies',
    apCost: 5,
    power: 200,
    effect: 'heal',
    targetType: 'all_allies'
  })
};

export function getSkillById(id) {
  return Skills[id] || null;
}

export function getSkillsForClass(characterClass) {
  const classSkills = {
    warrior: ['warrior_slash', 'warrior_taunt', 'warrior_bash', 'warrior_ultimate'],
    mage: ['mage_fireball', 'mage_frostbolt', 'mage_arcane', 'mage_ultimate'],
    healer: ['healer_heal', 'healer_blessing', 'healer_purify', 'healer_ultimate'],
    ranger: ['ranger_shot', 'ranger_multishot', 'ranger_aim']
  };

  const skillIds = classSkills[characterClass] || [];
  return skillIds.map(id => Skills[id]).filter(s => s);
}
