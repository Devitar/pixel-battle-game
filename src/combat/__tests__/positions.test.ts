import { describe, expect, it } from 'vitest';
import { collapseAfterDeath, pull, shove, shuffle, swap } from '../positions';
import type { CombatEvent } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('shove', () => {
  it('moves target back and displaces neighbor forward', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const state = makeTestState([], [e1, e2]);
    const events: CombatEvent[] = [];
    shove(e1, 1, state, events);
    expect(e1.slot).toBe(2);
    expect(e2.slot).toBe(1);
    expect(events.map((e) => e.kind)).toEqual(['position_changed', 'position_changed']);
  });

  it('is a no-op at the back of the formation', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const state = makeTestState([], [e1, e2]);
    const events: CombatEvent[] = [];
    shove(e2, 1, state, events);
    expect(e2.slot).toBe(2);
    expect(events).toHaveLength(0);
  });
});

describe('pull', () => {
  it('moves target forward and displaces neighbor back', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const state = makeTestState([], [e1, e2]);
    const events: CombatEvent[] = [];
    pull(e2, 1, state, events);
    expect(e2.slot).toBe(1);
    expect(e1.slot).toBe(2);
  });

  it('is a no-op when already at slot 1', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([], [e1]);
    const events: CombatEvent[] = [];
    pull(e1, 1, state, events);
    expect(e1.slot).toBe(1);
    expect(events).toHaveLength(0);
  });
});

describe('swap', () => {
  it('exchanges two same-side combatants', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const p1 = makeHeroCombatant('archer', 2, 'p1');
    const events: CombatEvent[] = [];
    swap(p0, p1, events);
    expect(p0.slot).toBe(2);
    expect(p1.slot).toBe(1);
  });

  it('throws on cross-side swap', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('ghoul', 1, 'e0');
    expect(() => swap(p0, e0, [])).toThrow();
  });
});

describe('collapseAfterDeath', () => {
  it('shifts living combatants forward after a death', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const e3 = makeEnemyCombatant('ghoul', 3, 'e2');
    e1.isDead = true;
    const state = makeTestState([], [e1, e2, e3]);
    const events: CombatEvent[] = [];
    collapseAfterDeath('enemy', state, events);
    expect(e1.slot).toBe(-1);
    expect(e2.slot).toBe(1);
    expect(e3.slot).toBe(2);
    const collapses = events.filter((e) => e.kind === 'position_changed');
    expect(collapses).toHaveLength(2);
    expect((collapses[0] as { toSlot: number }).toSlot).toBe(1);
    expect((collapses[1] as { toSlot: number }).toSlot).toBe(2);
  });

  it('does nothing when no slots changed', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([], [e1]);
    const events: CombatEvent[] = [];
    collapseAfterDeath('enemy', state, events);
    expect(events).toHaveLength(0);
  });
});

describe('shuffle', () => {
  it('moves back-row enemy in slot 1 toward preferred range', () => {
    const e0 = makeEnemyCombatant('skeleton_archer', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([], [e0, e1]);
    const events: CombatEvent[] = [];
    shuffle(e0, state, events);
    expect(e0.slot).toBe(2);
    expect(e1.slot).toBe(1);
    const changes = events.filter((e) => e.kind === 'position_changed');
    expect(changes).toHaveLength(2);
    for (const c of changes) {
      if (c.kind === 'position_changed') expect(c.reason).toBe('shuffle');
    }
  });

  it('hero shuffles toward slot 1 by default', () => {
    const p0 = makeHeroCombatant('knight', 2, 'p0');
    const p1 = makeHeroCombatant('archer', 1, 'p1');
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    shuffle(p0, state, events);
    expect(p0.slot).toBe(1);
    expect(p1.slot).toBe(2);
  });
});
