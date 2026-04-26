import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { pickAbility } from '../ability_priority';
import { resolveCombat } from '../combat';
import { setCooldown, tickCooldowns } from '../cooldowns';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('tickCooldowns', () => {
  it('decrements every cooldown by 1', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    combatant.cooldowns = { mend: 3, bless: 2 };
    tickCooldowns(combatant);
    expect(combatant.cooldowns).toEqual({ mend: 2, bless: 1 });
  });

  it('drops cooldowns that hit 0', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    combatant.cooldowns = { mend: 1 };
    tickCooldowns(combatant);
    expect(combatant.cooldowns).toEqual({});
  });

  it('is a no-op when the combatant has no cooldowns', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    expect(combatant.cooldowns).toEqual({});
    tickCooldowns(combatant);
    expect(combatant.cooldowns).toEqual({});
  });
});

describe('setCooldown', () => {
  it('sets the cooldown to the given value', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    setCooldown(combatant, 'mend', 2);
    expect(combatant.cooldowns).toEqual({ mend: 2 });
  });

  it('overwrites an existing cooldown', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    combatant.cooldowns = { mend: 1 };
    setCooldown(combatant, 'mend', 3);
    expect(combatant.cooldowns).toEqual({ mend: 3 });
  });
});

describe('integration: pickAbility skips on-cooldown abilities', () => {
  it('falls through to the next priority when the first is on cooldown', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 2, 'p0', {
      cooldowns: { flare_arrow: 2 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('skeleton_archer', 3, 'e1');
    const state = makeTestState([archer], [e0, e1]);
    const picked = pickAbility(archer, state, rng);
    expect(picked?.abilityId).toBe('piercing_shot');
  });

  it('falls through to a non-cooldown ability when all cooldown abilities are on cooldown', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 2, 'p0', {
      cooldowns: { flare_arrow: 2, piercing_shot: 2 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('skeleton_archer', 3, 'e1');
    const state = makeTestState([archer], [e0, e1]);
    const picked = pickAbility(archer, state, rng);
    expect(picked?.abilityId).toBe('volley');
  });

  it('returns null when every priority is on cooldown and nothing else is castable', () => {
    const rng = createRng(1);
    const skeleton = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      cooldowns: { bone_slash: 1 },
    });
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [skeleton]);
    const picked = pickAbility(skeleton, state, rng);
    expect(picked).toBeNull();
  });
});

describe('integration: cooldowns gate consecutive casts in resolveCombat', () => {
  it('priest with mend (cooldown 2) does not heal every turn', () => {
    const rng = createRng(42);
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 1, maxHp: 20 });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, knight], [e0]);

    const result = resolveCombat(state, rng);

    const mendCasts = result.events.filter(
      (ev) => ev.kind === 'ability_cast' && ev.casterId === 'p0' && ev.abilityId === 'mend',
    );
    const priestTurns = result.events.filter(
      (ev) => ev.kind === 'turn_start' && ev.combatantId === 'p0',
    ).length;
    expect(mendCasts.length).toBeLessThanOrEqual(Math.ceil(priestTurns / 3));
    expect(mendCasts.length).toBeGreaterThan(0);
  });
});
