import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { pickAbility } from '../ability_priority';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('pickAbility', () => {
  it('picks the first ability whose slot and targets are valid', () => {
    const rng = createRng(1);
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 5 });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, knight], [e0]);
    const picked = pickAbility(priest, state, rng);
    expect(picked).toEqual({ abilityId: 'mend', targetIds: ['p1'] });
  });

  it('falls through when caster slot is not in canCastFrom', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([archer], [e0]);
    const picked = pickAbility(archer, state, rng);
    expect(picked?.abilityId).toBe('archer_shoot');
  });

  it('falls through when target set is empty', () => {
    const rng = createRng(1);
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, knight], [e0]);
    const picked = pickAbility(priest, state, rng);
    expect(picked?.abilityId).toBe('bless');
  });

  it('returns null when nothing is castable', () => {
    const rng = createRng(1);
    const e0 = makeEnemyCombatant('skeleton_archer', 1, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [e0]);
    const picked = pickAbility(e0, state, rng);
    expect(picked).toBeNull();
  });
});
