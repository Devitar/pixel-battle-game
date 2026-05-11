import type { Stats } from '@combat/types';
import type { AbilityId, CombatantTag, PetSpeciesId, SlotIndex } from './types';

export interface PetSpeciesDef {
  id: PetSpeciesId;
  name: string;
  baseStats: Stats;
  /** Pet attack at combat-setup = round(scale * hunterEffectiveAttack) + perkBonus.
   *  baseStats.attack is a sentinel 0; the species attack budget is fully captured here. */
  attackScaleFromHunter: number;
  preferredSlots: readonly SlotIndex[];
  basicAbility: AbilityId;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  tags: readonly CombatantTag[];
}

export const PET_SPECIES: Record<PetSpeciesId, PetSpeciesDef> = {
  wolf: {
    id: 'wolf', name: 'Wolf',
    baseStats: { hp: 14, attack: 0, defense: 2, speed: 5, mind: 0, crit: 10, dodge: 10 },
    attackScaleFromHunter: 0.6,
    preferredSlots: [4],
    basicAbility: 'wolf_bite',
    abilities: ['wolf_bite', 'wolf_howl'],
    aiPriority: ['wolf_howl', 'wolf_bite'],
    tags: ['beast'],
  },
  hawk: {
    id: 'hawk', name: 'Hawk',
    baseStats: { hp: 9, attack: 0, defense: 1, speed: 7, mind: 0, crit: 20, dodge: 15 },
    attackScaleFromHunter: 0.5,
    preferredSlots: [4],
    basicAbility: 'hawk_dive',
    abilities: ['hawk_dive', 'hawk_screech'],
    aiPriority: ['hawk_screech', 'hawk_dive'],
    tags: ['beast'],
  },
  bear: {
    id: 'bear', name: 'Bear',
    baseStats: { hp: 22, attack: 0, defense: 4, speed: 2, mind: 0, crit: 5, dodge: 5 },
    attackScaleFromHunter: 0.4,
    preferredSlots: [4],
    basicAbility: 'bear_maul',
    abilities: ['bear_maul', 'bear_roar'],
    aiPriority: ['bear_roar', 'bear_maul'],
    tags: ['beast'],
  },
};
