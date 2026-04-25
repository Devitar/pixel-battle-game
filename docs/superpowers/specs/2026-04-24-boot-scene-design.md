# Boot Scene + Asset Preload + Save-Aware Routing (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster B, task 10

## Purpose

First Cluster B task. Land the production entry point: a `BootScene` that preloads the sprite sheet, resolves the save state (load or create-fresh), populates a global `AppState` singleton, and transitions to a `CampScene` stub. Replace `MainScene` as the auto-starting scene; keep `MainScene` and `ExplorerScene` registered as dev-only scenes reachable from the camp stub via keyboard shortcuts.

This is the first phaser-touching task. Cluster A's pure-TS modules get their first runtime consumer.

## Dependencies and invariants

**Vocabulary from Cluster A:**
- `SaveFile`, `save`, `load`, `STORAGE_KEY`, `CURRENT_SCHEMA_VERSION`, `createDefaultUnlocks` (task 9).
- `createRoster`, `addHero`, `Roster` (task 7); `createVault`, `Vault`, `balance`, `credit` (task 7).
- `generateStarterRoster` (task 8).
- `Rng`, `createRng` (task 1, extended task 9).
- `SHEET` (sprite sheet config from `src/render/frames.ts`).

**New invariants this spec declares:**
- **Boot is the auto-start scene.** `main.ts` registers `BootScene` first; Phaser starts the first scene in the array. Dev scenes stay registered (reachable manually) but never auto-start.
- **`AppState` is the application-wide save-state holder.** Singleton with `init` / `get` / `update` / `reset`. Initialized once at boot; mutated via the producer pattern from Cluster A. Auto-saves on every update.
- **`resolveSaveState` is pure TS.** Lives in `src/save/boot.ts`, no phaser. Tests the load-or-create branch without a Phaser game context.
- **`Date.now()` seeds the boot rng.** Only non-deterministic source in startup; only affects fresh-save hero rolls. Once persisted, the saved state is stable across reloads.
- **Phaser scenes themselves are not unit-tested.** `BootScene` is ~30 lines of phaser glue; `CampScene` is throwaway stub content. Both verified by smoke-testing the dev server.
- **`createDefaultUnlocks` from save.ts is used as-is.** No new defaults; the function defined in task 9 is the single source of truth.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/save/boot.ts` | Create | `resolveSaveState(storage, rng): { saveFile, isNew }`. |
| `src/save/__tests__/boot.test.ts` | Create | Pure-function tests for `resolveSaveState`. |
| `src/scenes/app_state.ts` | Create | `AppState` class + exported `appState` singleton. Plain TS (no phaser). |
| `src/scenes/__tests__/app_state.test.ts` | Create | init / get / update / reset / auto-save. |
| `src/scenes/boot_scene.ts` | Create | `BootScene extends Phaser.Scene`. |
| `src/scenes/camp_scene.ts` | Create | `CampScene extends Phaser.Scene`. Stub for task 10; replaced in task 12. |
| `src/main.ts` | Modify | Register `BootScene` first; keep `MainScene` + `ExplorerScene` registered. |

**Import boundary:**

- `src/save/boot.ts` is firewall-pure: imports `src/save/`, `src/camp/`, `src/heroes/` (transitively, via tavern), `src/util/`. No phaser.
- `src/scenes/app_state.ts` imports `src/save/save.ts` only (for `save` and `SaveFile`). No phaser, despite living in `src/scenes/`.
- `src/scenes/boot_scene.ts` imports phaser, `src/save/boot.ts`, `src/util/rng.ts`, `src/render/frames.ts`, `appState` from `app_state.ts`.
- `src/scenes/camp_scene.ts` imports phaser, `src/camp/roster.ts`, `src/camp/vault.ts`, `appState`.
- `src/scenes/dev/main_scene.ts` and `explorer_scene.ts` unchanged.

## `resolveSaveState` (`src/save/boot.ts`)

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

**Behavior:**
- Existing save (`load` returns non-null): return as-is, `isNew: false`.
- No save / corrupt save (`load` returns null): build fresh save, persist immediately, return with `isNew: true`.
- The fresh save is persisted immediately so refreshes after first launch don't re-roll the starter heroes.

**Failure modes:** `load()` already handles missing/corrupt cases gracefully (returns null + warns; never throws). `resolveSaveState` is null-safe and never throws.

**Determinism:** Same seed → same fresh save (provided no existing save in storage). Tested directly.

## `AppState` (`src/scenes/app_state.ts`)

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

  /** Test-only: clears initialization. Production never calls this. */
  reset(): void {
    this.current = null;
    this.storage = null;
  }
}

export const appState = new AppState();
```

**Producer pattern:** `update(prev => ({ ...prev, vault: credit(prev.vault, 100) }))` — matches Cluster A's immutable-update style. The producer returns the new SaveFile; `AppState` handles assignment + persistence.

**Auto-save:** every `update` call persists to localStorage. No "remember to save" rule. localStorage writes are fast (synchronous, <1ms); no batching needed at Tier 1 scale.

**Throws on uninitialized access:** any scene that reads AppState before boot has populated it gets a loud error. Boot scene calls `init` in `create()` before `scene.start('camp')`, so by the time any other scene's `create()` runs, AppState is populated.

**`reset()` is test-only.** Vitest's `beforeEach` calls it for isolation. Production code never reaches for it.

**Singleton.** Phaser instantiates scenes via Phaser.AUTO; scenes can't take constructor args. A singleton is the practical mechanism for cross-scene state. Tests share the singleton across files but `reset()` between tests gives effective isolation.

**No event emitter.** A reactive AppState (subscribe/notify) would let UI widgets re-render on change. Not in Tier 1; scenes that need fresh state call `appState.get()` at the relevant lifecycle hook. Tier 2 may add events when reactive UI components arrive.

## `BootScene` (`src/scenes/boot_scene.ts`)

```ts
import * as Phaser from 'phaser';
import { resolveSaveState } from '../save/boot';
import { createRng } from '../util/rng';
import { SHEET } from '../render/frames';
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

- **`preload`** loads `base_sprites.png` (Cluster A's existing config from `frames.ts`). Same key (`'base'`) as `MainScene` previously used; dev scenes that load it again will hit Phaser's cache.
- **`create`** runs after preload. Resolves save state, populates AppState, transitions.
- **`Date.now()` seed:** only non-deterministic call in the codebase. Affects fresh-save hero rolls only. Saved state is then stable.
- **No loading UI.** Preload is small (~11KB sheet + tiny configs); completes essentially instantly. Tier 2 may add a progress bar.

## `CampScene` stub (`src/scenes/camp_scene.ts`)

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

Throwaway. Task 12 replaces `create()` body with the real camp village (Tavern / Barracks / Noticeboard buildings). The keyboard shortcuts go away when the real UI lands.

## `main.ts` (modified)

```ts
import * as Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/boot_scene';
import { CampScene } from './scenes/camp_scene';
import { MainScene } from './scenes/dev/main_scene';
import { ExplorerScene } from './scenes/dev/explorer_scene';

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

Phaser auto-starts the first scene. BootScene runs first; transitions to CampScene; dev scenes accessible via the camp stub's keyboard shortcuts.

## Tests

### `src/save/__tests__/boot.test.ts`

Uses a `MemoryStorage` shim implementing `Storage`.

- Existing save → returns it as-is, `isNew: false`.
- Empty storage → builds fresh save with starter roster (3 heroes, one per Tier 1 class), `isNew: true`.
- Fresh save persists to storage immediately (subsequent `getItem` returns the JSON).
- Corrupt JSON in storage → treated as fresh save (load returns null, fresh save built and persisted).
- Determinism: same seed + empty storage → identical fresh saves.

### `src/scenes/__tests__/app_state.test.ts`

`beforeEach` calls `appState.reset()` for test isolation.

- `get()` throws when not initialized.
- `update()` throws when not initialized.
- `init` followed by `get` returns the SaveFile.
- `update(producer)` applies the producer and persists to storage.
- Multiple updates accumulate.
- Persisted JSON in storage matches current state.
- `reset()` clears state — `get()` throws afterward.

### Scenes themselves: no unit tests

`BootScene` is ~30 lines of Phaser glue; `CampScene` (stub) is throwaway. Verified by:
- `npm run dev` smoke test: open browser → see "Camp (stub)" with "Heroes: 3   Gold: 0" on first run; refresh → same heroes (saved).
- `npm run build`: production build succeeds.
- `npx tsc --noEmit`: typecheck passes.

## Risks and follow-ups

- **No loading UI** during preload. Acceptable for ~11KB; Tier 2 should add a progress bar when more atlases land (combat backgrounds, enemy sheets, animation atlases from PixelLab).
- **`Date.now()` seeding for boot rng** is non-deterministic. Acceptable for fresh-save hero rolls (varied flavor) but means starting a fresh game produces different heroes each launch — desirable. Combat / floor RNG uses run-specific seeds traceable from `RunState.seed`.
- **`AppState` singleton.** Standard pattern for a single-game-instance app, but tests need to `reset()` between cases. If we ever support multiple game instances simultaneously (unlikely for a single-player game), this changes.
- **CampScene stub will be replaced in task 12.** Keep stub content trivial; don't invest in styling.
- **Dev-scene keyboard shortcuts (`1` / `2`)** in the stub are throwaway. They'll need to migrate to a dev-mode flag in production (e.g., `?dev=1` URL param) or be removed entirely when task 12 lands.
- **Mid-run save handling deferred.** If `saveFile.runState` is present at boot, the camp stub doesn't know what to do with it (it just shows the persistent state summary). Task 16 (dungeon scene) will detect a present `runState` in `appState` and offer "resume run" UI when it lands.
- **`window.localStorage` direct dependency** in BootScene. The save module's storage abstraction allows test injection; the boot scene hardcodes the production source. Acceptable — boot scene is the only place this happens, and it's where production glue lives.
- **Test environment for AppState.** `beforeEach(appState.reset)` works because the singleton is module-scoped within the same Vitest worker. If Vitest's parallelism is configured to share modules across workers (it isn't by default), this would need revisiting.
