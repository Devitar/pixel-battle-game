import type { DungeonId, MilestoneId } from '@data/types';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

/**
 * Spec 1 ships an empty registry. Spec 2 adds 'first_crypt_clear' here
 * alongside the DUNGEONS['sunken_keep'] entry.
 *
 * The cast is needed because TypeScript can't directly construct
 * Record<never, MilestoneHandler> from {}; this is purely a type-level
 * accommodation and has no runtime effect.
 */
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {} as Record<MilestoneId, MilestoneHandler>;

/**
 * Returns the milestone ids triggered by this boss defeat.
 * Called from completeCombat when the defeated encounter's kind is 'boss'
 * AND floorNumber === DUNGEONS[dungeonId].floorsPerRun (canonical final boss only).
 *
 * Handlers are responsible for their own idempotency — e.g., the future
 * 'first_crypt_clear' handler will check if 'sunken_keep' is already in
 * unlocks.dungeons before adding it.
 */
export function detectBossMilestones(
  _dungeonId: DungeonId,
  _floorNumber: number,
): readonly MilestoneId[] {
  return [];  // empty in spec 1; spec 2 fills in the body
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
    const handler = (MILESTONES as Record<string, MilestoneHandler | undefined>)[id as string];
    if (handler) next = handler(next);
  }
  return next;
}
