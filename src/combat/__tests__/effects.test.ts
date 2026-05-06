import { describe, expect, it } from 'vitest';
import { ABILITIES } from '@data/abilities';
import { createRng } from '@util/rng';
import { applyAbility } from '../effects';
import { resolveTargetSelector } from '../target_selector';
import type { CombatEvent, StatusInstance } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

const rng = createRng(1);

describe('damage effect', () => {
  it('computes power × attack - defense with floor 1', () => {
    // crit=0/dodge=0 on both so no RNG is consumed; assertion is deterministic.
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 12, attack: 3, defense: 2, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
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
    // smite is mind-scaling: round(1.1 * priest.mind=5 * 1.5) = 8 raw, minus skeleton.defense=2 = 6 dmg. 12-6=6.
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.smite, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(6);
  });

  it('does not apply radiant bonus against humanoid', () => {
    // smite is mind-scaling: round(1.1 * priest.mind=5) = 6 raw, minus cultist.defense=1 = 5 dmg. 10-5=5.
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('cultist', 3, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.smite, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(5);
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
    const e1 = makeEnemyCombatant('ghost', 2, 'e1');
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
    // mend is mind-scaling: round(1.2 * priest.mind=5) = 6 hp. 10+6=16.
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1', { currentHp: 10, maxHp: 20 });
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.mend, p0, ['p1'], state, rng, events);
    expect(p1.currentHp).toBe(16);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ amount: 6 });
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
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 10, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const baselineState = makeTestState([p0], [e0]);
    const baselineEvents: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], baselineState, rng, baselineEvents);
    const baseline = (baselineEvents.find((e) => e.kind === 'damage_applied') as { amount: number }).amount;

    const p1 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 10, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
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

describe('damage scaling stat', () => {
  it('defaults to attack when scalingStat is unset', () => {
    // priest with crit=0 so no crit roll; e0 dodge=0 so no dodge roll.
    const p0 = makeHeroCombatant('priest', 1, 'p0', {
      baseStats: { hp: 15, attack: 3, defense: 2, speed: 4, mind: 5, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'priest_strike' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 3 });
  });

  it('uses mind when scalingStat is "mind"', () => {
    const p0 = makeHeroCombatant('priest', 1, 'p0', {
      baseStats: { hp: 15, attack: 3, defense: 2, speed: 4, mind: 5, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'priest_strike' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, scalingStat: 'mind' as const }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 5 });
  });
});

describe('heal scaling stat', () => {
  it('uses mind when scalingStat is "mind"', () => {
    const p0 = makeHeroCombatant('priest', 1, 'p0', { currentHp: 1 });
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'mend' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'self' as const },
      effects: [{ kind: 'heal' as const, power: 1.2, scalingStat: 'mind' as const }],
    };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    const h = events.find((e) => e.kind === 'heal_applied');
    expect(h).toMatchObject({ amount: 6 });
  });
});

describe('crit', () => {
  it('does not roll crit when caster crit is 0', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ wasCrit: false });
  });

  it('always crits when caster crit is 100, doubling raw before defense', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 100, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 3, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    // raw = round(1.0 * 4) = 4; crit doubles to 8; defense subtracts 3; final = 5.
    expect(dmg).toMatchObject({ wasCrit: true, amount: 5 });
  });

  it('crit doubles before defense (proves the difference)', () => {
    // Doubling-after-defense would give max(1, 4 - 3) * 2 = 2.
    // Doubling-before-defense gives max(1, 4*2 - 3) = 5.
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 100, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 3, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { amount: number };
    expect(dmg.amount).toBe(5);
    expect(dmg.amount).not.toBe(2);
  });
});

describe('healOnKill', () => {
  it('heals caster on lethal hit', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'priest_strike' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, healOnKill: 0.5 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ sourceId: 'p0', targetId: 'p0', amount: 3 });
    expect(p0.currentHp).toBe(8);
  });

  it('does NOT heal on non-lethal hit', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'priest_strike' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, healOnKill: 0.5 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toBeUndefined();
    expect(p0.currentHp).toBe(5);
  });

  it('caps healOnKill heal at caster missing HP (0 if full)', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 20,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'priest_strike' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, healOnKill: 0.5 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ amount: 0 });
    expect(p0.currentHp).toBe(20);
  });
});

describe('selfTarget on buff/debuff effects', () => {
  it('applies selfTarget debuff to caster, not to ability target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [
        { kind: 'damage' as const, power: 1.0 },
        { kind: 'debuff' as const, stat: 'defense' as const, delta: -2, duration: 2, statusId: 'enraged' as const, selfTarget: true },
      ],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    expect(events.find((e) => e.kind === 'damage_applied' && e.targetId === 'e0')).toBeDefined();
    expect(p0.statuses['enraged']).toBeDefined();
    expect(e0.statuses['enraged']).toBeUndefined();
    const statusEvent = events.find((e) => e.kind === 'status_applied' && e.statusId === 'enraged');
    expect(statusEvent).toMatchObject({ sourceId: 'p0', targetId: 'p0' });
  });

  it('selfTarget effect fires even when target dodges', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [
        { kind: 'damage' as const, power: 1.0 },
        { kind: 'debuff' as const, stat: 'defense' as const, delta: -2, duration: 2, statusId: 'enraged' as const, selfTarget: true },
      ],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    expect(events.find((e) => e.kind === 'attack_dodged')).toBeDefined();
    expect(events.find((e) => e.kind === 'damage_applied')).toBeUndefined();
    expect(p0.statuses['enraged']).toBeDefined();
  });

  it('selfTarget effect fires once per cast even on AoE (no double-apply)', () => {
    const p0 = makeHeroCombatant('archer', 2, 'p0', {
      baseStats: { hp: 14, attack: 5, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const e1 = makeEnemyCombatant('skeleton_warrior', 2, 'e1', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0, e1]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'volley' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: 'all' as const },
      effects: [
        { kind: 'damage' as const, power: 0.5 },
        { kind: 'buff' as const, stat: 'crit' as const, delta: 5, duration: 1, statusId: 'blessed' as const, selfTarget: true },
      ],
    };
    applyAbility(ability, p0, ['e0', 'e1'], state, rng, events);
    const statusEvents = events.filter((e) => e.kind === 'status_applied' && e.statusId === 'blessed');
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0]).toMatchObject({ targetId: 'p0' });
  });
});

describe('bonusCrit', () => {
  it('always crits when caster.crit + bonusCrit >= 100', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, bonusCrit: 100 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { wasCrit: boolean; amount: number };
    expect(dmg.wasCrit).toBe(true);
    expect(dmg.amount).toBe(8);
  });

  it('never crits when caster.crit + bonusCrit <= 0', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { wasCrit: boolean };
    expect(dmg.wasCrit).toBe(false);
  });
});

describe('moveToSlot', () => {
  it('swaps caster with ally currently in destination slot', () => {
    const p0 = makeHeroCombatant('knight', 2, 'p0');
    const p1 = makeHeroCombatant('archer', 3, 'p1');
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'self' as const },
      effects: [{ kind: 'moveToSlot' as const, slot: 3 as const }],
    };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    expect(p0.slot).toBe(3);
    expect(p1.slot).toBe(2);
    const moves = events.filter((e) => e.kind === 'position_changed');
    expect(moves).toHaveLength(2);
  });

  it('moves caster directly when destination slot is empty', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'self' as const },
      effects: [{ kind: 'moveToSlot' as const, slot: 3 as const }],
    };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    expect(p0.slot).toBe(3);
    const moves = events.filter((e) => e.kind === 'position_changed');
    expect(moves).toHaveLength(1);
  });

  it('is a no-op when caster already in destination slot', () => {
    const p0 = makeHeroCombatant('knight', 3, 'p0');
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'self' as const },
      effects: [{ kind: 'moveToSlot' as const, slot: 3 as const }],
    };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    expect(p0.slot).toBe(3);
    const moves = events.filter((e) => e.kind === 'position_changed');
    expect(moves).toHaveLength(0);
  });
});

describe('poison effect', () => {
  it('stores a "poisoned" status on the target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'poison' as const, damagePerTurn: 2, duration: 3, statusId: 'poisoned' as const }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    expect(e0.statuses['poisoned']).toBeDefined();
    expect(e0.statuses['poisoned'].remainingTurns).toBe(3);
    const statusEvent = events.find((e) => e.kind === 'status_applied' && e.statusId === 'poisoned');
    expect(statusEvent).toBeDefined();
  });
});

describe('Consecrate caster targeting', () => {
  // Consecrate's target selector uses `includeCaster: true`, so the party HoT
  // hits ALL 3 allies in a 3-hero formation (caster + 2 others), giving the
  // designed 27 HP party total per cast (3 heal × 3 turns × 3 allies).
  it('applies consecrated status to ALL allies including the caster', () => {
    const caster = makeHeroCombatant('paladin', 1, 'p0', {
      baseStats: { hp: 20, attack: 3, defense: 4, speed: 3, mind: 4, crit: 5, dodge: 5 },
    });
    const ally1 = makeHeroCombatant('knight', 2, 'p1');
    const ally2 = makeHeroCombatant('priest', 3, 'p2');
    const state = makeTestState([caster, ally1, ally2], []);

    const consecrate = ABILITIES.consecrate;
    const targetIds = resolveTargetSelector(consecrate.target, caster, state, rng);
    expect([...targetIds].sort()).toEqual(['p0', 'p1', 'p2']);

    const events: CombatEvent[] = [];
    applyAbility(consecrate, caster, targetIds, state, rng, events);

    expect(state.combatants.find((c) => c.id === 'p0')!.statuses['consecrated']).toBeDefined();
    expect(state.combatants.find((c) => c.id === 'p1')!.statuses['consecrated']).toBeDefined();
    expect(state.combatants.find((c) => c.id === 'p2')!.statuses['consecrated']).toBeDefined();
  });
});

describe('regen effect', () => {
  it('stores a "consecrated" status on the target with regen shape', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], []);
    const ability = {
      id: 'consecrate' as const,
      name: 'Consecrate',
      canCastFrom: [1, 2, 3] as const,
      target: { side: 'ally' as const, slots: 'all' as const },
      effects: [{ kind: 'regen' as const, healPerTurn: 3, duration: 3, statusId: 'consecrated' as const }],
    };
    const events: CombatEvent[] = [];
    applyAbility(ability, p0, ['p0'], state, rng, events);
    const target = state.combatants.find((c) => c.id === 'p0')!;
    expect(target.statuses['consecrated']).toBeDefined();
    expect(target.statuses['consecrated'].remainingTurns).toBe(3);
    expect(target.statuses['consecrated'].effect).toMatchObject({
      kind: 'regen',
      healPerTurn: 3,
      duration: 3,
      statusId: 'consecrated',
    });
  });
});

describe('chance field', () => {
  it('chance: 0 always skips the effect', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [
        { kind: 'damage' as const, power: 1.0 },
        { kind: 'stun' as const, duration: 1, chance: 0 },
      ],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    expect(events.find((e) => e.kind === 'damage_applied')).toBeDefined();
    expect(events.find((e) => e.kind === 'status_applied' && e.statusId === 'stunned')).toBeUndefined();
    expect(e0.statuses['stunned']).toBeUndefined();
  });

  it('chance: 100 always fires the effect', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [
        { kind: 'damage' as const, power: 1.0 },
        { kind: 'stun' as const, duration: 1, chance: 100 },
      ],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    expect(events.find((e) => e.kind === 'status_applied' && e.statusId === 'stunned')).toBeDefined();
    expect(e0.statuses['stunned']).toBeDefined();
  });

  it('dodge short-circuits chance — dodged target gets no rider effect even with chance: 100', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [
        { kind: 'damage' as const, power: 1.0 },
        { kind: 'stun' as const, duration: 1, chance: 100 },
      ],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    expect(events.find((e) => e.kind === 'attack_dodged')).toBeDefined();
    expect(events.find((e) => e.kind === 'damage_applied')).toBeUndefined();
    expect(events.find((e) => e.kind === 'status_applied')).toBeUndefined();
    expect(e0.statuses['stunned']).toBeUndefined();
  });
});

describe('wound_inflicted event', () => {
  it('heavy hit (>=30% maxHp) on hero rolls wound chance — fires when rng allows', () => {
    const ability = {
      id: 'bone_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    // Try seeds until we find one that produces a wound (wound chance is 30%).
    let foundWound = false;
    for (let seed = 1; seed <= 50; seed++) {
      const localP = makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 60, attack: 0, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
        currentHp: 60,
        maxHp: 60,
      });
      const localE = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 100, attack: 20, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const localState = makeTestState([localP], [localE]);
      const events: CombatEvent[] = [];
      applyAbility(ability, localE, ['p0'], localState, createRng(seed), events);
      // 20 dmg vs 60 maxHp = 33% — heavy, non-lethal.
      if (!localP.isDead && events.find((e) => e.kind === 'wound_inflicted')) {
        foundWound = true;
        break;
      }
    }
    expect(foundWound).toBe(true);
  });

  it('light hit (<30% maxHp) on hero never rolls a wound when not a crit', () => {
    const ability = {
      id: 'bone_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    // 1 dmg out of 100 maxHp = 1% — way below threshold. Try many seeds; expect no wound across all.
    for (let seed = 1; seed <= 30; seed++) {
      const localP = makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 100, attack: 0, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const localE = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const localState = makeTestState([localP], [localE]);
      const events: CombatEvent[] = [];
      applyAbility(ability, localE, ['p0'], localState, createRng(seed), events);
      expect(events.find((e) => e.kind === 'wound_inflicted')).toBeUndefined();
    }
  });

  it('crit on hero can trigger wound regardless of damage size', () => {
    // Force crit via bonusCrit: 100. Hit is small but crit triggers wound roll.
    const ability = {
      id: 'bone_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, bonusCrit: 100 }],
    };
    let foundWound = false;
    for (let seed = 1; seed <= 50; seed++) {
      const p = makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 100, attack: 0, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const e = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const state = makeTestState([p], [e]);
      const events: CombatEvent[] = [];
      applyAbility(ability, e, ['p0'], state, createRng(seed), events);
      if (!p.isDead && events.find((e) => e.kind === 'wound_inflicted')) {
        foundWound = true;
        break;
      }
    }
    expect(foundWound).toBe(true);
  });

  it('hits on enemy targets never roll wounds (hero-only)', () => {
    const heroStats = { hp: 20, attack: 100, defense: 0, speed: 3, mind: 0, crit: 100, dodge: 0 };
    const enemyStats = { hp: 1000, attack: 0, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 };
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, bonusCrit: 100 }],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const events: CombatEvent[] = [];
      const localState = makeTestState(
        [makeHeroCombatant('knight', 1, 'p0', { baseStats: { ...heroStats }, currentHp: 20, maxHp: 20 })],
        [makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { ...enemyStats }, currentHp: 1000, maxHp: 1000 })],
      );
      applyAbility(ability, localState.combatants[0], ['e0'], localState, createRng(seed), events);
      expect(events.find((e) => e.kind === 'wound_inflicted')).toBeUndefined();
    }
  });

  it('lethal hit does not roll a wound (dead heroes can not be wounded)', () => {
    const ability = {
      id: 'bone_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const p = makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 5, attack: 0, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
        currentHp: 5,
        maxHp: 5,
      });
      const e = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 100, attack: 100, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const state = makeTestState([p], [e]);
      const events: CombatEvent[] = [];
      applyAbility(ability, e, ['p0'], state, createRng(seed), events);
      // p0 should be dead from a 100-attack hit on 5 hp
      expect(p.isDead).toBe(true);
      expect(events.find((e) => e.kind === 'wound_inflicted')).toBeUndefined();
    }
  });
});

describe('damageTakenMultiplier', () => {
  it('multiplies amplified damage by the damageTakenMultiplier (1.20 × 4 = 5)', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      damageTakenMultiplier: 1.20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 4, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const ability = {
      id: 'bone_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    const events: CombatEvent[] = [];
    applyAbility(ability, e0, ['p0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { amount: number };
    // raw 4 × 1.0 = 4, no defense, exhaustion 0 → exhAmp 4. Then × 1.20 = 4.8 → round = 5.
    expect(dmg.amount).toBe(5);
  });

  it('no multiplier (undefined) means damage unchanged', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 4, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const ability = {
      id: 'bone_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    const events: CombatEvent[] = [];
    applyAbility(ability, e0, ['p0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { amount: number };
    expect(dmg.amount).toBe(4);
  });
});

import { tickStatuses } from '../statuses';

describe('of_burning rare property', () => {
  it('a hero with burningWeaponDamage applies burning status to the target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      burningWeaponDamage: 3,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    expect(e0.statuses['burning']).toBeDefined();
    expect(e0.statuses['burning'].remainingTurns).toBe(2);
  });

  it('burning status ticks damage at the target turn before decrement', () => {
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 10 });
    e0.statuses['burning'] = {
      statusId: 'burning',
      remainingTurns: 2,
      effect: { kind: 'poison', damagePerTurn: 3, duration: 2, statusId: 'burning' },
      sourceId: 'p0',
    };
    const events: CombatEvent[] = [];
    tickStatuses(e0, events);
    expect(e0.currentHp).toBe(7);
    expect(events.some((ev) => ev.kind === 'damage_applied' && ev.amount === 3)).toBe(true);
  });
});

describe('of_vampirism rare property', () => {
  it('source heals on a strong landed hit (heal > 0)', () => {
    const p0 = makeHeroCombatant('barbarian', 1, 'p0', {
      baseStats: { hp: 22, attack: 10, defense: 3, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      lifestealPercent: 25,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100, maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.barbarian_swing, p0, ['e0'], state, rng, events);
    const heal = events.find(
      (ev) => ev.kind === 'heal_applied' && ev.sourceId === 'p0' && ev.targetId === 'p0',
    );
    expect(heal).toBeDefined();
    expect(p0.currentHp).toBeGreaterThan(5);
  });

  it('lifesteal fires on lethal hits too', () => {
    const p0 = makeHeroCombatant('barbarian', 1, 'p0', {
      baseStats: { hp: 22, attack: 20, defense: 3, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      lifestealPercent: 50,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 4 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.barbarian_swing, p0, ['e0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    const heal = events.find((ev) => ev.kind === 'heal_applied');
    expect(heal).toBeDefined();
  });
});

describe('of_thorns rare property', () => {
  it('attacker takes thorn damage on a landed hit', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      thornsDamage: 1,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 10 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(e0.currentHp).toBe(9);
    const reflect = events.find(
      (ev) => ev.kind === 'damage_applied' && ev.sourceId === 'p0' && ev.targetId === 'e0',
    );
    expect(reflect).toBeDefined();
    expect(reflect).toMatchObject({ amount: 1 });
  });

  it('thorns does not fire on dodged attacks', () => {
    const p0 = makeHeroCombatant('rogue', 1, 'p0', {
      baseStats: { hp: 13, attack: 5, defense: 1, speed: 6, mind: 0, crit: 0, dodge: 100 },
      thornsDamage: 5,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(events.find((ev) => ev.kind === 'attack_dodged')).toBeDefined();
    expect(e0.currentHp).toBe(e0.maxHp);
  });

  it('thorns can kill the source on a low-HP attacker', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      thornsDamage: 5,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 1 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    expect(events.some((ev) => ev.kind === 'death' && ev.combatantId === 'e0')).toBe(true);
  });
});

describe('venomous on-hit', () => {
  it('applies poisoned status on non-lethal hit', () => {
    const venomousAttacker = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      venomousDamage: 2,
      venomousDuration: 2,
    });
    const target = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 30,
      maxHp: 30,
    });
    const state = makeTestState([target], [venomousAttacker]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, venomousAttacker, ['p0'], state, rng, events);
    expect(target.statuses['poisoned']).toBeDefined();
    expect(target.statuses['poisoned'].effect).toMatchObject({
      kind: 'poison',
      damagePerTurn: 2,
      duration: 2,
      statusId: 'poisoned',
    });
    expect(target.statuses['poisoned'].remainingTurns).toBe(2);
    const statusEvent = events.find((e) => e.kind === 'status_applied' && e.statusId === 'poisoned');
    expect(statusEvent).toBeDefined();
  });

  it('does NOT apply poisoned status on a lethal hit', () => {
    const venomousAttacker = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10, attack: 100, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      venomousDamage: 2,
      venomousDuration: 2,
    });
    const target = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 1, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 1,
    });
    const state = makeTestState([target], [venomousAttacker]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, venomousAttacker, ['p0'], state, rng, events);
    expect(target.statuses['poisoned']).toBeUndefined();
    expect(target.isDead).toBe(true);
  });

  it('does NOT apply when venomousDamage is undefined', () => {
    const normalAttacker = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const target = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 30,
      maxHp: 30,
    });
    const state = makeTestState([target], [normalAttacker]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, normalAttacker, ['p0'], state, rng, events);
    expect(target.statuses['poisoned']).toBeUndefined();
  });
});
