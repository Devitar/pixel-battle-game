import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../data/classes';
import { ENEMIES } from '../../data/enemies';
import { createEnemyCombatant, createHeroCombatant } from '../combatant';

describe('createHeroCombatant', () => {
  it('builds a Knight at slot 1 with full HP', () => {
    const c = createHeroCombatant('knight', 1, 'p0');
    expect(c.side).toBe('player');
    expect(c.kind).toBe('hero');
    expect(c.classId).toBe('knight');
    expect(c.slot).toBe(1);
    expect(c.id).toBe('p0');
    expect(c.currentHp).toBe(c.maxHp);
    expect(c.currentHp).toBe(CLASSES.knight.baseStats.hp);
    expect(c.isDead).toBe(false);
    expect(c.statuses).toEqual({});
  });

  it('applies overrides', () => {
    const c = createHeroCombatant('archer', 2, 'p1', { currentHp: 5 });
    expect(c.currentHp).toBe(5);
    expect(c.maxHp).toBe(CLASSES.archer.baseStats.hp);
  });

  it('propagates traitId via overrides', () => {
    const c = createHeroCombatant('knight', 1, 'p0', { traitId: 'stout' });
    expect(c.traitId).toBe('stout');
  });
});

describe('createEnemyCombatant', () => {
  it('builds a Skeleton Warrior at slot 1 with correct tags and preferredSlots', () => {
    const c = createEnemyCombatant('skeleton_warrior', 1, 'e0');
    expect(c.side).toBe('enemy');
    expect(c.kind).toBe('enemy');
    expect(c.enemyId).toBe('skeleton_warrior');
    expect(c.tags).toEqual(['undead']);
    expect(c.preferredSlots).toEqual([1, 2]);
    expect(c.currentHp).toBe(ENEMIES.skeleton_warrior.baseStats.hp);
  });

  it('applies overrides — scaled baseStats', () => {
    const c = createEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 18, attack: 5, defense: 2, speed: 3 },
      currentHp: 18,
      maxHp: 18,
    });
    expect(c.baseStats.hp).toBe(18);
    expect(c.baseStats.attack).toBe(5);
    expect(c.currentHp).toBe(18);
    expect(c.maxHp).toBe(18);
  });

  it('leaves traitId undefined', () => {
    const c = createEnemyCombatant('skeleton_warrior', 1, 'e0');
    expect(c.traitId).toBeUndefined();
  });
});
