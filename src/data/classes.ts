import { SPRITE_NAMES } from '../render/sprite_names.generated';
import type { ClassDef, ClassId } from './types';

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    baseStats: { hp: 20, attack: 4, defense: 4, speed: 3 },
    preferredWeapon: 'sword',
    abilities: ['knight_slash', 'shield_bash', 'bulwark', 'taunt'],
    aiPriority: ['shield_bash', 'bulwark', 'taunt', 'knight_slash'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.sword_tier1),
      shield: String(SPRITE_NAMES.shield.alloy_shield_1),
    },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    baseStats: { hp: 14, attack: 5, defense: 2, speed: 5 },
    preferredWeapon: 'bow',
    abilities: ['archer_shoot', 'piercing_shot', 'volley', 'flare_arrow'],
    aiPriority: ['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.bow_wood_tier1),
    },
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    baseStats: { hp: 15, attack: 3, defense: 2, speed: 4 },
    preferredWeapon: 'holy_symbol',
    abilities: ['priest_strike', 'mend', 'smite', 'bless'],
    aiPriority: ['mend', 'bless', 'smite', 'priest_strike'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.mace_tier1),
    },
  },
};
