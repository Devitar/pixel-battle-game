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
};
