import { CLASSES } from '@data/classes';
import { ENEMIES } from '@data/enemies';
import { PET_SPECIES } from '@data/pet_species';
import type { ClassId, EnemyId, PetSpeciesId, SlotIndex } from '@data/types';
import type { Combatant, CombatantId } from './types';

export function createHeroCombatant(
  classId: ClassId,
  slot: SlotIndex,
  id: CombatantId,
  overrides: Partial<Combatant> = {},
): Combatant {
  const def = CLASSES[classId];
  return {
    id,
    side: 'player',
    slot,
    kind: 'hero',
    classId,
    baseStats: { ...def.baseStats },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    cooldowns: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    isDead: false,
    ...overrides,
  };
}

export function createEnemyCombatant(
  enemyId: EnemyId,
  slot: SlotIndex,
  id: CombatantId,
  overrides: Partial<Combatant> = {},
): Combatant {
  const def = ENEMIES[enemyId];
  return {
    id,
    side: 'enemy',
    slot,
    kind: 'enemy',
    enemyId,
    baseStats: { ...def.baseStats },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    cooldowns: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    preferredSlots: def.preferredSlots,
    tags: def.tags,
    isDead: false,
    ...overrides,
  };
}

export function createPetCombatant(
  speciesId: PetSpeciesId,
  ownerHeroId: string,
  hunterEffectiveAttack: number,
  petAttackBonus: number = 0,
  petId: CombatantId = `pet_${ownerHeroId}`,
): Combatant {
  const def = PET_SPECIES[speciesId];
  const computedAttack =
    Math.round(def.attackScaleFromHunter * hunterEffectiveAttack) + petAttackBonus;
  return {
    id: petId,
    side: 'player',
    slot: 4,
    kind: 'pet',
    ownerHeroId,
    petSpeciesId: speciesId,
    baseStats: { ...def.baseStats, attack: computedAttack },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    cooldowns: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    preferredSlots: def.preferredSlots,
    tags: def.tags,
    isDead: false,
  };
}
