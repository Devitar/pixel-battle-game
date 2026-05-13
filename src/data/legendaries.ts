import type { EnemyId, ItemSlot, LegendaryDef, LegendaryId, LegendaryPassiveDef, LegendaryPassiveId } from './types';

export const LEGENDARY_DEFS: Record<LegendaryId, LegendaryDef> = {
  lichs_crown: {
    id: 'lichs_crown',
    name: "Lich's Crown",
    flavor: "A circlet of bleached vertebrae, still humming with the lich's hunger.",
    slot: 'hat',
    baseId: 'hat_hood',
    stats: { mind: 5, crit: 5 },
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  phylactery: {
    id: 'phylactery',
    name: 'Phylactery',
    flavor: "A glass vial of black ichor; the lich's life force trapped in glass that never breaks.",
    slot: 'outfit',
    baseId: 'outfit_cloth',
    stats: { defense: 2 },
    hpBonus: 15,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'rotting', duration: 2, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
  tidewalker_helm: {
    id: 'tidewalker_helm',
    name: 'Tidewalker Helm',
    flavor: 'A waterlogged crown of brass and barnacle, heavier than it looks.',
    slot: 'hat',
    baseId: 'hat_cap',
    stats: { defense: 3 },
    hpBonus: 5,
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },
  kings_aegis: {
    id: 'kings_aegis',
    name: "King's Aegis",
    flavor: 'A scarred boss-shield etched with sigils that still drip seawater.',
    slot: 'shield',
    baseId: 'shield_basic',
    stats: { defense: 3 },
    hpBonus: 10,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'drowning', duration: 3, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
};

export const BOSS_LEGENDARIES: Partial<Record<EnemyId, readonly LegendaryId[]>> = {
  bone_lich: ['lichs_crown', 'phylactery'],
  drowned_king: ['tidewalker_helm', 'kings_aegis'],
};

export const LEGENDARY_PASSIVE_DEFS: Record<LegendaryPassiveId, LegendaryPassiveDef> = {
  vampiric: {
    id: 'vampiric',
    adjective: 'Vampiric',
    description: 'Heal 15% of damage dealt.',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onHit' },
      action: { kind: 'lifesteal', ratio: 0.15 },
    },
  },
  devastating: {
    id: 'devastating',
    adjective: 'Devastating',
    description: 'Your first attack each combat deals double damage.',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'firstAttack' },
      action: { kind: 'damageMod', multiplier: 2.0 },
    },
  },
  cleaving: {
    id: 'cleaving',
    adjective: 'Cleaving',
    description: '+2 Attack for 3 turns on kill (stacks).',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true },
    },
  },
  hexing: {
    id: 'hexing',
    adjective: 'Hexing',
    description: 'Crits Mark the target (+30% damage taken, 3 turns).',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: {
        kind: 'applyStatus', statusId: 'marked', duration: 3, target: 'other',
        payload: { damageBonus: 0.3 },
      },
    },
  },
  fortified: {
    id: 'fortified',
    adjective: 'Fortified',
    description: 'Reduce incoming damage by 20%.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'damageMitigation', multiplier: 0.8 },
    },
  },
  reinforced: {
    id: 'reinforced',
    adjective: 'Reinforced',
    description: '+4 Defense while below 40% HP.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.4 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },
  thorny: {
    id: 'thorny',
    adjective: 'Thorny',
    description: 'Reflect Poison (4/turn, 2 turns) to attackers.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'poisoned', duration: 2, target: 'other',
        payload: { damagePerTurn: 4 },
      },
    },
  },
  warded: {
    id: 'warded',
    adjective: 'Warded',
    description: '+15 Dodge while below 50% HP.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'dodge', delta: 15 },
    },
  },
  vital: {
    id: 'vital',
    adjective: 'Vital',
    description: 'Gain Blessed (+5 HP/turn, 3 turns) when struck.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'blessed', duration: 3, target: 'self',
        payload: { healPerTurn: 5 },
      },
    },
  },
  resolute: {
    id: 'resolute',
    adjective: 'Resolute',
    description: '+3 Defense while below 50% HP.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'defense', delta: 3 },
    },
  },
  evasive: {
    id: 'evasive',
    adjective: 'Evasive',
    description: '+20 Dodge for 2 turns when struck.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 20, duration: 2 },
    },
  },
  enduring: {
    id: 'enduring',
    adjective: 'Enduring',
    description: '+1 Defense for 2 turns when struck (stacks).',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'gainStat', stat: 'defense', delta: 1, duration: 2, stacking: true },
    },
  },
  insightful: {
    id: 'insightful',
    adjective: 'Insightful',
    description: '+4 Mind while below 50% HP.',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'mind', delta: 4 },
    },
  },
  prescient: {
    id: 'prescient',
    adjective: 'Prescient',
    description: '+1 Speed for 2 turns on crit (stacks).',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'speed', delta: 1, duration: 2, stacking: true },
    },
  },
  cunning: {
    id: 'cunning',
    adjective: 'Cunning',
    description: '+15 Dodge for 2 turns on crit.',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 15, duration: 2 },
    },
  },
  wise: {
    id: 'wise',
    adjective: 'Wise',
    description: '+1 Mind for 3 turns on kill (stacks).',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 1, duration: 3, stacking: true },
    },
  },
};

export const LEGENDARY_PASSIVES_BY_SLOT: Record<ItemSlot, readonly LegendaryPassiveId[]> = {
  weapon: ['vampiric', 'devastating', 'cleaving', 'hexing'],
  shield: ['fortified', 'reinforced', 'thorny', 'warded'],
  outfit: ['vital', 'resolute', 'evasive', 'enduring'],
  hat:    ['insightful', 'prescient', 'cunning', 'wise'],
};
