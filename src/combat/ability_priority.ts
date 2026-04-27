import { ABILITIES } from '../data/abilities';
import type { AbilityId, AiCondition } from '../data/types';
import type { Rng } from '../util/rng';
import { resolveTargetSelector } from './target_selector';
import type { Combatant, CombatantId, CombatState } from './types';

export interface PickedAction {
  abilityId: AbilityId;
  targetIds: readonly CombatantId[];
}

export function pickAbility(caster: Combatant, state: CombatState, rng: Rng): PickedAction | null {
  for (const abilityId of caster.aiPriority) {
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;
    if (!ability.canCastFrom.includes(caster.slot)) continue;
    const targetIds = resolveTargetSelector(ability.target, caster, state, rng);
    if (targetIds.length === 0) continue;
    if (ability.aiCondition && !checkAiCondition(ability.aiCondition, caster, targetIds)) continue;
    return { abilityId, targetIds };
  }
  return null;
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
