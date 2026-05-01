import { describe, expect, it } from 'vitest';
import { ABILITIES } from '@data/abilities';
import { createRng } from '@util/rng';
import { applyAbility } from '../effects';
import type { CombatEvent } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

const rng = createRng(1);

describe('dodge', () => {
  it('does not roll dodge when target dodge is 0', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dodged = events.find((e) => e.kind === 'attack_dodged');
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dodged).toBeUndefined();
    expect(dmg).toBeDefined();
  });

  it('always dodges when target dodge is 100, emits attack_dodged, no damage', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dodged = events.find((e) => e.kind === 'attack_dodged');
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dodged).toMatchObject({ sourceId: 'p0', targetId: 'e0', abilityId: 'knight_slash' });
    expect(dmg).toBeUndefined();
  });

  it('dodge skips ALL effects on the target including riders (shield_bash damage + stun)', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    expect(events.find((e) => e.kind === 'attack_dodged')).toBeDefined();
    expect(events.find((e) => e.kind === 'damage_applied')).toBeUndefined();
    expect(events.find((e) => e.kind === 'status_applied' && e.statusId === 'stunned')).toBeUndefined();
    expect(e0.statuses['stunned']).toBeUndefined();
  });

  it('does not roll dodge for abilities with no damage effect (bulwark)', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 100 },
    });
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bulwark, p0, ['p0'], state, rng, events);
    expect(events.find((e) => e.kind === 'attack_dodged')).toBeUndefined();
    expect(events.find((e) => e.kind === 'status_applied' && e.statusId === 'bulwark')).toBeDefined();
  });

  it('dodge is per-target on AoE (volley): one target dodges, others get hit', () => {
    const p0 = makeHeroCombatant('archer', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const e1 = makeEnemyCombatant('skeleton_warrior', 2, 'e1', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 },
    });
    const e2 = makeEnemyCombatant('skeleton_warrior', 3, 'e2', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0, e1, e2]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.volley, p0, ['e0', 'e1', 'e2'], state, rng, events);
    const dodgedTargets = events
      .filter((e): e is Extract<CombatEvent, { kind: 'attack_dodged' }> => e.kind === 'attack_dodged')
      .map((e) => e.targetId);
    const damagedTargets = events
      .filter((e): e is Extract<CombatEvent, { kind: 'damage_applied' }> => e.kind === 'damage_applied')
      .map((e) => e.targetId);
    expect(dodgedTargets).toEqual(['e1']);
    expect(damagedTargets.sort()).toEqual(['e0', 'e2']);
  });
});
