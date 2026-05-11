import { describe, expect, it } from 'vitest';
import type { AbilityEffect } from '@data/types';
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

describe('getEffectiveStat — enraged threshold', () => {
  it('returns base attack when combatant is at full HP (threshold not crossed)', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 20,
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(5);
  });

  it('returns base + enragedAttackDelta when below threshold', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 9,  // 9/20 = 0.45 < 0.5
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(8);
  });

  it('returns base attack when at exactly 50% HP (strict less-than)', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,  // 10/20 = 0.5, not < 0.5
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(5);
  });

  it('does not apply enraged bonus to non-attack stats', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'defense')).toBe(4);
    expect(getEffectiveStat(c, 'speed')).toBe(3);
  });

  it('does not apply when enragedThreshold is undefined', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 20,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(5);
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
    const c = makeHeroCombatant('knight', 1, 'p0', { traitIds: ['quick'] });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed + 1);
  });

  it('Stout combatant does not change HP via getEffectiveStat (HP is baked at Hero creation)', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitIds: ['stout'] });
    expect(getEffectiveStat(c, 'hp')).toBe(c.baseStats.hp);
  });

  it('Cowardly in slot 1 reduces speed by 1', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitIds: ['cowardly'] });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed - 1);
  });

  it('Cowardly in slot 2 does not change speed (condition not satisfied)', () => {
    const c = makeHeroCombatant('knight', 2, 'p0', { traitIds: ['cowardly'] });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed);
  });

  it('Sturdy trait and Bulwark status stack on defense', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitIds: ['sturdy'] });
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    expect(getEffectiveStat(c, 'defense')).toBe(c.baseStats.defense + 1 + 3);
  });

  it('Lucky combatant adds +5 to crit', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitIds: ['lucky'] });
    expect(getEffectiveStat(c, 'crit')).toBe(c.baseStats.crit + 5);
  });

  it('Bloodthirsty active: +2 attack when below 50% HP', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitIds: ['bloodthirsty'],
      maxHp: 20,
      currentHp: 9,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack + 2);
  });

  it('Bloodthirsty inactive: no bonus at full HP', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitIds: ['bloodthirsty'],
      maxHp: 20,
      currentHp: 20,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });

  it('Bloodthirsty boundary: no bonus at exactly 50% HP', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitIds: ['bloodthirsty'],
      maxHp: 20,
      currentHp: 10,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });

  it('Combatant with no traitIds reads base + statuses only', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    expect(c.traitIds).toBeUndefined();
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });
});

describe('getEffectiveStat — perk evaluation', () => {
  it('Precise combatant adds +5 to crit', () => {
    const c = makeHeroCombatant('archer', 1, 'p0', { perkId: 'precise' });
    expect(getEffectiveStat(c, 'crit')).toBe(c.baseStats.crit + 5);
  });

  it('Combatant with no perkId reads base + statuses + traits only', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    expect(c.perkId).toBeUndefined();
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });

  it('Trait Sturdy + perk Iron Will stack additively on defense', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitIds: ['sturdy'],
      perkId: 'iron_will',
    });
    expect(getEffectiveStat(c, 'defense')).toBe(c.baseStats.defense + 1 + 1);
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

describe('getEffectiveStat with multiple traitIds', () => {
  it('sums stat effects across all traits', () => {
    const combatant = makeHeroCombatant('knight', 1, 'p0', {
      traitIds: ['quick', 'sharp_eyed'],
    });
    // Quick = +1 Speed; sharp_eyed = +1 Attack. Knight base speed = 3; with quick = 4.
    // sharp_eyed has no speed effect, so speed should equal baseStats.speed + 1.
    const speed = getEffectiveStat(combatant, 'speed');
    expect(speed).toBeGreaterThan(combatant.baseStats.speed);
  });

  it('returns base stat when traitIds is empty', () => {
    const combatant = makeHeroCombatant('knight', 1, 'p0', { traitIds: [] });
    expect(getEffectiveStat(combatant, 'speed')).toBe(combatant.baseStats.speed);
  });
});

describe('tickStatuses — regen', () => {
  it('increments target HP by healPerTurn each tick (capped at maxHp)', () => {
    const c = makeHeroCombatant('priest', 2, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
      maxHp: 20,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' },
      3,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(13);
    expect(events.find((e) => e.kind === 'heal_applied')).toBeDefined();
  });

  it('regen is capped at maxHp (no overheal)', () => {
    const c = makeHeroCombatant('priest', 2, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 19,
      maxHp: 20,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 5, duration: 3, statusId: 'consecrated' },
      3,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(20);  // capped, not 24
  });

  it('regen expires after duration ticks', () => {
    const c = makeHeroCombatant('priest', 2, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
      maxHp: 20,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' },
      3,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    tickStatuses(c, events);
    tickStatuses(c, events);
    expect(c.statuses['consecrated']).toBeUndefined();
    expect(c.currentHp).toBe(19);  // 10 + 3 + 3 + 3
  });

  it('regen does NOT tick on dead combatants', () => {
    const c = makeHeroCombatant('priest', 2, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 0,
      maxHp: 20,
      isDead: true,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' },
      3,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(0);  // unchanged
    expect(events.find((e) => e.kind === 'heal_applied')).toBeUndefined();
  });
});
