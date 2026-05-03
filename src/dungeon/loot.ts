import { AFFIXES, RARE_PROPERTIES } from '@data/items';
import type {
  AffixId,
  ItemBaseId,
  ItemSlot,
  Item,
  Rarity,
  RarePropertyId,
  RolledAffix,
  RolledRareProperty,
  WeaponType,
} from '@data/types';
import { generateItemId, type Rng, type WeightedOption } from '@util/rng';
import { floorScale } from './scaling';

const ALL_SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
const WEAPON_FAMILIES: readonly WeaponType[] = ['sword', 'bow', 'holy_symbol', 'axe', 'daggers', 'staff'];
const ALL_AFFIX_IDS: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

const WEAPON_FAMILY_TO_BASE: Record<WeaponType, ItemBaseId> = {
  sword: 'sword_basic',
  bow: 'bow_basic',
  holy_symbol: 'mace_basic',
  axe: 'axe_basic',
  daggers: 'daggers_basic',
  staff: 'staff_basic',
};

const OUTFIT_BASES: readonly ItemBaseId[] = ['outfit_cloth', 'outfit_leather'];
const HAT_BASES: readonly ItemBaseId[] = ['hat_cap', 'hat_hood'];

interface RarityRow { floor: number; common: number; uncommon: number; rare: number }
const RARITY_TABLE: readonly RarityRow[] = [
  { floor: 1,  common: 90, uncommon: 10, rare:  0 },
  { floor: 3,  common: 80, uncommon: 18, rare:  2 },
  { floor: 5,  common: 70, uncommon: 25, rare:  5 },
  { floor: 8,  common: 55, uncommon: 32, rare: 13 },
  { floor: 10, common: 45, uncommon: 35, rare: 20 },
  { floor: 15, common: 30, uncommon: 40, rare: 30 },
];

function rarityWeightsAt(floor: number): { common: number; uncommon: number; rare: number } {
  if (floor <= RARITY_TABLE[0].floor) return pluckWeights(RARITY_TABLE[0]);
  if (floor >= RARITY_TABLE[RARITY_TABLE.length - 1].floor) {
    return pluckWeights(RARITY_TABLE[RARITY_TABLE.length - 1]);
  }
  for (let i = 0; i < RARITY_TABLE.length - 1; i++) {
    const lo = RARITY_TABLE[i];
    const hi = RARITY_TABLE[i + 1];
    if (floor >= lo.floor && floor <= hi.floor) {
      const t = (floor - lo.floor) / (hi.floor - lo.floor);
      return {
        common: lerp(lo.common, hi.common, t),
        uncommon: lerp(lo.uncommon, hi.uncommon, t),
        rare: lerp(lo.rare, hi.rare, t),
      };
    }
  }
  return pluckWeights(RARITY_TABLE[RARITY_TABLE.length - 1]);
}

function pluckWeights(r: RarityRow) { return { common: r.common, uncommon: r.uncommon, rare: r.rare }; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function scaleByFloor(baseValue: number, floor: number): number {
  return Math.round(baseValue * floorScale(floor).hp);
}

function pickRarity(rng: Rng, floor: number): Rarity {
  const w = rarityWeightsAt(floor);
  const opts: WeightedOption<Rarity>[] = [
    { value: 'common', weight: w.common },
    { value: 'uncommon', weight: w.uncommon },
    { value: 'rare', weight: w.rare },
  ];
  return rng.weighted(opts);
}

function affixCount(rarity: Rarity, slot: ItemSlot): number {
  if (rarity === 'common') return 0;
  if (rarity === 'uncommon') return 1;
  return slot === 'hat' ? 3 : 2;
}

function pickAffixes(rng: Rng, count: number): AffixId[] {
  if (count === 0) return [];
  const shuffled = rng.shuffle(ALL_AFFIX_IDS);
  return shuffled.slice(0, count);
}

export function rollAffixValue(affixId: AffixId, floor: number): number {
  const def = AFFIXES[affixId];
  const scaled = scaleByFloor(def.baseValue, floor);
  return def.hpMultiplier === 3 ? scaled * 3 : scaled;
}

export function pickRareProperty(rng: Rng, slot: ItemSlot, floor: number): RolledRareProperty | undefined {
  if (slot === 'hat') return undefined;
  const candidates: RarePropertyId[] = [];
  for (const id of Object.keys(RARE_PROPERTIES) as RarePropertyId[]) {
    if ((RARE_PROPERTIES[id].slots as readonly string[]).includes(slot)) candidates.push(id);
  }
  const propertyId = rng.pick(candidates);
  const def = RARE_PROPERTIES[propertyId];
  let value: number;
  switch (def.kind) {
    case 'burn':      value = scaleByFloor(def.baseDamage, floor); break;
    case 'lifesteal': value = def.percentOfDamage; break; // ratio: not floor-scaled
    case 'thorns':    value = scaleByFloor(def.baseDamage, floor); break;
    case 'regen':     value = scaleByFloor(def.baseHeal,   floor); break;
  }
  return { propertyId, value };
}

function pickBaseId(rng: Rng, slot: ItemSlot): { baseId: ItemBaseId; weaponType?: WeaponType } {
  switch (slot) {
    case 'weapon': {
      const family = rng.pick(WEAPON_FAMILIES);
      return { baseId: WEAPON_FAMILY_TO_BASE[family], weaponType: family };
    }
    case 'shield': return { baseId: 'shield_basic' };
    case 'outfit': return { baseId: rng.pick(OUTFIT_BASES) };
    case 'hat':    return { baseId: rng.pick(HAT_BASES) };
  }
}

export function rollEventItem(rng: Rng, floorNumber: number, rarity: Rarity): Item {
  // Always-drop, forced-rarity item. Slot picked uniformly. Affixes / rare-property
  // scaled at current floor. Used by the event-resolver's add_item payload.
  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floorNumber),
  }));
  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floorNumber) : undefined;
  const id = generateItemId(rng);
  return {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floorNumber,
  };
}

export function rollShopItem(rng: Rng, slot: ItemSlot, floor: number): Item {
  // Used by shops: uses `floor` uniformly for rarity weights, affix values,
  // rare property values, and `floorRolledAt`. (Boss loot uses a different
  // policy — see rollLoot — so it doesn't delegate here.)
  const base = pickBaseId(rng, slot);
  const rarity = pickRarity(rng, floor);

  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floor),
  }));

  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floor) : undefined;

  const id = generateItemId(rng);
  return {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floor,
  };
}

export type LootKind = 'combat' | 'elite' | 'boss' | 'treasure';

export function rollLoot(rng: Rng, floorNumber: number, kind: LootKind): Item | null {
  if (kind === 'combat') {
    if (rng.next() >= 0.1) return null;
  }
  // Per-kind policy:
  //   combat:    10% drop gate (above), current-floor rarity table, current-floor scaling.
  //              Phase 5 dropped this from 50% → 10% to make treasure rooms the
  //              predictable loot path; combat drops are now an occasional bonus.
  //   elite:     guaranteed drop, forced rarity = rare, current-floor scaling.
  //   boss:      guaranteed drop, NEXT-floor rarity weights, current-floor affix scaling.
  //   treasure:  guaranteed drop, current-floor rarity table, current-floor scaling.
  const effectiveFloor = kind === 'boss' ? floorNumber + 1 : floorNumber;

  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const rarity: Rarity = kind === 'elite' ? 'rare' : pickRarity(rng, effectiveFloor);

  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floorNumber),
  }));

  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floorNumber) : undefined;

  const id = generateItemId(rng);
  const item: Item = {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floorNumber,
  };
  return item;
}

// Exported for tests.
export const _internal = { rarityWeightsAt, scaleByFloor };
