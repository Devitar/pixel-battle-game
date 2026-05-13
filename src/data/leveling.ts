import { CLASSES } from './classes';
import { PERKS } from './perks';
import type { Hero } from '@heroes/hero';
import type { PerkTier } from './types';
import type { Stats } from '@combat/types';

export const MAX_LEVEL = 10;

// Cumulative XP required to reach each level. Index = level - 1.
export const LEVEL_THRESHOLDS: readonly number[] = [
  0,      // level 1
  200,    // level 2
  800,    // level 3
  2000,   // level 4
  4000,   // level 5
  6000,   // level 6
  9000,   // level 7
  12500,  // level 8
  16000,  // level 9
  20000,  // level 10
];

export function xpForCombatNode(floor: number): number {
  return 5 * floor;
}

export function xpForEliteNode(floor: number): number {
  return 10 * floor;
}

export function xpForBossNode(floor: number): number {
  return 30 * floor;
}

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}

export function applyLevelUps(hero: Hero, prevLevel: number, newLevel: number): Hero {
  if (newLevel <= prevLevel) return hero;
  const def = CLASSES[hero.classId];
  const levels = newLevel - prevLevel;
  const hpBump = 2 * levels;
  const primaryBump = (def.primaryStat === 'crit' ? 2 : 1) * levels;
  const newBaseStats: Stats = { ...hero.baseStats };
  newBaseStats[def.primaryStat] = newBaseStats[def.primaryStat] + primaryBump;

  // Tier crossings — push 'l5' and 'l10' to pendingPerks when boundary crossed,
  // guarded by hasPicked to avoid re-pushing tiers already chosen.
  const hasPicked = (tier: PerkTier) =>
    hero.pickedPerks.some((id) => PERKS[id].tier === tier);

  const nextPending: PerkTier[] = [...hero.pendingPerks];
  if (prevLevel < 5 && newLevel >= 5 && !nextPending.includes('l5') && !hasPicked('l5')) {
    nextPending.push('l5');
  }
  if (prevLevel < 10 && newLevel >= 10 && !nextPending.includes('l10') && !hasPicked('l10')) {
    nextPending.push('l10');
  }

  return {
    ...hero,
    baseStats: newBaseStats,
    maxHp: hero.maxHp + hpBump,
    currentHp: hero.currentHp + hpBump,
    level: newLevel,
    pendingPerks: nextPending,
  };
}
