import { BASE_ITEMS, BASE_ITEM_STATS } from '../data/items';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type {
  ClassId, HeroEquipment, Item, ItemBaseId, ItemSlot,
  PerkId, StarterLoadout, TraitDef, TraitId, Wound,
} from '../data/types';
import type { Stats } from '../combat/types';

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
  wounds: Wound[];
  equipment: HeroEquipment;
  xp: number;
  level: number;
  pendingPerk: boolean;
  perkId?: PerkId;
}

export function createHero(
  classId: ClassId,
  name: string,
  id: string,
  traitId: TraitId,
  bodySpriteId: string,
): Hero {
  const def = CLASSES[classId];
  const equipment = buildStarterEquipment(id, def.starterLoadout);
  const maxHp = computeMaxHp(def.baseStats.hp, TRAITS[traitId], equipment);
  return {
    id,
    classId,
    name,
    baseStats: { ...def.baseStats },
    currentHp: maxHp,
    maxHp,
    traitId,
    bodySpriteId,
    wounds: [],
    equipment,
    xp: 0,
    level: 1,
    pendingPerk: false,
  };
}

export function computeMaxHp(
  classBaseHp: number,
  trait: TraitDef,
  equipment: HeroEquipment,
): number {
  let base = classBaseHp;
  if (trait.hpEffect) {
    const { delta, mode } = trait.hpEffect;
    base = mode === 'percent' ? Math.round(base * (1 + delta / 100)) : base + delta;
  }
  let gear = 0;
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    const baseStats = BASE_ITEM_STATS[item.baseId];
    if (baseStats.hp !== undefined) gear += baseStats.hp;
    for (const a of item.affixes) {
      if (a.affixId === 'of_vigor') gear += a.value;
    }
  }
  return base + gear;
}

function buildStarterEquipment(heroId: string, starter: StarterLoadout): HeroEquipment {
  const eq: HeroEquipment = {
    weapon: starterItem(`starter_${heroId}_weapon`, starter.weapon, 'weapon'),
  };
  if (starter.shield) eq.shield = starterItem(`starter_${heroId}_shield`, starter.shield, 'shield');
  if (starter.outfit) eq.outfit = starterItem(`starter_${heroId}_outfit`, starter.outfit, 'outfit');
  if (starter.hat)    eq.hat    = starterItem(`starter_${heroId}_hat`,    starter.hat,    'hat');
  return eq;
}

function starterItem(id: string, baseId: ItemBaseId, slot: ItemSlot): Item {
  const def = BASE_ITEMS[baseId];
  return {
    id,
    baseId,
    slot,
    rarity: 'common',
    ...(def.weaponType !== undefined ? { weaponType: def.weaponType } : {}),
    affixes: [],
    floorRolledAt: 1,
  };
}
