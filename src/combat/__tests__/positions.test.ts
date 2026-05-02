import { describe, expect, it } from 'vitest';
import { collapseAfterDeath, pull, shove, shuffle, shuffleWouldProgress, swap } from '../positions';
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
    const e0 = makeEnemyCombatant('ghost', 1, 'e0');
    expect(() => swap(p0, e0, [])).toThrow();
  });
});

describe('collapseAfterDeath', () => {
  it('shifts living combatants forward after a death', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const e3 = makeEnemyCombatant('ghost', 3, 'e2');
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
    const e1 = makeEnemyCombatant('ghost', 2, 'e1');
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

describe('shuffleWouldProgress', () => {
  it('false when only one combatant on side (nowhere to shuffle)', () => {
    const e0 = makeEnemyCombatant('skeleton_warrior', 3, 'e0');
    const state = makeTestState([], [e0]);
    expect(shuffleWouldProgress(e0, state)).toBe(false);
  });

  it('false when neighbor at destination is satisfied AND caster slot is unpreferred for them', () => {
    // Two melee enemies preferred [1,2]: slot-3 wants to swap with slot-2,
    // but slot-2 ally is happy at 2 and would be unhappy at 3 — they would
    // swap right back. Futile.
    const e0 = makeEnemyCombatant('skeleton_warrior', 2, 'e0');
    const e1 = makeEnemyCombatant('skeleton_warrior', 3, 'e1');
    const state = makeTestState([], [e0, e1]);
    expect(shuffleWouldProgress(e1, state)).toBe(false);
  });

  it('true when neighbor has different preferences (productive swap)', () => {
    // Slot-3 melee + slot-2 ranged: melee wants slot 1-2, ranged wants 3-4.
    // Swap helps both — melee moves to 2, ranged moves to 3.
    const ghost = makeEnemyCombatant('ghost', 2, 'e0');
    const archer = makeEnemyCombatant('skeleton_archer', 3, 'e1');
    const state = makeTestState([], [ghost, archer]);
    // archer at 3 wants to stay; but invert the test — ghost at 2 already in
    // preferred. From archer's perspective at slot 3, that IS preferred —
    // shuffle wouldn't trigger. Test the inverse: archer at slot 1 (forced).
    archer.slot = 1;
    ghost.slot = 2;
    expect(shuffleWouldProgress(archer, state)).toBe(true);
  });

  it('true when neighbor has no preferredSlots (indifferent)', () => {
    // Heroes have undefined preferredSlots — always treated as indifferent.
    const knight = makeHeroCombatant('knight', 3, 'p0');
    const ally = makeHeroCombatant('priest', 2, 'p1');
    const state = makeTestState([knight, ally], []);
    expect(shuffleWouldProgress(knight, state)).toBe(true);
  });
});
