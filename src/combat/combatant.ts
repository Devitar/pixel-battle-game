import { CLASSES } from '../data/classes';
import { ENEMIES } from '../data/enemies';
import type { ClassId, EnemyId, SlotIndex } from '../data/types';
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
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    preferredSlots: def.preferredSlots,
    tags: def.tags,
    isDead: false,
    ...overrides,
  };
}
