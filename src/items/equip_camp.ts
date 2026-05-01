import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ItemSlot } from '../data/types';
import { computeMaxHp, type Hero } from '../heroes/hero';
import { type Roster, updateHero } from '../camp/roster';
import { addItems, removeItem, type Stash } from '../camp/stash';
import { equip, unequip } from './equip';

export function equipFromStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  itemId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`equipFromStash: heroId '${heroId}' not in roster`);
  const stashItem = stash.items.find((i) => i.id === itemId);
  if (!stashItem) throw new Error(`equipFromStash: itemId '${itemId}' not in stash`);
  if (stashItem.slot !== slot) {
    throw new Error(
      `equipFromStash: item.slot '${stashItem.slot}' does not match target '${slot}'`,
    );
  }

  const { hero: nextHero, displaced } = equip(hero, stashItem, slot);
  const clampedHero = recomputeMaxHp(nextHero);

  let nextStash = removeItem(stash, itemId);
  if (displaced !== undefined) nextStash = addItems(nextStash, [displaced]);

  return { roster: updateHero(roster, clampedHero), stash: nextStash };
}

export function unequipToStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  if (slot === 'weapon') {
    throw new Error('unequipToStash: cannot unequip the weapon slot');
  }
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`unequipToStash: heroId '${heroId}' not in roster`);

  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return { roster, stash };

  const clampedHero = recomputeMaxHp(nextHero);
  return {
    roster: updateHero(roster, clampedHero),
    stash: addItems(stash, [item]),
  };
}

function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const trait = TRAITS[hero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, hero.equipment);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}
