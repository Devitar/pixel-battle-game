import type { AbilityId } from '../data/types';
import type { Combatant } from './types';

export function tickCooldowns(combatant: Combatant): void {
  for (const id of Object.keys(combatant.cooldowns) as AbilityId[]) {
    const remaining = (combatant.cooldowns[id] ?? 0) - 1;
    if (remaining <= 0) {
      delete combatant.cooldowns[id];
    } else {
      combatant.cooldowns[id] = remaining;
    }
  }
}

export function setCooldown(
  combatant: Combatant,
  abilityId: AbilityId,
  turns: number,
): void {
  combatant.cooldowns[abilityId] = turns;
}
