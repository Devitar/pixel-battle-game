import { SPRITE_NAMES } from '../render/sprite_names.generated';
import type { Stats } from '../combat/types';
import type {
  AffixDef,
  AffixId,
  ItemBaseId,
  ItemSlot,
  RarePropertyDef,
  RarePropertyId,
  WeaponType,
} from './types';

export interface BaseItemDef {
  baseId: ItemBaseId;
  name: string;
  slot: ItemSlot;
  weaponType?: WeaponType;
  spriteId: string;
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  of_power:     { id: 'of_power',     name: 'of Power',     stat: 'attack',  baseValue: 1 },
  of_insight:   { id: 'of_insight',   name: 'of Insight',   stat: 'mind',    baseValue: 1 },
  of_the_bear:  { id: 'of_the_bear',  name: 'of the Bear',  stat: 'defense', baseValue: 1 },
  of_vigor:     { id: 'of_vigor',     name: 'of Vigor',     stat: 'hp',      baseValue: 2, hpMultiplier: 3 },
  of_swiftness: { id: 'of_swiftness', name: 'of Swiftness', stat: 'speed',   baseValue: 1 },
  of_the_hawk:  { id: 'of_the_hawk',  name: 'of the Hawk',  stat: 'crit',    baseValue: 5 },
  of_evasion:   { id: 'of_evasion',   name: 'of Evasion',   stat: 'dodge',   baseValue: 5 },
};

export const RARE_PROPERTIES: Record<RarePropertyId, RarePropertyDef> = {
  of_burning:      { id: 'of_burning',      name: 'of Burning',      slots: ['weapon'], kind: 'burn',      baseDamage: 2, turns: 2 },
  of_vampirism:    { id: 'of_vampirism',    name: 'of Vampirism',    slots: ['weapon'], kind: 'lifesteal', percentOfDamage: 25 },
  of_thorns:       { id: 'of_thorns',       name: 'of Thorns',       slots: ['shield'], kind: 'thorns',    baseDamage: 1 },
  of_regeneration: { id: 'of_regeneration', name: 'of Regeneration', slots: ['outfit'], kind: 'regen',     baseHeal: 1 },
};

export const BASE_ITEMS: Record<ItemBaseId, BaseItemDef> = {
  sword_basic:    { baseId: 'sword_basic',    name: 'Sword',           slot: 'weapon', weaponType: 'sword',        spriteId: String(SPRITE_NAMES.weapon.sword_tier1) },
  bow_basic:      { baseId: 'bow_basic',      name: 'Bow',             slot: 'weapon', weaponType: 'bow',          spriteId: String(SPRITE_NAMES.weapon.bow_wood_tier1) },
  mace_basic:     { baseId: 'mace_basic',     name: 'Mace',            slot: 'weapon', weaponType: 'holy_symbol',  spriteId: String(SPRITE_NAMES.weapon.mace_tier1) },
  axe_basic:      { baseId: 'axe_basic',      name: 'Battleaxe',       slot: 'weapon', weaponType: 'axe',          spriteId: String(SPRITE_NAMES.weapon.battleaxe_tier1) },
  daggers_basic:  { baseId: 'daggers_basic',  name: 'Dagger',          slot: 'weapon', weaponType: 'daggers',      spriteId: String(SPRITE_NAMES.weapon.dagger_tier1) },
  staff_basic:    { baseId: 'staff_basic',    name: 'Staff',           slot: 'weapon', weaponType: 'staff',        spriteId: String(SPRITE_NAMES.weapon.staff_blue_tier1) },
  shield_basic:   { baseId: 'shield_basic',   name: 'Shield',          slot: 'shield',                              spriteId: String(SPRITE_NAMES.shield.alloy_shield_1) },
  outfit_cloth:   { baseId: 'outfit_cloth',   name: 'Cloth Robes',     slot: 'outfit',                              spriteId: '0' },
  outfit_leather: { baseId: 'outfit_leather', name: 'Leather Tunic',   slot: 'outfit',                              spriteId: '0' },
  hat_cap:        { baseId: 'hat_cap',        name: 'Cap',             slot: 'hat',                                 spriteId: '0' },
  hat_hood:       { baseId: 'hat_hood',       name: 'Hood',            slot: 'hat',                                 spriteId: '0' },
};

export const BASE_ITEM_STATS: Record<ItemBaseId, Partial<Stats>> = {
  sword_basic:    { attack: 1 },
  bow_basic:      { attack: 1 },
  mace_basic:     { attack: 1 },
  axe_basic:      { attack: 1 },
  daggers_basic:  { attack: 1 },
  staff_basic:    { mind: 1 },
  shield_basic:   { defense: 1 },
  outfit_cloth:   { hp: 6 },
  outfit_leather: { hp: 9 },
  hat_cap:        {},
  hat_hood:       {},
};
