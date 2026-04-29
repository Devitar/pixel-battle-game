import { AFFIXES, BASE_ITEMS, RARE_PROPERTIES } from '../data/items';
import type { HeroEquipment, Item, ItemSlot, RolledAffix, RolledRareProperty } from '../data/types';
import type { Stats } from '../combat/types';
import type { Hero } from '../heroes/hero';
import type { Pack } from '../run/pack';
import { applyEquipmentStats } from './stats';

const AFFIX_STAT_SUFFIX: Record<RolledAffix['affixId'], string> = {
  of_power: 'atk',
  of_insight: 'mind',
  of_the_bear: 'def',
  of_vigor: 'hp',
  of_swiftness: 'spd',
  of_the_hawk: '% crit',
  of_evasion: '% dodge',
};

export function filterPackBySlot(pack: Pack, slot: ItemSlot): readonly Item[] {
  return pack.items.filter((i) => i.slot === slot);
}

export function itemDisplayName(item: Item): string {
  const baseName = BASE_ITEMS[item.baseId].name;
  if (item.rareProperty) {
    return `${baseName} ${RARE_PROPERTIES[item.rareProperty.propertyId].name}`;
  }
  if (item.rarity === 'uncommon' && item.affixes.length > 0) {
    return `${baseName} ${AFFIXES[item.affixes[0].affixId].name}`;
  }
  return baseName;
}

export function itemAffixDescription(item: Item): string {
  const parts: string[] = [];
  for (const a of item.affixes) parts.push(formatAffix(a));
  if (item.rareProperty) parts.push(formatRareProperty(item.rareProperty));
  return parts.join(' · ');
}

function formatAffix(a: RolledAffix): string {
  const suffix = AFFIX_STAT_SUFFIX[a.affixId];
  if (suffix.startsWith('%')) {
    return `+${a.value}${suffix}`;
  }
  return `+${a.value} ${suffix}`;
}

function formatRareProperty(p: RolledRareProperty): string {
  switch (p.propertyId) {
    case 'of_burning': {
      const def = RARE_PROPERTIES.of_burning;
      const turns = def.kind === 'burn' ? def.turns : 2;
      return `burns ${turns} turns`;
    }
    case 'of_vampirism':    return `${p.value}% lifesteal`;
    case 'of_thorns':       return `${p.value} thorns`;
    case 'of_regeneration': return `+${p.value} regen/round`;
  }
}

export interface StatPreview {
  currentStats: Stats;
  previewStats: Stats;
  /** Only stats whose values changed are present. */
  deltas: Partial<Stats>;
}

/**
 * Equipment-only effective stats: class baseStats + equipment (base + affixes).
 * Trait and wound effects are intentionally excluded — they're invariant across
 * the swap and would shift both columns identically without changing the delta.
 * Matches the existing Barracks display convention.
 */
export function previewStats(hero: Hero, item: Item, slot: ItemSlot): StatPreview {
  const currentStats = applyEquipmentStats(hero.baseStats, hero.equipment);
  const simulatedEquipment = swapIntoSlot(hero.equipment, item, slot);
  const previewed = applyEquipmentStats(hero.baseStats, simulatedEquipment);

  const deltas: Partial<Stats> = {};
  for (const k of Object.keys(currentStats) as (keyof Stats)[]) {
    if (currentStats[k] !== previewed[k]) {
      deltas[k] = previewed[k] - currentStats[k];
    }
  }
  return { currentStats, previewStats: previewed, deltas };
}

function swapIntoSlot(equipment: HeroEquipment, item: Item, slot: ItemSlot): HeroEquipment {
  if (slot === 'weapon') return { ...equipment, weapon: item };
  return { ...equipment, [slot]: item };
}
