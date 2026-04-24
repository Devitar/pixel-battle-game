import { describe, expect, it } from 'vitest';
import { CRYPT_BOSS, CRYPT_POOL, ENEMIES } from '../../data/enemies';
import type { EnemyId } from '../../data/types';
import { createRng, type Rng, type WeightedOption } from '../../util/rng';
import { composeBossEncounter, composeCombatEncounter } from '../encounter';

const FLAT_SCALE = { hp: 1.0, attack: 1.0 };

function isFrontLiner(id: EnemyId): boolean {
  return ENEMIES[id].preferredSlots.some((s) => s === 1 || s === 2);
}

describe('composeCombatEncounter', () => {
  it('is deterministic for a given seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const a = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, rng1);
    const b = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, rng2);
    expect(a).toEqual(b);
  });

  it('encounter size is always 2, 3, or 4', () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 1000; seed++) {
      const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      sizes.add(enc.enemies.length);
    }
    for (const size of sizes) {
      expect([2, 3, 4]).toContain(size);
    }
  });

  it('slots are densely packed 1..N with no duplicates', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      const slots = enc.enemies.map((e) => e.slot).sort((a, b) => a - b);
      const expected = Array.from({ length: enc.enemies.length }, (_, i) => i + 1);
      expect(slots).toEqual(expected);
    }
  });

  it('every encounter has at least one front-liner', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      const hasFront = enc.enemies.some((p) => isFrontLiner(p.enemyId));
      expect(hasFront, `seed ${seed} produced all-back-liner encounter`).toBe(true);
    }
  });

  it('front-liner guarantee triggers via mock RNG when initial picks are all back-liners', () => {
    const calls: Array<string | number> = [];
    const mockRng: Rng = {
      next: () => 0,
      int: (min) => min,
      pick: <T>(arr: readonly T[]): T => {
        calls.push('pick');
        if (calls.filter((c) => c === 'pick').length <= 3) {
          return (arr.find((x) => x === ('skeleton_archer' as T)) ?? arr[0]) as T;
        }
        return arr[0];
      },
      shuffle: <T>(arr: readonly T[]): T[] => [...arr],
      weighted: <T>(options: readonly WeightedOption<T>[]): T => {
        calls.push('weighted');
        return options[1].value;
      },
    };
    const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, mockRng);
    expect(enc.enemies).toHaveLength(3);
    const hasFront = enc.enemies.some((p) => isFrontLiner(p.enemyId));
    expect(hasFront).toBe(true);
  });

  it('slot assignment: front-liners ascending, back-liners descending (2 front + 1 back)', () => {
    const picks: EnemyId[] = ['skeleton_warrior', 'ghoul', 'skeleton_archer'];
    let pickIdx = 0;
    const mockRng: Rng = {
      next: () => 0,
      int: (min) => min,
      pick: <T>(arr: readonly T[]): T => {
        const result = picks[pickIdx] as unknown as T;
        pickIdx++;
        return result ?? arr[0];
      },
      shuffle: <T>(arr: readonly T[]): T[] => [...arr],
      weighted: <T>(options: readonly WeightedOption<T>[]): T => options[1].value,
    };
    const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, mockRng);
    const bySlot = [...enc.enemies].sort((a, b) => a.slot - b.slot);
    expect(bySlot[0].enemyId).toBe('skeleton_warrior');
    expect(bySlot[0].slot).toBe(1);
    expect(bySlot[1].enemyId).toBe('ghoul');
    expect(bySlot[1].slot).toBe(2);
    expect(bySlot[2].enemyId).toBe('skeleton_archer');
    expect(bySlot[2].slot).toBe(3);
  });

  it('slot assignment: 1 front + 2 back puts back-liner at slot 2', () => {
    const picks: EnemyId[] = ['skeleton_warrior', 'skeleton_archer', 'cultist'];
    let pickIdx = 0;
    const mockRng: Rng = {
      next: () => 0,
      int: (min) => min,
      pick: <T>(arr: readonly T[]): T => {
        const result = picks[pickIdx] as unknown as T;
        pickIdx++;
        return result ?? arr[0];
      },
      shuffle: <T>(arr: readonly T[]): T[] => [...arr],
      weighted: <T>(options: readonly WeightedOption<T>[]): T => options[1].value,
    };
    const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, mockRng);
    const bySlot = [...enc.enemies].sort((a, b) => a.slot - b.slot);
    expect(bySlot[0].enemyId).toBe('skeleton_warrior');
    expect(bySlot[0].slot).toBe(1);
    expect(bySlot[1].slot).toBe(2);
    expect(bySlot[2].slot).toBe(3);
    expect(isFrontLiner(bySlot[1].enemyId)).toBe(false);
    expect(isFrontLiner(bySlot[2].enemyId)).toBe(false);
  });

  it('propagates the scale factor onto the encounter', () => {
    const scale = { hp: 1.5, attack: 1.5 };
    const enc = composeCombatEncounter(CRYPT_POOL, scale, createRng(1));
    expect(enc.scale).toEqual(scale);
  });
});

describe('composeBossEncounter', () => {
  it('is deterministic for a given seed', () => {
    const rng1 = createRng(7);
    const rng2 = createRng(7);
    const a = composeBossEncounter(CRYPT_BOSS, CRYPT_POOL, FLAT_SCALE, rng1);
    const b = composeBossEncounter(CRYPT_BOSS, CRYPT_POOL, FLAT_SCALE, rng2);
    expect(a).toEqual(b);
  });

  it('produces 3 placements: front-liner at slot 1, any at slot 2, boss at slot 3', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const enc = composeBossEncounter(CRYPT_BOSS, CRYPT_POOL, FLAT_SCALE, createRng(seed));
      expect(enc.enemies).toHaveLength(3);
      const bySlot = [...enc.enemies].sort((a, b) => a.slot - b.slot);
      expect(bySlot[0].slot).toBe(1);
      expect(isFrontLiner(bySlot[0].enemyId), `seed ${seed}: slot-1 minion should be front-liner`).toBe(true);
      expect(bySlot[1].slot).toBe(2);
      expect(CRYPT_POOL).toContain(bySlot[1].enemyId);
      expect(bySlot[2].slot).toBe(3);
      expect(bySlot[2].enemyId).toBe(CRYPT_BOSS);
    }
  });

  it('propagates the scale factor', () => {
    const scale = { hp: 1.3, attack: 1.3 };
    const enc = composeBossEncounter(CRYPT_BOSS, CRYPT_POOL, scale, createRng(1));
    expect(enc.scale).toEqual(scale);
  });
});
