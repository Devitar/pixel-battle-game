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
    { level: 1, upgradeCost: 0, unlockDescription: 'Common → Uncommon' },
    // L2 / L3 added when 29b lands.
  ],
  hospital: [
    { level: 1, upgradeCost: 0, unlockDescription: 'Treat one wound at a time' },
    // L2 / L3 added when 29c lands.
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
