import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { resolveCombat } from '../combat';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('resolveCombat — determinism', () => {
  it('produces identical events and final state for the same seed', () => {
    const initial = makeTestState(
      [makeHeroCombatant('knight', 1, 'p0'), makeHeroCombatant('archer', 2, 'p1')],
      [makeEnemyCombatant('skeleton_warrior', 1, 'e0'), makeEnemyCombatant('ghost', 2, 'e1')],
    );
    const a = resolveCombat(initial, createRng(123));
    const b = resolveCombat(initial, createRng(123));
    expect(a.events).toEqual(b.events);
    expect(a.outcome).toBe(b.outcome);
  });

  it('does not mutate the input state', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const initial = makeTestState([hero], [enemy]);
    const heroHpBefore = hero.currentHp;
    const enemyHpBefore = enemy.currentHp;
    resolveCombat(initial, createRng(1));
    expect(hero.currentHp).toBe(heroHpBefore);
    expect(enemy.currentHp).toBe(enemyHpBefore);
  });
});

describe('resolveCombat — scripted scenarios', () => {
  it('Knight beats Skeleton Warrior 1-on-1', () => {
    const initial = makeTestState(
      [makeHeroCombatant('knight', 1, 'p0')],
      [makeEnemyCombatant('skeleton_warrior', 1, 'e0')],
    );
    const result = resolveCombat(initial, createRng(1));
    expect(result.outcome).toBe('player_victory');
  });

  it('Knight at non-preferred slot shuffles toward the front in round 1', () => {
    const knight = makeHeroCombatant('knight', 3, 'p0');
    const archer = makeHeroCombatant('archer', 2, 'p1');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('zombie', 2, 'e1');
    const state = makeTestState([knight, archer], [e0, e1]);
    const result = resolveCombat(state, createRng(1));
    const knightShuffle = result.events.find(
      (e) => e.kind === 'shuffle' && e.combatantId === 'p0',
    );
    expect(knightShuffle).toBeDefined();
  });

  it('extreme stalemate resolves via exhaustion (never times out)', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    expect(['player_victory', 'player_defeat']).toContain(result.outcome);
    const exhaustionEvents = result.events.filter((e) => e.kind === 'exhaustion_applied');
    expect(exhaustionEvents.length).toBeGreaterThan(0);
  });

  it('Priest mends a wounded ally on round 1', () => {
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 10, maxHp: 20 });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const initial = makeTestState([priest, knight], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    const healEvent = result.events.find((e) => e.kind === 'heal_applied');
    expect(healEvent).toBeDefined();
    expect((healEvent as { sourceId: string }).sourceId).toBe('p0');
  });

  it('Shield Bash stun causes a skipped turn for the target', () => {
    const knight = makeHeroCombatant('knight', 1, 'p0');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 3, defense: 2, speed: 2, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([knight], [enemy]);
    const result = resolveCombat(initial, createRng(7));
    const stunSkip = result.events.find(
      (e) => e.kind === 'turn_skipped' && e.reason === 'stunned' && e.combatantId === 'e0',
    );
    expect(stunSkip).toBeDefined();
  });

  it('emits exhaustion_applied at level 1 at the top of round 100', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 10000, attack: 1, defense: 1000, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10000,
      maxHp: 10000,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10000, attack: 1, defense: 1000, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10000,
      maxHp: 10000,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    const exhaustionEvents = result.events.filter(
      (e) => e.kind === 'exhaustion_applied',
    ) as Array<{ kind: 'exhaustion_applied'; level: number }>;
    expect(exhaustionEvents.length).toBeGreaterThan(0);
    expect(exhaustionEvents[0].level).toBe(1);
  });

  it('ramps exhaustion level by 1 every 5 rounds after round 100', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 10000, attack: 1, defense: 1000, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10000,
      maxHp: 10000,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10000, attack: 1, defense: 1000, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10000,
      maxHp: 10000,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    const exhaustionEvents = result.events.filter(
      (e) => e.kind === 'exhaustion_applied',
    ) as Array<{ kind: 'exhaustion_applied'; level: number }>;
    for (let i = 0; i < exhaustionEvents.length; i++) {
      expect(exhaustionEvents[i].level).toBe(i + 1);
    }
    expect(exhaustionEvents.length).toBeGreaterThanOrEqual(3);
  });

  it('emits no exhaustion events when combat ends before round 100', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    expect(result.outcome).toBe('player_victory');
    const exhaustionEvents = result.events.filter((e) => e.kind === 'exhaustion_applied');
    expect(exhaustionEvents).toHaveLength(0);
  });

  it('extreme stalemate always resolves below the 1000-round safety cap across seeds', () => {
    for (const seed of [1, 7, 42, 99, 12345]) {
      const hero = makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 100, attack: 1, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 100, attack: 1, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
        currentHp: 100,
        maxHp: 100,
      });
      const initial = makeTestState([hero], [enemy]);
      const result = resolveCombat(initial, createRng(seed));
      expect(['player_victory', 'player_defeat']).toContain(result.outcome);
      const lastRoundEnd = [...result.events]
        .reverse()
        .find((e) => e.kind === 'round_end') as { kind: 'round_end'; round: number } | undefined;
      expect(lastRoundEnd).toBeDefined();
      expect(lastRoundEnd!.round).toBeLessThan(500);
    }
  });

  it('Full Crypt-boss scenario runs to completion', () => {
    const initial = makeTestState(
      [
        makeHeroCombatant('knight', 1, 'p0'),
        makeHeroCombatant('archer', 2, 'p1'),
        makeHeroCombatant('priest', 3, 'p2'),
      ],
      [
        makeEnemyCombatant('skeleton_archer', 1, 'e0'),
        makeEnemyCombatant('cultist', 2, 'e1'),
        makeEnemyCombatant('bone_lich', 3, 'e2'),
      ],
    );
    const result = resolveCombat(initial, createRng(42));
    expect(['player_victory', 'player_defeat']).toContain(result.outcome);
    expect(result.events[result.events.length - 1].kind).toBe('combat_end');
  });
});

describe('resolveCombat — poison kills mid-turn', () => {
  it('a poisoned combatant who dies from poison on their own turn skips the rest of the turn', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 5, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 20,
    });
    hero.statuses['poisoned'] = {
      statusId: 'poisoned',
      remainingTurns: 3,
      effect: { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      sourceId: 'e0',
    };
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    expect(result.outcome).toBe('player_defeat');
    const heroDeathIdx = result.events.findIndex((e) => e.kind === 'death' && e.combatantId === 'p0');
    expect(heroDeathIdx).toBeGreaterThanOrEqual(0);
    const heroCastsAfterDeath = result.events
      .slice(heroDeathIdx + 1)
      .some((e) => e.kind === 'ability_cast' && e.casterId === 'p0');
    expect(heroCastsAfterDeath).toBe(false);
  });
});

describe('of_regeneration round-start heal', () => {
  it('a hero with regenPerRound heals at the start of each round, capped at maxHp', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      regenPerRound: 3,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100, maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const result = resolveCombat(state, createRng(1));
    const heals = result.events.filter(
      (ev) => ev.kind === 'heal_applied' && ev.targetId === 'p0' && ev.sourceId === 'p0',
    );
    expect(heals.length).toBeGreaterThan(0);
  });
});
