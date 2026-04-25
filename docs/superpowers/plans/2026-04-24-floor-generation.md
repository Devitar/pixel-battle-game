# Floor Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Crypt floor generator: `generateFloor(dungeonId, floorNumber, rng): Node[]` producing 3 combat nodes + 1 boss node with per-floor stat scaling and weighted encounter composition.

**Architecture:** Layered dependency graph: types → scaling (pure math) → encounter composer (pool + slot logic) → floor generator (thin orchestrator). The generator emits data structures only; conversion to runtime `Combatant`s happens later in task 6's run state layer.

**Tech Stack:** TypeScript 6.0, Vitest 4.1. No phaser. Uses existing `Rng` contract from `src/util/rng`.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* No commit steps; user drives staging.

**Source spec:** [`docs/superpowers/specs/2026-04-24-floor-generation-design.md`](../specs/2026-04-24-floor-generation-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `DungeonId` literal union + `DungeonDef` interface. |
| `src/data/dungeons.ts` | Create | `DUNGEONS` registry — Crypt only. |
| `src/dungeon/node.ts` | Create | `ScaleFactors`, `EnemyPlacement`, `Encounter`, `Node`, `NodeType`. |
| `src/dungeon/scaling.ts` | Create | `floorScale(floorNumber): ScaleFactors`. |
| `src/dungeon/encounter.ts` | Create | `composeCombatEncounter`, `composeBossEncounter`. |
| `src/dungeon/floor.ts` | Create | `generateFloor(dungeonId, floorNumber, rng): Node[]`. |
| `src/data/__tests__/dungeons.test.ts` | Create | Registry integrity. |
| `src/dungeon/__tests__/scaling.test.ts` | Create | Exact scale values + error cases. |
| `src/dungeon/__tests__/encounter.test.ts` | Create | Determinism, size bounds, front-liner guarantee (mocked RNG), slot assignment, boss shape. |
| `src/dungeon/__tests__/floor.test.ts` | Create | Structure, scale propagation, boss-last, id uniqueness, pool integrity. |

---

## Task 1: Types + node definitions

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/dungeon/node.ts`

No tests for pure type files; the compile gate is the check.

- [ ] **Step 1: Extend `src/data/types.ts` with `DungeonId` and `DungeonDef`**

Append at the end of the file:

```ts
export type DungeonId = 'crypt';

export interface DungeonDef {
  id: DungeonId;
  name: string;
  theme: string;
  floorLength: number;
  enemyPool: readonly EnemyId[];
  bossId: EnemyId;
}
```

- [ ] **Step 2: Create `src/dungeon/node.ts`**

```ts
import type { EnemyId, SlotIndex } from '../data/types';

export interface ScaleFactors {
  hp: number;
  attack: number;
}

export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
}

export interface Encounter {
  enemies: readonly EnemyPlacement[];
  scale: ScaleFactors;
}

export type Node =
  | { id: string; type: 'combat'; encounter: Encounter }
  | { id: string; type: 'boss'; encounter: Encounter };

export type NodeType = Node['type'];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

---

## Task 2: `data/dungeons.ts` + integrity test

**Files:**
- Create: `src/data/dungeons.ts`
- Create: `src/data/__tests__/dungeons.test.ts`

TDD cycle: stub first, write integrity tests, confirm RED, fill in data, confirm GREEN.

- [ ] **Step 1: Create `src/data/dungeons.ts` as a stub**

```ts
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {} as Record<DungeonId, DungeonDef>;
```

- [ ] **Step 2: Create `src/data/__tests__/dungeons.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the tests — expect RED**

Run: `npx vitest run src/data/__tests__/dungeons.test.ts`
Expected: FAIL. `DUNGEONS['crypt']` is undefined.

- [ ] **Step 4: Replace `src/data/dungeons.ts` with the full implementation**

```ts
import { CRYPT_BOSS, CRYPT_POOL } from './enemies';
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    floorLength: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
};
```

- [ ] **Step 5: Run the tests — expect GREEN**

Run: `npx vitest run src/data/__tests__/dungeons.test.ts`
Expected: 4 passing.

---

## Task 3: `dungeon/scaling.ts`

**Files:**
- Create: `src/dungeon/scaling.ts`
- Create: `src/dungeon/__tests__/scaling.test.ts`

- [ ] **Step 1: Create `src/dungeon/__tests__/scaling.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { floorScale } from '../scaling';

describe('floorScale', () => {
  it('floor 1 is 1.0× on both stats', () => {
    expect(floorScale(1)).toEqual({ hp: 1.0, attack: 1.0 });
  });

  it('floor 2 is 1.1× on both stats', () => {
    const s = floorScale(2);
    expect(s.hp).toBeCloseTo(1.1);
    expect(s.attack).toBeCloseTo(1.1);
  });

  it('floor 10 is 1.9× on both stats', () => {
    const s = floorScale(10);
    expect(s.hp).toBeCloseTo(1.9);
    expect(s.attack).toBeCloseTo(1.9);
  });

  it('throws on floor 0', () => {
    expect(() => floorScale(0)).toThrow();
  });

  it('throws on negative floors', () => {
    expect(() => floorScale(-5)).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect RED**

Run: `npx vitest run src/dungeon/__tests__/scaling.test.ts`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Create `src/dungeon/scaling.ts`**

```ts
import type { ScaleFactors } from './node';

export function floorScale(floorNumber: number): ScaleFactors {
  if (floorNumber < 1) {
    throw new Error(`floorScale: floorNumber must be >= 1, got ${floorNumber}`);
  }
  const mult = 1 + 0.1 * (floorNumber - 1);
  return { hp: mult, attack: mult };
}
```

- [ ] **Step 4: Run — expect GREEN**

Run: `npx vitest run src/dungeon/__tests__/scaling.test.ts`
Expected: 5 passing.

---

## Task 4: `dungeon/encounter.ts`

**Files:**
- Create: `src/dungeon/encounter.ts`
- Create: `src/dungeon/__tests__/encounter.test.ts`

Biggest task. The `composeCombatEncounter` and `composeBossEncounter` functions plus tests for determinism, size bounds, front-liner guarantee, slot assignment, and boss shape.

- [ ] **Step 1: Create `src/dungeon/__tests__/encounter.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CRYPT_BOSS, CRYPT_POOL } from '../../data/enemies';
import { ENEMIES } from '../../data/enemies';
import type { EnemyId } from '../../data/types';
import { createRng, type Rng } from '../../util/rng';
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
    // Mock RNG: size = 3, then three back-liner picks, then a front-liner re-roll pick.
    const calls: Array<string | number> = [];
    const mockRng: Rng = {
      next: () => 0,
      int: (min, max) => min,
      pick: <T>(arr: readonly T[]): T => {
        calls.push('pick');
        // First 3 calls: return skeleton_archer (back-liner). 4th call: front-liner pool, return first.
        if (calls.filter((c) => c === 'pick').length <= 3) {
          return arr.find((x) => x === ('skeleton_archer' as T)) ?? arr[0];
        }
        return arr[0];
      },
      shuffle: <T>(arr: readonly T[]): T[] => [...arr],
      weighted: <T>(options) => {
        calls.push('weighted');
        return options[1].value; // index 1 = size 3 in [2, 3, 4] weights
      },
    };
    const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, mockRng);
    expect(enc.enemies).toHaveLength(3);
    const hasFront = enc.enemies.some((p) => isFrontLiner(p.enemyId));
    expect(hasFront).toBe(true);
  });

  it('slot assignment: front-liners ascending, back-liners descending (2 front + 1 back)', () => {
    // Use mock RNG to force exactly this composition: [warrior, ghoul, archer].
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
      weighted: (options) => options[1].value, // size 3
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
      weighted: (options) => options[1].value, // size 3
    };
    const enc = composeCombatEncounter(CRYPT_POOL, FLAT_SCALE, mockRng);
    const bySlot = [...enc.enemies].sort((a, b) => a.slot - b.slot);
    expect(bySlot[0].enemyId).toBe('skeleton_warrior');
    expect(bySlot[0].slot).toBe(1);
    // back-liners fill descending from slot N; for 3 enemies N=3, so second back-liner at slot 2
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
```

- [ ] **Step 2: Run — expect RED**

Run: `npx vitest run src/dungeon/__tests__/encounter.test.ts`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Create `src/dungeon/encounter.ts`**

```ts
import { ENEMIES } from '../data/enemies';
import type { EnemyId, SlotIndex } from '../data/types';
import type { Rng } from '../util/rng';
import type { Encounter, EnemyPlacement, ScaleFactors } from './node';

const ENCOUNTER_SIZE_WEIGHTS = [
  { value: 2, weight: 20 },
  { value: 3, weight: 60 },
  { value: 4, weight: 20 },
];

function isFrontLiner(enemyId: EnemyId): boolean {
  const preferred = ENEMIES[enemyId].preferredSlots;
  return preferred.some((s) => s === 1 || s === 2);
}

function assignSlots(enemies: readonly EnemyId[]): EnemyPlacement[] {
  const frontIds = enemies.filter(isFrontLiner);
  const backIds = enemies.filter((id) => !isFrontLiner(id));
  const placements: EnemyPlacement[] = [];
  let front = 1;
  let back = enemies.length;
  for (const id of frontIds) {
    placements.push({ enemyId: id, slot: front as SlotIndex });
    front += 1;
  }
  for (const id of backIds) {
    placements.push({ enemyId: id, slot: back as SlotIndex });
    back -= 1;
  }
  placements.sort((a, b) => a.slot - b.slot);
  return placements;
}

export function composeCombatEncounter(
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter {
  const size = rng.weighted(ENCOUNTER_SIZE_WEIGHTS);

  const picks: EnemyId[] = [];
  for (let i = 0; i < size; i++) {
    picks.push(rng.pick(pool));
  }

  if (!picks.some(isFrontLiner)) {
    const frontPool = pool.filter(isFrontLiner);
    picks[0] = rng.pick(frontPool);
  }

  return { enemies: assignSlots(picks), scale };
}

export function composeBossEncounter(
  bossId: EnemyId,
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter {
  const frontPool = pool.filter(isFrontLiner);
  const minion1 = rng.pick(frontPool);
  const minion2 = rng.pick(pool);

  const placements: EnemyPlacement[] = [
    { enemyId: minion1, slot: 1 as SlotIndex },
    { enemyId: minion2, slot: 2 as SlotIndex },
    { enemyId: bossId, slot: 3 as SlotIndex },
  ];

  return { enemies: placements, scale };
}
```

- [ ] **Step 4: Run — expect GREEN**

Run: `npx vitest run src/dungeon/__tests__/encounter.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 5: `dungeon/floor.ts`

**Files:**
- Create: `src/dungeon/floor.ts`
- Create: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 1: Create `src/dungeon/__tests__/floor.test.ts`**

```ts
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
```

- [ ] **Step 2: Run — expect RED**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Create `src/dungeon/floor.ts`**

```ts
import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import type { Node } from './node';
import { floorScale } from './scaling';

export function generateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): Node[] {
  const dungeon = DUNGEONS[dungeonId];
  const scale = floorScale(floorNumber);
  const nodes: Node[] = [];

  for (let i = 0; i < dungeon.floorLength; i++) {
    nodes.push({
      id: `${dungeonId}-f${floorNumber}-n${i}`,
      type: 'combat',
      encounter: composeCombatEncounter(dungeon.enemyPool, scale, rng),
    });
  }

  nodes.push({
    id: `${dungeonId}-f${floorNumber}-boss`,
    type: 'boss',
    encounter: composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng),
  });

  return nodes;
}
```

- [ ] **Step 4: Run — expect GREEN**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 6: Full-suite verification

**Files:** none changed.

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm test`
Expected: all tests pass. Previous total was 296; this task adds roughly +25 (4 dungeons + 5 scaling + 10 encounter + 8 floor).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: `tsc` exits 0; Vite emits `dist/` bundle. Pre-existing phaser chunk-size warning is unrelated.

- [ ] **Step 3: Hand off to user**

Summarize:
- Files created: 6 (types additions + 5 new sources + 1 new data module).
- Test files: 4 new.
- Test count added vs. baseline.
- Offer to migrate TODO.md task 5 → HISTORY.md with decision context.

---

## Self-review

**Spec coverage:**

- Types (DungeonId, DungeonDef, Node, Encounter, ScaleFactors, EnemyPlacement) → Task 1.
- Dungeon registry (Crypt entry, integrity tests) → Task 2.
- Linear scaling formula + error cases → Task 3.
- Encounter composer: size weights 20/60/20, front-liner guarantee, slot assignment ascending/descending, scale propagation → Task 4.
- Boss composer: 3 slots, boss at slot 3, front-liner at slot 1, uniform minion at slot 2 → Task 4.
- Floor generator: 3 combat + 1 boss, deterministic, unique ids, scale propagation → Task 5.
- Test plan from spec → fully covered across Tasks 2–5.

Gap: none.

**Placeholder scan:** no TBDs, no "similar to Task N," no "implement later." Every code step shows full code; every test step shows full test code.

**Type consistency:** cross-checked — `DungeonId`, `DungeonDef`, `Node`, `Encounter`, `ScaleFactors`, `EnemyPlacement`, `NodeType` all defined once in Task 1 and referenced consistently in later tasks. Function signatures (`floorScale`, `composeCombatEncounter`, `composeBossEncounter`, `generateFloor`) match between their test callsites and implementation.
