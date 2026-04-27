import { describe, expect, it } from 'vitest';
import type { AbilityEffect } from '../../data/types';
import { getEffectiveStat, tickStatuses } from '../statuses';
import type { CombatEvent, StatusInstance } from '../types';
import { makeEnemyCombatant, makeHeroCombatant } from './helpers';

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

describe('getEffectiveStat — trait evaluation', () => {
  it('Quick combatant adds +1 to speed', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'quick' });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed + 1);
  });

  it('Stout combatant does not change HP via getEffectiveStat (HP is baked at Hero creation)', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'stout' });
    expect(getEffectiveStat(c, 'hp')).toBe(c.baseStats.hp);
  });

  it('Cowardly in slot 1 reduces speed by 1', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'cowardly' });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed - 1);
  });

  it('Cowardly in slot 2 does not change speed (condition not satisfied)', () => {
    const c = makeHeroCombatant('knight', 2, 'p0', { traitId: 'cowardly' });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed);
  });

  it('Sturdy trait and Bulwark status stack on defense', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'sturdy' });
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    expect(getEffectiveStat(c, 'defense')).toBe(c.baseStats.defense + 1 + 3);
  });

  it('Combatant with no traitId reads base + statuses only', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    expect(c.traitId).toBeUndefined();
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });
});

describe('tickStatuses — poison', () => {
  it('decrements target HP by damagePerTurn each tick', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
    });
    c.statuses['poisoned'] = status(
      { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      3,
      'enemy',
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(8);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 2, wasCrit: false, sourceId: 'enemy', targetId: 'p0' });
  });

  it('poison damage bypasses defense', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
    });
    c.statuses['poisoned'] = status(
      { kind: 'poison', damagePerTurn: 2, duration: 1, statusId: 'poisoned' },
      1,
      'enemy',
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(8);
  });

  it('poison expires after duration ticks', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 20,
    });
    c.statuses['poisoned'] = status(
      { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      3,
      'enemy',
    );
    for (let i = 0; i < 3; i++) {
      tickStatuses(c, [] as CombatEvent[]);
    }
    expect(c.currentHp).toBe(14);
    expect(c.statuses['poisoned']).toBeUndefined();
  });

  it('poison kills target — emits death event and sets isDead', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
    });
    c.statuses['poisoned'] = status(
      { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      3,
      'enemy',
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.isDead).toBe(true);
    const death = events.find((e) => e.kind === 'death');
    expect(death).toMatchObject({ combatantId: 'p0' });
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ lethal: true });
  });
});
