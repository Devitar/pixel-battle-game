import { DEFAULT_FEET_SPRITE, DEFAULT_LEGS_SPRITE } from '@data/body_sprites';
import { BASE_ITEMS, BASE_ITEM_STATS } from '@data/items';
import { CLASSES } from '@data/classes';
import { PERKS } from '@data/perks';
import { TRAITS } from '@data/traits';
import type {
  ClassId, HeroEquipment, Item, ItemBaseId, ItemSlot,
  PerkDef, PerkId, StarterLoadout, TraitDef, TraitHpEffect, TraitId, Wound,
} from '@data/types';
import type { Stats } from '@combat/types';

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
  legsSpriteId: string;
  feetSpriteId: string;
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
  legsSpriteId: string = DEFAULT_LEGS_SPRITE,
  feetSpriteId: string = DEFAULT_FEET_SPRITE,
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
    legsSpriteId,
    feetSpriteId,
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
  perk?: PerkDef,
): number {
  let base = classBaseHp;
  if (trait.hpEffect) base = applyHpEffect(base, trait.hpEffect);
  if (perk?.hpEffect) base = applyHpEffect(base, perk.hpEffect);
  return base + gearTotal(equipment);
}

export function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const trait = TRAITS[hero.traitId];
  const perk = hero.perkId ? PERKS[hero.perkId] : undefined;
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, hero.equipment, perk);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}

export function applyPerk(hero: Hero, perkId: PerkId): Hero {
  const perk = PERKS[perkId];
  const updated: Hero = { ...hero, perkId, pendingPerk: false };
  if (perk.hpEffect) {
    const newMaxHp = applyHpEffect(hero.maxHp, perk.hpEffect);
    const ratio = hero.maxHp > 0 ? newMaxHp / hero.maxHp : 1;
    updated.maxHp = newMaxHp;
    updated.currentHp = Math.max(1, Math.round(hero.currentHp * ratio));
  }
  return updated;
}

function applyHpEffect(value: number, effect: TraitHpEffect): number {
  const { delta, mode } = effect;
  return mode === 'percent' ? Math.round(value * (1 + delta / 100)) : value + delta;
}

function gearTotal(equipment: HeroEquipment): number {
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
  return gear;
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
