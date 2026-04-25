import type { Combatant, CombatSide, CombatState } from '../types';
import { createEnemyCombatant, createHeroCombatant } from '../combatant';

export const makeHeroCombatant = createHeroCombatant;
export const makeEnemyCombatant = createEnemyCombatant;

export function makeTestState(
  heroes: readonly Combatant[],
  enemies: readonly Combatant[],
): CombatState {
  return {
    combatants: [...heroes, ...enemies],
    round: 0,
  };
}

export function bySide(state: CombatState, side: CombatSide): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.isDead);
}
