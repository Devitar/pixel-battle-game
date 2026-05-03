import { describe, expect, it } from 'vitest';
import { CRYPT_BOSS, CRYPT_POOL } from '@data/enemies';
import { EVENTS } from '@data/events';
import { createRng } from '@util/rng';
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

  it('floor 1 has 5 nodes: 2 preamble combat + 2 fork branches + 1 boss', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    expect(nodes).toHaveLength(5);
    const bossCount = nodes.filter((n) => n.type === 'boss').length;
    expect(bossCount).toBe(1);
    // The other 4 nodes are 2 preamble combats + 2 fork branches whose types
    // depend on the rolled fork shape. Per-shape coverage in the dedicated
    // tests below.
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

  it('fork has exactly 2 branches, both pointing at the unique boss', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    expect(fork.nextNodeIds).toHaveLength(2);
    const branches = fork.nextNodeIds.map((id) => nodes.find((n) => n.id === id)!);
    for (const b of branches) {
      expect(b.nextNodeIds).toHaveLength(1);
      const target = nodes.find((n) => n.id === b.nextNodeIds[0])!;
      expect(target.type).toBe('boss');
    }
  });

  it('fork branches are exactly the pair from one of twelve fork shapes', () => {
    const seenShapes = new Set<string>();
    for (let seed = 1; seed <= 1200; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
      const branchTypes = fork.nextNodeIds
        .map((id) => nodes.find((n) => n.id === id)!.type)
        .sort()
        .join('+');
      seenShapes.add(branchTypes);
    }
    expect(seenShapes).toEqual(new Set([
      'combat+shop',
      'combat+elite',
      'elite+shop',
      'camp+combat',
      'camp+shop',
      'camp+elite',
      'combat+event',
      'event+shop',
      'elite+event',
      'camp+event',
      'combat+treasure',
      'elite+treasure',
    ]));
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

  it('propagates per-floor scale to every non-elite encounter', () => {
    for (const floorNumber of [1, 2, 5, 10]) {
      const expected = floorScale(floorNumber);
      const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
      for (const node of nodes) {
        if (node.type === 'shop') continue;
        if (node.type === 'camp') continue; // camp has no encounter
        if (node.type === 'event') continue; // event has no encounter
        if (node.type === 'treasure') continue; // treasure has no encounter
        if (node.type === 'elite') continue; // elite scale = floorScale × elite multipliers; covered separately
        expect(node.encounter.scale).toEqual(expected);
      }
    }
  });

  it('elite encounters apply ELITE_HP_MULT and ELITE_ATTACK_MULT on top of floorScale', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const floorNumber of [1, 5]) {
        const baseScale = floorScale(floorNumber);
        const { nodes } = generateFloor('crypt', floorNumber, createRng(seed));
        const elite = nodes.find((n) => n.type === 'elite');
        if (!elite || elite.type !== 'elite') continue;
        expect(elite.encounter.scale.hp).toBeCloseTo(baseScale.hp * 1.5, 10);
        expect(elite.encounter.scale.attack).toBeCloseTo(baseScale.attack * 1.25, 10);
        return;
      }
    }
    throw new Error('no elite-bearing floor found in the sample range');
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

  it('floor generation is deterministic per seed (full nodes equality)', () => {
    for (const seed of [1, 7, 42]) {
      const a = generateFloor('crypt', 1, createRng(seed));
      const b = generateFloor('crypt', 1, createRng(seed));
      expect(a).toEqual(b);
    }
  });

  it('shop (when present on a floor) has 4 inventory items', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const shop = nodes.find((n) => n.type === 'shop');
      if (!shop) continue;
      if (shop.type !== 'shop') throw new Error('expected shop');
      expect(shop.inventory).toHaveLength(4);
      return;
    }
    throw new Error('no shop-bearing floor found in the sample range');
  });

  it('shop_vs_combat shape: fork branches are exactly one combat and one shop', () => {
    const { fork } = findFloorWithShape('shop_vs_combat');
    expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'shop']);
  });

  it('elite_vs_combat shape: fork branches are exactly one combat and one elite', () => {
    const { fork } = findFloorWithShape('elite_vs_combat');
    expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'elite']);
  });

  it('elite_vs_shop shape: fork branches are exactly one elite and one shop (no combat)', () => {
    const { fork } = findFloorWithShape('elite_vs_shop');
    expect(fork.map((b) => b.type).sort()).toEqual(['elite', 'shop']);
    for (const b of fork) {
      expect(b.type).not.toBe('combat');
    }
  });

  it('camp_vs_combat shape: fork branches are exactly one camp and one combat', () => {
    const { fork } = findFloorWithShape('camp_vs_combat');
    expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'combat']);
  });

  it('camp_vs_shop shape: fork branches are exactly one camp and one shop', () => {
    const { fork } = findFloorWithShape('camp_vs_shop');
    expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'shop']);
  });

  it('camp_vs_elite shape: fork branches are exactly one camp and one elite', () => {
    const { fork } = findFloorWithShape('camp_vs_elite');
    expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'elite']);
  });

  it('event_vs_combat shape: fork branches are exactly one event and one combat', () => {
    const { fork } = findFloorWithShape('event_vs_combat');
    expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'event']);
  });

  it('event_vs_shop shape: fork branches are exactly one event and one shop', () => {
    const { fork } = findFloorWithShape('event_vs_shop');
    expect(fork.map((b) => b.type).sort()).toEqual(['event', 'shop']);
  });

  it('event_vs_elite shape: fork branches are exactly one event and one elite', () => {
    const { fork } = findFloorWithShape('event_vs_elite');
    expect(fork.map((b) => b.type).sort()).toEqual(['elite', 'event']);
  });

  it('event_vs_camp shape: fork branches are exactly one event and one camp', () => {
    const { fork } = findFloorWithShape('event_vs_camp');
    expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'event']);
  });

  it('treasure_vs_combat shape: fork branches are exactly one treasure and one combat', () => {
    const { fork } = findFloorWithShape('treasure_vs_combat');
    expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'treasure']);
  });

  it('treasure_vs_elite shape: fork branches are exactly one treasure and one elite', () => {
    const { fork } = findFloorWithShape('treasure_vs_elite');
    expect(fork.map((b) => b.type).sort()).toEqual(['elite', 'treasure']);
  });

  it('event nodes carry a valid cardId from the EVENTS table', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      for (const node of nodes) {
        if (node.type !== 'event') continue;
        expect(EVENTS[node.cardId]).toBeDefined();
        expect(node.nextNodeIds).toHaveLength(1);
      }
    }
  });

  it('twelve fork shapes are roughly evenly distributed across seeds', () => {
    const counts = {
      shop_vs_combat: 0,
      elite_vs_combat: 0,
      elite_vs_shop: 0,
      camp_vs_combat: 0,
      camp_vs_shop: 0,
      camp_vs_elite: 0,
      event_vs_combat: 0,
      event_vs_shop: 0,
      event_vs_elite: 0,
      event_vs_camp: 0,
      treasure_vs_combat: 0,
      treasure_vs_elite: 0,
    };
    for (let seed = 1; seed <= 1200; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
      const types = fork.nextNodeIds
        .map((id) => nodes.find((n) => n.id === id)!.type)
        .sort()
        .join('+');
      if (types === 'combat+shop')          counts.shop_vs_combat += 1;
      else if (types === 'combat+elite')    counts.elite_vs_combat += 1;
      else if (types === 'elite+shop')      counts.elite_vs_shop += 1;
      else if (types === 'camp+combat')     counts.camp_vs_combat += 1;
      else if (types === 'camp+shop')       counts.camp_vs_shop += 1;
      else if (types === 'camp+elite')      counts.camp_vs_elite += 1;
      else if (types === 'combat+event')    counts.event_vs_combat += 1;
      else if (types === 'event+shop')      counts.event_vs_shop += 1;
      else if (types === 'elite+event')     counts.event_vs_elite += 1;
      else if (types === 'camp+event')      counts.event_vs_camp += 1;
      else if (types === 'combat+treasure') counts.treasure_vs_combat += 1;
      else if (types === 'elite+treasure')  counts.treasure_vs_elite += 1;
    }
    // Expected ~100 each (1/12 of 1200). Loose lower bound: at least 60.
    expect(counts.shop_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.elite_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.elite_vs_shop).toBeGreaterThanOrEqual(60);
    expect(counts.camp_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.camp_vs_shop).toBeGreaterThanOrEqual(60);
    expect(counts.camp_vs_elite).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_shop).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_elite).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_camp).toBeGreaterThanOrEqual(60);
    expect(counts.treasure_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.treasure_vs_elite).toBeGreaterThanOrEqual(60);
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

  it('floor 15: every combat-encounter enemy has one modifierIds from the full pool (across seeds, all three appear)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const { nodes } = generateFloor('crypt', 15, createRng(seed));
      for (const node of nodes) {
        if (node.type !== 'combat') continue;
        for (const placement of node.encounter.enemies) {
          expect(placement.modifierIds).toHaveLength(1);
          seen.add(placement.modifierIds![0]);
        }
      }
    }
    expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });

  it('elite encounter on floor 1: every enemy has one modifierIds from the full pool', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const elite = nodes.find((n) => n.type === 'elite');
      if (!elite || elite.type !== 'elite') continue;
      for (const placement of elite.encounter.enemies) {
        expect(placement.modifierIds).toHaveLength(1);
        seen.add(placement.modifierIds![0]);
      }
    }
    expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });

  it('boss encounter has no modifierIds (any floor)', () => {
    for (const floorNumber of [1, 5, 15]) {
      const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
      const boss = nodes.find((n) => n.type === 'boss');
      expect(boss).toBeDefined();
      if (boss?.type === 'boss') {
        for (const placement of boss.encounter.enemies) {
          expect(placement.modifierIds).toBeUndefined();
        }
      }
    }
  });
});

function findFloorWithShape(
  shape:
    | 'shop_vs_combat'
    | 'elite_vs_combat'
    | 'elite_vs_shop'
    | 'camp_vs_combat'
    | 'camp_vs_shop'
    | 'camp_vs_elite'
    | 'event_vs_combat'
    | 'event_vs_shop'
    | 'event_vs_elite'
    | 'event_vs_camp'
    | 'treasure_vs_combat'
    | 'treasure_vs_elite',
  maxSeeds = 1000,
): { nodes: ReturnType<typeof generateFloor>['nodes']; fork: { type: string }[] } {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branches = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!)
      .map((n) => ({ type: n.type }));
    const types = branches.map((b) => b.type).sort();
    const matches =
      (shape === 'shop_vs_combat'     && types[0] === 'combat' && types[1] === 'shop')     ||
      (shape === 'elite_vs_combat'    && types[0] === 'combat' && types[1] === 'elite')    ||
      (shape === 'elite_vs_shop'      && types[0] === 'elite'  && types[1] === 'shop')     ||
      (shape === 'camp_vs_combat'     && types[0] === 'camp'   && types[1] === 'combat')   ||
      (shape === 'camp_vs_shop'       && types[0] === 'camp'   && types[1] === 'shop')     ||
      (shape === 'camp_vs_elite'      && types[0] === 'camp'   && types[1] === 'elite')    ||
      (shape === 'event_vs_combat'    && types[0] === 'combat' && types[1] === 'event')    ||
      (shape === 'event_vs_shop'      && types[0] === 'event'  && types[1] === 'shop')     ||
      (shape === 'event_vs_elite'     && types[0] === 'elite'  && types[1] === 'event')    ||
      (shape === 'event_vs_camp'      && types[0] === 'camp'   && types[1] === 'event')    ||
      (shape === 'treasure_vs_combat' && types[0] === 'combat' && types[1] === 'treasure') ||
      (shape === 'treasure_vs_elite'  && types[0] === 'elite'  && types[1] === 'treasure');
    if (matches) return { nodes, fork: branches };
  }
  throw new Error(`no '${shape}' floor in first ${maxSeeds} seeds`);
}
