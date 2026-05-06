import type { DungeonTier } from '@data/types';
import type { ScaleFactors } from './node';

const TIER_SCALING_SLOPE: Record<DungeonTier, number> = {
  1: 0.10,  // today's value (regression-locked)
  2: 0.13,  // Sunken Keep — spec 2 real value
  3: 0.10,
  4: 0.10,
};

const TIER_GOLD_MULTIPLIER: Record<DungeonTier, number> = {
  1: 1,
  2: 1.5,   // Sunken Keep — spec 2 real value
  3: 1,
  4: 1,
};

export function floorScale(floorNumber: number, tier: DungeonTier = 1): ScaleFactors {
  if (floorNumber < 1) {
    throw new Error(`floorScale: floorNumber must be >= 1, got ${floorNumber}`);
  }
  const slope = TIER_SCALING_SLOPE[tier];
  const mult = 1 + slope * (floorNumber - 1);
  return { hp: mult, attack: mult };
}

export function goldMultiplier(tier: DungeonTier): number {
  return TIER_GOLD_MULTIPLIER[tier];
}
