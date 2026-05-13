import type { ClassId, PerkDef, PerkId } from './types';

export const PERKS: Record<PerkId, PerkDef> = {
  iron_will: {
    id: 'iron_will',
    name: 'Iron Will',
    description: '+1 Defense',
    classId: 'knight',
    tier: 'l5',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  resolute: {
    id: 'resolute',
    name: 'Resolute',
    description: '+10% HP',
    classId: 'knight',
    tier: 'l5',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  precise: {
    id: 'precise',
    name: 'Precise',
    description: '+5% Crit',
    classId: 'archer',
    tier: 'l5',
    statEffects: [{ stat: 'crit', delta: 5 }],
  },
  eagle_eye: {
    id: 'eagle_eye',
    name: 'Eagle Eye',
    description: '+1 Attack',
    classId: 'archer',
    tier: 'l5',
    statEffects: [{ stat: 'attack', delta: 1 }],
  },
  devout: {
    id: 'devout',
    name: 'Devout',
    description: '+1 Mind',
    classId: 'priest',
    tier: 'l5',
    statEffects: [{ stat: 'mind', delta: 1 }],
  },
  steadfast: {
    id: 'steadfast',
    name: 'Steadfast',
    description: '+10% HP',
    classId: 'priest',
    tier: 'l5',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  berserker: {
    id: 'berserker',
    name: 'Berserker',
    description: '+2 Attack',
    classId: 'barbarian',
    tier: 'l5',
    statEffects: [{ stat: 'attack', delta: 2 }],
  },
  tough_skin: {
    id: 'tough_skin',
    name: 'Tough Skin',
    description: '+1 Defense',
    classId: 'barbarian',
    tier: 'l5',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  lethal: {
    id: 'lethal',
    name: 'Lethal',
    description: '+5% Crit',
    classId: 'rogue',
    tier: 'l5',
    statEffects: [{ stat: 'crit', delta: 5 }],
  },
  evasive: {
    id: 'evasive',
    name: 'Evasive',
    description: '+5% Dodge',
    classId: 'rogue',
    tier: 'l5',
    statEffects: [{ stat: 'dodge', delta: 5 }],
  },
  arcane_power: {
    id: 'arcane_power',
    name: 'Arcane Power',
    description: '+1 Mind',
    classId: 'mage',
    tier: 'l5',
    statEffects: [{ stat: 'mind', delta: 1 }],
  },
  quick_cast: {
    id: 'quick_cast',
    name: 'Quick Cast',
    description: '+1 Speed',
    classId: 'mage',
    tier: 'l5',
    statEffects: [{ stat: 'speed', delta: 1 }],
  },
  righteous: {
    id: 'righteous',
    name: 'Righteous',
    description: '+3 Mind. Smite hits harder; Lay on Hands heals more.',
    classId: 'paladin',
    tier: 'l5',
    statEffects: [{ stat: 'mind', delta: 3 }],
  },
  vindicator: {
    id: 'vindicator',
    name: 'Vindicator',
    description: '+2 Attack. Hit harder with Strike and basic melee.',
    classId: 'paladin',
    tier: 'l5',
    statEffects: [{ stat: 'attack', delta: 2 }],
  },
  beastmaster: {
    id: 'beastmaster',
    name: 'Beastmaster',
    description: '+2 Attack to your pet.',
    classId: 'hunter',
    tier: 'l5',
    petAttackBonus: 2,
  },
  sharpshooter: {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    description: "+2 Attack. Hunter's shots hit harder.",
    classId: 'hunter',
    tier: 'l5',
    statEffects: [{ stat: 'attack', delta: 2 }],
  },

  // === L10 ===

  // Knight
  unbreakable: {
    id: 'unbreakable',
    name: 'Unbreakable',
    description: 'Halve incoming damage when struck at full HP.',
    classId: 'knight', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onStruck', whenAtFullHp: true },
      action: { kind: 'damageMitigation', multiplier: 0.5 },
    },
  },
  last_stand: {
    id: 'last_stand',
    name: 'Last Stand',
    description: '+4 Defense while below 30% HP.',
    classId: 'knight', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.3 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },

  // Archer
  eagles_mark: {
    id: 'eagles_mark',
    name: "Eagle's Mark",
    description: 'Crits Mark the target (+25% damage taken, 3 turns).',
    classId: 'archer', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'applyStatus', statusId: 'marked', duration: 3, target: 'other', payload: { damageBonus: 0.25 } },
    },
  },
  first_strike: {
    id: 'first_strike',
    name: 'First Strike',
    description: 'Your first attack each combat deals double damage.',
    classId: 'archer', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'firstAttack' },
      action: { kind: 'damageMod', multiplier: 2.0 },
    },
  },

  // Priest
  sanctity: {
    id: 'sanctity',
    name: 'Sanctity',
    description: '+4 Mind while below 50% HP.',
    classId: 'priest', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'mind', delta: 4 },
    },
  },
  holy_vigor: {
    id: 'holy_vigor',
    name: 'Holy Vigor',
    description: 'Gain Blessed (+5 HP/turn, 3 turns) when struck.',
    classId: 'priest', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'applyStatus', statusId: 'blessed', duration: 3, target: 'self', payload: { healPerTurn: 5 } },
    },
  },

  // Barbarian
  rampage: {
    id: 'rampage',
    name: 'Rampage',
    description: '+2 Attack for 3 turns on kill (stacks up to 5).',
    classId: 'barbarian', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true },
    },
  },
  bloodlust: {
    id: 'bloodlust',
    name: 'Bloodlust',
    description: '+4 Attack while below 50% HP.',
    classId: 'barbarian', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'attack', delta: 4 },
    },
  },

  // Rogue
  backstab: {
    id: 'backstab',
    name: 'Backstab',
    description: 'Your first attack each combat deals 2.5x damage.',
    classId: 'rogue', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'firstAttack' },
      action: { kind: 'damageMod', multiplier: 2.5 },
    },
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom',
    description: '+20 Dodge for 2 turns on crit.',
    classId: 'rogue', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 20, duration: 2 },
    },
  },

  // Mage
  spellweaver: {
    id: 'spellweaver',
    name: 'Spellweaver',
    description: '+2 Mind for 3 turns on kill (stacks up to 5).',
    classId: 'mage', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  arcane_surge: {
    id: 'arcane_surge',
    name: 'Arcane Surge',
    description: 'Crits Mark the target (+50% damage taken, 2 turns).',
    classId: 'mage', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'applyStatus', statusId: 'marked', duration: 2, target: 'other', payload: { damageBonus: 0.5 } },
    },
  },

  // Paladin
  crusader: {
    id: 'crusader',
    name: 'Crusader',
    description: '+2 Mind for 3 turns on kill (stacks up to 5).',
    classId: 'paladin', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  aegis: {
    id: 'aegis',
    name: 'Aegis',
    description: '+3 Defense while below 40% HP.',
    classId: 'paladin', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.4 },
      action: { kind: 'gainStat', stat: 'defense', delta: 3 },
    },
  },

  // Hunter
  pack_tactics: {
    id: 'pack_tactics',
    name: 'Pack Tactics',
    description: '+1 Speed for 2 turns on kill (stacks up to 5).',
    classId: 'hunter', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'speed', delta: 1, duration: 2, stacking: true },
    },
  },
  killer_instinct: {
    id: 'killer_instinct',
    name: 'Killer Instinct',
    description: '+2 Attack for 2 turns on crit (stacks up to 5).',
    classId: 'hunter', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'attack', delta: 2, duration: 2, stacking: true },
    },
  },
};

export const CLASS_PERK_TIERS: Record<ClassId, { readonly l5: readonly PerkId[]; readonly l10: readonly PerkId[] }> = {
  knight:    { l5: ['iron_will',    'resolute'],     l10: ['unbreakable', 'last_stand'] },
  archer:    { l5: ['precise',      'eagle_eye'],    l10: ['eagles_mark', 'first_strike'] },
  priest:    { l5: ['devout',       'steadfast'],    l10: ['sanctity', 'holy_vigor'] },
  barbarian: { l5: ['berserker',    'tough_skin'],   l10: ['rampage', 'bloodlust'] },
  rogue:     { l5: ['lethal',       'evasive'],      l10: ['backstab', 'phantom'] },
  mage:      { l5: ['arcane_power', 'quick_cast'],   l10: ['spellweaver', 'arcane_surge'] },
  paladin:   { l5: ['righteous',    'vindicator'],   l10: ['crusader', 'aegis'] },
  hunter:    { l5: ['beastmaster',  'sharpshooter'], l10: ['pack_tactics', 'killer_instinct'] },
};
