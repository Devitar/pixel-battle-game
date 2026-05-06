import { describe, expect, it } from 'vitest';
import { DUNGEONS } from '../dungeons';
import { ENEMIES } from '../enemies';

describe('DUNGEONS', () => {
  it('registers the crypt', () => {
    expect(DUNGEONS['crypt']).toBeDefined();
    expect(DUNGEONS['crypt'].id).toBe('crypt');
  });

  it('crypt has positive finite floorsPerRun', () => {
    const len = DUNGEONS['crypt'].floorsPerRun;
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

  it('crypt is tier 1', () => {
    expect(DUNGEONS['crypt'].tier).toBe(1);
  });
});

describe('DUNGEONS.sunken_keep', () => {
  it('is registered with tier 2', () => {
    expect(DUNGEONS.sunken_keep).toBeDefined();
    expect(DUNGEONS.sunken_keep.id).toBe('sunken_keep');
    expect(DUNGEONS.sunken_keep.tier).toBe(2);
  });

  it('has 3 floors with rowsPerFloor 10', () => {
    expect(DUNGEONS.sunken_keep.floorsPerRun).toBe(3);
    expect(DUNGEONS.sunken_keep.rowsPerFloor).toBe(10);
  });

  it('has the expected unlock requirement string', () => {
    expect(DUNGEONS.sunken_keep.unlockRequirement).toBe('Defeat the Bone Lich');
  });

  it('enemyPool references registered enemies', () => {
    for (const id of DUNGEONS.sunken_keep.enemyPool) {
      expect(ENEMIES[id], `pool references missing enemy ${id}`).toBeDefined();
    }
  });

  it('bossId is a registered boss', () => {
    const bossId = DUNGEONS.sunken_keep.bossId;
    expect(ENEMIES[bossId]).toBeDefined();
    expect(ENEMIES[bossId].role).toBe('boss');
  });
});
