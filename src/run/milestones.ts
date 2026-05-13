import { DUNGEONS } from '@data/dungeons';
import type { DungeonId, MilestoneId, Unlocks } from '@data/types';
import type { Hero } from '@heroes/hero';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

/**
 * Spec 2 introduced 'first_crypt_clear' (Sunken Keep dungeon unlock).
 * Spec 3 (Paladin) extended the handler to also unlock the Paladin class.
 * Spec (Legendary) added 'first_hero_l10' — flips unlocks.legendaryEnabled
 * the first time any hero reaches L10. Detection lives in detectXpMilestones
 * (called from the two XP-grant sites in run_state).
 *
 * Handlers are responsible for their own idempotency.
 */
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {
  first_crypt_clear: (state) => {
    let next = state;
    if (!next.unlocks.dungeons.includes('sunken_keep')) {
      next = {
        ...next,
        unlocks: { ...next.unlocks, dungeons: [...next.unlocks.dungeons, 'sunken_keep'] },
      };
    }
    if (!next.unlocks.classes.includes('paladin')) {
      next = {
        ...next,
        unlocks: { ...next.unlocks, classes: [...next.unlocks.classes, 'paladin'] },
      };
    }
    return next;  // identity preserved when both branches no-op
  },
  first_sunken_keep_clear: (state) => {
    let next = state;
    if (!next.unlocks.classes.includes('hunter')) {
      next = {
        ...next,
        unlocks: { ...next.unlocks, classes: [...next.unlocks.classes, 'hunter'] },
      };
    }
    if (!next.unlocks.buildings.includes('chapel')) {
      next = {
        ...next,
        unlocks: { ...next.unlocks, buildings: [...next.unlocks.buildings, 'chapel'] },
      };
    }
    if (!next.unlocks.buildings.includes('training_grounds')) {
      next = {
        ...next,
        unlocks: { ...next.unlocks, buildings: [...next.unlocks.buildings, 'training_grounds'] },
      };
    }
    return next;  // identity preserved when all branches no-op
  },
  first_hero_l10: (state) => {
    if (state.unlocks.legendaryEnabled) return state;
    return {
      ...state,
      unlocks: { ...state.unlocks, legendaryEnabled: true },
    };
  },
};

/**
 * Returns the milestone ids triggered by this boss defeat.
 * Called from completeCombat when:
 *   - the defeated encounter's kind is 'boss'
 *   - AND floorNumber === DUNGEONS[dungeonId].floorsPerRun (canonical final boss only)
 */
export function detectBossMilestones(
  dungeonId: DungeonId,
  floorNumber: number,
): readonly MilestoneId[] {
  if (dungeonId === 'crypt' && floorNumber === DUNGEONS.crypt.floorsPerRun) {
    return ['first_crypt_clear'];
  }
  if (dungeonId === 'sunken_keep' && floorNumber === DUNGEONS.sunken_keep.floorsPerRun) {
    return ['first_sunken_keep_clear'];
  }
  return [];
}

/**
 * Returns ['first_hero_l10'] when any hero crossed level 10 (from < 10 to >= 10)
 * in this XP-grant, and the milestone hasn't already fired. Otherwise [].
 *
 * The before/after arrays must be parallel (same hero ids at same indices) —
 * the two XP-grant sites in run_state (completeCombat + completeSurpriseCombat)
 * build `partyAfterXp` by mapping over `updatedPartyLiving` 1:1, so this
 * invariant holds there.
 */
export function detectXpMilestones(
  partyBefore: readonly Hero[],
  partyAfter: readonly Hero[],
  unlocks: Unlocks,
): readonly MilestoneId[] {
  if (unlocks.legendaryEnabled) return [];
  const crossed = partyAfter.some((hAfter, i) => {
    const hBefore = partyBefore[i];
    return hBefore !== undefined && hAfter.level >= 10 && hBefore.level < 10;
  });
  return crossed ? ['first_hero_l10'] : [];
}

/**
 * Drains pendingMilestones into SaveFile by running each registered handler.
 */
export function applyPendingMilestones(
  state: SaveFile,
  ids: readonly MilestoneId[],
): SaveFile {
  let next = state;
  for (const id of ids) {
    const handler = MILESTONES[id];
    if (handler) next = handler(next);
  }
  return next;
}
