import { CLASSES } from '../../data/classes';
import { ENEMIES } from '../../data/enemies';
import type { ClassId, EnemyId, SlotIndex } from '../../data/types';
import type { Combatant, CombatantId, CombatSide, CombatState } from '../types';

export function makeHeroCombatant(
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
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    isDead: false,
    ...overrides,
  };
}

export function makeEnemyCombatant(
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
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    preferredSlots: def.preferredSlots,
    tags: def.tags,
    isDead: false,
    ...overrides,
  };
}

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
