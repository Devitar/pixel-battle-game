import { describe, expect, it } from 'vitest';
import { ENEMIES } from '@data/enemies';
import type { Encounter } from '@dungeon/node';
import { createHero } from '@heroes/hero';
import { buildCombatState } from '../combat_setup';

const FLAT_SCALE = { hp: 1.0, attack: 1.0 };

describe('buildCombatState', () => {
  it('places party at slots 1..N in array order with combatantIds p0..pN-1', () => {
    const party = [
      createHero('knight', 'K', 'h0', 'quick', 'body1'),
      createHero('archer', 'A', 'h1', 'quick', 'body1'),
      createHero('priest', 'P', 'h2', 'quick', 'body1'),
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
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    party[0] = { ...party[0], currentHp: 7 };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter);
    expect(state.combatants[0].currentHp).toBe(7);
  });

  it('respects enemy slots from placements and assigns e0..eM-1', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
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
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
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
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'ghost', slot: 1 }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const e0 = state.combatants.find((c) => c.id === 'e0')!;
    expect(e0.baseStats).toEqual(ENEMIES.ghost.baseStats);
  });

  it('round starts at 0', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter);
    expect(state.round).toBe(0);
  });
});

describe('buildCombatState — trait propagation', () => {
  it('copies each Hero traitIds into the resulting Combatant', () => {
    const party = [
      createHero('knight', 'K', 'h0', 'stout', 'body1'),
      createHero('archer', 'A', 'h1', 'cowardly', 'body1'),
      createHero('priest', 'P', 'h2', 'sharp_eyed', 'body1'),
    ];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter);
    expect(state.combatants[0].traitIds).toEqual(['stout']);
    expect(state.combatants[1].traitIds).toEqual(['cowardly']);
    expect(state.combatants[2].traitIds).toEqual(['sharp_eyed']);
  });

  it('applies a statDelta wound (winded) to baseStats.attack', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
    hero.wounds = [{ id: 'winded', runsRemaining: 5 }];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    // hero.baseStats.attack (4) - winded (-2) + sword_basic base (+1) = 3
    expect(state.combatants[0].baseStats.attack).toBe(hero.baseStats.attack - 2 + 1);
  });

  it('applies a damageTakenMult wound (bruised) to combatant.damageTakenMultiplier', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
    hero.wounds = [{ id: 'bruised', runsRemaining: 5 }];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].damageTakenMultiplier).toBeCloseTo(1.20);
  });

  it('stacks two bruised wounds → damageTakenMultiplier 1.40', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
    hero.wounds = [
      { id: 'bruised', runsRemaining: 5 },
      { id: 'bruised', runsRemaining: 5 },
    ];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].damageTakenMultiplier).toBeCloseTo(1.40);
  });

  it('broken_bone wound reduces baseStats.hp AND maxHp AND clamps currentHp', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
    hero.wounds = [{ id: 'broken_bone', runsRemaining: 5 }];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    const c = state.combatants[0];
    expect(c.baseStats.hp).toBe(hero.baseStats.hp - 10);
    expect(c.maxHp).toBe(hero.maxHp - 10);
    expect(c.currentHp).toBeLessThanOrEqual(c.maxHp);
  });

  it('no wounds → no damageTakenMultiplier set on combatant', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].damageTakenMultiplier).toBeUndefined();
  });
});

describe('buildCombatState — equipment stats', () => {
  it('weapon affix +1 attack adds to combatant attack', () => {
    const hero = createHero('knight', 'K', 'h1', 'quick', '0');
    hero.equipment = {
      ...hero.equipment,
      weapon: { ...hero.equipment.weapon, affixes: [{ affixId: 'of_power', value: 1 }] },
    };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    const p0 = state.combatants[0];
    // hero.baseStats.attack (4) + sword_basic base (+1) + of_power affix (+1) = 6
    expect(p0.baseStats.attack).toBe(hero.baseStats.attack + 1 + 1);
  });

  it('outfit base hp + of_vigor affix flow into both baseStats.hp and maxHp', () => {
    const hero = createHero('archer', 'A', 'h1', 'quick', '0');
    hero.equipment = {
      ...hero.equipment,
      outfit: {
        id: 'o1', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'uncommon',
        affixes: [{ affixId: 'of_vigor', value: 6 }],
        floorRolledAt: 1,
      },
    };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    const p0 = state.combatants[0];
    // archer baseStats.hp (14) + outfit_cloth base (+6) + of_vigor (+6) = 26
    expect(p0.baseStats.hp).toBe(hero.baseStats.hp + 6 + 6);
    expect(p0.maxHp).toBe(p0.baseStats.hp);
  });

  it('rare weapon with of_burning sets Combatant.burningWeaponDamage', () => {
    const hero = createHero('knight', 'K', 'h1', 'quick', '0');
    hero.equipment = {
      ...hero.equipment,
      weapon: {
        id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'rare', weaponType: 'sword',
        affixes: [], rareProperty: { propertyId: 'of_burning', value: 3 }, floorRolledAt: 1,
      },
    };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    const p0 = state.combatants[0];
    expect(p0.burningWeaponDamage).toBe(3);
    expect(p0.lifestealPercent).toBeUndefined();
    expect(p0.thornsDamage).toBeUndefined();
    expect(p0.regenPerRound).toBeUndefined();
  });

  it('of_vampirism on weapon sets Combatant.lifestealPercent', () => {
    const hero = createHero('knight', 'K', 'h1', 'quick', '0');
    hero.equipment = {
      ...hero.equipment,
      weapon: {
        id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'rare', weaponType: 'sword',
        affixes: [], rareProperty: { propertyId: 'of_vampirism', value: 25 }, floorRolledAt: 1,
      },
    };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].lifestealPercent).toBe(25);
  });

  it('of_thorns on shield sets Combatant.thornsDamage', () => {
    const hero = createHero('knight', 'K', 'h1', 'quick', '0');
    hero.equipment = {
      ...hero.equipment,
      shield: {
        id: 's', baseId: 'shield_basic', slot: 'shield', rarity: 'rare',
        affixes: [], rareProperty: { propertyId: 'of_thorns', value: 1 }, floorRolledAt: 1,
      },
    };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].thornsDamage).toBe(1);
  });

  it('of_regeneration on outfit sets Combatant.regenPerRound', () => {
    const hero = createHero('archer', 'A', 'h1', 'quick', '0');
    hero.equipment = {
      ...hero.equipment,
      outfit: {
        id: 'o', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'rare',
        affixes: [], rareProperty: { propertyId: 'of_regeneration', value: 2 }, floorRolledAt: 1,
      },
    };
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].regenPerRound).toBe(2);
  });
});

import type { Hero } from '@heroes/hero';

function huntersInParty(): Hero[] {
  const archer = createHero('archer', 'A', 'a1', 'stout', 'body1');
  const knight = createHero('knight', 'K', 'k1', 'stout', 'body1');
  const hunter = createHero(
    'hunter', 'Robin', 'r1', 'stout',
    'body1', undefined, undefined, 'wolf',
  );
  return [knight, archer, hunter];
}

describe('buildCombatState — pet build pass', () => {
  it('appends a wolf pet at slot 4 for a Hunter party member', () => {
    const party = huntersInParty();
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, []);
    const pet = state.combatants.find((c) => c.kind === 'pet');
    expect(pet).toBeDefined();
    expect(pet!.slot).toBe(4);
    expect(pet!.ownerHeroId).toBe('r1');
    expect(pet!.petSpeciesId).toBe('wolf');
  });

  it('skips the pet when the Hunter\'s id is in petsDownByHeroId', () => {
    const party = huntersInParty();
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, ['r1']);
    const pet = state.combatants.find((c) => c.kind === 'pet');
    expect(pet).toBeUndefined();
  });

  it('builds no pet for a Hunter without petSpeciesId (defensive)', () => {
    const knight = createHero('knight', 'K', 'k1', 'stout', 'body1');
    const archer = createHero('archer', 'A', 'a1', 'stout', 'body1');
    const hunterNoPet = createHero('hunter', 'X', 'x1', 'stout', 'body1');
    const party = [knight, archer, hunterNoPet];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, []);
    expect(state.combatants.find((c) => c.kind === 'pet')).toBeUndefined();
  });

  it('reads Beastmaster perk and adds petAttackBonus', () => {
    const knight = createHero('knight', 'K', 'k1', 'stout', 'body1');
    const archer = createHero('archer', 'A', 'a1', 'stout', 'body1');
    const hunter = createHero(
      'hunter', 'B', 'b1', 'stout',
      'body1', undefined, undefined, 'bear',
    );
    hunter.pickedPerks = ['beastmaster'] as const;
    const party = [knight, archer, hunter];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, []);
    const pet = state.combatants.find((c) => c.kind === 'pet');
    const huntCombatant = state.combatants.find((c) => c.id === 'p2');
    expect(pet).toBeDefined();
    // bear scale 0.4 × hunter effective attack + 2 perk bonus
    const expected = Math.round(0.4 * huntCombatant!.baseStats.attack) + 2;
    expect(pet!.baseStats.attack).toBe(expected);
  });
});

import type { Item } from '@data/types';
import { resolveCombatAbilities } from '@items/kit';

describe('buildCombatState — kit resolution', () => {
  it('Knight wielding axe → Combatant.abilities includes knight_cleaving_swing, excludes shield_bash', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', '0');
    const axeWeapon: Item = {
      id: 'w_axe', baseId: 'axe_basic', slot: 'weapon', rarity: 'common',
      weaponType: 'axe', affixes: [], floorRolledAt: 1,
    };
    const heroWithAxe: typeof hero = {
      ...hero,
      equipment: { ...hero.equipment, weapon: axeWeapon },
    };
    const encounter = { enemies: [{ enemyId: 'skeleton_warrior' as const, slot: 1 as const }], scale: FLAT_SCALE };
    const state = buildCombatState([heroWithAxe], encounter);
    const p0 = state.combatants[0];
    expect(p0.abilities).toContain('knight_cleaving_swing');
    expect(p0.abilities).not.toContain('shield_bash');
  });

  it('Knight wielding bow → Combatant.abilities is [knight_slash]', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', '0');
    const bow: Item = {
      id: 'w_bow', baseId: 'bow_basic', slot: 'weapon', rarity: 'common',
      weaponType: 'bow', affixes: [], floorRolledAt: 1,
    };
    const heroWithBow: typeof hero = {
      ...hero,
      equipment: { ...hero.equipment, weapon: bow },
    };
    const encounter = { enemies: [{ enemyId: 'skeleton_warrior' as const, slot: 1 as const }], scale: FLAT_SCALE };
    const state = buildCombatState([heroWithBow], encounter);
    const p0 = state.combatants[0];
    expect(p0.abilities).toEqual(['knight_slash']);
  });

  it('Combatant.abilities matches resolveCombatAbilities output', () => {
    const hero = createHero('mage', 'M', 'h0', 'quick', '0');
    const resolved = resolveCombatAbilities(hero);
    const encounter = { enemies: [{ enemyId: 'skeleton_warrior' as const, slot: 1 as const }], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].abilities).toEqual(resolved.abilities);
    expect(state.combatants[0].aiPriority).toEqual(resolved.aiPriority);
  });
});

describe('buildCombatState — modifierIds', () => {
  it('Armored: enemy gets baseStats.defense = scaled defense + 2', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const enemyDef = ENEMIES.skeleton_warrior;
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: ['armored'] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.baseStats.defense).toBe(enemyDef.baseStats.defense + 2);
  });

  it('Venomous: enemy gets venomousDamage 2 and venomousDuration 2', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: ['venomous'] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.venomousDamage).toBe(2);
    expect(enemy.venomousDuration).toBe(2);
  });

  it('Enraged: enemy gets enragedThreshold 0.5 and enragedAttackDelta 3', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: ['enraged'] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.enragedThreshold).toBe(0.5);
    expect(enemy.enragedAttackDelta).toBe(3);
  });

  it('No modifierIds: enemy has none of the modifier-derived fields set', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1 }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.venomousDamage).toBeUndefined();
    expect(enemy.venomousDuration).toBeUndefined();
    expect(enemy.enragedThreshold).toBeUndefined();
    expect(enemy.enragedAttackDelta).toBeUndefined();
    expect(enemy.baseStats.defense).toBe(ENEMIES.skeleton_warrior.baseStats.defense);
  });

  it('Empty modifierIds: enemy has none of the modifier-derived fields set', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: [] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.venomousDamage).toBeUndefined();
    expect(enemy.enragedThreshold).toBeUndefined();
    expect(enemy.baseStats.defense).toBe(ENEMIES.skeleton_warrior.baseStats.defense);
  });
});
