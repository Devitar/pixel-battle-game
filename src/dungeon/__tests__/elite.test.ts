import { describe, expect, it } from 'vitest';
import { CRYPT_POOL, ENEMIES } from '@data/enemies';
import type { EnemyId } from '@data/types';
import { createRng } from '@util/rng';
import { composeEliteEncounter, ELITE_ATTACK_MULT, ELITE_HP_MULT } from '../elite';
import { floorScale } from '../scaling';

const FLAT_SCALE = { hp: 1.0, attack: 1.0 };

function isFrontLiner(id: EnemyId): boolean {
  return ENEMIES[id].preferredSlots.some((s) => s === 1 || s === 2);
}

describe('composeEliteEncounter', () => {
  it('is deterministic for a given seed', () => {
    const a = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(42));
    const b = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(42));
    expect(a).toEqual(b);
  });

  it('always produces exactly 4 enemies', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      expect(enc.enemies).toHaveLength(4);
    }
  });

  it('slots are densely packed 1..4 with no duplicates', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      const slots = enc.enemies.map((e) => e.slot).sort((a, b) => a - b);
      expect(slots).toEqual([1, 2, 3, 4]);
    }
  });

  it('every encounter has at least one front-liner', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      const hasFront = enc.enemies.some((p) => isFrontLiner(p.enemyId));
      expect(hasFront, `seed ${seed} produced all-back-liner elite`).toBe(true);
    }
  });

  it('every enemy is from the supplied pool', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      for (const placement of enc.enemies) {
        expect(CRYPT_POOL).toContain(placement.enemyId);
      }
    }
  });

  it('multiplies the supplied scale by the elite multipliers', () => {
    for (const floorNumber of [1, 5, 10]) {
      const baseScale = floorScale(floorNumber);
      const enc = composeEliteEncounter(CRYPT_POOL, baseScale, createRng(1));
      expect(enc.scale.hp).toBeCloseTo(baseScale.hp * ELITE_HP_MULT, 10);
      expect(enc.scale.attack).toBeCloseTo(baseScale.attack * ELITE_ATTACK_MULT, 10);
    }
  });

  it('elite multipliers are exactly 1.5 hp / 1.25 attack', () => {
    expect(ELITE_HP_MULT).toBe(1.5);
    expect(ELITE_ATTACK_MULT).toBe(1.25);
  });
});
