import type { Node } from './node';

export const LOOKAHEAD_ROWS = 2;

export interface VisibilityResult {
  /** Nodes the party has actually walked through (cartographer log). */
  readonly revealed: ReadonlySet<string>;
  /** Nodes within `lookahead` rows of the current row, including the current row. */
  readonly visible: ReadonlySet<string>;
  /** "Road not taken" — nodes in past rows that the party did NOT walk through.
   *  Drawn at low opacity so the player can see which fork branches they
   *  passed up without losing the contrast of the path they actually took. */
  readonly ghost: ReadonlySet<string>;
  /** Whether the edge from `fromId` to `toId` should be drawn at all. True iff
   *  both endpoints are in (revealed ∪ visible ∪ ghost). */
  isEdgeVisible(fromId: string, toId: string): boolean;
  /** Whether the edge should render at low opacity. True iff at least one
   *  endpoint is a ghost. Only meaningful when `isEdgeVisible` is also true. */
  isEdgeGhost(fromId: string, toId: string): boolean;
}

/**
 * Compute fog-of-war state for the current floor. The render loop uses this to
 * decide which node containers to show and which edges to draw.
 *
 * Per the locked Q2 design (TODO #30 Phase 3) plus the road-not-taken refinement:
 * - `revealed` = the cartographer log (`traversedNodeIds`). These nodes stay
 *   shown even when the party has moved past them.
 * - `visible` = the current row plus the next `lookahead` rows. The boss is
 *   "discovered" when within `lookahead` rows.
 * - `ghost` = nodes in past rows the party did NOT walk through. Drawn but
 *   dimmed — preserves the cartographer-log story (you can see which forks you
 *   passed up) without flattening the contrast of the chosen path.
 * - Beyond `currentRow + lookahead` is fog: no node, no edge.
 */
export function computeVisibility(
  nodes: readonly Node[],
  currentNodeId: string,
  traversedNodeIds: readonly string[],
  lookahead: number,
): VisibilityResult {
  if (nodes.length === 0) {
    return {
      revealed: new Set(),
      visible: new Set(),
      ghost: new Set(),
      isEdgeVisible: () => false,
      isEdgeGhost: () => false,
    };
  }

  const revealed = new Set(traversedNodeIds);

  const referenced = new Set<string>(nodes.flatMap((n) => [...n.nextNodeIds]));
  const start = nodes.find((n) => !referenced.has(n.id));
  if (!start) {
    return {
      revealed,
      visible: new Set(),
      ghost: new Set(),
      isEdgeVisible: () => false,
      isEdgeGhost: () => false,
    };
  }

  // BFS depth assignment (matches map_layout's row computation).
  const depth = new Map<string, number>();
  depth.set(start.id, 0);
  const queue: string[] = [start.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    const d = depth.get(id)!;
    for (const nextId of node.nextNodeIds) {
      if (!depth.has(nextId)) {
        depth.set(nextId, d + 1);
        queue.push(nextId);
      }
    }
  }

  const currentRow = depth.get(currentNodeId);
  const visible = new Set<string>();
  const ghost = new Set<string>();
  if (currentRow !== undefined) {
    for (const [id, d] of depth) {
      if (d >= currentRow && d <= currentRow + lookahead) {
        visible.add(id);
      } else if (d < currentRow && !revealed.has(id)) {
        ghost.add(id);
      }
    }
  }

  const isEdgeVisible = (fromId: string, toId: string): boolean => {
    const fromOk = revealed.has(fromId) || visible.has(fromId) || ghost.has(fromId);
    const toOk = revealed.has(toId) || visible.has(toId) || ghost.has(toId);
    return fromOk && toOk;
  };

  const isEdgeGhost = (fromId: string, toId: string): boolean => {
    return ghost.has(fromId) || ghost.has(toId);
  };

  return { revealed, visible, ghost, isEdgeVisible, isEdgeGhost };
}
