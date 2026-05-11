import { DUNGEONS } from '@data/dungeons';
import type { DungeonId, MilestoneId } from '@data/types';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

/**
 * Spec 2 introduced 'first_crypt_clear' (Sunken Keep dungeon unlock).
 * Spec 3 (Paladin) extended the handler to also unlock the Paladin class.
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
    if (state.unlocks.classes.includes('hunter')) return state;
    return {
      ...state,
      unlocks: { ...state.unlocks, classes: [...state.unlocks.classes, 'hunter'] },
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
