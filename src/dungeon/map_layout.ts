import type { Node } from './node';

export interface MapLayoutPosition {
  readonly x: number;
  readonly y: number;
}

export interface MapLayoutEdge {
  readonly fromId: string;
  readonly toId: string;
}

export interface MapLayout {
  readonly positions: ReadonlyMap<string, MapLayoutPosition>;
  readonly edges: readonly MapLayoutEdge[];
  readonly rowCount: number;
}

export interface MapLayoutOptions {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function computeMapLayout(
  nodes: readonly Node[],
  options: MapLayoutOptions,
): MapLayout {
  if (nodes.length === 0) {
    return { positions: new Map(), edges: [], rowCount: 0 };
  }

  const referenced = new Set<string>(nodes.flatMap((n) => [...n.nextNodeIds]));
  const start = nodes.find((n) => !referenced.has(n.id));
  if (!start) {
    return { positions: new Map(), edges: [], rowCount: 0 };
  }

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

  const rowCount = Math.max(...depth.values()) + 1;

  const byRow = new Map<number, string[]>();
  for (const [id, d] of depth) {
    const arr = byRow.get(d);
    if (arr) arr.push(id);
    else byRow.set(d, [id]);
  }
  for (const arr of byRow.values()) arr.sort();

  const positions = new Map<string, MapLayoutPosition>();
  const colSpacing = rowCount > 1 ? options.width / (rowCount - 1) : 0;
  // Slot-based y positioning (3-slot grid: slot 0 = top-third, slot 1 = mid,
  // slot 2 = bottom-third). When a node has no `slot` field (legacy save data
  // from before Phase 2b), fall back to even distribution by within-row index
  // (Phase 1 behavior).
  const slotById = new Map<string, 0 | 1 | 2 | undefined>();
  for (const node of nodes) {
    slotById.set(node.id, (node as { slot?: 0 | 1 | 2 }).slot);
  }
  const ySlotBased = (slot: 0 | 1 | 2): number =>
    options.top + (options.height * (slot + 1)) / 4;
  const yEvenFallback = (rowIndex: number, rowSize: number): number =>
    options.top + (options.height * (rowIndex + 1)) / (rowSize + 1);

  for (const [d, ids] of byRow) {
    const x = options.left + d * colSpacing;
    const n = ids.length;
    for (let i = 0; i < n; i++) {
      const slot = slotById.get(ids[i]);
      const y = slot !== undefined ? ySlotBased(slot) : yEvenFallback(i, n);
      positions.set(ids[i], { x, y });
    }
  }

  const edges: MapLayoutEdge[] = [];
  for (const node of nodes) {
    for (const nextId of node.nextNodeIds) {
      edges.push({ fromId: node.id, toId: nextId });
    }
  }

  return { positions, edges, rowCount };
}
