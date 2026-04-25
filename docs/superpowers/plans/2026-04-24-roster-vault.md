# Roster & Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent camp state: `Roster` (12-hero cap with add/remove/update/get/list/canAdd) and `Vault` (gold accumulator with credit/spend/balance). Both immutable, both pure data modules.

**Architecture:** Two independent files under `src/camp/`. No cross-dependencies between them. Roster imports `Hero` from `src/heroes/`. Vault has no imports. Both expose primitives; run-outcome application is composed at the caller.

**Tech Stack:** TypeScript 6.0, Vitest 4.1. No phaser.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* No commit steps.

**Source spec:** [`docs/superpowers/specs/2026-04-24-roster-vault-design.md`](../specs/2026-04-24-roster-vault-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/camp/roster.ts` | Create | `Roster` type + 7 ops + `DEFAULT_ROSTER_CAPACITY`. |
| `src/camp/vault.ts` | Create | `Vault` type + 4 ops. |
| `src/camp/__tests__/roster.test.ts` | Create | |
| `src/camp/__tests__/vault.test.ts` | Create | |

---

## Task 1: Roster + tests

**Files:**
- Create: `src/camp/roster.ts`
- Create: `src/camp/__tests__/roster.test.ts`

TDD cycle.

- [ ] **Step 1: Create `src/camp/__tests__/roster.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createHero } from '../../heroes/hero';
import {
  addHero,
  canAdd,
  createRoster,
  DEFAULT_ROSTER_CAPACITY,
  getHero,
  listHeroes,
  removeHero,
  updateHero,
} from '../roster';

describe('createRoster', () => {
  it('defaults capacity to 12', () => {
    const r = createRoster();
    expect(r.capacity).toBe(DEFAULT_ROSTER_CAPACITY);
    expect(r.heroes).toEqual([]);
  });

  it('accepts a custom capacity', () => {
    const r = createRoster(16);
    expect(r.capacity).toBe(16);
  });

  it('throws on non-positive capacity', () => {
    expect(() => createRoster(0)).toThrow();
    expect(() => createRoster(-5)).toThrow();
  });
});

describe('addHero', () => {
  it('appends to heroes and returns a new roster', () => {
    const r = createRoster();
    const h = createHero('knight', 'Eira', 'h1');
    const r2 = addHero(r, h);
    expect(r2.heroes).toEqual([h]);
    expect(r.heroes).toEqual([]);
  });

  it('throws at capacity', () => {
    let r = createRoster(2);
    r = addHero(r, createHero('knight', 'A', 'h1'));
    r = addHero(r, createHero('archer', 'B', 'h2'));
    expect(() => addHero(r, createHero('priest', 'C', 'h3'))).toThrow();
  });

  it('throws on duplicate id', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1'));
    expect(() => addHero(r, createHero('archer', 'B', 'h1'))).toThrow();
  });
});

describe('removeHero', () => {
  it('removes the matching hero and returns a new roster', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1'));
    r = addHero(r, createHero('archer', 'B', 'h2'));
    const r2 = removeHero(r, 'h1');
    expect(r2.heroes.map((h) => h.id)).toEqual(['h2']);
    expect(r.heroes.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  it('throws on missing id', () => {
    const r = createRoster();
    expect(() => removeHero(r, 'missing')).toThrow();
  });
});

describe('updateHero', () => {
  it('replaces by id, preserving array index', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1'));
    r = addHero(r, createHero('archer', 'B', 'h2'));
    const wounded = { ...r.heroes[0], currentHp: 5 };
    const r2 = updateHero(r, wounded);
    expect(r2.heroes[0].currentHp).toBe(5);
    expect(r2.heroes[0].id).toBe('h1');
    expect(r2.heroes[1].id).toBe('h2');
  });

  it('throws on missing id', () => {
    const r = createRoster();
    expect(() => updateHero(r, createHero('knight', 'A', 'h1'))).toThrow();
  });
});

describe('getHero', () => {
  it('returns the hero when present', () => {
    const r = addHero(createRoster(), createHero('knight', 'A', 'h1'));
    expect(getHero(r, 'h1')?.name).toBe('A');
  });

  it('returns undefined when missing', () => {
    expect(getHero(createRoster(), 'missing')).toBeUndefined();
  });
});

describe('listHeroes', () => {
  it('returns the heroes array', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1'));
    expect(listHeroes(r)).toHaveLength(1);
  });
});

describe('canAdd', () => {
  it('true under capacity', () => {
    expect(canAdd(createRoster(3))).toBe(true);
  });

  it('false at capacity', () => {
    let r = createRoster(1);
    r = addHero(r, createHero('knight', 'A', 'h1'));
    expect(canAdd(r)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect RED**

Run: `npx vitest run src/camp/__tests__/roster.test.ts`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Create `src/camp/roster.ts`**

```ts
import type { Hero } from '../heroes/hero';

export const DEFAULT_ROSTER_CAPACITY = 12;

export interface Roster {
  readonly heroes: readonly Hero[];
  readonly capacity: number;
}

export function createRoster(capacity: number = DEFAULT_ROSTER_CAPACITY): Roster {
  if (capacity < 1) {
    throw new Error(`createRoster: capacity must be >= 1, got ${capacity}`);
  }
  return { heroes: [], capacity };
}

export function canAdd(roster: Roster): boolean {
  return roster.heroes.length < roster.capacity;
}

export function addHero(roster: Roster, hero: Hero): Roster {
  if (!canAdd(roster)) {
    throw new Error(`addHero: roster at capacity ${roster.capacity}`);
  }
  if (roster.heroes.some((h) => h.id === hero.id)) {
    throw new Error(`addHero: hero with id '${hero.id}' already in roster`);
  }
  return { ...roster, heroes: [...roster.heroes, hero] };
}

export function removeHero(roster: Roster, heroId: string): Roster {
  const idx = roster.heroes.findIndex((h) => h.id === heroId);
  if (idx === -1) {
    throw new Error(`removeHero: no hero with id '${heroId}'`);
  }
  return {
    ...roster,
    heroes: [...roster.heroes.slice(0, idx), ...roster.heroes.slice(idx + 1)],
  };
}

export function updateHero(roster: Roster, hero: Hero): Roster {
  const idx = roster.heroes.findIndex((h) => h.id === hero.id);
  if (idx === -1) {
    throw new Error(`updateHero: no hero with id '${hero.id}'`);
  }
  const next = [...roster.heroes];
  next[idx] = hero;
  return { ...roster, heroes: next };
}

export function getHero(roster: Roster, heroId: string): Hero | undefined {
  return roster.heroes.find((h) => h.id === heroId);
}

export function listHeroes(roster: Roster): readonly Hero[] {
  return roster.heroes;
}
```

- [ ] **Step 4: Run — expect GREEN**

Run: `npx vitest run src/camp/__tests__/roster.test.ts`
Expected: all tests pass (~13 assertions).

---

## Task 2: Vault + tests

**Files:**
- Create: `src/camp/vault.ts`
- Create: `src/camp/__tests__/vault.test.ts`

- [ ] **Step 1: Create `src/camp/__tests__/vault.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { balance, createVault, credit, spend } from '../vault';

describe('Vault', () => {
  it('createVault starts empty', () => {
    expect(createVault()).toEqual({ gold: 0 });
  });

  it('balance returns the gold field', () => {
    expect(balance({ gold: 42 })).toBe(42);
  });

  it('credit adds gold and returns a new vault', () => {
    const v = createVault();
    const v2 = credit(v, 100);
    expect(v2.gold).toBe(100);
    expect(v.gold).toBe(0);
  });

  it('credit throws on negative', () => {
    expect(() => credit(createVault(), -1)).toThrow();
  });

  it('spend deducts gold', () => {
    const v = credit(createVault(), 50);
    const v2 = spend(v, 20);
    expect(v2.gold).toBe(30);
  });

  it('spend throws on negative', () => {
    const v = credit(createVault(), 50);
    expect(() => spend(v, -1)).toThrow();
  });

  it('spend throws when insufficient', () => {
    const v = credit(createVault(), 10);
    expect(() => spend(v, 15)).toThrow();
  });

  it('spend of exact balance drains to zero', () => {
    const v = credit(createVault(), 25);
    expect(spend(v, 25).gold).toBe(0);
  });

  it('credit and spend are chainable', () => {
    let v = createVault();
    v = credit(v, 100);
    v = spend(v, 30);
    v = credit(v, 50);
    expect(balance(v)).toBe(120);
  });
});
```

- [ ] **Step 2: Run — expect RED**

Run: `npx vitest run src/camp/__tests__/vault.test.ts`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Create `src/camp/vault.ts`**

```ts
export interface Vault {
  readonly gold: number;
}

export function createVault(): Vault {
  return { gold: 0 };
}

export function balance(vault: Vault): number {
  return vault.gold;
}

export function credit(vault: Vault, amount: number): Vault {
  if (amount < 0) {
    throw new Error(`credit: amount must be non-negative, got ${amount}`);
  }
  return { gold: vault.gold + amount };
}

export function spend(vault: Vault, amount: number): Vault {
  if (amount < 0) {
    throw new Error(`spend: amount must be non-negative, got ${amount}`);
  }
  if (amount > vault.gold) {
    throw new Error(`spend: insufficient funds — balance ${vault.gold}, requested ${amount}`);
  }
  return { gold: vault.gold - amount };
}
```

- [ ] **Step 4: Run — expect GREEN**

Run: `npx vitest run src/camp/__tests__/vault.test.ts`
Expected: 9 passing.

---

## Task 3: Full-suite verification

**Files:** none changed.

- [ ] **Step 1: Run full Vitest suite**

Run: `npm test`
Expected: all pass. Previous baseline 360; this task adds ~22 (13 roster + 9 vault).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds. Pre-existing phaser chunk-size warning unrelated.

- [ ] **Step 4: Hand off to user**

Summarize:
- Files created: 2 source + 2 test.
- Test count added vs. baseline.
- Offer to migrate TODO.md task 7 → HISTORY.md.

---

## Self-review

**Spec coverage:**

- `Roster` type with `heroes` + `capacity` → Task 1.
- `DEFAULT_ROSTER_CAPACITY = 12` → Task 1.
- 7 roster ops (`createRoster`, `addHero`, `removeHero`, `updateHero`, `getHero`, `listHeroes`, `canAdd`) → Task 1.
- Throw on cap exceeded / missing id / duplicate id / non-positive capacity → Task 1 tests and impl.
- `Vault` type with `gold` → Task 2.
- 4 vault ops (`createVault`, `credit`, `spend`, `balance`) → Task 2.
- Throw on negative amount / insufficient funds → Task 2 tests and impl.
- Immutability regression — Task 1 (`original unchanged` checks), Task 2 (`chainable` check).

Gap: none.

**Placeholder scan:** no TBDs, no "similar to Task N," no "implement later." Every step has complete code.

**Type consistency:** `Roster`, `Vault`, `DEFAULT_ROSTER_CAPACITY`, and op signatures all match between tests and implementations. `Hero` is imported consistently from `../../heroes/hero` in tests and `../heroes/hero` in `roster.ts`.
