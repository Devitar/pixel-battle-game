import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { resolveCombat } from '../combat';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('resolveCombat — determinism', () => {
  it('produces identical events and final state for the same seed', () => {
    const initial = makeTestState(
      [makeHeroCombatant('knight', 1, 'p0'), makeHeroCombatant('archer', 2, 'p1')],
      [makeEnemyCombatant('skeleton_warrior', 1, 'e0'), makeEnemyCombatant('ghoul', 2, 'e1')],
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

  it('no-damage matchup times out at 30 rounds', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    expect(result.outcome).toBe('timeout');
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
      baseStats: { hp: 100, attack: 3, defense: 2, speed: 2 },
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
    expect(['player_victory', 'player_defeat', 'timeout']).toContain(result.outcome);
    expect(result.events[result.events.length - 1].kind).toBe('combat_end');
  });
});
