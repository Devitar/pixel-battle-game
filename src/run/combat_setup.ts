import { ENEMIES } from '../data/enemies';
import type { EnemyId, SlotIndex } from '../data/types';
import { createEnemyCombatant, createHeroCombatant } from '../combat/combatant';
import type { CombatState, Combatant, Stats } from '../combat/types';
import type { Encounter, ScaleFactors } from '../dungeon/node';
import type { Hero } from '../heroes/hero';

function scaleEnemyStats(enemyId: EnemyId, scale: ScaleFactors): Stats {
  const base = ENEMIES[enemyId].baseStats;
  return {
    hp: Math.round(base.hp * scale.hp),
    attack: Math.round(base.attack * scale.attack),
    defense: base.defense,
    speed: base.speed,
  };
}

export function buildCombatState(
  party: readonly Hero[],
  encounter: Encounter,
): CombatState {
  const combatants: Combatant[] = [];

  for (let i = 0; i < party.length; i++) {
    const hero = party[i];
    combatants.push(
      createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
        baseStats: hero.baseStats,
        currentHp: hero.currentHp,
        maxHp: hero.maxHp,
        traitId: hero.traitId,
      }),
    );
  }

  for (let i = 0; i < encounter.enemies.length; i++) {
    const placement = encounter.enemies[i];
    const scaled = scaleEnemyStats(placement.enemyId, encounter.scale);
    combatants.push(
      createEnemyCombatant(placement.enemyId, placement.slot, `e${i}`, {
        baseStats: scaled,
        currentHp: scaled.hp,
        maxHp: scaled.hp,
      }),
    );
  }

  return { combatants, round: 0 };
}
