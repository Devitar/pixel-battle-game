# Save / Load via localStorage (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 9

## Purpose

Persistence layer for the player's progress. Serializes `Roster + Vault + Unlocks + RunState (mid-run) + run RNG state` to localStorage; loads on boot; treats missing/corrupt saves as a fresh-game trigger. Includes a versioned schema with a migration framework that's empty at Tier 1 but ready for Tier 2+ field additions.

This is the last Cluster A task. Every immutable type built across tasks 1–8 gets a persistence contract validated here.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `Roster` (task 7), `Vault` (task 7), `Hero` (task 6), `RunState` (task 6), `Rng` (task 1), `ClassId`, `DungeonId` (tasks 2, 5).

**New invariants this spec declares:**
- **Mid-run save is supported.** `SaveFile.runState?` and `SaveFile.runRngState?` are both present or both absent — pairing invariant enforced at write time and recovered at read time.
- **`Storage` is dependency-injected.** All public functions take `storage: Storage` as a parameter. Production passes `window.localStorage`; tests pass an in-memory shim. No module-level state.
- **Load never throws.** Missing key → `null`. Corrupt JSON → `null + console.warn`. Shape mismatch → `null + warn`. Future version → `null + warn`. Pairing violation in stored data → drop the run, keep the rest. Crash-free guarantee for the boot path.
- **Save throws on caller programming errors.** `save()` throws if `runState`/`runRngState` pairing is violated by the caller — surface bugs at write time rather than corrupt the persistence.
- **RNG state is part of the persistence surface.** `Rng` interface gains `getState(): number`; `createRngFromState(state)` resumes a paused run. Round-trip property: `createRngFromState(rng.getState())` produces an RNG that yields the same sequence as `rng` from that point.
- **Migration is keyed by `fromVersion`.** Each entry produces a save file at `version + 1`. Chain runs until `CURRENT_SCHEMA_VERSION` is reached. Empty registry in Tier 1.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `Unlocks` interface. |
| `src/util/rng.ts` | Modify | Add `getState()` to `Rng` interface; add `createRngFromState`. Refactor to share `createRngInternal`. |
| `src/save/save.ts` | Create | `SaveFile` type, constants (`CURRENT_SCHEMA_VERSION`, `STORAGE_KEY`), `save`, `load`, `clearSave`, `createDefaultUnlocks`. |
| `src/save/migration.ts` | Create | `MIGRATIONS` registry (empty in Tier 1), `migrate` runner. |
| `src/util/__tests__/rng.test.ts` | Modify | `getState` + `createRngFromState` tests. |
| `src/save/__tests__/save.test.ts` | Create | Roundtrip, pairing, missing/corrupt/future, clearSave, default unlocks. |
| `src/save/__tests__/migration.test.ts` | Create | Empty-registry behavior, non-object input, version handling. |

**Import boundary:** `src/save/` imports from `src/data/`, `src/camp/`, `src/run/`, `src/heroes/`. First module that depends on essentially every persistence-relevant domain. `src/util/rng.ts` adds no imports. No phaser anywhere.

## Types

### `Unlocks` (`src/data/types.ts`)

```ts
export interface Unlocks {
  classes: readonly ClassId[];
  dungeons: readonly DungeonId[];
}
```

Tier 1 default: `{ classes: ['knight', 'archer', 'priest'], dungeons: ['crypt'] }`. Tier 2+ extensions (Paladin, Sunken Keep, Hospital building, etc.) append to these arrays via schema migrations.

### `SaveFile` (`src/save/save.ts`)

```ts
export const CURRENT_SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'pixel-battle-game/save';

export interface SaveFile {
  version: number;
  roster: Roster;
  vault: Vault;
  unlocks: Unlocks;
  runState?: RunState;
  runRngState?: number;
}
```

- Single localStorage key (`pixel-battle-game/save`) holds the whole JSON blob. Atomic save/load.
- `runState` and `runRngState` are paired — either both present or both absent. The scene that drives a run captures `rng.getState()` alongside `runState` when serializing.
- All fields are JSON-safe plain records. No Maps, Dates, Symbols, or class instances.

## RNG state extensions (`src/util/rng.ts`)

```ts
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(array: readonly T[]): T;
  shuffle<T>(array: readonly T[]): T[];
  weighted<T>(options: readonly WeightedOption<T>[]): T;
  getState(): number;
}

export function createRng(seed: number): Rng;
export function createRngFromState(state: number): Rng;
```

Implementation: refactor the existing `createRng` to share an internal helper `createRngInternal(initialState)`. `createRng(seed)` calls it with `seed >>> 0`; `createRngFromState(state)` calls it with `state >>> 0`. The `getState()` closure-getter exposes the current internal state.

```ts
function createRngInternal(initialState: number): Rng {
  let state = initialState >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    pick<T>(array) { /* unchanged */ },
    shuffle<T>(array) { /* unchanged */ },
    weighted<T>(options) { /* unchanged */ },
    getState() { return state; },
  };
}

export function createRng(seed: number): Rng { return createRngInternal(seed); }
export function createRngFromState(state: number): Rng { return createRngInternal(state); }
```

`>>> 0` normalizes any number to a 32-bit unsigned int. mulberry32 always operates on `Uint32`. The save format stores the state as a regular `number` (JSON-safe); coerced back on load.

## Public functions

```ts
export function save(data: SaveFile, storage: Storage): void;
export function load(storage: Storage): SaveFile | null;
export function clearSave(storage: Storage): void;
export function createDefaultUnlocks(): Unlocks;
```

### `save`

```ts
export function save(data: SaveFile, storage: Storage): void {
  if ((data.runState === undefined) !== (data.runRngState === undefined)) {
    throw new Error('save: runState and runRngState must both be present or both absent');
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
```

Validates the pairing invariant at the API boundary. Throws on caller programming errors so they surface immediately.

### `load`

```ts
export function load(storage: Storage): SaveFile | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('load: corrupt save (JSON parse failed)', e);
    return null;
  }

  if (!isPlausibleRawSave(parsed)) {
    console.warn('load: corrupt save (shape mismatch)');
    return null;
  }

  const versioned = parsed as { version: number };
  if (versioned.version > CURRENT_SCHEMA_VERSION) {
    console.warn(
      `load: save version ${versioned.version} is newer than supported ${CURRENT_SCHEMA_VERSION}`,
    );
    return null;
  }

  let migrated: SaveFile | null;
  try {
    migrated = migrate(parsed);
  } catch (e) {
    console.warn('load: migration failed', e);
    return null;
  }
  if (!migrated) return null;

  if ((migrated.runState === undefined) !== (migrated.runRngState === undefined)) {
    console.warn('load: runState/runRngState pairing invariant violated; discarding run');
    return { ...migrated, runState: undefined, runRngState: undefined };
  }

  return migrated;
}

function isPlausibleRawSave(parsed: unknown): parsed is { version: number } {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const v = (parsed as Record<string, unknown>).version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 1;
}
```

Recovery hierarchy — least to most destructive:
1. **Pairing violation in stored data:** drop the run, keep the rest. Player loses an in-progress run but keeps roster/vault/unlocks.
2. **Migration failure / shape mismatch / future version / corrupt JSON:** return `null`. Caller (boot scene) creates a new game.
3. **Missing key:** return `null`. Same caller path; never an error condition.

### `clearSave`

```ts
export function clearSave(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}
```

For "discard save" UX in Tier 2+ and for test cleanup.

### `createDefaultUnlocks`

```ts
export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest'],
    dungeons: ['crypt'],
  };
}
```

Constructor for Tier 1 default unlocks. Boot scene (task 10) calls this when creating a fresh save.

## Migration framework (`src/save/migration.ts`)

```ts
import { CURRENT_SCHEMA_VERSION, type SaveFile } from './save';

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, MigrationFn> = {
  // Tier 1: empty.
  // Future example: { 1: (raw) => ({ ...raw, version: 2, stash: { items: [] } }) }
};

export function migrate(raw: unknown): SaveFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let cur = raw as Record<string, unknown>;
  let version = cur.version as number;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) return null;
    cur = migration(cur);
    version = cur.version as number;
  }

  if (version !== CURRENT_SCHEMA_VERSION) return null;
  return cur as unknown as SaveFile;
}
```

- **Migrations keyed by `fromVersion`.** Each entry produces a save file at `version + 1`.
- **Missing migration step → null.** Treated as corrupt by the caller.
- **No final-shape validation.** Trust the migration chain. Adding a runtime validator at the end would duplicate the responsibility.
- **Tier 1 path:** loading a v1 save runs zero migrations, returns the input cast to `SaveFile`. Loading a v0 save (hypothetical) returns null because `MIGRATIONS[0]` doesn't exist.

## Tests

### `src/util/__tests__/rng.test.ts` — additions

- `getState()` returns a finite number.
- After `createRng(42).next()`, `getState()` returns the post-next state (different from initial).
- **Round-trip property:** advance an RNG N times, capture state, build a new RNG from that state — both produce identical sequences from that point.
- Two RNGs created from the same state produce identical sequences.

### `src/save/__tests__/save.test.ts`

- **Roundtrip — no run:** save → load → equal to original.
- **Roundtrip — with run:** runState + runRngState preserved.
- **Save throws if runState present without runRngState** (and vice versa).
- **load returns null when no save exists.**
- **load returns null + warns on corrupt JSON.**
- **load returns null + warns on shape mismatch (missing version).**
- **load returns null + warns on future version (`version > CURRENT_SCHEMA_VERSION`).**
- **load drops the run on pairing invariant violation in stored data, keeps roster/vault/unlocks, warns.**
- **clearSave removes the key.**
- **createDefaultUnlocks** returns exactly the three Tier 1 classes and Crypt.

Tests use an in-memory `MemoryStorage` class implementing `Storage` (Map-backed, ~20 lines).

### `src/save/__tests__/migration.test.ts`

- Returns input unchanged when `version === CURRENT_SCHEMA_VERSION`.
- Returns null when no migration exists for an older version (Tier 1 has none).
- Returns null on non-object input (`null`, string, number).

## Risks and follow-ups

- **Mid-run save is now a contract.** Any change to `RunState`'s shape (additions, renames) needs a save migration. Worth flagging in future task plans that touch the type.
- **No save file size budget.** A roster of 12 heroes + a mid-run state with 4 floor-nodes is well under 4KB; localStorage's typical 5MB limit is comfortable. If gear introduces blob-like metadata, monitor.
- **Cross-tab sync.** Two tabs of the game share localStorage. Saving in tab A doesn't reflect in tab B until tab B explicitly reloads. Tier 2 may add a `storage` event listener; out of scope here.
- **No encryption / signing.** Players can edit `localStorage` to give themselves max-level heroes and unlimited gold. Acceptable for a single-player game without leaderboards.
- **`createDefaultUnlocks` lives in `save.ts` rather than `data/`.** Could argue for either location. Putting it next to `SaveFile` keeps "what's in a fresh save" co-located. If the default needs to be tunable from data, move it later.
- **Migration framework is untested with real migrations.** Tier 2's first schema bump will exercise the chain end-to-end. The Tier 1 tests confirm the framework structure works (forward-version rejection, missing-migration-null, etc.) but don't validate a migration's data correctness.
- **`storage` parameter is a thin abstraction.** `Storage` is the standard browser type. Memory shim + `window.localStorage` are the only two implementations Tier 1 needs. Tier 3 might add IndexedDB for larger blobs, at which point this abstraction becomes a custom interface rather than the browser `Storage`.
