import { describe, expect, it } from 'vitest';
import { CLASSES } from '@data/classes';
import { ENEMIES } from '@data/enemies';
import { createEnemyCombatant, createHeroCombatant, createPetCombatant } from '../combatant';
import { PET_SPECIES } from '@data/pet_species';

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

  it('propagates traitIds via overrides', () => {
    const c = createHeroCombatant('knight', 1, 'p0', { traitIds: ['stout'] });
    expect(c.traitIds).toEqual(['stout']);
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
      baseStats: { hp: 18, attack: 5, defense: 2, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 18,
      maxHp: 18,
    });
    expect(c.baseStats.hp).toBe(18);
    expect(c.baseStats.attack).toBe(5);
    expect(c.currentHp).toBe(18);
    expect(c.maxHp).toBe(18);
  });

  it('leaves traitIds undefined', () => {
    const c = createEnemyCombatant('skeleton_warrior', 1, 'e0');
    expect(c.traitIds).toBeUndefined();
  });
});

describe('createPetCombatant', () => {
  it('builds a wolf with attack scaled from hunter Attack=10', () => {
    const pet = createPetCombatant('wolf', 'hunter_id_1', 10);
    expect(pet.kind).toBe('pet');
    expect(pet.side).toBe('player');
    expect(pet.slot).toBe(4);
    expect(pet.ownerHeroId).toBe('hunter_id_1');
    expect(pet.petSpeciesId).toBe('wolf');
    // wolf scale 0.6 × 10 = 6
    expect(pet.baseStats.attack).toBe(6);
    expect(pet.baseStats.hp).toBe(PET_SPECIES.wolf.baseStats.hp);
    expect(pet.maxHp).toBe(PET_SPECIES.wolf.baseStats.hp);
    expect(pet.currentHp).toBe(PET_SPECIES.wolf.baseStats.hp);
    expect(pet.tags).toContain('beast');
    expect(pet.preferredSlots).toEqual([4]);
    expect(pet.id).toBe('pet_hunter_id_1');
  });

  it('applies petAttackBonus on top of the scaled attack', () => {
    const pet = createPetCombatant('hawk', 'h2', 8, 2);
    // hawk scale 0.5 × 8 = 4, +2 perk bonus = 6
    expect(pet.baseStats.attack).toBe(6);
  });

  it('rounds the scaled attack', () => {
    // bear scale 0.4 × 7 = 2.8 → 3
    const pet = createPetCombatant('bear', 'h3', 7);
    expect(pet.baseStats.attack).toBe(3);
  });

  it('uses species abilities and aiPriority', () => {
    const pet = createPetCombatant('wolf', 'h4', 10);
    expect(pet.abilities).toEqual(PET_SPECIES.wolf.abilities);
    expect(pet.aiPriority).toEqual(PET_SPECIES.wolf.aiPriority);
  });
});
