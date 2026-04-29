import { MODIFIER_IDS, type ModifierId } from '../data/modifiers';
import type { Rng } from '../util/rng';
import type { EnemyPlacement } from './node';

export function poolForFloor(floorNumber: number): readonly ModifierId[] {
  if (floorNumber < 5)  return [];
  if (floorNumber < 10) return ['armored'];
  if (floorNumber < 15) return ['armored', 'venomous'];
  return ['armored', 'venomous', 'enraged'];
}

export function fullPool(): readonly ModifierId[] {
  return MODIFIER_IDS;
}

export function rollModifier(pool: readonly ModifierId[], rng: Rng): ModifierId | undefined {
  if (pool.length === 0) return undefined;
  return rng.pick(pool);
}

export function stampCombatModifiers(
  enemies: readonly EnemyPlacement[],
  floorNumber: number,
  rng: Rng,
): EnemyPlacement[] {
  const pool = poolForFloor(floorNumber);
  if (pool.length === 0) {
    return enemies.map((p) => ({ ...p }));
  }
  return enemies.map((p) => ({ ...p, modifierIds: [rng.pick(pool)] }));
}

export function stampEliteModifiers(
  enemies: readonly EnemyPlacement[],
  rng: Rng,
): EnemyPlacement[] {
  const pool = fullPool();
  return enemies.map((p) => ({ ...p, modifierIds: [rng.pick(pool)] }));
}
