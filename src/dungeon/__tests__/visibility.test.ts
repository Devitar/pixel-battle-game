import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { generateFloor } from '../floor';
import type { Node } from '../node';
import { computeVisibility, LOOKAHEAD_ROWS } from '../visibility';

function startNodeId(nodes: readonly Node[]): string {
  const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
  return nodes.find((n) => !referenced.has(n.id))!.id;
}

function bossNodeId(nodes: readonly Node[]): string {
  return nodes.find((n) => n.type === 'boss')!.id;
}

function rowOf(nodes: readonly Node[], targetId: string): number {
  const start = startNodeId(nodes);
  if (targetId === start) return 0;
  const depth = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id)!;
    const d = depth.get(id)!;
    for (const nextId of node.nextNodeIds) {
      if (!depth.has(nextId)) {
        depth.set(nextId, d + 1);
        queue.push(nextId);
      }
    }
  }
  return depth.get(targetId)!;
}

describe('computeVisibility', () => {
  it('LOOKAHEAD_ROWS is 2 (per locked Q2 design)', () => {
    expect(LOOKAHEAD_ROWS).toBe(2);
  });

  it('revealed = traversedNodeIds (the cartographer log)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const startNode = nodes.find((n) => n.id === start)!;
    const second = startNode.nextNodeIds[0];
    const traversed = [start, second];
    const result = computeVisibility(nodes, second, traversed, LOOKAHEAD_ROWS);
    expect(result.revealed).toEqual(new Set(traversed));
  });

  it('at row 0: visible = nodes in rows 0, 1, 2; row 3+ fogged', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    for (const node of nodes) {
      const r = rowOf(nodes, node.id);
      const isVisible = result.visible.has(node.id);
      if (r >= 0 && r <= LOOKAHEAD_ROWS) {
        expect(isVisible, `node ${node.id} at row ${r} should be visible`).toBe(true);
      } else {
        expect(isVisible, `node ${node.id} at row ${r} should be fogged`).toBe(false);
      }
    }
  });

  it('boss is fogged at run start (row 0; floor 1 has 8 rows; boss at row 7)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const boss = bossNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    expect(result.visible.has(boss)).toBe(false);
    expect(result.revealed.has(boss)).toBe(false);
  });

  it('boss becomes visible when current row is within LOOKAHEAD_ROWS of it', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const boss = bossNodeId(nodes);
    const bossRow = rowOf(nodes, boss); // 7 for floor 1
    const visibilityRow = bossRow - LOOKAHEAD_ROWS;
    const candidate = nodes.find((n) => rowOf(nodes, n.id) === visibilityRow)!;
    const result = computeVisibility(nodes, candidate.id, [candidate.id], LOOKAHEAD_ROWS);
    expect(result.visible.has(boss), `boss at row ${bossRow} should be visible from row ${visibilityRow}`).toBe(true);
  });

  it('past nodes (in traversedNodeIds) are revealed even if outside the lookahead window', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const r1 = nodes.find((n) => rowOf(nodes, n.id) === 1)!.id;
    const r2 = nodes.find((n) => rowOf(nodes, n.id) === 2)!.id;
    const r3 = nodes.find((n) => rowOf(nodes, n.id) === 3)!.id;
    const traversed = [start, r1, r2, r3];
    const result = computeVisibility(nodes, r3, traversed, LOOKAHEAD_ROWS);
    expect(result.revealed.has(start)).toBe(true);
  });

  it('untaken branch at a past fork becomes a ghost (drawn but dimmed, not revealed)', () => {
    // Synthetic 5-row DAG with a fork at row 1: r1a taken, r1b not. Player
    // advances to row 4. r1b is in a past row (row 1 < currentRow 4) and was
    // never on the cartographer log → ghost. Drawn dimmed so the player can
    // still see the branch they passed up.
    const nodes: Node[] = [
      { id: 'r0',  type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r1a', 'r1b'], slot: 1 },
      { id: 'r1a', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r2'],         slot: 0 },
      { id: 'r1b', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r2'],         slot: 2 },
      { id: 'r2',  type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r3'],         slot: 1 },
      { id: 'r3',  type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r4'],         slot: 1 },
      { id: 'r4',  type: 'boss',   encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: [],             slot: 1 },
    ];
    const traversed = ['r0', 'r1a', 'r2', 'r3', 'r4'];
    const result = computeVisibility(nodes, 'r4', traversed, LOOKAHEAD_ROWS);
    expect(result.revealed.has('r1b')).toBe(false);
    expect(result.visible.has('r1b')).toBe(false);
    expect(result.ghost.has('r1b')).toBe(true);
  });

  it('ghost set is empty at run start (no past rows yet)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    expect(result.ghost.size).toBe(0);
  });

  it('future-row nodes (beyond lookahead) are fogged, not ghosted', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const boss = bossNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    // Boss at row 7, currentRow 0, lookahead 2. Boss is future → fogged, not ghost.
    expect(result.ghost.has(boss)).toBe(false);
    expect(result.visible.has(boss)).toBe(false);
    expect(result.revealed.has(boss)).toBe(false);
  });

  it('isEdgeGhost: true when either endpoint is a ghost', () => {
    const nodes: Node[] = [
      { id: 'r0',  type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r1a', 'r1b'], slot: 1 },
      { id: 'r1a', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r2'],         slot: 0 },
      { id: 'r1b', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r2'],         slot: 2 },
      { id: 'r2',  type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r3'],         slot: 1 },
      { id: 'r3',  type: 'boss',   encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: [],             slot: 1 },
    ];
    const traversed = ['r0', 'r1a', 'r2', 'r3'];
    const result = computeVisibility(nodes, 'r3', traversed, LOOKAHEAD_ROWS);
    // r0 → r1b: r0 revealed, r1b ghost → ghost edge.
    expect(result.isEdgeVisible('r0', 'r1b')).toBe(true);
    expect(result.isEdgeGhost('r0', 'r1b')).toBe(true);
    // r1b → r2: r1b ghost, r2 revealed → ghost edge.
    expect(result.isEdgeVisible('r1b', 'r2')).toBe(true);
    expect(result.isEdgeGhost('r1b', 'r2')).toBe(true);
    // r0 → r1a: both revealed → not a ghost edge.
    expect(result.isEdgeVisible('r0', 'r1a')).toBe(true);
    expect(result.isEdgeGhost('r0', 'r1a')).toBe(false);
  });

  it('isEdgeVisible: true when both endpoints are revealed-or-visible', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    const startNode = nodes.find((n) => n.id === start)!;
    const successor = startNode.nextNodeIds[0];
    expect(result.isEdgeVisible(start, successor)).toBe(true);
  });

  it('isEdgeVisible: false when target is fogged (out of lookahead)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    const r2Node = nodes.find((n) => rowOf(nodes, n.id) === 2);
    if (r2Node) {
      const r3Successor = r2Node.nextNodeIds.find((id) => rowOf(nodes, id) === 3);
      if (r3Successor !== undefined) {
        expect(result.isEdgeVisible(r2Node.id, r3Successor)).toBe(false);
      }
    }
  });

  it('empty nodes array yields empty sets and a no-op edge predicate', () => {
    const result = computeVisibility([], '', [], LOOKAHEAD_ROWS);
    expect(result.revealed.size).toBe(0);
    expect(result.visible.size).toBe(0);
    expect(result.ghost.size).toBe(0);
    expect(result.isEdgeVisible('a', 'b')).toBe(false);
    expect(result.isEdgeGhost('a', 'b')).toBe(false);
  });

  it('is deterministic for the same input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(7));
    const start = startNodeId(nodes);
    const a = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    const b = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    expect([...a.revealed].sort()).toEqual([...b.revealed].sort());
    expect([...a.visible].sort()).toEqual([...b.visible].sort());
  });

  it('lookahead=0 → only the current row is visible', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], 0);
    for (const node of nodes) {
      const r = rowOf(nodes, node.id);
      if (r === 0) {
        expect(result.visible.has(node.id)).toBe(true);
      } else {
        expect(result.visible.has(node.id)).toBe(false);
      }
    }
  });
});
