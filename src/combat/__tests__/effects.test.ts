import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../data/abilities';
import { createRng } from '../../util/rng';
import { applyAbility } from '../effects';
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
