import { describe, expect, it } from 'vitest';
import { BLACKSMITH_UPGRADE_COST } from '@data/blacksmith';
import type { AffixId, Item } from '@data/types';
import { rollAffixValue } from '@dungeon/loot';
import { createRng } from '@util/rng';
import {
  canBlacksmithUpgrade,
  canUpgrade,
  nextRarity,
  upgradeCost,
  upgradeItem,
} from '../upgrade';

const ALL_AFFIX_IDS: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

function commonSwordAtFloor(floor: number): Item {
  return {
    id: 'fixture-common-sword',
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity: 'common',
    weaponType: 'sword',
    affixes: [],
    floorRolledAt: floor,
  };
}

function uncommonSwordWithPower(floor: number): Item {
  return {
    id: 'fixture-uncommon-sword',
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity: 'uncommon',
    weaponType: 'sword',
    affixes: [{ affixId: 'of_power', value: rollAffixValue('of_power', floor) }],
    floorRolledAt: floor,
  };
}

function uncommonHatWithPower(floor: number): Item {
  return {
    id: 'fixture-uncommon-hat',
    baseId: 'hat_cap',
    slot: 'hat',
    rarity: 'uncommon',
    affixes: [{ affixId: 'of_power', value: rollAffixValue('of_power', floor) }],
    floorRolledAt: floor,
  };
}

function rareWeapon(floor: number): Item {
  return {
    id: 'fixture-rare-weapon',
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity: 'rare',
    weaponType: 'sword',
    affixes: [
      { affixId: 'of_power',     value: rollAffixValue('of_power', floor) },
      { affixId: 'of_swiftness', value: rollAffixValue('of_swiftness', floor) },
    ],
    rareProperty: { propertyId: 'of_burning', value: 2 },
    floorRolledAt: floor,
  };
}

function epicWeapon(floor: number): Item {
  return {
    id: 'fixture-epic-weapon',
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity: 'epic',
    weaponType: 'sword',
    affixes: [
      { affixId: 'of_power',     value: rollAffixValue('of_power', floor) },
      { affixId: 'of_swiftness', value: rollAffixValue('of_swiftness', floor) },
      { affixId: 'of_the_bear',  value: rollAffixValue('of_the_bear', floor) },
    ],
    rareProperty: { propertyId: 'of_burning', value: 2 },
    floorRolledAt: floor,
  };
}

describe('nextRarity', () => {
  it('maps common → uncommon, uncommon → rare', () => {
    expect(nextRarity('common')).toBe('uncommon');
    expect(nextRarity('uncommon')).toBe('rare');
  });
});

describe('nextRarity — Epic tier', () => {
  it('rare upgrades to epic', () => {
    expect(nextRarity('rare')).toBe('epic');
  });
  it('epic is the cap (no further upgrade)', () => {
    expect(nextRarity('epic')).toBeNull();
  });
});

describe('canUpgrade', () => {
  it('returns true for common, uncommon, and rare; false for epic', () => {
    expect(canUpgrade(commonSwordAtFloor(5))).toBe(true);
    expect(canUpgrade(uncommonSwordWithPower(5))).toBe(true);
    expect(canUpgrade(rareWeapon(5))).toBe(true);
    expect(canUpgrade(epicWeapon(5))).toBe(false);
  });
});

describe('canBlacksmithUpgrade', () => {
  it('L1 allows common→uncommon only', () => {
    expect(canBlacksmithUpgrade(commonSwordAtFloor(5), 1)).toBe(true);
    expect(canBlacksmithUpgrade(uncommonSwordWithPower(5), 1)).toBe(false);
    expect(canBlacksmithUpgrade(rareWeapon(5), 1)).toBe(false);
  });

  it('L2 allows common→uncommon AND uncommon→rare', () => {
    expect(canBlacksmithUpgrade(commonSwordAtFloor(5), 2)).toBe(true);
    expect(canBlacksmithUpgrade(uncommonSwordWithPower(5), 2)).toBe(true);
    expect(canBlacksmithUpgrade(rareWeapon(5), 2)).toBe(false);
  });

  it('L3 allows common→uncommon, uncommon→rare, AND rare→epic', () => {
    expect(canBlacksmithUpgrade(commonSwordAtFloor(5), 3)).toBe(true);
    expect(canBlacksmithUpgrade(uncommonSwordWithPower(5), 3)).toBe(true);
    expect(canBlacksmithUpgrade(rareWeapon(5), 3)).toBe(true);
    // Epic is the cap — even at L3, an epic item can't upgrade further.
    expect(canBlacksmithUpgrade(epicWeapon(5), 3)).toBe(false);
  });
});

describe('upgradeCost', () => {
  it('charges 100g for common→uncommon', () => {
    expect(upgradeCost(commonSwordAtFloor(5))).toBe(BLACKSMITH_UPGRADE_COST.uncommon);
    expect(upgradeCost(commonSwordAtFloor(5))).toBe(100);
  });

  it('charges 300g for uncommon→rare', () => {
    expect(upgradeCost(uncommonSwordWithPower(5))).toBe(BLACKSMITH_UPGRADE_COST.rare);
    expect(upgradeCost(uncommonSwordWithPower(5))).toBe(300);
  });

  it('charges 900g for rare→epic', () => {
    expect(upgradeCost(rareWeapon(5))).toBe(BLACKSMITH_UPGRADE_COST.epic);
    expect(upgradeCost(rareWeapon(5))).toBe(900);
  });

  it('throws on epic input (epic is the cap)', () => {
    expect(() => upgradeCost(epicWeapon(5))).toThrow();
  });
});

describe('upgradeItem', () => {
  it('common→uncommon adds one affix at the item floor', () => {
    const item = commonSwordAtFloor(6);
    const rng = createRng(1);
    const upgraded = upgradeItem(item, rng);

    expect(upgraded.rarity).toBe('uncommon');
    expect(upgraded.affixes.length).toBe(1);
    const newAffix = upgraded.affixes[0];
    expect(ALL_AFFIX_IDS).toContain(newAffix.affixId);
    expect(newAffix.value).toBe(rollAffixValue(newAffix.affixId, 6));
    expect(upgraded.rareProperty).toBeUndefined();
    expect(upgraded.floorRolledAt).toBe(6);
    expect(upgraded.id).not.toBe(item.id);
  });

  it('uncommon→rare on a weapon adds an affix and a rare property', () => {
    const item = uncommonSwordWithPower(6);
    const rng = createRng(2);
    const upgraded = upgradeItem(item, rng);

    expect(upgraded.rarity).toBe('rare');
    expect(upgraded.affixes.length).toBe(2);
    // First affix is preserved verbatim.
    expect(upgraded.affixes[0]).toEqual(item.affixes[0]);
    // Second affix is new and not a duplicate of the first.
    const newAffix = upgraded.affixes[1];
    expect(newAffix.affixId).not.toBe('of_power');
    expect(newAffix.value).toBe(rollAffixValue(newAffix.affixId, 6));
    // Rare property is rolled, weapon-valid.
    expect(upgraded.rareProperty).toBeDefined();
    expect(['of_burning', 'of_vampirism']).toContain(upgraded.rareProperty!.propertyId);
  });

  it('uncommon→rare on a hat adds one affix and no rare property', () => {
    const item = uncommonHatWithPower(6);
    const rng = createRng(3);
    const upgraded = upgradeItem(item, rng);

    expect(upgraded.rarity).toBe('rare');
    // Deliberate divergence from loot-side: Blacksmith adds ONE affix per tier
    // bump. A freshly-rolled rare hat would have 3 affixes; an upgraded one has 2.
    expect(upgraded.affixes.length).toBe(2);
    expect(upgraded.affixes[0]).toEqual(item.affixes[0]);
    expect(upgraded.affixes[1].affixId).not.toBe('of_power');
    // Hats never roll a rare property.
    expect(upgraded.rareProperty).toBeUndefined();
  });

  it('upgrades rare → epic with one new affix and preserves the rare property', () => {
    const item = rareWeapon(5);
    const rng = createRng(4);
    const upgraded = upgradeItem(item, rng);

    expect(upgraded.rarity).toBe('epic');
    expect(upgraded.affixes.length).toBe(item.affixes.length + 1);
    // Existing affixes are preserved verbatim.
    expect(upgraded.affixes[0]).toEqual(item.affixes[0]);
    expect(upgraded.affixes[1]).toEqual(item.affixes[1]);
    // The new (third) affix is one of the unused affix IDs, not a duplicate.
    const newAffix = upgraded.affixes[2];
    expect(ALL_AFFIX_IDS).toContain(newAffix.affixId);
    expect(newAffix.affixId).not.toBe('of_power');
    expect(newAffix.affixId).not.toBe('of_swiftness');
    // Rare property is preserved (already set on the rare input; epic does not reroll it).
    expect(upgraded.rareProperty).toEqual(item.rareProperty);
  });

  it('throws on epic input (epic is the cap)', () => {
    const item = epicWeapon(5);
    const rng = createRng(4);
    expect(() => upgradeItem(item, rng)).toThrow();
  });

  it('produces a fresh id', () => {
    const item = uncommonSwordWithPower(6);
    const rng = createRng(5);
    const upgraded = upgradeItem(item, rng);
    expect(upgraded.id).not.toBe(item.id);
    expect(upgraded.id.length).toBeGreaterThan(0);
  });

  it('preserves floorRolledAt across the upgrade', () => {
    const item = commonSwordAtFloor(7);
    const rng = createRng(6);
    const upgraded = upgradeItem(item, rng);
    expect(upgraded.floorRolledAt).toBe(7);
  });

  it('the new affix at common→uncommon is different from any existing affix', () => {
    // Construct a common item that has no affixes (the only realistic case for
    // common, but cement the uniqueness invariant by trying many seeds and
    // confirming the new affix never duplicates an existing one).
    const item = commonSwordAtFloor(6);
    for (let seed = 1; seed <= 10; seed++) {
      const upgraded = upgradeItem(item, createRng(seed));
      const newAffix = upgraded.affixes[0];
      // Common had 0 affixes — uniqueness is trivially satisfied. Just sanity-check.
      expect(newAffix).toBeDefined();
      expect(ALL_AFFIX_IDS).toContain(newAffix.affixId);
    }
  });
});
