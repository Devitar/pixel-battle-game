import { ABILITIES } from '../data/abilities';
import { CLASSES } from '../data/classes';
import { WEAPON_FAMILY } from '../data/items';
import type { AbilityId } from '../data/types';
import type { Hero } from '../heroes/hero';

export interface ResolvedCombatAbilities {
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
}

export function resolveCombatAbilities(hero: Hero): ResolvedCombatAbilities {
  const classDef = CLASSES[hero.classId];
  const equippedWeaponType = hero.equipment.weapon.weaponType;
  if (!equippedWeaponType) {
    // Defensive against data corruption — every weapon should have weaponType.
    return { abilities: [classDef.basicAbility], aiPriority: [classDef.basicAbility] };
  }

  const equippedFamily = WEAPON_FAMILY[equippedWeaponType];
  const preferredFamily = classDef.weaponFamily;
  const isPreferred = equippedWeaponType === classDef.preferredWeapon;

  let abilities: AbilityId[];
  let aiPriority: AbilityId[];

  if (isPreferred) {
    // Band 1: preferred weapon — full kit
    abilities = [...classDef.abilities];
    aiPriority = [...classDef.aiPriority];
  } else if (
    equippedFamily === preferredFamily &&
    classDef.swapTarget !== undefined &&
    classDef.weaponSwaps !== undefined &&
    classDef.weaponSwaps[equippedWeaponType] !== undefined
  ) {
    // Band 2: same family, swap one ability
    const replacement = classDef.weaponSwaps[equippedWeaponType]!;
    const target = classDef.swapTarget;
    abilities = classDef.abilities.map((a) => (a === target ? replacement : a));
    aiPriority = classDef.aiPriority.map((a) => (a === target ? replacement : a));
  } else {
    // Band 3: wholly wrong — only basic
    abilities = [classDef.basicAbility];
    aiPriority = [classDef.basicAbility];
  }

  // Shield filter — applied last
  if (hero.equipment.shield === undefined) {
    abilities = abilities.filter((id) => !ABILITIES[id].requiresShield);
    aiPriority = aiPriority.filter((id) => !ABILITIES[id].requiresShield);
  }

  return { abilities, aiPriority };
}
