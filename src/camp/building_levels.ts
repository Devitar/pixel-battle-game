import type { BuildingId, BuildingLevel } from '@save/save';

export interface BuildingLevelDef {
  level: BuildingLevel;
  upgradeCost: number;          // gold cost to upgrade FROM the previous level (0 at L1)
  unlockDescription: string;    // shown in / near the Upgrade button
}

export const BUILDING_LEVELS: Record<BuildingId, readonly BuildingLevelDef[]> = {
  tavern: [
    { level: 1, upgradeCost: 0,   unlockDescription: '3 candidates per visit' },
    { level: 2, upgradeCost: 200, unlockDescription: '4 candidates per visit' },
    { level: 3, upgradeCost: 500, unlockDescription: '5 candidates per visit' },
  ],
  barracks: [
    { level: 1, upgradeCost: 0,   unlockDescription: '12 hero slots' },
    { level: 2, upgradeCost: 200, unlockDescription: '16 hero slots' },
    { level: 3, upgradeCost: 500, unlockDescription: '20 hero slots' },
  ],
  blacksmith: [
    { level: 1, upgradeCost: 0,   unlockDescription: 'Common → Uncommon' },
    { level: 2, upgradeCost: 200, unlockDescription: 'Common → Rare' },
    { level: 3, upgradeCost: 500, unlockDescription: 'Common → Epic' },
  ],
  hospital: [
    { level: 1, upgradeCost: 0,   unlockDescription: '1 treatment per run' },
    { level: 2, upgradeCost: 200, unlockDescription: '2 treatments per run' },
    { level: 3, upgradeCost: 500, unlockDescription: '3 treatments per run · 2× time-heal' },
  ],
  chapel: [
    { level: 1, upgradeCost: 0, unlockDescription: 'Add or replace traits on heroes' },
  ],
  training_grounds: [
    { level: 1, upgradeCost: 0,   unlockDescription: '2 trainee slots · 25% XP' },
    { level: 2, upgradeCost: 200, unlockDescription: '3 trainee slots · 40% XP' },
    { level: 3, upgradeCost: 500, unlockDescription: '4 trainee slots · 55% XP' },
  ],
};

// Aligned with createRoster's DEFAULT_ROSTER_CAPACITY = 12 (BARRACKS_CAPACITY[1]).
// If either changes, align the other.
export const BARRACKS_CAPACITY: Record<BuildingLevel, number> = {
  1: 12,
  2: 16,
  3: 20,
};

export function nextLevel(building: BuildingId, current: BuildingLevel): BuildingLevelDef | null {
  const tiers = BUILDING_LEVELS[building];
  return tiers.find((t) => t.level === current + 1) ?? null;
}

export function tavernCandidateCount(level: BuildingLevel): number {
  return [3, 4, 5][level - 1];
}

export function hospitalTreatmentCap(level: BuildingLevel): number {
  return [1, 2, 3][level - 1];
}

export function hospitalTickAmount(level: BuildingLevel): number {
  return level === 3 ? 2 : 1;
}

export const TRAINEE_SLOT_CAPACITY: Record<BuildingLevel, number> = { 1: 2, 2: 3, 3: 4 };
export const TRAINEE_PRO_RATE: Record<BuildingLevel, number>     = { 1: 0.25, 2: 0.40, 3: 0.55 };
