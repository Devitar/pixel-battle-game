import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../data/enemies';
import type { Encounter } from '../../dungeon/node';
import { createHero } from '../../heroes/hero';
import { buildCombatState } from '../combat_setup';

const FLAT_SCALE = { hp: 1.0, attack: 1.0 };

describe('buildCombatState', () => {
  it('places party at slots 1..N in array order with combatantIds p0..pN-1', () => {
    const party = [
      createHero('knight', 'K', 'h0'),
      createHero('archer', 'A', 'h1'),
      createHero('priest', 'P', 'h2'),
    ];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter);
    expect(state.combatants[0].id).toBe('p0');
    expect(state.combatants[0].slot).toBe(1);
    expect(state.combatants[0].classId).toBe('knight');
    expect(state.combatants[1].id).toBe('p1');
    expect(state.combatants[1].slot).toBe(2);
    expect(state.combatants[2].id).toBe('p2');
    expect(state.combatants[2].slot).toBe(3);
  });

  it('preserves party current HP (does not reset to max)', () => {
    const party = [createHero('knight', 'K', 'h0')];
    party[0] = { ...party[0], currentHp: 7 };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter);
    expect(state.combatants[0].currentHp).toBe(7);
  });

  it('respects enemy slots from placements and assigns e0..eM-1', () => {
    const party = [createHero('knight', 'K', 'h0')];
    const encounter: Encounter = {
      enemies: [
        { enemyId: 'skeleton_warrior', slot: 1 },
        { enemyId: 'skeleton_archer', slot: 3 },
      ],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemies = state.combatants.filter((c) => c.side === 'enemy');
    expect(enemies).toHaveLength(2);
    expect(enemies[0].id).toBe('e0');
    expect(enemies[0].slot).toBe(1);
    expect(enemies[1].id).toBe('e1');
    expect(enemies[1].slot).toBe(3);
  });

  it('applies scale to enemy HP and Attack only', () => {
    const party = [createHero('knight', 'K', 'h0')];
    const scale = { hp: 1.5, attack: 1.5 };
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1 }],
      scale,
    };
    const state = buildCombatState(party, encounter);
    const e0 = state.combatants.find((c) => c.id === 'e0')!;
    const base = ENEMIES.skeleton_warrior.baseStats;
    expect(e0.baseStats.hp).toBe(Math.round(base.hp * 1.5));
    expect(e0.baseStats.attack).toBe(Math.round(base.attack * 1.5));
    expect(e0.baseStats.defense).toBe(base.defense);
    expect(e0.baseStats.speed).toBe(base.speed);
    expect(e0.currentHp).toBe(e0.maxHp);
    expect(e0.currentHp).toBe(Math.round(base.hp * 1.5));
  });

  it('scale at 1.0x leaves stats unchanged', () => {
    const party = [createHero('knight', 'K', 'h0')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'ghoul', slot: 1 }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const e0 = state.combatants.find((c) => c.id === 'e0')!;
    expect(e0.baseStats).toEqual(ENEMIES.ghoul.baseStats);
  });

  it('round starts at 0', () => {
    const party = [createHero('knight', 'K', 'h0')];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter);
    expect(state.round).toBe(0);
  });
});
