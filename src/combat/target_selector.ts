import type { Rng } from '../util/rng';
import type { TargetFilter, TargetSelector } from '../data/types';
import type { Combatant, CombatantId, CombatSide, CombatState } from './types';

function opposingSide(side: CombatSide): CombatSide {
  return side === 'player' ? 'enemy' : 'player';
}

function passesFilter(target: Combatant, filter: TargetFilter | undefined): boolean {
  if (!filter) return true;
  switch (filter.kind) {
    case 'hurt':
      return target.currentHp < target.maxHp;
    case 'hasStatus':
      return filter.statusId in target.statuses;
    case 'lacksStatus':
      return !(filter.statusId in target.statuses);
    case 'hasTag':
      return (target.tags ?? []).includes(filter.tag);
  }
}

export function resolveTargetSelector(
  selector: TargetSelector,
  caster: Combatant,
  state: CombatState,
  rng: Rng,
): CombatantId[] {
  let candidates: Combatant[];
  if (selector.side === 'self') {
    candidates = [caster];
  } else if (selector.side === 'ally') {
    candidates = state.combatants.filter((c) => c.side === caster.side && c.id !== caster.id);
  } else {
    candidates = state.combatants.filter((c) => c.side === opposingSide(caster.side));
  }

  candidates = candidates.filter((c) => !c.isDead);

  const slots = selector.slots;
  if (slots === undefined || slots === 'all') {
    // no-op
  } else if (slots === 'furthest') {
    if (candidates.length > 0) {
      const maxSlot = Math.max(...candidates.map((c) => c.slot));
      candidates = candidates.filter((c) => c.slot === maxSlot);
    }
  } else {
    const allowed = new Set<number>(slots);
    candidates = candidates.filter((c) => allowed.has(c.slot));
  }

  candidates = candidates.filter((c) => passesFilter(c, selector.filter));

  if (selector.side === 'enemy') {
    const taunters = candidates.filter((c) => 'taunting' in c.statuses);
    if (taunters.length > 0) candidates = taunters;
  }

  if (candidates.length === 0) return [];

  if (selector.pick) {
    let chosen: Combatant;
    switch (selector.pick) {
      case 'first':
        chosen = [...candidates].sort((a, b) => a.slot - b.slot)[0];
        break;
      case 'lowestHp':
        chosen = [...candidates].sort((a, b) => a.currentHp - b.currentHp || a.slot - b.slot)[0];
        break;
      case 'highestHp':
        chosen = [...candidates].sort((a, b) => b.currentHp - a.currentHp || a.slot - b.slot)[0];
        break;
      case 'random':
        chosen = rng.pick(candidates);
        break;
    }
    return [chosen.id];
  }

  return candidates.map((c) => c.id);
}
