import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { pickAbility } from '../ability_priority';
import { createPetCombatant } from '../combatant';
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

  it('returns null when only lower-priority abilities are castable from current slot', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 1, 'p0');
    // Need an ally so shuffle has somewhere productive to go — single-combatant
    // sides can't shuffle, in which case pickAbility correctly falls through
    // to the lower-priority castable.
    const ally = makeHeroCombatant('knight', 2, 'p1');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([archer, ally], [e0]);
    const picked = pickAbility(archer, state, rng);
    // Higher-priority abilities (flare_arrow, piercing_shot, volley) are
    // canCastFrom-blocked; engine prefers shuffle so the Archer can reach
    // slot 2 where the full kit unlocks.
    expect(picked).toBeNull();
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

  it('skips abilities whose cooldown > 0', () => {
    const rng = createRng(1);
    const priest = makeHeroCombatant('priest', 2, 'p0', { cooldowns: { mend: 2 } });
    const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 5 });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, knight], [e0]);
    const picked = pickAbility(priest, state, rng);
    expect(picked?.abilityId).toBe('bless');
  });

  it('returns null when higher-priority abilities are slot-blocked', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 3, 'p0');
    const ally = makeHeroCombatant('priest', 2, 'p1');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight, ally], [e0]);
    expect(pickAbility(knight, state, rng)).toBeNull();
  });

  it('does NOT prefer shuffle when the higher-priority is blocked by cooldown', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 3, 'p0', { cooldowns: { shield_bash: 2 } });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    expect(pickAbility(knight, state, rng)?.abilityId).toBe('bulwark');
  });

  it('returns the highest priority when castable from current slot', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    expect(pickAbility(knight, state, rng)?.abilityId).toBe('shield_bash');
  });

  it('does not prefer shuffle when higher-priority is castable from current slot', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    expect(pickAbility(knight, state, rng)?.abilityId).toBe('shield_bash');
  });

  it('Priest at slot 1 prefers shuffle over priest_strike', () => {
    const rng = createRng(1);
    const priest = makeHeroCombatant('priest', 1, 'p0');
    const ally = makeHeroCombatant('knight', 2, 'p1');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, ally], [e0]);
    expect(pickAbility(priest, state, rng)).toBeNull();
  });

  it('does NOT defer to shuffle when shuffle would be futile (3 melee enemies preferred [1,2])', () => {
    const rng = createRng(1);
    // Three enemies all preferring slots [1,2]. Slot-3 enemy has bone_slash
    // (slot-blocked from 3) AND bone_throw (any-slot fallback). Without the
    // futility check, the engine would defer to shuffle indefinitely; with it,
    // pickAbility falls through to the fallback bone_throw.
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('skeleton_warrior', 2, 'e1');
    const e2 = makeEnemyCombatant('skeleton_warrior', 3, 'e2');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [e0, e1, e2]);
    expect(pickAbility(e2, state, rng)?.abilityId).toBe('bone_throw');
  });
});

describe('petAlive AI condition', () => {
  it('blocks command_strike when the Hunter has no living pet', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h_alone');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter], [enemy]);
    const pick = pickAbility(hunter, state, createRng(1));
    expect(pick?.abilityId).not.toBe('command_strike');
  });

  it('allows command_strike when a pet is alive and owned by the Hunter', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h_with_pet');
    const pet = createPetCombatant('wolf', 'h_with_pet', 10);
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter, pet], [enemy]);
    const pick = pickAbility(hunter, state, createRng(1));
    expect(pick?.abilityId).toBe('command_strike');
  });

  it('blocks command_strike when the pet is dead', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h_dead_pet');
    const pet = createPetCombatant('wolf', 'h_dead_pet', 10);
    pet.isDead = true;
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter, pet], [enemy]);
    const pick = pickAbility(hunter, state, createRng(1));
    expect(pick?.abilityId).not.toBe('command_strike');
  });
});
