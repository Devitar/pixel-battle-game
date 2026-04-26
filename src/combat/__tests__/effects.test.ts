import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../data/abilities';
import { createRng } from '../../util/rng';
import { applyAbility } from '../effects';
import type { CombatEvent, StatusInstance } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

const rng = createRng(1);

describe('damage effect', () => {
  it('computes power × attack - defense with floor 1', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(10);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 2, lethal: false });
  });

  it('floors damage at 1 when defense exceeds raw', () => {
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(p0.currentHp).toBe(19);
  });

  it('applies radiant × undead = 1.5× bonus', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.smite, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(9);
  });

  it('does not apply radiant bonus against humanoid', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('cultist', 3, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.smite, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(8);
  });

  it('mark multiplies damage for every hit in its duration', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    e0.statuses['marked'] = {
      statusId: 'marked',
      remainingTurns: 2,
      effect: { kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' },
      sourceId: 'p0',
    } satisfies StatusInstance;
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 4 });
  });

  it('lethal damage emits death and collapses the line', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 2 });
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    expect(e0.slot).toBe(-1);
    expect(e1.slot).toBe(1);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('death');
    const collapse = events.find((e) => e.kind === 'position_changed' && e.reason === 'collapse');
    expect(collapse).toBeDefined();
  });
});

describe('heal effect', () => {
  it('caps at maxHp and emits even on zero heal', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1');
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.mend, p0, ['p1'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ amount: 0 });
  });

  it('heals up to the cap', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1', { currentHp: 10, maxHp: 20 });
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.mend, p0, ['p1'], state, rng, events);
    expect(p1.currentHp).toBe(14);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ amount: 4 });
  });
});

describe('stun effect', () => {
  it('applies "stunned" status on target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    expect(e0.statuses['stunned']).toBeDefined();
    expect(e0.statuses['stunned'].remainingTurns).toBe(1);
  });
});

describe('buff / debuff', () => {
  it('adds a non-HP buff status', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1');
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bless, p0, ['p1'], state, rng, events);
    expect(p1.statuses['blessed']).toBeDefined();
  });

  it('hp debuff updates maxHp and clamps currentHp', () => {
    const e0 = makeEnemyCombatant('bone_lich', 4, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.curse_of_frailty, e0, ['p0'], state, rng, events);
    expect(p0.maxHp).toBe(17);
    expect(p0.currentHp).toBe(17);
  });
});

describe('damage effect — exhaustion amplification', () => {
  it('amplifies damage taken on player-side target by 10% per level, rounded', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1 },
      currentHp: 100,
      maxHp: 100,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 10, defense: 0, speed: 1 },
      currentHp: 100,
      maxHp: 100,
    });
    const baselineState = makeTestState([p0], [e0]);
    const baselineEvents: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], baselineState, rng, baselineEvents);
    const baseline = (baselineEvents.find((e) => e.kind === 'damage_applied') as { amount: number }).amount;

    const p1 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1 },
      currentHp: 100,
      maxHp: 100,
    });
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 10, defense: 0, speed: 1 },
      currentHp: 100,
      maxHp: 100,
    });
    const ampedState = makeTestState([p1], [e1]);
    ampedState.exhaustionLevel = 3;
    const ampedEvents: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e1, ['p0'], ampedState, rng, ampedEvents);
    const amped = (ampedEvents.find((e) => e.kind === 'damage_applied') as { amount: number }).amount;

    expect(amped).toBe(Math.max(1, Math.round(baseline * 1.30)));
  });

  it('does not amplify damage on enemy-side target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    state.exhaustionLevel = 5;
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 2, lethal: false });
  });

  it('preserves the floor of 1 when amplification applied to a 1-damage hit', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    state.exhaustionLevel = 1;
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { amount: number };
    expect(dmg.amount).toBeGreaterThanOrEqual(1);
  });
});

describe('multi-effect ability', () => {
  it('applies damage then stun when non-lethal', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(11);
    expect(e0.statuses['stunned']).toBeDefined();
  });

  it('skips stun when damage is lethal', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 1 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    expect(e0.statuses['stunned']).toBeUndefined();
    const stunEvents = events.filter((e) => e.kind === 'status_applied');
    expect(stunEvents).toHaveLength(0);
  });
});
