import { ABILITIES } from '@data/abilities';
import type { AbilityId, AiCondition } from '@data/types';
import type { Rng } from '@util/rng';
import { resolveTargetSelector } from './target_selector';
import type { Combatant, CombatantId, CombatState } from './types';

export interface PickedAction {
  abilityId: AbilityId;
  targetIds: readonly CombatantId[];
}

export function pickAbility(caster: Combatant, state: CombatState, rng: Rng): PickedAction | null {
  for (let i = 0; i < caster.aiPriority.length; i++) {
    const abilityId = caster.aiPriority[i];
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;
    if (!ability.canCastFrom.includes(caster.slot)) continue;
    const targetIds = resolveTargetSelector(ability.target, caster, state, rng);
    if (targetIds.length === 0) continue;
    if (ability.aiCondition && !checkAiCondition(ability.aiCondition, caster, targetIds)) continue;

    // If a higher-priority ability is blocked SOLELY by canCastFrom, prefer
    // shuffle over this lower-priority pick. Avoids the Knight-at-slot-3
    // -spamming-Bulwark anti-pattern where the engine never reaches the
    // null/shuffle path because a self-buff or basic Attack is always castable.
    if (i > 0 && hasShufflableHigherPriority(caster, i)) return null;

    return { abilityId, targetIds };
  }
  return null;
}

function hasShufflableHigherPriority(caster: Combatant, currentIndex: number): boolean {
  for (let j = 0; j < currentIndex; j++) {
    const abilityId = caster.aiPriority[j];
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;  // cooldown blocks regardless of slot
    if (ability.canCastFrom.includes(caster.slot)) continue;  // not slot-blocked from here
    return true;  // slot-blocked, otherwise-available higher priority found
  }
  return false;
}

function checkAiCondition(
  cond: AiCondition,
  caster: Combatant,
  targetIds: readonly CombatantId[],
): boolean {
  switch (cond.kind) {
    case 'minTargets':
      return targetIds.length >= cond.n;
    case 'casterHpBelow':
      return caster.maxHp > 0 && caster.currentHp / caster.maxHp < cond.ratio;
  }
}
