import { BLACKSMITH_UPGRADE_COST } from '@data/blacksmith';
import type { AffixId, Item, Rarity, RolledAffix } from '@data/types';
import { pickRareProperty, rollAffixValue } from '@dungeon/loot';
import type { BuildingLevel } from '@save/save';
import { generateItemId, type Rng } from '@util/rng';

const ALL_AFFIX_IDS: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

const NEXT_RARITY: Record<Rarity, Exclude<Rarity, 'common'> | null> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'epic',
  epic: null,
};

export function nextRarity(r: Rarity): Exclude<Rarity, 'common'> | null {
  return NEXT_RARITY[r];
}

export function canUpgrade(item: Item): boolean {
  return nextRarity(item.rarity) !== null;
}

export function canBlacksmithUpgrade(item: Item, blacksmithLevel: BuildingLevel): boolean {
  if (!canUpgrade(item)) return false;
  if (item.rarity === 'uncommon' && blacksmithLevel < 2) return false;
  if (item.rarity === 'rare' && blacksmithLevel < 3) return false;
  return true;
}

export function upgradeCost(item: Item): number {
  const target = nextRarity(item.rarity);
  if (target === null) {
    throw new Error(`upgradeCost: item already at max rarity '${item.rarity}'`);
  }
  return BLACKSMITH_UPGRADE_COST[target];
}

export function upgradeItem(item: Item, rng: Rng): Item {
  const target = nextRarity(item.rarity);
  if (target === null) {
    throw new Error(`upgradeItem: cannot upgrade item at rarity '${item.rarity}'`);
  }

  const newAffix = rollNewAffix(item, rng);

  // Hats never roll a rare property; everything else rolls one when reaching rare.
  const rareProperty = target === 'rare' && item.slot !== 'hat'
    ? pickRareProperty(rng, item.slot, item.floorRolledAt)
    : item.rareProperty;

  const upgraded: Item = {
    ...item,
    id: generateItemId(rng),
    rarity: target,
    affixes: [...item.affixes, newAffix],
    ...(rareProperty !== undefined ? { rareProperty } : {}),
  };
  return upgraded;
}

function rollNewAffix(item: Item, rng: Rng): RolledAffix {
  const used = new Set(item.affixes.map((a) => a.affixId));
  const available = ALL_AFFIX_IDS.filter((id) => !used.has(id));
  if (available.length === 0) {
    // Defensive — items max at 4 affixes (hat at epic) so there are always at least
    // 3 unused affix ids when this runs. Epic is the cap for upgrades.
    throw new Error('rollNewAffix: no available affixes');
  }
  const affixId = rng.pick(available);
  return { affixId, value: rollAffixValue(affixId, item.floorRolledAt) };
}
