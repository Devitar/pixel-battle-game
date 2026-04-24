import type { Rng } from '../util/rng';
import { getEffectiveStat } from './statuses';
import type { Combatant, CombatantId } from './types';

export function computeInitiative(combatants: readonly Combatant[], rng: Rng): CombatantId[] {
  const living = combatants.filter((c) => !c.isDead);
  const withInit = living.map((c) => {
    const speed = getEffectiveStat(c, 'speed');
    const varianceMax = Math.max(2, Math.floor(speed * 0.1));
    const initiative = speed + rng.int(0, varianceMax);
    return { c, initiative };
  });
  withInit.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (a.c.side !== b.c.side) return a.c.side === 'player' ? -1 : 1;
    return a.c.slot - b.c.slot;
  });
  return withInit.map((x) => x.c.id);
}
