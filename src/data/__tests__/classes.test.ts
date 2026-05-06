import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { CLASSES } from '../classes';
import type { ClassId } from '../types';

const EXPECTED_IDS: readonly ClassId[] = ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin'];
const STATS: readonly ('hp' | 'attack' | 'defense' | 'speed')[] = [
  'hp',
  'attack',
  'defense',
  'speed',
];

describe('CLASSES', () => {
  it('registers every expected class id', () => {
    for (const id of EXPECTED_IDS) {
      expect(CLASSES[id], `missing class ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(CLASSES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('class %s', (id) => {
    it('has matching id field', () => {
      expect(CLASSES[id].id).toBe(id);
    });

    it('has all four base stats positive and finite', () => {
      for (const s of STATS) {
        const v = CLASSES[id].baseStats[s];
        expect(v, `${id}.${s}`).toBeGreaterThan(0);
        expect(Number.isFinite(v), `${id}.${s} finite`).toBe(true);
      }
    });

    it('lists only registered abilities', () => {
      for (const abilityId of CLASSES[id].abilities) {
        expect(ABILITIES[abilityId], `${id} references missing ability ${abilityId}`).toBeDefined();
      }
    });

    it('aiPriority is a subset of abilities', () => {
      const abilities = new Set<string>(CLASSES[id].abilities);
      for (const p of CLASSES[id].aiPriority) {
        expect(
          abilities.has(p),
          `${id} prioritizes ${p} which is not in its abilities list`,
        ).toBe(true);
      }
    });

    it('has a starter weapon sprite id', () => {
      expect(CLASSES[id].starterLoadout.weapon).toBeTruthy();
    });

    it('references only abilities castable from player-side slots', () => {
      for (const abilityId of CLASSES[id].abilities) {
        const slots = ABILITIES[abilityId].canCastFrom;
        for (const s of slots) {
          expect(
            [1, 2, 3],
            `${id} references ${abilityId} with canCastFrom=${s} (must be 1-3)`,
          ).toContain(s);
        }
      }
    });
  });

  it('Knight starts with a shield, Archer and Priest do not', () => {
    expect(CLASSES.knight.starterLoadout.shield).toBeTruthy();
    expect(CLASSES.archer.starterLoadout.shield).toBeUndefined();
    expect(CLASSES.priest.starterLoadout.shield).toBeUndefined();
  });

  describe('weaponFamily + basicAbility', () => {
    it('every class declares a weaponFamily', () => {
      const valid = new Set(['melee', 'ranged', 'magic']);
      for (const id of EXPECTED_IDS) {
        expect(valid.has(CLASSES[id].weaponFamily), `${id}.weaponFamily`).toBe(true);
      }
    });

    it("each class's basicAbility is in its abilities list", () => {
      for (const id of EXPECTED_IDS) {
        const def = CLASSES[id];
        expect(def.abilities, `${id}.basicAbility`).toContain(def.basicAbility);
      }
    });

    it('basicAbility resolves to a registered ability', () => {
      for (const id of EXPECTED_IDS) {
        expect(ABILITIES[CLASSES[id].basicAbility]).toBeDefined();
      }
    });
  });
});

describe('swap mappings', () => {
  const SWAP_CLASSES: readonly ClassId[] = ['knight', 'priest', 'barbarian', 'rogue', 'mage', 'paladin'];

  it('Archer has no swapTarget or weaponSwaps', () => {
    expect(CLASSES.archer.swapTarget).toBeUndefined();
    expect(CLASSES.archer.weaponSwaps).toBeUndefined();
  });

  describe.each(SWAP_CLASSES)('class %s swap mapping', (id) => {
    it('declares both swapTarget and weaponSwaps', () => {
      expect(CLASSES[id].swapTarget).toBeDefined();
      expect(CLASSES[id].weaponSwaps).toBeDefined();
    });

    it("swapTarget is in the class's abilities list", () => {
      const def = CLASSES[id];
      expect(def.abilities).toContain(def.swapTarget!);
    });

    it('weaponSwaps keys are same family as the class but not the preferred weapon', () => {
      const def = CLASSES[id];
      const family = def.weaponFamily;
      const familyMembers: Record<typeof family, readonly string[]> = {
        melee: ['sword', 'axe', 'daggers'],
        ranged: ['bow'],
        magic: ['staff', 'holy_symbol'],
      };
      const allowed = new Set(familyMembers[family]);
      for (const weaponType of Object.keys(def.weaponSwaps!)) {
        expect(allowed.has(weaponType), `${id}.weaponSwaps key '${weaponType}' must be ${family}`).toBe(true);
        expect(weaponType, `${id}.weaponSwaps key cannot equal preferredWeapon`).not.toBe(def.preferredWeapon);
      }
    });

    it('weaponSwaps values are valid registered abilities', () => {
      const def = CLASSES[id];
      for (const swapId of Object.values(def.weaponSwaps!)) {
        expect(ABILITIES[swapId!], `${id}.weaponSwaps value '${swapId}' must be a registered ability`).toBeDefined();
      }
    });
  });
});

describe('class primaryStat', () => {
  const VALID_PRIMARIES: ReadonlyArray<string> = [
    'attack', 'defense', 'speed', 'mind', 'crit', 'dodge',
  ];

  for (const classId of EXPECTED_IDS) {
    it(`${classId} has a primaryStat that's a non-HP buffable stat`, () => {
      const def = CLASSES[classId];
      expect(VALID_PRIMARIES).toContain(def.primaryStat);
    });
  }
});

describe('Paladin', () => {
  it('has the expected stat profile (Knight chassis with mind=4)', () => {
    const p = CLASSES.paladin;
    expect(p.baseStats.hp).toBe(20);
    expect(p.baseStats.attack).toBe(3);
    expect(p.baseStats.defense).toBe(4);
    expect(p.baseStats.mind).toBe(4);
  });

  it('has primaryStat=mind, preferredWeapon=sword, weaponFamily=melee', () => {
    expect(CLASSES.paladin.primaryStat).toBe('mind');
    expect(CLASSES.paladin.preferredWeapon).toBe('sword');
    expect(CLASSES.paladin.weaponFamily).toBe('melee');
  });

  it('has the 4 expected abilities including shared smite', () => {
    expect([...CLASSES.paladin.abilities].sort()).toEqual(
      ['consecrate', 'lay_on_hands', 'paladin_strike', 'smite'].sort(),
    );
  });

  it('AI prioritizes consecrate > lay_on_hands > smite > basic', () => {
    expect(CLASSES.paladin.aiPriority).toEqual(['consecrate', 'lay_on_hands', 'smite', 'paladin_strike']);
  });

  it('starter loadout matches Knight pattern (sword + shield)', () => {
    expect(CLASSES.paladin.starterLoadout.weapon).toBe('sword_basic');
    expect(CLASSES.paladin.starterLoadout.shield).toBe('shield_basic');
  });

  it('declares smite as swapTarget with axe + daggers variants', () => {
    expect(CLASSES.paladin.swapTarget).toBe('smite');
    expect(CLASSES.paladin.weaponSwaps).toEqual({
      axe: 'paladin_cleaving_smite',
      daggers: 'paladin_quick_smite',
    });
  });
});
