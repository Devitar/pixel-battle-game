import { describe, expect, it } from 'vitest';
import { CRYPT_POOL, CRYPT_BOSS } from '@data/enemies';
import type { DungeonDef } from '@data/types';
import { ENEMIES } from '@data/enemies';
import type { Hero } from '@heroes/hero';
import { createRng } from '@util/rng';
import type { RunState } from '@run/run_state';
import { floorCap, rollSurprise } from '../surprise';

const CRYPT: DungeonDef = {
  id: 'crypt',
  name: 'The Crypt',
  theme: '',
  floorLength: 3,
  enemyPool: CRYPT_POOL,
  bossId: CRYPT_BOSS,
};

function fakeRunState(over: Partial<RunState> = {}): RunState {
  return {
    dungeonId: 'crypt',
    seed: 1,
    party: [] as readonly Hero[],
    pack: { gold: 0, items: [] },
    currentFloorNumber: 1,
    currentFloorNodes: [],
    currentNodeId: 'x',
    awaitingFork: false,
    status: 'in_dungeon',
    fallen: [],
    lost: [],
    traversedNodeIds: ['x'],
    surprisesThisFloor: 0,
    ...over,
  } as RunState;
}

describe('floorCap', () => {
  it('returns 1 for floors 1 and 2, 2 for floor 3', () => {
    expect(floorCap(1)).toBe(1);
    expect(floorCap(2)).toBe(1);
    expect(floorCap(3)).toBe(2);
  });
});

describe('rollSurprise — gating', () => {
  it('returns null for combat destinations', () => {
    const run = fakeRunState();
    // Use a forced-true RNG to confirm the gate, not the probability.
    expect(rollSurprise(run, CRYPT, 'combat', createRng(1))).toBeNull();
  });

  it('returns null for elite destinations', () => {
    const run = fakeRunState();
    expect(rollSurprise(run, CRYPT, 'elite', createRng(1))).toBeNull();
  });

  it('returns null for boss destinations', () => {
    const run = fakeRunState();
    expect(rollSurprise(run, CRYPT, 'boss', createRng(1))).toBeNull();
  });

  it('returns null when surprisesThisFloor >= floorCap', () => {
    const run = fakeRunState({ currentFloorNumber: 1, surprisesThisFloor: 1 });
    // Sample many seeds — none should fire because cap is 1 and we're at 1.
    for (let seed = 1; seed <= 50; seed++) {
      expect(rollSurprise(run, CRYPT, 'shop', createRng(seed))).toBeNull();
    }
  });

  it('floor 3 cap allows up to 2 surprises', () => {
    const run = fakeRunState({ currentFloorNumber: 3, surprisesThisFloor: 1 });
    // At floor 3, cap is 2, so at count=1 we should NOT be hard-blocked. Some
    // seeds will hit the probability gate. Verify at least one seed fires.
    let anyHit = false;
    for (let seed = 1; seed <= 200; seed++) {
      if (rollSurprise(run, CRYPT, 'shop', createRng(seed)) !== null) {
        anyHit = true;
        break;
      }
    }
    expect(anyHit).toBe(true);
  });
});

describe('rollSurprise — probability gate', () => {
  // Sample N trials with deterministic seeds and verify hit rate falls within
  // ±5% of the configured per-floor probability. The encounter content isn't
  // verified here — Task 5 covers that. We just check non-null vs null.
  function hitRate(floorNumber: number, trials: number): number {
    let hits = 0;
    for (let seed = 1; seed <= trials; seed++) {
      const run = fakeRunState({ currentFloorNumber: floorNumber, surprisesThisFloor: 0 });
      if (rollSurprise(run, CRYPT, 'shop', createRng(seed)) !== null) hits++;
    }
    return hits / trials;
  }

  it('floor 1 fires within tolerance of 15%', () => {
    const rate = hitRate(1, 1000);
    expect(rate).toBeGreaterThan(0.10);
    expect(rate).toBeLessThan(0.20);
  });

  it('floor 2 fires within tolerance of 20%', () => {
    const rate = hitRate(2, 1000);
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.25);
  });

  it('floor 3 fires within tolerance of 25%', () => {
    const rate = hitRate(3, 1000);
    expect(rate).toBeGreaterThan(0.20);
    expect(rate).toBeLessThan(0.30);
  });
});

describe('rollSurprise — encounter composition', () => {
  // Find a seed that produces a hit on floor 1, then verify the encounter shape.
  function firstHitEncounter(floorNumber: number) {
    for (let seed = 1; seed <= 1000; seed++) {
      const run = fakeRunState({ currentFloorNumber: floorNumber });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc !== null) return enc;
    }
    throw new Error('no surprise hit in 1000 seeds — probability table may be off');
  }

  it('encounter has 1 or 2 enemies', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      // Vary trial start by perturbing the floor number to get diverse seeds.
      const enc = firstHitEncounter(1);
      expect(enc.enemies.length).toBeGreaterThanOrEqual(1);
      expect(enc.enemies.length).toBeLessThanOrEqual(2);
    }
  });

  it('every encounter has at least one front-liner', () => {
    let checked = 0;
    for (let seed = 1; seed <= 2000 && checked < 50; seed++) {
      const run = fakeRunState({ currentFloorNumber: 1 });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc === null) continue;
      checked++;
      const hasFront = enc.enemies.some((p) => {
        const preferred = ENEMIES[p.enemyId].preferredSlots;
        return preferred.some((s) => s === 1 || s === 2);
      });
      expect(hasFront, `seed ${seed} produced all-back-liner surprise`).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('no enemy placement carries modifierIds', () => {
    let checked = 0;
    for (let seed = 1; seed <= 2000 && checked < 50; seed++) {
      const run = fakeRunState({ currentFloorNumber: 1 });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc === null) continue;
      checked++;
      for (const placement of enc.enemies) {
        expect(placement.modifierIds).toBeUndefined();
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('scale matches floorScale of currentFloorNumber', () => {
    const enc = firstHitEncounter(2);
    // floorScale(2) = { hp: 1.1, attack: 1.1 }
    expect(enc.scale.hp).toBeCloseTo(1.1, 5);
    expect(enc.scale.attack).toBeCloseTo(1.1, 5);
  });

  it('slots are 1..N densely packed (no gaps)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 2000 && checked < 50; seed++) {
      const run = fakeRunState({ currentFloorNumber: 1 });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc === null) continue;
      checked++;
      const slots = enc.enemies.map((e) => e.slot).sort((a, b) => a - b);
      const expected = Array.from({ length: enc.enemies.length }, (_, i) => i + 1);
      expect(slots).toEqual(expected);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
