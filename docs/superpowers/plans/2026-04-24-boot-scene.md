# Boot Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the production entry point — `BootScene` resolves save state and transitions to a `CampScene` stub via the `AppState` singleton; `MainScene` and `ExplorerScene` stay registered as dev scenes reachable from the camp stub.

**Architecture:** Pure-TS layer first (`AppState`, `resolveSaveState`), then Phaser scenes that glue them together. Pure-TS modules get unit tests; scene classes are smoke-tested in the dev server.

**Tech Stack:** TypeScript 6.0, Vitest 4.1, Phaser 4.0. First Cluster B task with phaser imports.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* No commit steps.

**Source spec:** [`docs/superpowers/specs/2026-04-24-boot-scene-design.md`](../specs/2026-04-24-boot-scene-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/save/boot.ts` | Create | `resolveSaveState(storage, rng)`. |
| `src/save/__tests__/boot.test.ts` | Create | resolveSaveState behavior. |
| `src/scenes/app_state.ts` | Create | `AppState` singleton. |
| `src/scenes/__tests__/app_state.test.ts` | Create | init / get / update / reset / auto-save. |
| `src/scenes/boot_scene.ts` | Create | Phaser scene: preload + resolve + init + transition. |
| `src/scenes/camp_scene.ts` | Create | Phaser scene stub (replaced in task 12). |
| `src/main.ts` | Modify | Register BootScene first; keep dev scenes. |

---

## Task 1: `AppState` singleton + tests

**Files:**
- Create: `src/scenes/app_state.ts`
- Create: `src/scenes/__tests__/app_state.test.ts`

Pure TS. No phaser. TDD-able in isolation.

- [ ] **Step 1: Create `src/scenes/app_state.ts`**

```ts
import { save, type SaveFile } from '../save/save';

class AppState {
  private current: SaveFile | null = null;
  private storage: Storage | null = null;

  init(saveFile: SaveFile, storage: Storage): void {
    this.current = saveFile;
    this.storage = storage;
  }

  get(): SaveFile {
    if (!this.current) {
      throw new Error('AppState not initialized — boot scene must call init() first');
    }
    return this.current;
  }

  update(producer: (current: SaveFile) => SaveFile): void {
    if (!this.current || !this.storage) {
      throw new Error('AppState not initialized');
    }
    const next = producer(this.current);
    this.current = next;
    save(next, this.storage);
  }

  reset(): void {
    this.current = null;
    this.storage = null;
  }
}

export const appState = new AppState();
```

- [ ] **Step 2: Create `src/scenes/__tests__/app_state.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoster } from '../../camp/roster';
import { createVault, credit } from '../../camp/vault';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  createDefaultUnlocks,
  type SaveFile,
} from '../../save/save';
import { appState } from '../app_state';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

function makeBaseSave(): SaveFile {
  return {
    version: CURRENT_SCHEMA_VERSION,
    roster: createRoster(),
    vault: createVault(),
    unlocks: createDefaultUnlocks(),
  };
}

beforeEach(() => {
  appState.reset();
});

describe('AppState', () => {
  it('throws on get() before init', () => {
    expect(() => appState.get()).toThrow();
  });

  it('throws on update() before init', () => {
    expect(() => appState.update((s) => s)).toThrow();
  });

  it('init followed by get returns the saveFile', () => {
    const storage = new MemoryStorage();
    const sf = makeBaseSave();
    appState.init(sf, storage);
    expect(appState.get()).toBe(sf);
  });

  it('update applies the producer and persists', () => {
    const storage = new MemoryStorage();
    appState.init(makeBaseSave(), storage);
    appState.update((s) => ({ ...s, vault: credit(s.vault, 100) }));
    expect(appState.get().vault.gold).toBe(100);
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('multiple updates accumulate', () => {
    const storage = new MemoryStorage();
    appState.init(makeBaseSave(), storage);
    appState.update((s) => ({ ...s, vault: credit(s.vault, 50) }));
    appState.update((s) => ({ ...s, vault: credit(s.vault, 75) }));
    expect(appState.get().vault.gold).toBe(125);
  });

  it('persisted save reflects the current state', () => {
    const storage = new MemoryStorage();
    appState.init(makeBaseSave(), storage);
    appState.update((s) => ({ ...s, vault: credit(s.vault, 200) }));
    const stored = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(stored.vault.gold).toBe(200);
  });

  it('reset clears state — get throws afterward', () => {
    appState.init(makeBaseSave(), new MemoryStorage());
    appState.reset();
    expect(() => appState.get()).toThrow();
  });
});
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npx vitest run src/scenes/__tests__/app_state.test.ts`
Expected: 7 passing.

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 2: `resolveSaveState` + tests

**Files:**
- Create: `src/save/boot.ts`
- Create: `src/save/__tests__/boot.test.ts`

Pure TS. No phaser.

- [ ] **Step 1: Create `src/save/boot.ts`**

```ts
import { addHero, createRoster } from '../camp/roster';
import { createVault } from '../camp/vault';
import { generateStarterRoster } from '../camp/buildings/tavern';
import type { Rng } from '../util/rng';
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultUnlocks,
  load,
  save,
  type SaveFile,
} from './save';

export function resolveSaveState(
  storage: Storage,
  rng: Rng,
): { saveFile: SaveFile; isNew: boolean } {
  const existing = load(storage);
  if (existing) {
    return { saveFile: existing, isNew: false };
  }
  const fresh = createFreshSave(rng);
  save(fresh, storage);
  return { saveFile: fresh, isNew: true };
}

function createFreshSave(rng: Rng): SaveFile {
  const heroes = generateStarterRoster(rng);
  let roster = createRoster();
  for (const hero of heroes) {
    roster = addHero(roster, hero);
  }
  return {
    version: CURRENT_SCHEMA_VERSION,
    roster,
    vault: createVault(),
    unlocks: createDefaultUnlocks(),
  };
}
```

- [ ] **Step 2: Create `src/save/__tests__/boot.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createRoster } from '../../camp/roster';
import { createVault, credit } from '../../camp/vault';
import { createRng } from '../../util/rng';
import { resolveSaveState } from '../boot';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  createDefaultUnlocks,
  save,
  type SaveFile,
} from '../save';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

describe('resolveSaveState', () => {
  it('returns the existing save when one is present', () => {
    const storage = new MemoryStorage();
    const original: SaveFile = {
      version: CURRENT_SCHEMA_VERSION,
      roster: createRoster(),
      vault: credit(createVault(), 200),
      unlocks: createDefaultUnlocks(),
    };
    save(original, storage);

    const { saveFile, isNew } = resolveSaveState(storage, createRng(1));
    expect(isNew).toBe(false);
    expect(saveFile).toEqual(original);
  });

  it('creates a fresh save when storage is empty', () => {
    const storage = new MemoryStorage();
    const { saveFile, isNew } = resolveSaveState(storage, createRng(42));
    expect(isNew).toBe(true);
    expect(saveFile.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(saveFile.roster.heroes).toHaveLength(3);
    expect(saveFile.vault).toEqual({ gold: 0 });
    expect(saveFile.unlocks).toEqual(createDefaultUnlocks());
    expect(saveFile.runState).toBeUndefined();
  });

  it('persists the fresh save to storage', () => {
    const storage = new MemoryStorage();
    resolveSaveState(storage, createRng(42));
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('starter roster has one hero of each Tier 1 class', () => {
    const storage = new MemoryStorage();
    const { saveFile } = resolveSaveState(storage, createRng(7));
    const classIds = saveFile.roster.heroes.map((h) => h.classId).sort();
    expect(classIds).toEqual(['archer', 'knight', 'priest']);
  });

  it('treats corrupt storage as fresh save', () => {
    const storage = new MemoryStorage();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(STORAGE_KEY, 'not valid json');
    const { saveFile, isNew } = resolveSaveState(storage, createRng(1));
    expect(isNew).toBe(true);
    expect(saveFile.roster.heroes).toHaveLength(3);
    warnSpy.mockRestore();
  });

  it('is deterministic for the same seed', () => {
    const a = resolveSaveState(new MemoryStorage(), createRng(99));
    const b = resolveSaveState(new MemoryStorage(), createRng(99));
    expect(a.saveFile).toEqual(b.saveFile);
  });
});
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npx vitest run src/save/__tests__/boot.test.ts`
Expected: 6 passing.

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 3: BootScene + CampScene + main.ts

**Files:**
- Create: `src/scenes/boot_scene.ts`
- Create: `src/scenes/camp_scene.ts`
- Modify: `src/main.ts`

Phaser-touching code. No unit tests for scene classes; smoke-tested in the dev server.

- [ ] **Step 1: Create `src/scenes/boot_scene.ts`**

```ts
import * as Phaser from 'phaser';
import { resolveSaveState } from '../save/boot';
import { SHEET } from '../render/frames';
import { createRng } from '../util/rng';
import { appState } from './app_state';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.spritesheet(SHEET.key, SHEET.url, {
      frameWidth: SHEET.frameWidth,
      frameHeight: SHEET.frameHeight,
      margin: SHEET.margin,
      spacing: SHEET.spacing,
    });
  }

  create(): void {
    const rng = createRng(Date.now());
    const { saveFile } = resolveSaveState(window.localStorage, rng);
    appState.init(saveFile, window.localStorage);
    this.scene.start('camp');
  }
}
```

- [ ] **Step 2: Create `src/scenes/camp_scene.ts`**

```ts
import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { balance } from '../camp/vault';
import { appState } from './app_state';

export class CampScene extends Phaser.Scene {
  constructor() {
    super('camp');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const state = appState.get();
    const heroCount = listHeroes(state.roster).length;
    const gold = balance(state.vault);

    this.add
      .text(cx, cy - 60, 'Camp (stub)', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy, `Heroes: ${heroCount}   Gold: ${gold}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 60, 'Press 1 for Paperdoll Demo · 2 for Sprite Explorer', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#666666',
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-ONE', () => this.scene.start('main'));
    this.input.keyboard?.on('keydown-TWO', () => this.scene.start('explorer'));
  }
}
```

- [ ] **Step 3: Modify `src/main.ts`**

Replace the entire file with:

```ts
import * as Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/boot_scene';
import { CampScene } from './scenes/camp_scene';
import { ExplorerScene } from './scenes/dev/explorer_scene';
import { MainScene } from './scenes/dev/main_scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, CampScene, MainScene, ExplorerScene],
});
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: build succeeds. Pre-existing phaser chunk-size warning unrelated.

---

## Task 4: Full-suite verification + smoke test

**Files:** none changed.

- [ ] **Step 1: Run full Vitest suite**

Run: `npm test`
Expected: all passing. Baseline 464; this task adds +13 (7 AppState + 6 resolveSaveState).

- [ ] **Step 2: Smoke test in dev server**

Run: `npm run dev`

In the browser at `http://localhost:5173`:
- Open DevTools → Application → Local Storage → `http://localhost:5173`. Confirm `pixel-battle-game/save` key does NOT exist (or delete it if it does from prior testing).
- Reload the page.
- Expected: "Camp (stub)" text + "Heroes: 3   Gold: 0" + "Press 1 for Paperdoll Demo · 2 for Sprite Explorer".
- Verify Local Storage now contains `pixel-battle-game/save` with a valid JSON SaveFile (3 heroes, vault.gold = 0).
- Reload again. Expected: same heroes (verify by checking class ids of heroes in stored JSON match between reloads). The starter roster persists.
- Press `1`. Expected: Paperdoll Demo (MainScene) renders.
- Refresh, return to camp. Press `2`. Expected: Sprite Explorer (ExplorerScene) renders.
- Stop the dev server (Ctrl+C).

- [ ] **Step 3: Hand off to user**

Summarize:
- Files created: 4 new (boot.ts, app_state.ts, boot_scene.ts, camp_scene.ts) + 2 test files.
- Files modified: 1 (main.ts).
- Test count added vs. baseline.
- **First Cluster B task complete.** Cluster A's pure-TS modules now have a runtime entry point.
- Offer to migrate TODO.md task 10 → HISTORY.md.

---

## Self-review

**Spec coverage:**

- `resolveSaveState` (pure function, load-or-create, persists fresh save) → Task 2.
- `AppState` singleton (init / get / update / reset / auto-save) → Task 1.
- `BootScene` (preload spritesheet, resolve, init, transition) → Task 3 Step 1.
- `CampScene` stub (status display + dev shortcut keys) → Task 3 Step 2.
- `main.ts` registers BootScene first → Task 3 Step 3.
- Dev scenes stay registered, no longer auto-start → Task 3 Step 3 (BootScene is index 0).
- All tests from spec → Tasks 1 and 2.
- Smoke test for scenes → Task 4 Step 2.

Gap: none.

**Placeholder scan:** no TBDs, no "similar to Task N." Every code step shows full code.

**Type consistency:** `SaveFile`, `Storage`, `appState`, `resolveSaveState` consistent across files. `BootScene` uses `'boot'` key; `CampScene` uses `'camp'`; transition target keys match.

**Interface-extension audit (lesson from tasks 8–9):** This task adds new types (`AppState` class, `BootScene`, `CampScene` classes) but does **not** modify any existing interfaces or function signatures. `Rng`, `SaveFile`, `Storage` are all consumed without modification. No grep needed for callers/implementations of changed types — there are none.
