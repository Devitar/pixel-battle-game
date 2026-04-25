import type {
  Ability,
  AbilityEffect,
  BuffableStat,
  SlotIndex,
  StatusId,
  TargetSelector,
} from './types';

export interface AbilityDescription {
  castLine: string;
  targetLine: string;
  effectLines: string[];
}

export function describeAbility(ability: Ability): AbilityDescription {
  return {
    castLine: describeCast(ability.canCastFrom),
    targetLine: describeTarget(ability.target),
    effectLines: ability.effects.map(describeEffect),
  };
}

function describeCast(slots: readonly SlotIndex[]): string {
  const sorted = [...slots].sort((a, b) => a - b);

  // Both [1,2,3] (full player party) and [1,2,3,4] (full enemy formation)
  // read as "any slot" — for either audience there is no positional restriction.
  const startsAtOneNoGaps = sorted.every((s, i) => s === i + 1);
  if ((sorted.length === 3 || sorted.length === 4) && startsAtOneNoGaps) {
    return 'any slot';
  }

  if (sorted.length === 1) return `slot ${sorted[0]}`;
  if (sorted.length === 2) return `slot ${sorted[0]} or ${sorted[1]}`;
  const head = sorted.slice(0, -1).join(', ');
  return `slot ${head}, or ${sorted[sorted.length - 1]}`;
}

const STATUS_LABEL: Record<StatusId, string> = {
  bulwark: 'bulwark',
  taunting: 'taunting',
  marked: 'marked',
  blessed: 'blessed',
  rotting: 'rotting',
  frailty: 'frailty',
  stunned: 'stunned',
};

function describeFilter(filter: TargetSelector['filter']): string {
  if (!filter) return '';
  switch (filter.kind) {
    case 'hurt':
      return '(hurt)';
    case 'hasStatus':
      return `(${STATUS_LABEL[filter.statusId]})`;
    case 'lacksStatus':
      return `(not ${STATUS_LABEL[filter.statusId]})`;
    case 'hasTag':
      return `(${filter.tag})`;
  }
}

function describePick(pick: TargetSelector['pick']): string {
  if (!pick) return '';
  if (pick === 'lowestHp') return ', lowest HP';
  if (pick === 'highestHp') return ', highest HP';
  if (pick === 'first') return ', first available';
  return '';
}

function describeSlotPhrase(
  slots: readonly SlotIndex[] | 'all' | 'furthest',
): string {
  if (slots === 'all') return 'all';
  if (slots === 'furthest') return 'furthest';
  if (slots.length === 1) return `slot ${slots[0]}`;
  if (slots.length === 2) return `slot ${slots[0]} or ${slots[1]}`;
  const sorted = [...slots].sort((a, b) => a - b);
  const head = sorted.slice(0, -1).join(', ');
  return `slot ${head}, or ${sorted[sorted.length - 1]}`;
}

function describeTarget(t: TargetSelector): string {
  // Special case: slots:'all' + pick:'first' reads "side, first available"
  // (avoids the ungrammatical "all enemies, first available")
  if (t.slots === 'all' && t.pick === 'first') {
    const filter = describeFilter(t.filter);
    return filter ? `${t.side} ${filter}, first available` : `${t.side}, first available`;
  }

  // Pure 'all' (no pick): "all enemies" / "all allies"
  if (t.slots === 'all') {
    const plural =
      t.side === 'enemy' ? 'enemies' : t.side === 'ally' ? 'allies' : 'self';
    const filter = describeFilter(t.filter);
    return filter ? `all ${plural} ${filter}` : `all ${plural}`;
  }

  // Default: side [+ slot phrase] [+ filter] [+ pick suffix]
  const slotPhrase = t.slots ? describeSlotPhrase(t.slots) : '';
  const filter = describeFilter(t.filter);

  let main = slotPhrase ? `${t.side} ${slotPhrase}` : t.side;
  if (filter) main = `${main} ${filter}`;
  return main + describePick(t.pick);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function capStat(stat: BuffableStat): string {
  if (stat === 'hp') return 'HP';
  return stat[0].toUpperCase() + stat.slice(1);
}

function turnWord(n: number): string {
  return n === 1 ? 'turn' : 'turns';
}

function describeEffect(e: AbilityEffect): string {
  switch (e.kind) {
    case 'damage':
      return `Deal ${Math.round(e.power * 100)}% damage`;
    case 'heal':
      return `Heal ${Math.round(e.power * 100)}% power`;
    case 'stun':
      return `Stun for ${e.duration} ${turnWord(e.duration)}`;
    case 'shove':
      return `Shove ${e.slots} slot${e.slots === 1 ? '' : 's'} back`;
    case 'pull':
      return `Pull ${e.slots} slot${e.slots === 1 ? '' : 's'} forward`;
    case 'buff':
      return `${signed(e.delta)} ${capStat(e.stat)} for ${e.duration} ${turnWord(e.duration)}`;
    case 'debuff':
      return `${signed(e.delta)} ${capStat(e.stat)} for ${e.duration} ${turnWord(e.duration)}`;
    case 'mark':
      return `Mark target for +${Math.round(e.damageBonus * 100)}% damage (${e.duration} ${turnWord(e.duration)})`;
    case 'taunt':
      return `Taunt for ${e.duration} ${turnWord(e.duration)}`;
  }
}
