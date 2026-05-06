import { DUNGEONS } from '@data/dungeons';
import type { DungeonId, MilestoneId } from '@data/types';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

/**
 * Spec 2 introduces 'first_crypt_clear'. Future class/dungeon specs extend
 * this registry — e.g., the Paladin spec extends the first_crypt_clear handler
 * to also append 'paladin' to state.unlocks.classes.
 *
 * Handlers are responsible for their own idempotency.
 */
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {
  first_crypt_clear: (state) => {
    if (state.unlocks.dungeons.includes('sunken_keep')) return state;
    return {
      ...state,
      unlocks: {
        ...state.unlocks,
        dungeons: [...state.unlocks.dungeons, 'sunken_keep'],
      },
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
