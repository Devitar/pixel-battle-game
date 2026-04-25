# Roster & Vault (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 7

## Purpose

The persistent camp state: a `Roster` holding up to 12 heroes (Barracks L1) and a `Vault` accumulating banked gold. Both survive between runs. Consumed by recruitment (task 8), the Barracks UI (task 14), and the Leave transition in the camp-screen scene (task 18) — which banks the run's pack gold into the vault and writes returning heroes back with their end-of-run HP.

Scope: two pure-data modules with primitive ops. Run-outcome application (cashout / wipe) is composed by the scene layer, not baked into these modules.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `Hero` (task 6). Identity + class + current HP, carried across runs in the roster.

**Invariants this spec declares:**
- `Roster` and `Vault` are immutable. Every operation returns a new value.
- `Roster.capacity` is stored on the struct (not a global constant), letting Tier 2 Barracks upgrades raise it to 16 / 20 with a mutation of the field rather than a code change.
- All invariant violations throw: cap exceeded, duplicate id, missing id, negative amount, insufficient funds. Callers that want graceful error paths pre-check via predicates (`canAdd`, `balance`).
- Ids are globally unique per hero (enforced at recruitment in task 8). `addHero` throws on duplicates; `updateHero` and `removeHero` throw on missing.
- Run-outcome application lives at the caller. This task's modules expose primitives; task 18's camp-screen scene composes them for cashout and wipe.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/camp/roster.ts` | Create | `Roster` type + 7 ops (`createRoster`, `addHero`, `removeHero`, `updateHero`, `getHero`, `listHeroes`, `canAdd`). `DEFAULT_ROSTER_CAPACITY` constant (12). |
| `src/camp/vault.ts` | Create | `Vault` type + 4 ops (`createVault`, `credit`, `spend`, `balance`). |
| `src/camp/__tests__/roster.test.ts` | Create | Cap, dedupe, preservation-of-order, invariants. |
| `src/camp/__tests__/vault.test.ts` | Create | Credit, spend, invariants, chainability. |

**Import boundary:** `src/camp/` imports from `src/heroes/` (for `Hero`). No phaser, no combat, no run state, no util. First leaf domain since the pure data modules in `src/data/`.

## Types

### `Roster`

```ts
import type { Hero } from '../heroes/hero';

export const DEFAULT_ROSTER_CAPACITY = 12;

export interface Roster {
  readonly heroes: readonly Hero[];
  readonly capacity: number;
}
```

- `heroes` preserves insertion order. UI layers (Barracks list) render in this order.
- `capacity` is mutable (via immutable update) for Tier 2 Barracks upgrades.
- Starter roster is created by task 10 (boot scene) with `capacity = DEFAULT_ROSTER_CAPACITY` and 3 preset heroes (one of each class).

### `Vault`

```ts
export interface Vault {
  readonly gold: number;
}
```

- Mirrors `Pack` structurally. Different types because the game's language distinguishes "pack = at-risk, during run" from "vault = safe, at camp," and a shared `Wallet` type would lose that signal at call sites.

## Operations

### Roster (`src/camp/roster.ts`)

```ts
export function createRoster(capacity?: number): Roster;
export function addHero(roster: Roster, hero: Hero): Roster;
export function removeHero(roster: Roster, heroId: string): Roster;
export function updateHero(roster: Roster, hero: Hero): Roster;
export function getHero(roster: Roster, heroId: string): Hero | undefined;
export function listHeroes(roster: Roster): readonly Hero[];
export function canAdd(roster: Roster): boolean;
```

Full bodies:

```ts
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

- **`updateHero` preserves insertion order** — the hero keeps their array index. Matters for UI list rendering (Barracks).
- **`canAdd` is a predicate, not error-wrapper.** UI (Tavern hire button in task 13) uses it to disable the hire action pre-click. `addHero` still throws on violation; `canAdd` is a user-friendly pre-check.
- **`listHeroes` returns the internal `readonly` array** — no defensive copy. Consumers that iterate don't pay an allocation; TypeScript prevents mutation through the returned reference.

### Vault (`src/camp/vault.ts`)

```ts
export function createVault(): Vault;
export function credit(vault: Vault, amount: number): Vault;
export function spend(vault: Vault, amount: number): Vault;
export function balance(vault: Vault): number;
```

Full bodies:

```ts
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

- **`spend` is the only way balance decreases.** No `emptyVault` or `zeroVault`; a Tier 2 feature that drains the vault (e.g., catastrophic event) would add that operation explicitly.
- **Naming parallels `pack.ts` but diverges where the game's language does.** Pack: `addGold` / `totalGold` / `emptyPack`. Vault: `credit` / `spend` / `balance`. Different verbs because the two concepts are distinct in the GDD's vocabulary; a generic `Wallet` shared between them would obscure the "pack is at risk, vault is safe" signal.

## Tests

### `src/camp/__tests__/roster.test.ts`

- `createRoster()` defaults capacity to 12, heroes empty.
- `createRoster(16)` accepts custom capacity.
- `createRoster(0)` / `createRoster(-5)` throw.
- `addHero` appends, returns new roster, doesn't mutate original.
- `addHero` at capacity throws.
- `addHero` with duplicate id throws.
- `removeHero` removes matching hero; original unchanged.
- `removeHero` on missing id throws.
- `updateHero` replaces by id, preserves array index.
- `updateHero` on missing id throws.
- `getHero` returns hero when present; undefined when missing.
- `listHeroes` returns the heroes array.
- `canAdd`: true under capacity, false at capacity.

### `src/camp/__tests__/vault.test.ts`

- `createVault` starts empty.
- `balance` returns gold field.
- `credit` adds gold, returns new vault.
- `credit` throws on negative.
- `spend` deducts gold.
- `spend` throws on negative.
- `spend` throws on insufficient funds.
- `spend` of exact balance drains to zero.
- Credit/spend are chainable (immutability regression).

## Risks and follow-ups

- **Capacity upgrade is a one-field mutation.** Tier 2's Barracks upgrades call `{ ...roster, capacity: newCapacity }`. No new op needed, but the upgrade logic lives in Tier 2's camp-building logic module.
- **No `Stash` for gear.** GDD §6 mentions a Stash for banked unequipped gear at camp. Tier 2 scope; out of this task.
- **No HP-reset-on-camp.** GDD says "heals only at camp nodes or via items" — Tier 1 has neither. Heroes stored in the roster retain their end-of-run HP indefinitely (task 9's save format will capture this). Tier 2 adds Hospital (heals wounds) and Camp node (heals HP mid-run).
- **Run-outcome application (cashout/wipe) is caller territory.** The camp-screen scene (task 18) does the composition: `updateHero` for each returning hero with new HP, `removeHero` for each fallen hero, `credit(vault, outcome.goldBanked)`. This task stays ignorant of run outcomes.
- **Serialization is task 9's concern.** `Roster` and `Vault` are JSON-safe plain records; task 9 can serialize directly with `JSON.stringify`.
- **No ordering guarantees under `removeHero` + `addHero` re-pattern.** Callers that want to maintain a specific order (e.g., alphabetical by name) handle it at the UI layer.
