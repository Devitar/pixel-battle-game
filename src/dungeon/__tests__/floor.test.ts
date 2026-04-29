import { describe, expect, it } from 'vitest';
import { CRYPT_BOSS, CRYPT_POOL } from '../../data/enemies';
import { createRng } from '../../util/rng';
import { generateFloor } from '../floor';
import { floorScale } from '../scaling';

describe('generateFloor — Crypt', () => {
  it('is deterministic for the same seed', () => {
    const a = generateFloor('crypt', 1, createRng(42));
    const b = generateFloor('crypt', 1, createRng(42));
    expect(a).toEqual(b);
  });

  it('returns { nodes, startNodeId } shape', () => {
    const result = generateFloor('crypt', 1, createRng(1));
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(typeof result.startNodeId).toBe('string');
    expect(result.startNodeId.length).toBeGreaterThan(0);
  });

  it('floor 1 has 5 nodes: 3 combat + 1 shop + 1 boss (diamond)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    expect(nodes).toHaveLength(5);
    const combatCount = nodes.filter((n) => n.type === 'combat').length;
    const shopCount = nodes.filter((n) => n.type === 'shop').length;
    const bossCount = nodes.filter((n) => n.type === 'boss').length;
    expect(combatCount).toBe(3);
    expect(shopCount).toBe(1);
    expect(bossCount).toBe(1);
  });

  it('startNodeId points to the unique source node', () => {
    const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(1));
    const start = nodes.find((n) => n.id === startNodeId);
    expect(start).toBeDefined();
    expect(start!.nextNodeIds).toHaveLength(1);
    // No other node points to the start.
    const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
    expect(referenced.has(startNodeId)).toBe(false);
  });

  it('fork structure: one branch is combat, one is shop, both converge at boss', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branches = fork.nextNodeIds.map((id) => nodes.find((n) => n.id === id)!);
    const types = branches.map((b) => b.type).sort();
    expect(types).toEqual(['combat', 'shop']);

    // Both branches' nextNodeIds point at the same boss.
    for (const b of branches) {
      expect(b.nextNodeIds).toHaveLength(1);
      const target = nodes.find((n) => n.id === b.nextNodeIds[0])!;
      expect(target.type).toBe('boss');
    }
  });

  it('boss is the unique terminal (nextNodeIds.length === 0)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const terminals = nodes.filter((n) => n.nextNodeIds.length === 0);
    expect(terminals).toHaveLength(1);
    expect(terminals[0].type).toBe('boss');
  });

  it('every non-start node is reachable from some other node', () => {
    const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(1));
    const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
    for (const node of nodes) {
      if (node.id === startNodeId) continue;
      expect(referenced.has(node.id), `node ${node.id} unreachable`).toBe(true);
    }
  });

  it('node ids are unique within a floor', () => {
    const { nodes } = generateFloor('crypt', 3, createRng(1));
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('propagates per-floor scale to every encounter', () => {
    for (const floorNumber of [1, 2, 5, 10]) {
      const expected = floorScale(floorNumber);
      const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
      for (const node of nodes) {
        if (node.type === 'shop') continue;
        expect(node.encounter.scale).toEqual(expected);
      }
    }
  });

  it('every combat encounter uses pool enemies only', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const combatNodes = nodes.filter((n) => n.type === 'combat');
    for (const node of combatNodes) {
      for (const placement of node.encounter.enemies) {
        expect(CRYPT_POOL).toContain(placement.enemyId);
      }
    }
  });

  it('boss encounter contains the Crypt boss at slot 3', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const boss = nodes.find((n) => n.type === 'boss')!;
    const bossPlacement = boss.encounter.enemies.find((p) => p.enemyId === CRYPT_BOSS);
    expect(bossPlacement).toBeDefined();
    expect(bossPlacement?.slot).toBe(3);
  });

  it('different floor numbers produce different node ids', () => {
    const f1 = generateFloor('crypt', 1, createRng(1));
    const f2 = generateFloor('crypt', 2, createRng(1));
    const f1Ids = new Set(f1.nodes.map((n) => n.id));
    const f2Ids = new Set(f2.nodes.map((n) => n.id));
    for (const id of f1Ids) {
      expect(f2Ids.has(id)).toBe(false);
    }
  });

  it('shop branch placement is deterministic per seed', () => {
    const a = generateFloor('crypt', 1, createRng(7));
    const b = generateFloor('crypt', 1, createRng(7));
    const aShop = a.nodes.find((n) => n.type === 'shop')!.id;
    const bShop = b.nodes.find((n) => n.type === 'shop')!.id;
    expect(aShop).toBe(bShop);
  });

  it('shop has 4 inventory items', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const shop = nodes.find((n) => n.type === 'shop')!;
    if (shop.type !== 'shop') throw new Error('expected shop');
    expect(shop.inventory).toHaveLength(4);
  });
});
