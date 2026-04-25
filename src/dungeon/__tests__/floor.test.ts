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

  it('floor 1 has 4 nodes: 3 combat + 1 boss', () => {
    const nodes = generateFloor('crypt', 1, createRng(1));
    expect(nodes).toHaveLength(4);
    expect(nodes[0].type).toBe('combat');
    expect(nodes[1].type).toBe('combat');
    expect(nodes[2].type).toBe('combat');
    expect(nodes[3].type).toBe('boss');
  });

  it('boss node is always last', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const nodes = generateFloor('crypt', 1, createRng(seed));
      expect(nodes[nodes.length - 1].type).toBe('boss');
      expect(nodes.slice(0, -1).every((n) => n.type === 'combat')).toBe(true);
    }
  });

  it('propagates per-floor scale to every encounter', () => {
    for (const floorNumber of [1, 2, 5, 10]) {
      const expected = floorScale(floorNumber);
      const nodes = generateFloor('crypt', floorNumber, createRng(1));
      for (const node of nodes) {
        expect(node.encounter.scale).toEqual(expected);
      }
    }
  });

  it('node ids are unique within a floor', () => {
    const nodes = generateFloor('crypt', 3, createRng(1));
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every combat encounter uses pool enemies only', () => {
    const nodes = generateFloor('crypt', 1, createRng(1));
    const combatNodes = nodes.filter((n) => n.type === 'combat');
    for (const node of combatNodes) {
      for (const placement of node.encounter.enemies) {
        expect(CRYPT_POOL).toContain(placement.enemyId);
      }
    }
  });

  it('boss encounter contains the Crypt boss at slot 3', () => {
    const nodes = generateFloor('crypt', 1, createRng(1));
    const boss = nodes[nodes.length - 1];
    expect(boss.type).toBe('boss');
    const bossPlacement = boss.encounter.enemies.find((p) => p.enemyId === CRYPT_BOSS);
    expect(bossPlacement).toBeDefined();
    expect(bossPlacement?.slot).toBe(3);
  });

  it('different floor numbers produce different node ids', () => {
    const f1 = generateFloor('crypt', 1, createRng(1));
    const f2 = generateFloor('crypt', 2, createRng(1));
    for (let i = 0; i < f1.length; i++) {
      expect(f1[i].id).not.toBe(f2[i].id);
    }
  });
});
