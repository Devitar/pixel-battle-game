import { TRAITS } from '../data/traits';
import type { BuffableStat, TraitCondition } from '../data/types';
import type { Combatant, CombatEvent } from './types';

function evaluateTraitCondition(
  condition: TraitCondition | undefined,
  combatant: Combatant,
): boolean {
  if (!condition) return true;
  switch (condition.kind) {
    case 'inSlot':
      return combatant.slot === condition.slot;
  }
}

export function getEffectiveStat(combatant: Combatant, stat: BuffableStat): number {
  let total = combatant.baseStats[stat === 'hp' ? 'hp' : stat];

  if (stat !== 'hp' && combatant.traitId) {
    const trait = TRAITS[combatant.traitId];
    for (const effect of trait.statEffects ?? []) {
      if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
        total += effect.delta;
      }
    }
  }

  for (const status of Object.values(combatant.statuses)) {
    const e = status.effect;
    if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === stat) {
      total += e.delta;
    }
  }
  return total;
}

export function tickStatuses(combatant: Combatant, events: CombatEvent[]): void {
  const ids = Object.keys(combatant.statuses);
  for (const id of ids) {
    const status = combatant.statuses[id];
    status.remainingTurns -= 1;
    if (status.remainingTurns <= 0) {
      const e = status.effect;
      if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === 'hp') {
        combatant.maxHp -= e.delta;
      }
      delete combatant.statuses[id];
      events.push({ kind: 'status_expired', targetId: combatant.id, statusId: status.statusId });
    }
  }
}
