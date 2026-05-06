import { describe, expect, it } from 'vitest';
import { CRYPT_BOSS, CRYPT_POOL } from '@data/enemies';
import { DUNGEONS } from '@data/dungeons';
import { EVENTS } from '@data/events';
import type { Node } from '@dungeon/node';
import { createRng } from '@util/rng';
import { generateFloor, _internal } from '../floor';
import { floorScale } from '../scaling';

describe('generateFloor — DAG topology', () => {
  it('floor 1 has 8 rows, floor 2 has 9, floor 3 has 10', () => {
    for (const [floor, expectedRows] of [[1, 8], [2, 9], [3, 10]] as const) {
      const { nodes } = generateFloor('crypt', floor, createRng(1));
      const rowCount = depthOf(nodes, terminalId(nodes)) + 1;
      expect(rowCount).toBe(expectedRows);
    }
  });

  it('row 0 is a single combat node (the start)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(seed));
      const start = nodes.find((n) => n.id === startNodeId)!;
      expect(start.type).toBe('combat');
      const rowOfStart = nodesInRow(nodes, 0);
      expect(rowOfStart).toHaveLength(1);
    }
  });

  it('last row is a single boss node (the terminal)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const terminals = nodes.filter((n) => n.nextNodeIds.length === 0);
      expect(terminals).toHaveLength(1);
      expect(terminals[0].type).toBe('boss');
    }
  });

  it('middle row sizes are between 1 and 3', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const totalRows = depthOf(nodes, terminalId(nodes)) + 1;
      for (let r = 1; r < totalRows - 1; r++) {
        const rowSize = nodesInRow(nodes, r).length;
        expect(rowSize).toBeGreaterThanOrEqual(1);
        expect(rowSize).toBeLessThanOrEqual(3);
      }
    }
  });

  it('every node id is unique within a floor', () => {
    const { nodes } = generateFloor('crypt', 2, createRng(7));
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every non-start node has ≥1 incoming edge', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(seed));
      const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
      for (const node of nodes) {
        if (node.id === startNodeId) continue;
        expect(referenced.has(node.id), `seed ${seed} node ${node.id} (${node.type}) is unreachable`).toBe(true);
      }
    }
  });

  it('every non-boss node has ≥1 outgoing edge', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      for (const node of nodes) {
        if (node.type === 'boss') continue;
        expect(node.nextNodeIds.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every edge connects row r to row r+1 (no skip-level edges)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      for (const node of nodes) {
        const fromRow = depthOf(nodes, node.id);
        for (const toId of node.nextNodeIds) {
          const toRow = depthOf(nodes, toId);
          expect(toRow).toBe(fromRow + 1);
        }
      }
    }
  });

  it('every edge respects slot ±1 (no-cross by construction)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const byId = new Map(nodes.map((n) => [n.id, n]));
      for (const node of nodes) {
        for (const toId of node.nextNodeIds) {
          const target = byId.get(toId)!;
          const slotDelta = Math.abs((target as { slot: number }).slot - (node as { slot: number }).slot);
          expect(slotDelta).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('determinism: same seed → identical floor', () => {
    for (const seed of [1, 7, 42, 123]) {
      const a = generateFloor('crypt', 1, createRng(seed));
      const b = generateFloor('crypt', 1, createRng(seed));
      expect(a).toEqual(b);
    }
  });

  it('every path from start to terminal has length === rowCount', () => {
    const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(1));
    const totalRows = depthOf(nodes, terminalId(nodes)) + 1;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const allPathLengths = new Set<number>();
    function walk(id: string, len: number): void {
      const node = byId.get(id)!;
      if (node.nextNodeIds.length === 0) {
        allPathLengths.add(len);
        return;
      }
      for (const nextId of node.nextNodeIds) walk(nextId, len + 1);
    }
    walk(startNodeId, 1);
    expect(allPathLengths).toEqual(new Set([totalRows]));
  });
});

describe('generateFloor — type distribution', () => {
  it('exactly 1 shop, 1 camp per floor', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      expect(nodes.filter((n) => n.type === 'shop')).toHaveLength(1);
      expect(nodes.filter((n) => n.type === 'camp')).toHaveLength(1);
    }
  });

  it('1-2 treasure nodes per floor', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const count = nodes.filter((n) => n.type === 'treasure').length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('1-2 event nodes per floor', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const count = nodes.filter((n) => n.type === 'event').length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('1-2 elite nodes per floor', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const count = nodes.filter((n) => n.type === 'elite').length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('exactly 1 boss per floor (the terminal)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const bosses = nodes.filter((n) => n.type === 'boss');
      expect(bosses).toHaveLength(1);
      expect(bosses[0].nextNodeIds).toHaveLength(0);
    }
  });

  it('combat is 30-65% of total nodes (loose bounds; spec target ≈ 50%)', () => {
    let total = 0;
    let combat = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      total += nodes.length;
      combat += nodes.filter((n) => n.type === 'combat').length;
    }
    const pct = combat / total;
    expect(pct).toBeGreaterThanOrEqual(0.30);
    expect(pct).toBeLessThanOrEqual(0.65);
  });

  it('row 0 is always combat type', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(seed));
      const start = nodes.find((n) => n.id === startNodeId)!;
      expect(start.type).toBe('combat');
    }
  });
});

describe('generateFloor — placement constraints', () => {
  it('no two same-type nodes adjacent within a row (slot-sorted)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const totalRows = depthOf(nodes, terminalId(nodes)) + 1;
      for (let r = 0; r < totalRows; r++) {
        const inRow = nodesInRow(nodes, r).slice().sort(
          (a, b) => (a as { slot: number }).slot - (b as { slot: number }).slot,
        );
        for (let i = 0; i < inRow.length - 1; i++) {
          expect(inRow[i].type).not.toBe(inRow[i + 1].type);
        }
      }
    }
  });

  it('no special type repeats back-to-back along any source-to-terminal path', () => {
    const SPECIALS = new Set(['shop', 'camp', 'treasure', 'event', 'elite']);
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(seed));
      const byId = new Map(nodes.map((n) => [n.id, n]));
      function walkPath(id: string, prev: string | undefined): void {
        const node = byId.get(id)!;
        if (prev !== undefined) {
          const prevType = byId.get(prev)!.type;
          if (SPECIALS.has(node.type) && prevType === node.type) {
            throw new Error(`back-to-back ${node.type}: ${prev} -> ${id} (seed ${seed})`);
          }
        }
        for (const nextId of node.nextNodeIds) walkPath(nextId, id);
      }
      walkPath(startNodeId, undefined);
    }
  });

  it('combat back-to-back along path is allowed (observed across 200 seeds)', () => {
    let sawCombatBackToBack = false;
    for (let seed = 1; seed <= 200 && !sawCombatBackToBack; seed++) {
      const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(seed));
      const byId = new Map(nodes.map((n) => [n.id, n]));
      function walkPath(id: string, prev: string | undefined): void {
        if (sawCombatBackToBack) return;
        const node = byId.get(id)!;
        if (prev !== undefined) {
          const prevType = byId.get(prev)!.type;
          if (node.type === 'combat' && prevType === 'combat') {
            sawCombatBackToBack = true;
            return;
          }
        }
        for (const nextId of node.nextNodeIds) walkPath(nextId, id);
      }
      walkPath(startNodeId, undefined);
    }
    expect(sawCombatBackToBack).toBe(true);
  });

  it('penultimate row contains ≥1 camp or treasure', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const totalRows = depthOf(nodes, terminalId(nodes)) + 1;
      const penult = nodesInRow(nodes, totalRows - 2);
      const hasRest = penult.some((n) => n.type === 'camp' || n.type === 'treasure');
      expect(hasRest, `seed ${seed} penult row has no camp/treasure`).toBe(true);
    }
  });

  it('no edge crossings (slot-ordering preserved between rows)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const totalRows = depthOf(nodes, terminalId(nodes)) + 1;
      for (let r = 0; r < totalRows - 1; r++) {
        const fromRowSorted = nodesInRow(nodes, r).slice().sort(
          (a, b) => (a as { slot: number }).slot - (b as { slot: number }).slot,
        );
        for (let i = 0; i < fromRowSorted.length; i++) {
          for (let j = i + 1; j < fromRowSorted.length; j++) {
            const a = fromRowSorted[i];
            const c = fromRowSorted[j];
            for (const bId of a.nextNodeIds) {
              for (const dId of c.nextNodeIds) {
                const b = byId.get(bId)!;
                const d = byId.get(dId)!;
                const bSlot = (b as { slot: number }).slot;
                const dSlot = (d as { slot: number }).slot;
                expect(bSlot).toBeLessThanOrEqual(dSlot);
              }
            }
          }
        }
      }
    }
  });
});

describe('generateFloor — encounter composition', () => {
  it('every combat / elite / boss node has an encounter', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    for (const node of nodes) {
      if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
        expect(node.encounter).toBeDefined();
        expect(node.encounter.enemies.length).toBeGreaterThan(0);
      }
    }
  });

  it('shop nodes have 4 inventory items', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const shop = nodes.find((n) => n.type === 'shop')!;
    expect((shop as { inventory: readonly unknown[] }).inventory).toHaveLength(4);
  });

  it('event nodes carry a valid cardId from the EVENTS table', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      for (const node of nodes) {
        if (node.type !== 'event') continue;
        expect(EVENTS[node.cardId]).toBeDefined();
      }
    }
  });

  it('boss encounter contains the Crypt boss at slot 3', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const boss = nodes.find((n) => n.type === 'boss')!;
    if (boss.type !== 'boss') throw new Error('expected boss type narrowing');
    const bossPlacement = boss.encounter.enemies.find((p) => p.enemyId === CRYPT_BOSS);
    expect(bossPlacement).toBeDefined();
    expect(bossPlacement?.slot).toBe(3);
  });

  it('per-floor scale propagates to combat encounters', () => {
    for (const floorNumber of [1, 2, 3]) {
      const expected = floorScale(floorNumber);
      const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
      for (const node of nodes) {
        if (node.type !== 'combat') continue;
        expect(node.encounter.scale).toEqual(expected);
      }
    }
  });

  it('every combat-bearing encounter uses pool enemies only', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    for (const node of nodes) {
      if (node.type !== 'combat' && node.type !== 'elite') continue;
      for (const placement of node.encounter.enemies) {
        expect(CRYPT_POOL).toContain(placement.enemyId);
      }
    }
  });

  it('floor 1: combat encounters carry no modifierIds', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    for (const node of nodes) {
      if (node.type !== 'combat') continue;
      for (const placement of node.encounter.enemies) {
        expect(placement.modifierIds).toBeUndefined();
      }
    }
  });

  it('floor 5: every combat-encounter enemy has exactly one modifierIds entry from [armored]', () => {
    const { nodes } = generateFloor('crypt', 5, createRng(1));
    for (const node of nodes) {
      if (node.type !== 'combat') continue;
      for (const placement of node.encounter.enemies) {
        expect(placement.modifierIds).toHaveLength(1);
        expect(placement.modifierIds![0]).toBe('armored');
      }
    }
  });
});

// ---- Helper-function tests (Task 1 of Phase 2b). ----

describe('floor.ts helpers (_internal)', () => {
  describe('rollRowSize', () => {
    it('returns 1 / 2 / 3 with rough 20/50/30 weights over 1000 rolls', () => {
      const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
      for (let seed = 1; seed <= 1000; seed++) {
        const v = _internal.rollRowSize(createRng(seed));
        counts[v] += 1;
      }
      expect(counts[1]).toBeGreaterThan(120);
      expect(counts[1]).toBeLessThan(280);
      expect(counts[2]).toBeGreaterThan(400);
      expect(counts[2]).toBeLessThan(600);
      expect(counts[3]).toBeGreaterThan(220);
      expect(counts[3]).toBeLessThan(380);
    });
  });

  describe('pickSlots', () => {
    it('count=1 always returns [1]', () => {
      for (let seed = 1; seed <= 50; seed++) {
        expect(_internal.pickSlots(createRng(seed), 1)).toEqual([1]);
      }
    });

    it('count=3 always returns [0, 1, 2]', () => {
      for (let seed = 1; seed <= 50; seed++) {
        expect(_internal.pickSlots(createRng(seed), 3)).toEqual([0, 1, 2]);
      }
    });

    it('count=2 returns one of three valid pairs', () => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        const slots = _internal.pickSlots(createRng(seed), 2);
        seen.add(slots.join(','));
      }
      expect(seen).toEqual(new Set(['0,1', '0,2', '1,2']));
    });
  });

  describe('pickEdgeCandidates', () => {
    it('returns only slots within ±1 of fromSlot', () => {
      const result = _internal.pickEdgeCandidates(createRng(1), 1, [0, 1, 2]);
      for (const s of result) {
        expect(Math.abs(s - 1)).toBeLessThanOrEqual(1);
      }
    });

    it('clamps to available candidates when desired count exceeds available', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const result = _internal.pickEdgeCandidates(createRng(seed), 0, [1, 2]);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.length).toBeLessThanOrEqual(1);
      }
    });

    it('returns empty when no candidates are in range', () => {
      const result = _internal.pickEdgeCandidates(createRng(1), 0, [2]);
      expect(result).toEqual([]);
    });
  });

  describe('rollQuota', () => {
    it('produces feasible quota when middleNodeCount is sufficient', () => {
      for (let seed = 1; seed <= 100; seed++) {
        const q = _internal.rollQuota(createRng(seed), 1, 12);
        expect(q).not.toBeNull();
        expect(q!.shop).toBe(1);
        expect(q!.camp).toBe(1);
        expect(q!.treasure).toBeGreaterThanOrEqual(1);
        expect(q!.treasure).toBeLessThanOrEqual(2);
        expect(q!.event).toBeGreaterThanOrEqual(1);
        expect(q!.event).toBeLessThanOrEqual(2);
        expect(q!.elite).toBeGreaterThanOrEqual(1);
        expect(q!.elite).toBeLessThanOrEqual(2);
        expect(q!.combat).toBeGreaterThanOrEqual(0);
        const sum = q!.combat + q!.elite + q!.shop + q!.camp + q!.treasure + q!.event;
        expect(sum).toBe(12);
      }
    });

    it('returns null when middleNodeCount is too small', () => {
      const q = _internal.rollQuota(createRng(1), 1, 4);
      expect(q).toBeNull();
    });

    it('elite count biases higher on later floors', () => {
      let elitesFloor1 = 0;
      let elitesFloor3 = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const q1 = _internal.rollQuota(createRng(seed), 1, 12);
        const q3 = _internal.rollQuota(createRng(seed), 3, 12);
        if (q1) elitesFloor1 += q1.elite;
        if (q3) elitesFloor3 += q3.elite;
      }
      expect(elitesFloor3).toBeGreaterThan(elitesFloor1);
    });
  });

  describe('violatesPlacement', () => {
    it('flags same-type left sibling', () => {
      expect(_internal.violatesPlacement('shop', 'shop', undefined, [])).toBe(true);
    });

    it('flags same-type right sibling', () => {
      expect(_internal.violatesPlacement('camp', undefined, 'camp', [])).toBe(true);
    });

    it('does NOT flag when siblings are undefined (not yet placed)', () => {
      expect(_internal.violatesPlacement('shop', undefined, undefined, [])).toBe(false);
    });

    it('does NOT flag combat back-to-back along path', () => {
      expect(_internal.violatesPlacement('combat', undefined, undefined, ['combat'])).toBe(false);
    });

    it('flags special type back-to-back along path', () => {
      expect(_internal.violatesPlacement('shop', undefined, undefined, ['shop'])).toBe(true);
    });

    it('flags elite back-to-back along path', () => {
      expect(_internal.violatesPlacement('elite', undefined, undefined, ['elite'])).toBe(true);
    });

    it('returns false when no constraint is hit', () => {
      expect(_internal.violatesPlacement('shop', 'combat', undefined, ['combat'])).toBe(false);
    });
  });
});

// ---- Helpers used by topology tests ----

function depthOf(nodes: readonly Node[], targetId: string): number {
  const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
  const start = nodes.find((n) => !referenced.has(n.id));
  if (!start) throw new Error('depthOf: no start node');
  const seen = new Set<string>([start.id]);
  let frontier: { id: string; depth: number }[] = [{ id: start.id, depth: 0 }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { id, depth } of frontier) {
      if (id === targetId) return depth;
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;
      for (const nextId of node.nextNodeIds) {
        if (seen.has(nextId)) continue;
        seen.add(nextId);
        next.push({ id: nextId, depth: depth + 1 });
      }
    }
    frontier = next;
  }
  throw new Error(`depthOf: target ${targetId} not reachable`);
}

function terminalId(nodes: readonly Node[]): string {
  const terminal = nodes.find((n) => n.nextNodeIds.length === 0);
  if (!terminal) throw new Error('terminalId: no terminal');
  return terminal.id;
}

function nodesInRow(nodes: readonly Node[], rowIndex: number): readonly Node[] {
  return nodes.filter((n) => depthOf(nodes, n.id) === rowIndex);
}

describe('generateFloor — rowsPerFloor', () => {
  it('default (rowsPerFloor unset) produces 8 + (floor − 1) rows', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(8);
  });

  it('default (rowsPerFloor unset) on floor 3 produces 10 rows', () => {
    const { nodes } = generateFloor('crypt', 3, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(10);
  });

  it('honors rowsPerFloor when set on a dungeon def', () => {
    // Mutate the Crypt def temporarily for the duration of this test.
    const original = DUNGEONS.crypt.rowsPerFloor;
    (DUNGEONS.crypt as any).rowsPerFloor = 10;
    try {
      const { nodes } = generateFloor('crypt', 1, createRng(1));
      const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
      expect(rows).toBe(10);
    } finally {
      (DUNGEONS.crypt as any).rowsPerFloor = original;
    }
  });
});

describe('generateFloor — Sunken Keep', () => {
  it('floor 1 Sunken Keep produces 10 rows', () => {
    const { nodes } = generateFloor('sunken_keep', 1, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(10);
  });

  it('floor 3 Sunken Keep produces 12 rows', () => {
    const { nodes } = generateFloor('sunken_keep', 3, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(12);
  });

  it('Sunken Keep encounters reference Sunken Keep enemies', () => {
    const { nodes } = generateFloor('sunken_keep', 1, createRng(1));
    const combatNodes = nodes.filter(n => n.type === 'combat');
    expect(combatNodes.length).toBeGreaterThan(0);
    for (const node of combatNodes) {
      if (node.type === 'combat') {
        for (const enemy of node.encounter.enemies) {
          expect(['drowned_knight', 'brine_crab', 'drowned_sailor', 'siren']).toContain(enemy.enemyId);
        }
      }
    }
  });

  it('Sunken Keep boss is the Drowned King', () => {
    const { nodes } = generateFloor('sunken_keep', 1, createRng(1));
    const bossNode = nodes.find(n => n.type === 'boss');
    expect(bossNode).toBeDefined();
    if (bossNode && bossNode.type === 'boss') {
      const hasKing = bossNode.encounter.enemies.some(e => e.enemyId === 'drowned_king');
      expect(hasKing).toBe(true);
    }
  });

  it('quota generator succeeds across many seeds (no infeasibility)', () => {
    let failures = 0;
    for (let seed = 1; seed <= 100; seed++) {
      try {
        for (let f = 1; f <= 3; f++) {
          generateFloor('sunken_keep', f, createRng(seed * 1000 + f));
        }
      } catch {
        failures++;
      }
    }
    expect(failures).toBe(0);
  });
});
