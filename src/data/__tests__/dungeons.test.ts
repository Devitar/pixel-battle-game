import { describe, expect, it } from 'vitest';
import { DUNGEONS } from '../dungeons';
import { ENEMIES } from '../enemies';

describe('DUNGEONS', () => {
  it('registers the crypt', () => {
    expect(DUNGEONS['crypt']).toBeDefined();
    expect(DUNGEONS['crypt'].id).toBe('crypt');
  });

  it('crypt has positive finite floorLength', () => {
    const len = DUNGEONS['crypt'].floorLength;
    expect(len).toBeGreaterThan(0);
    expect(Number.isFinite(len)).toBe(true);
  });

  it('crypt enemyPool is non-empty and every entry is registered', () => {
    const pool = DUNGEONS['crypt'].enemyPool;
    expect(pool.length).toBeGreaterThan(0);
    for (const id of pool) {
      expect(ENEMIES[id], `pool references missing enemy ${id}`).toBeDefined();
    }
  });

  it('crypt bossId is a registered enemy with role boss', () => {
    const bossId = DUNGEONS['crypt'].bossId;
    expect(ENEMIES[bossId]).toBeDefined();
    expect(ENEMIES[bossId].role).toBe('boss');
  });
});
