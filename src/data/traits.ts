import type { TraitDef, TraitId } from './types';

export const TRAITS: Record<TraitId, TraitDef> = {
  stout: {
    id: 'stout',
    name: 'Stout',
    description: '+10% HP',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  quick: {
    id: 'quick',
    name: 'Quick',
    description: '+1 Speed',
    statEffects: [{ stat: 'speed', delta: 1 }],
  },
  sturdy: {
    id: 'sturdy',
    name: 'Sturdy',
    description: '+1 Defense',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  sharp_eyed: {
    id: 'sharp_eyed',
    name: 'Sharp-eyed',
    description: '+1 Attack',
    statEffects: [{ stat: 'attack', delta: 1 }],
  },
  cowardly: {
    id: 'cowardly',
    name: 'Cowardly',
    description: '-1 Speed when in slot 1',
    statEffects: [{ stat: 'speed', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
  nervous: {
    id: 'nervous',
    name: 'Nervous',
    description: '-1 Defense when in slot 1',
    statEffects: [{ stat: 'defense', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
  frail: {
    id: 'frail',
    name: 'Frail',
    description: '-10% HP',
    hpEffect: { delta: -10, mode: 'percent' },
  },
  sluggish: {
    id: 'sluggish',
    name: 'Sluggish',
    description: '-1 Speed',
    statEffects: [{ stat: 'speed', delta: -1 }],
  },
  lucky: {
    id: 'lucky',
    name: 'Lucky',
    description: '+5% Crit',
    statEffects: [{ stat: 'crit', delta: 5 }],
  },
  slippery: {
    id: 'slippery',
    name: 'Slippery',
    description: '+5% Dodge',
    statEffects: [{ stat: 'dodge', delta: 5 }],
  },
  wise: {
    id: 'wise',
    name: 'Wise',
    description: '+1 Mind',
    statEffects: [{ stat: 'mind', delta: 1 }],
  },
  bloodthirsty: {
    id: 'bloodthirsty',
    name: 'Bloodthirsty',
    description: '+2 Attack when below 50% HP',
    statEffects: [{ stat: 'attack', delta: 2, condition: { kind: 'belowHpRatio', ratio: 0.5 } }],
  },
};
