import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { generateFloor } from '../floor';
import type { Node } from '../node';
import { computeMapLayout } from '../map_layout';

const VIEWPORT = { left: 100, top: 80, width: 760, height: 360 } as const;

describe('computeMapLayout', () => {
  it('returns a position for every node in the input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    expect(layout.positions.size).toBe(nodes.length);
    for (const node of nodes) {
      expect(layout.positions.has(node.id)).toBe(true);
    }
  });

  it('start node has the smallest x, boss the largest', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
    const start = nodes.find((n) => !referenced.has(n.id))!;
    const boss = nodes.find((n) => n.type === 'boss')!;
    const startX = layout.positions.get(start.id)!.x;
    const bossX = layout.positions.get(boss.id)!.x;
    for (const node of nodes) {
      const x = layout.positions.get(node.id)!.x;
      expect(x).toBeGreaterThanOrEqual(startX);
      expect(x).toBeLessThanOrEqual(bossX);
    }
  });

  it('all edges go strictly left-to-right (Δx > 0)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    for (const edge of layout.edges) {
      const fromX = layout.positions.get(edge.fromId)!.x;
      const toX = layout.positions.get(edge.toId)!.x;
      expect(toX).toBeGreaterThan(fromX);
    }
  });

  it('emits one edge per (node, nextNodeId) pair from the input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    const expectedEdges = nodes.flatMap((n) =>
      n.nextNodeIds.map((toId) => ({ fromId: n.id, toId })),
    );
    expect(layout.edges).toHaveLength(expectedEdges.length);
    for (const expected of expectedEdges) {
      expect(layout.edges).toContainEqual(expected);
    }
  });

  it('two fork-branch nodes at the same depth share x but differ in y', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const [aId, bId] = fork.nextNodeIds;
    const a = layout.positions.get(aId)!;
    const b = layout.positions.get(bId)!;
    expect(a.x).toBe(b.x);
    expect(a.y).not.toBe(b.y);
  });

  it('is deterministic for the same input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(7));
    const a = computeMapLayout(nodes, VIEWPORT);
    const b = computeMapLayout(nodes, VIEWPORT);
    expect(Array.from(a.positions.entries())).toEqual(Array.from(b.positions.entries()));
    expect(a.edges).toEqual(b.edges);
    expect(a.rowCount).toBe(b.rowCount);
  });

  it('empty node array yields an empty layout', () => {
    const layout = computeMapLayout([] as readonly Node[], VIEWPORT);
    expect(layout.positions.size).toBe(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.rowCount).toBe(0);
  });
});
