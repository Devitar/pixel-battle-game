import type { Rarity } from './types';

// Cost is keyed by the *target* rarity (i.e. the rarity the item will become).
export const BLACKSMITH_UPGRADE_COST: Record<Exclude<Rarity, 'common' | 'legendary'>, number> = {
  uncommon: 100,
  rare: 300,
  epic: 900,
};
