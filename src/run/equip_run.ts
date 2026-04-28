import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ItemSlot } from '../data/types';
import { computeMaxHp } from '../heroes/hero';
import { equip, unequip } from '../items/equip';
import { addItem, removeItem } from './pack';
import type { RunState } from './run_state';

export function equipFromPack(
  runState: RunState,
  heroIndex: number,
  packItemId: string,
  slot: ItemSlot,
): RunState {
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(
      `equipFromPack: heroIndex ${heroIndex} out of bounds (party size ${runState.party.length})`,
    );
  }
  const hero = runState.party[heroIndex];
  const packItem = runState.pack.items.find((i) => i.id === packItemId);
  if (!packItem) {
    throw new Error(`equipFromPack: item id '${packItemId}' not in pack`);
  }
  if (packItem.slot !== slot) {
    throw new Error(
      `equipFromPack: item.slot '${packItem.slot}' does not match target slot '${slot}'`,
    );
  }

  const { hero: nextHero, displaced } = equip(hero, packItem, slot);
  const classDef = CLASSES[nextHero.classId];
  const trait = TRAITS[nextHero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, nextHero.equipment);
  const clampedHero = {
    ...nextHero,
    maxHp: newMaxHp,
    currentHp: Math.min(nextHero.currentHp, newMaxHp),
  };

  let nextPack = removeItem(runState.pack, packItemId);
  if (displaced !== undefined) nextPack = addItem(nextPack, displaced);

  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}

export function unequipToPack(
  runState: RunState,
  heroIndex: number,
  slot: ItemSlot,
): RunState {
  if (slot === 'weapon') {
    throw new Error('unequipToPack: cannot unequip the weapon slot — every hero must have a weapon');
  }
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(
      `unequipToPack: heroIndex ${heroIndex} out of bounds (party size ${runState.party.length})`,
    );
  }
  const hero = runState.party[heroIndex];
  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return runState;

  const classDef = CLASSES[nextHero.classId];
  const trait = TRAITS[nextHero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, nextHero.equipment);
  const clampedHero = {
    ...nextHero,
    maxHp: newMaxHp,
    currentHp: Math.min(nextHero.currentHp, newMaxHp),
  };

  const nextPack = addItem(runState.pack, item);
  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}
