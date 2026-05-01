import { BASE_ITEM_STATS } from '@data/items';
import type {
  AffixId, BuffableStat, HeroEquipment, RarePropertyId, RolledRareProperty,
} from '@data/types';
import type { Stats } from '@combat/types';

const AFFIX_TO_STAT: Record<AffixId, BuffableStat> = {
  of_power: 'attack',
  of_insight: 'mind',
  of_the_bear: 'defense',
  of_vigor: 'hp',
  of_swiftness: 'speed',
  of_the_hawk: 'crit',
  of_evasion: 'dodge',
};

export function applyEquipmentStats(stats: Stats, equipment: HeroEquipment): Stats {
  const result: Stats = { ...stats };
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    const base = BASE_ITEM_STATS[item.baseId];
    for (const k of Object.keys(base) as (keyof Stats)[]) {
      result[k] = result[k] + (base[k] ?? 0);
    }
    for (const a of item.affixes) {
      const stat = AFFIX_TO_STAT[a.affixId];
      result[stat] = result[stat] + a.value;
    }
  }
  return result;
}

export interface RarePropertyFields {
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
  burningWeaponDamage?: number;
}

export function rarePropertyFields(equipment: HeroEquipment): RarePropertyFields {
  const out: RarePropertyFields = {};
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item || !item.rareProperty) continue;
    const map: Record<RarePropertyId, (rp: RolledRareProperty) => void> = {
      of_burning:      (rp) => { out.burningWeaponDamage = rp.value; },
      of_vampirism:    (rp) => { out.lifestealPercent = rp.value; },
      of_thorns:       (rp) => { out.thornsDamage = rp.value; },
      of_regeneration: (rp) => { out.regenPerRound = rp.value; },
    };
    map[item.rareProperty.propertyId](item.rareProperty);
  }
  return out;
}
