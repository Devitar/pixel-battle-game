import { describe, expect, it } from 'vitest';
import type { AbilityEffect } from '../../data/types';
import { getEffectiveStat, tickStatuses } from '../statuses';
import type { CombatEvent, StatusInstance } from '../types';
import { makeHeroCombatant } from './helpers';

function status(effect: AbilityEffect, remainingTurns: number, sourceId = 'src'): StatusInstance {
  const statusId = 'statusId' in effect ? effect.statusId : ('stunned' as const);
  return { statusId, remainingTurns, effect, sourceId };
}

describe('getEffectiveStat', () => {
  it('returns base stat when no statuses', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    expect(getEffectiveStat(c, 'attack')).toBe(4);
    expect(getEffectiveStat(c, 'defense')).toBe(4);
  });

  it('sums buff deltas on the matching stat', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    expect(getEffectiveStat(c, 'defense')).toBe(7);
    expect(getEffectiveStat(c, 'attack')).toBe(4);
  });

  it('applies debuff deltas (negative)', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['rotting'] = status(
      { kind: 'debuff', stat: 'attack', delta: -1, duration: 2, statusId: 'rotting' },
      2,
    );
    expect(getEffectiveStat(c, 'attack')).toBe(3);
  });
});

describe('tickStatuses', () => {
  it('decrements durations by 1', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.statuses['bulwark'].remainingTurns).toBe(1);
    expect(events).toHaveLength(0);
  });

  it('expires statuses at 0 and emits status_expired', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      1,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.statuses['bulwark']).toBeUndefined();
    expect(events).toEqual([{ kind: 'status_expired', targetId: 'p0', statusId: 'bulwark' }]);
  });

  it('reverts maxHp on hp-debuff expiry; currentHp stays put', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.maxHp = 17;
    c.currentHp = 15;
    c.statuses['frailty'] = status(
      { kind: 'debuff', stat: 'hp', delta: -3, duration: 2, statusId: 'frailty' },
      1,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.maxHp).toBe(20);
    expect(c.currentHp).toBe(15);
  });

  it('keeps multi-turn statuses through multiple ticks', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.statuses['bulwark'].remainingTurns).toBe(1);
    tickStatuses(c, events);
    expect(c.statuses['bulwark']).toBeUndefined();
    expect(events).toHaveLength(1);
  });
});
