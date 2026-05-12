import { ENEMIES } from '@data/enemies';
import { MODIFIERS, type ModifierId } from '@data/modifiers';
import { resolveCombatAbilities } from '@items/kit';
import { applyEquipmentStats, rarePropertyFields } from '@items/stats';
import type { EnemyId, SlotIndex, Wound } from '@data/types';
import { WOUNDS } from '@data/wounds';
import { createEnemyCombatant, createHeroCombatant, createPetCombatant } from '@combat/combatant';
import { PERKS } from '@data/perks';
import type { CombatState, Combatant, Stats } from '@combat/types';
import type { Encounter, ScaleFactors } from '@dungeon/node';
import type { Hero } from '@heroes/hero';

function applyWoundsToStats(base: Stats, wounds: readonly Wound[]): Stats {
  const result: Stats = { ...base };
  for (const wound of wounds) {
    const effect = WOUNDS[wound.id].effect;
    if (effect.kind === 'statDelta') {
      result[effect.stat] += effect.delta;
    }
  }
  return result;
}

function applyModifiersToStats(base: Stats, modifierIds: readonly ModifierId[] | undefined): Stats {
  if (!modifierIds || modifierIds.length === 0) return base;
  const result: Stats = { ...base };
  for (const id of modifierIds) {
    const effect = MODIFIERS[id].effect;
    if (effect.kind === 'statDelta') {
      result[effect.stat] += effect.delta;
    }
  }
  return result;
}

function computeDamageTakenMultiplier(wounds: readonly Wound[]): number {
  let mult = 1;
  for (const wound of wounds) {
    const effect = WOUNDS[wound.id].effect;
    if (effect.kind === 'damageTakenMult') {
      mult += effect.multiplier - 1;
    }
  }
  return mult;
}

function scaleEnemyStats(enemyId: EnemyId, scale: ScaleFactors): Stats {
  const base = ENEMIES[enemyId].baseStats;
  return {
    hp: Math.round(base.hp * scale.hp),
    attack: Math.round(base.attack * scale.attack),
    defense: base.defense,
    speed: base.speed,
    mind: base.mind,
    crit: base.crit,
    dodge: base.dodge,
  };
}

export function buildCombatState(
  party: readonly Hero[],
  encounter: Encounter,
  petsDownByHeroId: readonly string[] = [],
): CombatState {
  const combatants: Combatant[] = [];

  for (let i = 0; i < party.length; i++) {
    const hero = party[i];
    const woundedStats = applyWoundsToStats(hero.baseStats, hero.wounds);
    const fullStats = applyEquipmentStats(woundedStats, hero.equipment);
    const damageTakenMultiplier = computeDamageTakenMultiplier(hero.wounds);
    const rareFields = rarePropertyFields(hero.equipment);
    const { abilities, aiPriority } = resolveCombatAbilities(hero);
    const woundedMaxHp = fullStats.hp;
    combatants.push(
      createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
        baseStats: fullStats,
        currentHp: Math.min(hero.currentHp, woundedMaxHp),
        maxHp: woundedMaxHp,
        traitIds: hero.traitIds,
        abilities,
        aiPriority,
        pickedPerks: hero.pickedPerks,
        ...(damageTakenMultiplier !== 1 ? { damageTakenMultiplier } : {}),
        ...rareFields,
      }),
    );
  }

  // Pet build pass — for each Hunter party member with a petSpeciesId whose pet
  // isn't currently down for the run, add a pet combatant at slot 4.
  for (let i = 0; i < party.length; i++) {
    const hero = party[i];
    if (hero.classId !== 'hunter' || !hero.petSpeciesId) continue;
    if (petsDownByHeroId.includes(hero.id)) continue;
    const heroCombatant = combatants[i];
    // Sum petAttackBonus across all picked perks (currently at most one L5 perk).
    let petAttackBonus = 0;
    for (const perkId of hero.pickedPerks) {
      petAttackBonus += PERKS[perkId].petAttackBonus ?? 0;
    }
    combatants.push(
      createPetCombatant(
        hero.petSpeciesId,
        hero.id,
        heroCombatant.baseStats.attack,
        petAttackBonus,
      ),
    );
  }

  for (let i = 0; i < encounter.enemies.length; i++) {
    const placement = encounter.enemies[i];
    const scaled = scaleEnemyStats(placement.enemyId, encounter.scale);
    const withModifierStats = applyModifiersToStats(scaled, placement.modifierIds);
    const modifierFields: Partial<Combatant> = {};
    for (const id of placement.modifierIds ?? []) {
      const effect = MODIFIERS[id].effect;
      if (effect.kind === 'venomous_on_hit') {
        modifierFields.venomousDamage = effect.damagePerTurn;
        modifierFields.venomousDuration = effect.duration;
      } else if (effect.kind === 'enraged_threshold') {
        modifierFields.enragedThreshold = effect.hpRatio;
        modifierFields.enragedAttackDelta = effect.attackDelta;
      }
    }
    combatants.push(
      createEnemyCombatant(placement.enemyId, placement.slot, `e${i}`, {
        baseStats: withModifierStats,
        currentHp: withModifierStats.hp,
        maxHp: withModifierStats.hp,
        ...modifierFields,
      }),
    );
  }

  return { combatants, round: 0, exhaustionLevel: 0 };
}
