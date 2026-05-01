import { ABILITIES } from '@data/abilities';
import { CLASSES } from '@data/classes';
import { WEAPON_DISPLAY_NAME, WEAPON_FAMILY } from '@data/items';
import type { AbilityId } from '@data/types';
import type { Hero } from '@heroes/hero';

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

/**
 * Returns a human-readable one-line status describing the hero's current kit
 * configuration: which weapon they have, which band they fall into (full kit /
 * off-preferred / wrong family), and any shield-filter consequence.
 *
 * Output examples:
 *   "Sword + Shield · Full kit"
 *   "Axe · Off-preferred (1 swap)"
 *   "Bow · Wrong family (basic only)"
 *   "Sword · No shield (Shield Bash unavailable)"
 */
export function describeKitStatus(hero: Hero): string {
  const classDef = CLASSES[hero.classId];
  const equippedWeaponType = hero.equipment.weapon.weaponType;
  if (!equippedWeaponType) {
    return 'Unknown weapon';
  }

  const weaponName = WEAPON_DISPLAY_NAME[equippedWeaponType];
  const isPreferred = equippedWeaponType === classDef.preferredWeapon;
  const equippedFamily = WEAPON_FAMILY[equippedWeaponType];
  const sameFamily = equippedFamily === classDef.weaponFamily;

  if (isPreferred) {
    const shieldRequiredInClass = classDef.abilities.some(
      (id) => ABILITIES[id].requiresShield === true,
    );
    if (shieldRequiredInClass && hero.equipment.shield === undefined) {
      return `${weaponName} · No shield (Shield Bash unavailable)`;
    }
    if (shieldRequiredInClass) {
      return `${weaponName} + Shield · Full kit`;
    }
    return `${weaponName} · Full kit`;
  }

  if (sameFamily && classDef.weaponSwaps?.[equippedWeaponType] !== undefined) {
    return `${weaponName} · Off-preferred (1 swap)`;
  }

  return `${weaponName} · Wrong family (basic only)`;
}
