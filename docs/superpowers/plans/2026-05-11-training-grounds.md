# Training Grounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note on commits:** Each task ends with a `git commit` step per skill template. This codebase's CLAUDE.md says "never create git commits without explicit user instruction in the current turn" — defer to the user at execution time. If the user opts to skip commits, leave changes in the working tree and proceed to the next task.

**Goal:** Implement the Training Grounds camp building (Cluster D · 6) — the third and final Sunken-Keep-gated unlock. Benched heroes assigned to N drag-and-drop slot cards (N = 2/3/4 by building level) earn passive XP from every completed run, pro-rated against the run's depth at 25/40/55%.

**Architecture:** A new `RunState.traineeXpBase: number` accumulates per-node XP yields in-engine alongside the existing per-node XP grants. At cashout and wipe, a new pure helper `grantTraineeXp` applies pro-rated XP to every assigned, alive, non-active trainee. UI is modeled on the Expeditions party-picker: drag heroes from an eligible grid into N slot drop-zones. Unlock gates on `unlocks.buildings.includes('training_grounds')`, appended by the existing `first_sunken_keep_clear` milestone handler.

**Tech Stack:** TypeScript, Vitest, Phaser (scenes only). Phaser firewall preserved — `src/camp/trainee_xp.ts` is pure TS, no Phaser imports.

**Spec:** `docs/superpowers/specs/2026-05-11-training-grounds-design.md`

---

## File Structure

**Created:**
- `src/camp/trainee_xp.ts` — `grantTraineeXp(state, traineeXpBase, activeHeroIds) → { state, xpPerTrainee, eligibleCount }`. Pure TS, no Phaser.
- `src/camp/__tests__/trainee_xp.test.ts` — `grantTraineeXp` tests.
- `src/scenes/training_grounds_panel_scene.ts` — Training Grounds UI scene with drag-into-slot UX.

**Modified:**
- `src/data/types.ts` — widens `BuildingId` with `'training_grounds'`.
- `src/save/save.ts` — adds `SaveFile.traineeHeroIds`; defaults; `normalizeSaveFile` orphan-scrub + length-match.
- `src/save/boot.ts` — `createFreshSave`'s `buildingLevels` includes `training_grounds: 1`; adds `traineeHeroIds: [null, null]`.
- `src/save/migration.ts` — bumps `CURRENT_SCHEMA_VERSION` 4→5; adds `MIGRATIONS[4]`.
- `src/save/__tests__/migration.test.ts` — v4→v5 test.
- `src/save/__tests__/save.test.ts` — fixture updates; `normalizeSaveFile` scrub test.
- `src/save/__tests__/boot.test.ts` — fixture updates.
- `src/camp/building_levels.ts` — adds `training_grounds` to `BUILDING_LEVELS`; adds `TRAINEE_SLOT_CAPACITY` + `TRAINEE_PRO_RATE` exports.
- `src/camp/__tests__/building_levels.test.ts` — training-grounds shape tests + new-constant tests.
- `src/run/run_state.ts` — `RunState.traineeXpBase: number`; `WipeOutcome.traineeXpBase`; accumulator at the two grant sites; `startRun` init.
- `src/run/__tests__/run_state.test.ts` — accumulator tests + wipe-outcome carry-through.
- `src/run/milestones.ts` — `first_sunken_keep_clear` extended to also append `'training_grounds'`.
- `src/run/__tests__/milestones.test.ts` — handler extension tests.
- `src/scenes/camp_scene.ts` — refactored to lookup-driven tile build loop; conditional Training Grounds tile.
- `src/scenes/camp_screen_scene.ts` — cashout hook calls `grantTraineeXp`; one-liner toast.
- `src/scenes/corridor_scene.ts` — wipe hook calls `grantTraineeXp`; one-liner toast.
- `src/scenes/__tests__/app_state.test.ts` — fixture updates.
- `src/camp/__tests__/building_upgrade.test.ts` — fixture updates.
- `src/items/__tests__/sell.test.ts` — fixture updates.
- `src/main.ts` — registers `TrainingGroundsPanelScene`.
- `gdd.md` — §6 row 7 patch.

---

## Phase 1 — Foundation: BuildingId + building-level data

### Task 1: Widen `BuildingId` with `'training_grounds'`; add `BUILDING_LEVELS.training_grounds` and the two new constant exports

**Files:**
- Modify: `src/data/types.ts` (widen `BuildingId`)
- Modify: `src/camp/building_levels.ts` (add `training_grounds` entry + new constant exports)
- Modify: `src/camp/__tests__/building_levels.test.ts` (new shape tests)

- [ ] **Step 1: Write failing tests for `training_grounds` building shape and the new constants**

Append to `src/camp/__tests__/building_levels.test.ts`:

```typescript
import { TRAINEE_PRO_RATE, TRAINEE_SLOT_CAPACITY, nextLevel } from '@camp/building_levels';

describe('training_grounds building levels', () => {
  it('registers training_grounds with three tiers and the standard cost ladder', () => {
    expect(BUILDING_LEVELS.training_grounds).toHaveLength(3);
    expect(BUILDING_LEVELS.training_grounds[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.training_grounds[0]?.upgradeCost).toBe(0);
    expect(BUILDING_LEVELS.training_grounds[1]?.level).toBe(2);
    expect(BUILDING_LEVELS.training_grounds[1]?.upgradeCost).toBe(200);
    expect(BUILDING_LEVELS.training_grounds[2]?.level).toBe(3);
    expect(BUILDING_LEVELS.training_grounds[2]?.upgradeCost).toBe(500);
  });

  it('training_grounds has no L4 upgrade path', () => {
    expect(nextLevel('training_grounds', 3)).toBeNull();
  });
});

describe('trainee constants', () => {
  it('TRAINEE_SLOT_CAPACITY maps L1=2, L2=3, L3=4', () => {
    expect(TRAINEE_SLOT_CAPACITY[1]).toBe(2);
    expect(TRAINEE_SLOT_CAPACITY[2]).toBe(3);
    expect(TRAINEE_SLOT_CAPACITY[3]).toBe(4);
  });

  it('TRAINEE_PRO_RATE maps L1=0.25, L2=0.40, L3=0.55', () => {
    expect(TRAINEE_PRO_RATE[1]).toBe(0.25);
    expect(TRAINEE_PRO_RATE[2]).toBe(0.40);
    expect(TRAINEE_PRO_RATE[3]).toBe(0.55);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/camp/__tests__/building_levels.test.ts`
Expected: FAIL — `BUILDING_LEVELS.training_grounds` is undefined; `TRAINEE_PRO_RATE` / `TRAINEE_SLOT_CAPACITY` are undefined; type error on the `'training_grounds'` literal in `nextLevel`.

- [ ] **Step 3: Widen `BuildingId` in `src/data/types.ts`**

Find the existing `BuildingId` type (search for `export type BuildingId`) and update to:

```typescript
export type BuildingId =
  | 'tavern'
  | 'barracks'
  | 'blacksmith'
  | 'hospital'
  | 'chapel'
  | 'training_grounds';
```

- [ ] **Step 4: Add `training_grounds` to `BUILDING_LEVELS` and export the two new constants in `src/camp/building_levels.ts`**

After the `chapel` entry (lines ~30-32), append:

```typescript
training_grounds: [
  { level: 1, upgradeCost: 0,   unlockDescription: '2 trainee slots · 25% XP' },
  { level: 2, upgradeCost: 200, unlockDescription: '3 trainee slots · 40% XP' },
  { level: 3, upgradeCost: 500, unlockDescription: '4 trainee slots · 55% XP' },
],
```

Then append the two new exports (after `hospitalTickAmount` or at the end of the file):

```typescript
export const TRAINEE_SLOT_CAPACITY: Record<BuildingLevel, number> = { 1: 2, 2: 3, 3: 4 };
export const TRAINEE_PRO_RATE: Record<BuildingLevel, number>     = { 1: 0.25, 2: 0.40, 3: 0.55 };
```

- [ ] **Step 5: Run tests — expect passing**

Run: `npx vitest run src/camp/__tests__/building_levels.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify build doesn't break elsewhere**

Run: `npm run build`
Expected: build will FAIL with errors in:
- `src/save/save.ts` — `normalizeSaveFile` default for `buildingLevels` is missing the `training_grounds` key (its `Record<BuildingId, BuildingLevel>` type now requires it).
- `src/save/boot.ts` — `createFreshSave`'s `buildingLevels` literal is missing the key.

These get fixed in Task 2 (which adds the field everywhere it belongs). Do not fix them here.

- [ ] **Step 7: Commit (skip if build is broken — Task 2 fixes the cascade)**

```bash
git add src/data/types.ts src/camp/building_levels.ts src/camp/__tests__/building_levels.test.ts
git commit -m "Training Grounds — widen BuildingId, add BUILDING_LEVELS entry + constants"
```

(If the build breaks the commit hook, defer the commit and combine with Task 2.)

---

## Phase 2 — SaveFile shape: traineeHeroIds + boot + normalize

### Task 2: Add `SaveFile.traineeHeroIds`, default in boot, scrub orphans + length-match on normalize

**Files:**
- Modify: `src/save/save.ts` (add `traineeHeroIds`; extend `normalizeSaveFile`; new `normalizeTraineeSlots` helper)
- Modify: `src/save/boot.ts` (default `traineeHeroIds: [null, null]`; `buildingLevels.training_grounds: 1`)
- Modify: `src/save/__tests__/save.test.ts` (`normalizeTraineeSlots` tests + fixture updates)
- Modify: `src/save/__tests__/boot.test.ts` (fixture update)
- Modify: `src/scenes/__tests__/app_state.test.ts` (fixture update)
- Modify: `src/camp/__tests__/building_upgrade.test.ts` (fixture update)
- Modify: `src/items/__tests__/sell.test.ts` (fixture update)

- [ ] **Step 1: Write failing tests for `traineeHeroIds` scrub + length-match**

Append to `src/save/__tests__/save.test.ts`:

```typescript
describe('normalizeSaveFile — traineeHeroIds scrubbing and length-matching', () => {
  it('scrubs orphan trainee ids (heroId not in roster) to null', () => {
    const raw = buildSaveFileFixture({
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
      traineeHeroIds: ['ghost-id', 'h1'],
      rosterHeroIds: ['h1'],   // 'ghost-id' is not in roster
    });
    const file = normalizeSaveFile(raw);
    expect(file.traineeHeroIds).toEqual([null, 'h1']);
  });

  it('pads traineeHeroIds with null when shorter than capacity', () => {
    const raw = buildSaveFileFixture({
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 2 },
      traineeHeroIds: ['h1'],   // L2 capacity = 3, only 1 entry
      rosterHeroIds: ['h1'],
    });
    const file = normalizeSaveFile(raw);
    expect(file.traineeHeroIds).toEqual(['h1', null, null]);
  });

  it('truncates traineeHeroIds when longer than capacity', () => {
    const raw = buildSaveFileFixture({
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
      traineeHeroIds: ['h1', 'h2', 'h3'],   // L1 capacity = 2
      rosterHeroIds: ['h1', 'h2', 'h3'],
    });
    const file = normalizeSaveFile(raw);
    expect(file.traineeHeroIds).toEqual(['h1', 'h2']);
  });

  it('defaults missing traineeHeroIds to all-null at current capacity', () => {
    const raw = buildSaveFileFixture({
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 3 },
      traineeHeroIds: undefined,   // missing
      rosterHeroIds: ['h1'],
    });
    const file = normalizeSaveFile(raw);
    expect(file.traineeHeroIds).toEqual([null, null, null, null]);  // L3 capacity = 4
  });
});
```

Add a fixture builder near the top of the file (or extend the existing one):

```typescript
function buildSaveFileFixture(opts: {
  buildingLevels: Record<string, number>;
  traineeHeroIds: readonly (string | null)[] | undefined;
  rosterHeroIds: readonly string[];
}): SaveFile {
  const heroes = opts.rosterHeroIds.map((id) => ({
    id,
    classId: 'knight' as const,
    name: id,
    baseStats: { hp: 20, attack: 5, defense: 2, speed: 5, crit: 5, accuracy: 95, dodge: 5 },
    currentHp: 20,
    maxHp: 20,
    traitIds: ['stout' as const],
    bodySpriteId: 'body1',
    legsSpriteId: 'legs1',
    feetSpriteId: 'feet1',
    wounds: [],
    equipment: {
      weapon: {
        id: `w_${id}`, baseId: 'sword_basic', slot: 'weapon' as const,
        rarity: 'common' as const, affixes: [], floorRolledAt: 1,
      },
    },
    xp: 0, level: 1, pendingPerk: false,
  }));
  return {
    version: CURRENT_SCHEMA_VERSION,
    roster: { heroes, capacity: 12 },
    vault: { gold: 100 },
    stash: { items: [] },
    unlocks: { classes: ['knight'], dungeons: ['crypt'], buildings: ['training_grounds'] },
    buildingLevels: opts.buildingLevels as SaveFile['buildingLevels'],
    hospitalTreatmentsRemaining: 1,
    tavernCandidates: [],
    campRngState: 0,
    traineeHeroIds: opts.traineeHeroIds as SaveFile['traineeHeroIds'],
  };
}
```

(Inspect the file's existing test imports for the actual `Hero`/`Roster` shape — adjust the fixture inline if any field mismatches the real interfaces. The test should fail to compile until `SaveFile.traineeHeroIds` is added.)

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/save/__tests__/save.test.ts`
Expected: FAIL — `SaveFile` does not have a `traineeHeroIds` field; `normalizeSaveFile` doesn't apply the scrub.

- [ ] **Step 3: Add `traineeHeroIds` to `SaveFile` in `src/save/save.ts`**

Find the `SaveFile` interface (line ~18-35) and add the field after `tavernCandidates`:

```typescript
export interface SaveFile {
  /* existing fields */
  tavernCandidates: readonly Hero[];
  traineeHeroIds: readonly (string | null)[];   // NEW. Length = TRAINEE_SLOT_CAPACITY[buildingLevels.training_grounds]
  /* … remaining existing fields … */
}
```

- [ ] **Step 4: Add `normalizeTraineeSlots` helper + extend `normalizeSaveFile` in `src/save/save.ts`**

Add the import at the top of the file:

```typescript
import { TRAINEE_SLOT_CAPACITY } from '@camp/building_levels';
```

Append the helper at the bottom of the file (after `normalizeHero`):

```typescript
function normalizeTraineeSlots(file: SaveFile): readonly (string | null)[] {
  const level = file.buildingLevels?.training_grounds ?? 1;
  const capacity = TRAINEE_SLOT_CAPACITY[level];
  const rosterIds = new Set(file.roster.heroes.map((h) => h.id));
  const current = file.traineeHeroIds ?? [];
  const scrubbed = current.map((id) => (id !== null && rosterIds.has(id) ? id : null));
  if (scrubbed.length === capacity) return scrubbed;
  if (scrubbed.length < capacity) {
    return [...scrubbed, ...new Array(capacity - scrubbed.length).fill(null)];
  }
  return scrubbed.slice(0, capacity);
}
```

Extend `normalizeSaveFile` (line ~126) to include the new field:

```typescript
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    buildingLevels: file.buildingLevels ?? {
      tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1,
    },
    hospitalTreatmentsRemaining: file.hospitalTreatmentsRemaining ?? 1,
    tavernCandidates: file.tavernCandidates ?? [],
    traineeHeroIds: normalizeTraineeSlots(file),   // NEW
    roster: { ...file.roster, heroes: file.roster.heroes.map(normalizeHero) },
    runState: file.runState === undefined
      ? undefined
      : {
          ...file.runState,
          lost: file.runState.lost ?? [],
          traversedNodeIds: file.runState.traversedNodeIds ?? [file.runState.currentNodeId],
          surprisesThisFloor: file.runState.surprisesThisFloor ?? 0,
          pendingMilestones: file.runState.pendingMilestones ?? [],
        },
  };
}
```

(Note: `runState.traineeXpBase` defensive default is added in Task 4, not here.)

- [ ] **Step 5: Update `createFreshSave` in `src/save/boot.ts`**

Find the `buildingLevels` literal (line 41) and add `training_grounds: 1`:

```typescript
buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
```

Add `traineeHeroIds: [null, null]` to the return object (after `tavernCandidates`):

```typescript
return {
  /* existing fields */
  tavernCandidates: [],
  traineeHeroIds: [null, null],
  campRngState: rng.getState(),
};
```

- [ ] **Step 6: Sweep test fixtures**

For each of these files, find `buildingLevels` literals and add `training_grounds: 1`; find SaveFile constructions missing `traineeHeroIds` and add `traineeHeroIds: [null, null]`:

- `src/save/__tests__/boot.test.ts`
- `src/scenes/__tests__/app_state.test.ts`
- `src/camp/__tests__/building_upgrade.test.ts`
- `src/items/__tests__/sell.test.ts`

Also: in `src/save/__tests__/save.test.ts`, any existing SaveFile fixture (besides the new `buildSaveFileFixture` builder added in Step 1) needs both new fields.

Per saved-memory `feedback_grep_tests_before_data_edits`, grep `__tests__/` for `buildingLevels:` literals to find every occurrence in lockstep. Update each.

Run: `grep -rn "buildingLevels:" src/` to enumerate (do this via the Grep tool).

- [ ] **Step 7: Run tests — expect passing**

Run: `npm test`
Expected: PASS on all (1848+ baseline) tests, including the new `normalizeTraineeSlots` tests.

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/save/save.ts src/save/boot.ts src/save/__tests__/save.test.ts src/save/__tests__/boot.test.ts src/scenes/__tests__/app_state.test.ts src/camp/__tests__/building_upgrade.test.ts src/items/__tests__/sell.test.ts
git commit -m "Training Grounds — SaveFile.traineeHeroIds + normalize scrub + boot defaults"
```

(If Task 1's commit was deferred, include those files here too.)

---

## Phase 3 — Migration v4 → v5

### Task 3: Bump `CURRENT_SCHEMA_VERSION` 4→5; register `MIGRATIONS[4]`

**Files:**
- Modify: `src/save/migration.ts` (bump version; add MIGRATIONS[4])
- Modify: `src/save/__tests__/migration.test.ts` (v4→v5 test)

- [ ] **Step 1: Write failing test for v4→v5 migration**

Append to `src/save/__tests__/migration.test.ts`:

```typescript
describe('v4 → v5 migration (Training Grounds)', () => {
  it('adds buildingLevels.training_grounds = 1', () => {
    const raw = {
      version: 4,
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'], buildings: [] },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
      campRngState: 0,
    };
    const migrated = migrate(raw) as SaveFile;
    expect(migrated.buildingLevels.training_grounds).toBe(1);
  });

  it('adds traineeHeroIds = [null, null] (L1 default)', () => {
    const raw = {
      version: 4,
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'], buildings: [] },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
      campRngState: 0,
    };
    const migrated = migrate(raw) as SaveFile;
    expect(migrated.traineeHeroIds).toEqual([null, null]);
  });

  it('adds runState.traineeXpBase = 0 when a run is in progress', () => {
    const raw = {
      version: 4,
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'], buildings: [] },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
      campRngState: 0,
      runState: {
        dungeonId: 'crypt',
        seed: 0,
        party: [],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: 'start',
        awaitingFork: false,
        status: 'in_dungeon',
        fallen: [],
        lost: [],
        traversedNodeIds: ['start'],
        surprisesThisFloor: 0,
        pendingMilestones: [],
        petsDownByHeroId: [],
      },
      runRngState: 0,
    };
    const migrated = migrate(raw) as SaveFile;
    expect(migrated.runState?.traineeXpBase).toBe(0);
  });

  it('full chain v1 → v5 produces a valid v5 save', () => {
    const v1raw = {
      version: 1,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
    };
    const migrated = migrate(v1raw) as SaveFile;
    expect(migrated.version).toBe(5);
    expect(migrated.buildingLevels.training_grounds).toBe(1);
    expect(migrated.traineeHeroIds).toEqual([null, null]);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: FAIL — `CURRENT_SCHEMA_VERSION` is still 4; `MIGRATIONS[4]` is undefined; v4 saves are rejected by `migrate` (returns null) because the loop hits a missing migration.

- [ ] **Step 3: Bump version and add migration in `src/save/migration.ts`**

Update line 7:

```typescript
export const CURRENT_SCHEMA_VERSION = 5;
```

Append to the `MIGRATIONS` record (after the existing `3:` entry):

```typescript
  // v4 → v5: introduce Training Grounds. Add buildingLevels.training_grounds = 1;
  // traineeHeroIds = [null, null]; (mid-run) runState.traineeXpBase = 0.
  // Training Grounds spec, 2026-05-11.
  4: (raw) => {
    const out: Record<string, unknown> = { ...raw, version: 5 };

    const bl = out.buildingLevels as Record<string, unknown> | undefined;
    if (bl && bl.training_grounds === undefined) bl.training_grounds = 1;

    if (out.traineeHeroIds === undefined) {
      out.traineeHeroIds = [null, null];
    }

    const runState = out.runState as Record<string, unknown> | undefined;
    if (runState && runState.traineeXpBase === undefined) {
      runState.traineeXpBase = 0;
    }

    return out;
  },
```

- [ ] **Step 4: Run tests — expect passing**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: PASS on all migration tests.

Run: `npm test`
Expected: PASS overall.

- [ ] **Step 5: Commit**

```bash
git add src/save/migration.ts src/save/__tests__/migration.test.ts
git commit -m "Training Grounds — save migration v4 → v5"
```

---

## Phase 4 — RunState: traineeXpBase accumulator

### Task 4: Add `traineeXpBase` to `RunState` + `WipeOutcome`; increment at both per-node XP grant sites

**Files:**
- Modify: `src/run/run_state.ts` (interface fields; `startRun` init; accumulator at 2 sites; `WipeOutcome` field; pass-through in wipe construction)
- Modify: `src/run/__tests__/run_state.test.ts` (accumulator tests)
- Modify: `src/save/save.ts` (`normalizeSaveFile` defensive default for `runState.traineeXpBase`)
- Modify: `src/save/migration.ts` (no change — already added in Task 3; verify)

- [ ] **Step 1: Write failing tests for `traineeXpBase` accumulator**

Append to `src/run/__tests__/run_state.test.ts`:

```typescript
describe('traineeXpBase accumulator', () => {
  it('startRun initializes traineeXpBase to 0', () => {
    const party = makeParty(3);
    const rng = createRng(1);
    const rs = startRun('crypt', party, 1, rng);
    expect(rs.traineeXpBase).toBe(0);
  });

  it('completeCombat victory increments traineeXpBase by xpForCombatNode(floor)', () => {
    const rs = startAtCombatNode({ floor: 2 });
    const result = makeCombatVictoryResult(rs);
    const { runState: next } = completeCombat(rs, result, createRng(1));
    expect(next.traineeXpBase).toBe(rs.traineeXpBase + xpForCombatNode(2));
  });

  it('completeCombat victory at an elite node increments by xpForEliteNode(floor)', () => {
    const rs = startAtCombatNode({ floor: 3, kind: 'elite' });
    const result = makeCombatVictoryResult(rs);
    const { runState: next } = completeCombat(rs, result, createRng(1));
    expect(next.traineeXpBase).toBe(rs.traineeXpBase + xpForEliteNode(3));
  });

  it('completeCombat victory at a boss node increments by xpForBossNode(floor)', () => {
    const rs = startAtCombatNode({ floor: 1, kind: 'boss' });
    const result = makeCombatVictoryResult(rs);
    const { runState: next } = completeCombat(rs, result, createRng(1));
    expect(next.traineeXpBase).toBe(rs.traineeXpBase + xpForBossNode(1));
  });

  it('completeSurpriseCombat victory increments by xpForCombatNode(floor)', () => {
    const rs = startAtSurpriseCombat({ floor: 2 });
    const result = makeCombatVictoryResult(rs);
    const { runState: next } = completeSurpriseCombat(rs, result, createRng(1));
    expect(next.traineeXpBase).toBe(rs.traineeXpBase + xpForCombatNode(2));
  });

  it('player_defeat at completeCombat carries traineeXpBase into the WipeOutcome', () => {
    const rs = startAtCombatNode({ floor: 2 });
    // pre-load some accumulated base from prior nodes
    const rsWithBase = { ...rs, traineeXpBase: 50 };
    const result = makeCombatDefeatResult(rsWithBase);
    const { wipe } = completeCombat(rsWithBase, result, createRng(1));
    expect(wipe?.traineeXpBase).toBe(50);
  });

  it('player_defeat at completeSurpriseCombat carries traineeXpBase into the WipeOutcome', () => {
    const rs = startAtSurpriseCombat({ floor: 2 });
    const rsWithBase = { ...rs, traineeXpBase: 75 };
    const result = makeCombatDefeatResult(rsWithBase);
    const { wipe } = completeSurpriseCombat(rsWithBase, result, createRng(1));
    expect(wipe?.traineeXpBase).toBe(75);
  });

  it('advanceFloor preserves traineeXpBase', () => {
    const rs = startAtBossNode({ floor: 1 });
    const rsWithBase = { ...rs, traineeXpBase: 120 };
    const next = advanceFloor(rsWithBase, createRng(1));
    expect(next.traineeXpBase).toBe(120);
  });
});
```

(Use the existing test helpers in the file — e.g., `startAtCombatNode`, `makeCombatVictoryResult`. If a helper doesn't exist for the case, write a tight inline one; mirror existing patterns. Same for `xpForEliteNode` / `xpForBossNode` imports — `xpForEliteNode` is already imported at line 4.)

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "traineeXpBase"`
Expected: FAIL — `RunState.traineeXpBase` undefined; `startRun` doesn't init it; accumulator missing at all sites; `WipeOutcome.traineeXpBase` undefined.

- [ ] **Step 3: Add `traineeXpBase` to `RunState` and `WipeOutcome` in `src/run/run_state.ts`**

Update the interface (line 18-34):

```typescript
export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeId: string;
  readonly awaitingFork: boolean;
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
  readonly lost: readonly Hero[];
  readonly traversedNodeIds: readonly string[];
  readonly surprisesThisFloor: number;
  readonly pendingMilestones: readonly MilestoneId[];
  readonly petsDownByHeroId: readonly string[];
  readonly traineeXpBase: number;   // NEW. Cumulative per-node XP yield this run.
}
```

Update `WipeOutcome` (line 45-50):

```typescript
export interface WipeOutcome {
  packLost: Pack;
  heroesFallen: readonly Hero[];
  heroesLost: readonly Hero[];
  milestonesTriggered: readonly MilestoneId[];
  readonly traineeXpBase: number;   // NEW.
}
```

- [ ] **Step 4: Init `traineeXpBase: 0` in `startRun`**

Update `startRun` return (line 86-102):

```typescript
return {
  dungeonId,
  seed,
  party: [...party],
  pack: createPack(),
  currentFloorNumber: 1,
  currentFloorNodes: nodes,
  currentNodeId: startNodeId,
  awaitingFork: false,
  status: 'in_dungeon',
  fallen: [],
  lost: [],
  traversedNodeIds: [startNodeId],
  surprisesThisFloor: 0,
  pendingMilestones: [],
  petsDownByHeroId: [],
  traineeXpBase: 0,   // NEW
};
```

- [ ] **Step 5: Increment `traineeXpBase` in `completeCombat` victory paths**

In `completeCombat` (around line 267-275), after the existing `xpReward` computation and `partyAfterXp` map, all return paths need `traineeXpBase: runState.traineeXpBase + xpReward`. Two return paths follow the `partyAfterXp` calc (boss and non-boss victory).

For the player_defeat path (line 235), the wipe needs `traineeXpBase: runState.traineeXpBase` (no increment — defeat skipped the XP grant). Update:

```typescript
const wipe: WipeOutcome = {
  packLost: runState.pack,
  heroesFallen: allLost,
  heroesLost: runState.lost,
  milestonesTriggered: runState.pendingMilestones,
  traineeXpBase: runState.traineeXpBase,   // NEW
};
```

For the boss-victory return (line 301-311):

```typescript
return {
  runState: {
    ...runState,
    party: partyAfterXp,
    fallen: [...runState.fallen, ...newFallen],
    pack: newPack,
    status: 'camp_screen',
    pendingMilestones: [...runState.pendingMilestones, ...triggered],
    petsDownByHeroId: newPetsDown,
    traineeXpBase: runState.traineeXpBase + xpReward,   // NEW
  },
};
```

For the non-boss-victory return (line 320-330):

```typescript
return {
  runState: {
    ...runState,
    party: partyAfterXp,
    fallen: [...runState.fallen, ...newFallen],
    pack: newPack,
    status: 'in_dungeon',
    awaitingFork: true,
    petsDownByHeroId: newPetsDown,
    traineeXpBase: runState.traineeXpBase + xpReward,   // NEW
  },
};
```

- [ ] **Step 6: Increment `traineeXpBase` in `completeSurpriseCombat` victory path; carry through on defeat**

In `completeSurpriseCombat` (line 333-438), do the same:

Defeat path (line 379-384):

```typescript
const wipe: WipeOutcome = {
  packLost: runState.pack,
  heroesFallen: allLost,
  heroesLost: runState.lost,
  milestonesTriggered: runState.pendingMilestones,
  traineeXpBase: runState.traineeXpBase,   // NEW
};
```

Victory return (line 429-437):

```typescript
return {
  runState: {
    ...runState,
    party: partyAfterXp,
    fallen: [...runState.fallen, ...newFallen],
    pack: newPack,
    petsDownByHeroId: newPetsDown,
    traineeXpBase: runState.traineeXpBase + xpReward,   // NEW
  },
};
```

- [ ] **Step 7: Verify `advanceFloor` preserves `traineeXpBase`**

Read the `advanceFloor` function (line ~440-456). The current implementation uses `{ ...runState, currentFloorNumber: nextFloor, /* … */ }` — the spread preserves `traineeXpBase` naturally. No code change needed; the test in Step 1 verifies this.

- [ ] **Step 8: Defensive default for `runState.traineeXpBase` in `normalizeSaveFile`**

In `src/save/save.ts`, extend the runState branch of `normalizeSaveFile`:

```typescript
runState: file.runState === undefined
  ? undefined
  : {
      ...file.runState,
      lost: file.runState.lost ?? [],
      traversedNodeIds: file.runState.traversedNodeIds ?? [file.runState.currentNodeId],
      surprisesThisFloor: file.runState.surprisesThisFloor ?? 0,
      pendingMilestones: file.runState.pendingMilestones ?? [],
      traineeXpBase: file.runState.traineeXpBase ?? 0,   // NEW
    },
```

- [ ] **Step 9: Run tests — expect passing**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "traineeXpBase"`
Expected: PASS on the 8 new accumulator tests.

Run: `npm test`
Expected: PASS overall. Other run_state tests should still pass — adding a field to RunState with a defensive normalizer keeps the tests forward-compatible.

Run: `npm run build`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts src/save/save.ts
git commit -m "Training Grounds — RunState.traineeXpBase accumulator + WipeOutcome carry-through"
```

---

## Phase 5 — `grantTraineeXp` pure helper

### Task 5: Create `src/camp/trainee_xp.ts` with `grantTraineeXp` + tests

**Files:**
- Create: `src/camp/trainee_xp.ts`
- Create: `src/camp/__tests__/trainee_xp.test.ts`

- [ ] **Step 1: Write failing tests for `grantTraineeXp`**

Create `src/camp/__tests__/trainee_xp.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { grantTraineeXp } from '@camp/trainee_xp';
import type { SaveFile } from '@save/save';
import type { Hero } from '@heroes/hero';

function makeHero(id: string, xp = 0, level = 1): Hero {
  return {
    id,
    classId: 'knight',
    name: id,
    baseStats: { hp: 20, attack: 5, defense: 2, speed: 5, crit: 5, accuracy: 95, dodge: 5 },
    currentHp: 20,
    maxHp: 20,
    traitIds: ['stout'],
    bodySpriteId: 'body1',
    legsSpriteId: 'legs1',
    feetSpriteId: 'feet1',
    wounds: [],
    equipment: {
      weapon: { id: `w_${id}`, baseId: 'sword_basic', slot: 'weapon', rarity: 'common', affixes: [], floorRolledAt: 1 },
    },
    xp,
    level,
    pendingPerk: false,
  };
}

function makeSaveFile(opts: {
  heroes: readonly Hero[];
  traineeHeroIds: readonly (string | null)[];
  trainingUnlocked: boolean;
  level?: 1 | 2 | 3;
}): SaveFile {
  return {
    version: 5,
    roster: { heroes: [...opts.heroes], capacity: 12 },
    vault: { gold: 0 },
    stash: { items: [] },
    unlocks: {
      classes: ['knight'],
      dungeons: ['crypt'],
      buildings: opts.trainingUnlocked ? ['training_grounds'] : [],
    },
    buildingLevels: {
      tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1,
      training_grounds: opts.level ?? 1,
    },
    hospitalTreatmentsRemaining: 1,
    tavernCandidates: [],
    campRngState: 0,
    traineeHeroIds: opts.traineeHeroIds,
  };
}

describe('grantTraineeXp', () => {
  it('no-op when Training Grounds not unlocked', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: false,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(0);
    expect(result.xpPerTrainee).toBe(0);
    expect(result.state.roster.heroes[0]?.xp).toBe(0);
  });

  it('no-op when traineeXpBase is 0', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 0, []);
    expect(result.eligibleCount).toBe(0);
    expect(result.state.roster.heroes[0]?.xp).toBe(0);
  });

  it('grants round(base × 0.25) XP per trainee at L1', () => {
    const h1 = makeHero('h1');
    const h2 = makeHero('h2');
    const state = makeSaveFile({
      heroes: [h1, h2], traineeHeroIds: ['h1', 'h2'], trainingUnlocked: true, level: 1,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(2);
    expect(result.xpPerTrainee).toBe(60);   // round(240 × 0.25) = 60
    expect(result.state.roster.heroes.find((h) => h.id === 'h1')?.xp).toBe(60);
    expect(result.state.roster.heroes.find((h) => h.id === 'h2')?.xp).toBe(60);
  });

  it('grants round(base × 0.40) at L2 and round(base × 0.55) at L3', () => {
    const h1 = makeHero('h1');
    const state2 = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1', null, null], trainingUnlocked: true, level: 2,
    });
    const result2 = grantTraineeXp(state2, 240, []);
    expect(result2.xpPerTrainee).toBe(96);   // round(240 × 0.40) = 96

    const state3 = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1', null, null, null], trainingUnlocked: true, level: 3,
    });
    const result3 = grantTraineeXp(state3, 240, []);
    expect(result3.xpPerTrainee).toBe(132);   // round(240 × 0.55) = 132
  });

  it('skips slots that are null', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: [null, 'h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(1);
  });

  it('skips trainees whose id is in activeHeroIds (double-dip prevention)', () => {
    const h1 = makeHero('h1');
    const h2 = makeHero('h2');
    const state = makeSaveFile({
      heroes: [h1, h2], traineeHeroIds: ['h1', 'h2'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, ['h1']);
    expect(result.eligibleCount).toBe(1);
    expect(result.state.roster.heroes.find((h) => h.id === 'h1')?.xp).toBe(0);
    expect(result.state.roster.heroes.find((h) => h.id === 'h2')?.xp).toBe(60);
  });

  it('skips trainees whose id is not in roster.heroes (orphan)', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1', 'ghost-id'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(1);
    expect(result.state.roster.heroes.find((h) => h.id === 'h1')?.xp).toBe(60);
  });

  it('returns no-op result when every slot is null/orphan/active', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: [null, 'ghost'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(0);
    expect(result.xpPerTrainee).toBe(0);
    expect(result.state).toBe(state);   // identity-preserved
  });

  it('triggers level-ups via applyLevelUps', () => {
    // L1 trainee with 150 XP gains 60 → 210 XP → crosses L2 threshold (200).
    const h1 = makeHero('h1', 150, 1);
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    const after = result.state.roster.heroes.find((h) => h.id === 'h1');
    expect(after?.xp).toBe(210);
    expect(after?.level).toBe(2);
    expect(after?.maxHp).toBeGreaterThan(20);   // L2 HP bump applied
  });

  it('L5 trainee receives XP but level stays at 5', () => {
    const h1 = makeHero('h1', 4000, 5);
    h1.pendingPerk = true;
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    const after = result.state.roster.heroes.find((h) => h.id === 'h1');
    expect(after?.xp).toBe(4060);
    expect(after?.level).toBe(5);
    expect(after?.pendingPerk).toBe(true);   // already-set flag preserved
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/camp/__tests__/trainee_xp.test.ts`
Expected: FAIL — `@camp/trainee_xp` module doesn't exist.

- [ ] **Step 3: Create the helper module**

Create `src/camp/trainee_xp.ts`:

```typescript
import { applyLevelUps, levelForXp } from '@data/leveling';
import type { SaveFile } from '@save/save';
import { TRAINEE_PRO_RATE } from './building_levels';

export interface TraineeXpResult {
  state: SaveFile;
  xpPerTrainee: number;
  eligibleCount: number;
}

/**
 * Grants trainee XP to every assigned, alive, non-active trainee.
 *
 * - Skips null slots, orphan ids (not in roster.heroes), and ids in `activeHeroIds`.
 * - Returns identity-preserved state when there's nothing to do.
 *
 * Pure: no Phaser, no I/O. Caller persists the returned state.
 */
export function grantTraineeXp(
  state: SaveFile,
  traineeXpBase: number,
  activeHeroIds: readonly string[],
): TraineeXpResult {
  if (!state.unlocks.buildings.includes('training_grounds')) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }
  if (traineeXpBase === 0) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }

  const level = state.buildingLevels.training_grounds;
  const proRate = TRAINEE_PRO_RATE[level];
  const xpPerTrainee = Math.round(traineeXpBase * proRate);

  const activeSet = new Set(activeHeroIds);
  const rosterById = new Map(state.roster.heroes.map((h) => [h.id, h]));

  let eligibleCount = 0;
  const nextHeroes = state.roster.heroes.slice();
  for (const slotId of state.traineeHeroIds) {
    if (slotId === null) continue;
    if (activeSet.has(slotId)) continue;
    const hero = rosterById.get(slotId);
    if (!hero) continue;

    eligibleCount += 1;
    const idx = nextHeroes.findIndex((h) => h.id === slotId);
    const before = nextHeroes[idx];
    const newXp = before.xp + xpPerTrainee;
    const newLevel = levelForXp(newXp);
    nextHeroes[idx] = applyLevelUps({ ...before, xp: newXp }, before.level, newLevel);
  }

  if (eligibleCount === 0) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }

  return {
    state: { ...state, roster: { ...state.roster, heroes: nextHeroes } },
    xpPerTrainee,
    eligibleCount,
  };
}
```

- [ ] **Step 4: Run tests — expect passing**

Run: `npx vitest run src/camp/__tests__/trainee_xp.test.ts`
Expected: PASS on all 10 tests.

Run: `npm test`
Expected: PASS overall.

- [ ] **Step 5: Commit**

```bash
git add src/camp/trainee_xp.ts src/camp/__tests__/trainee_xp.test.ts
git commit -m "Training Grounds — grantTraineeXp pure helper"
```

---

## Phase 6 — Milestone handler extension

### Task 6: Extend `first_sunken_keep_clear` to append `'training_grounds'` to `unlocks.buildings`

**Files:**
- Modify: `src/run/milestones.ts` (third branch in the handler)
- Modify: `src/run/__tests__/milestones.test.ts` (new assertions)

- [ ] **Step 1: Write failing tests**

Append to `src/run/__tests__/milestones.test.ts`:

```typescript
describe('first_sunken_keep_clear — training_grounds branch', () => {
  it('appends training_grounds to unlocks.buildings on a fresh state', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toContain('training_grounds');
  });

  it('appends only training_grounds when hunter and chapel already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight', 'hunter'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: ['chapel'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toEqual(['chapel', 'training_grounds']);
    expect(after.unlocks.classes).toEqual(['knight', 'hunter']);
  });

  it('is idempotent when all three branches already applied', () => {
    const before = makeFakeSave({
      classes: ['knight', 'hunter'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: ['chapel', 'training_grounds'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toEqual(['chapel', 'training_grounds']);
  });
});
```

(`makeFakeSave` is already defined in the file for the Hunter and Chapel tests. If its signature doesn't include `buildings`, widen it now — same pattern Chapel used.)

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/run/__tests__/milestones.test.ts`
Expected: FAIL — `training_grounds` is not appended; the handler currently only handles `hunter` and `chapel`.

- [ ] **Step 3: Add the third branch to the handler in `src/run/milestones.ts`**

Update `first_sunken_keep_clear` (line ~30-45):

```typescript
first_sunken_keep_clear: (state) => {
  let next = state;
  if (!next.unlocks.classes.includes('hunter')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, classes: [...next.unlocks.classes, 'hunter'] },
    };
  }
  if (!next.unlocks.buildings.includes('chapel')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, buildings: [...next.unlocks.buildings, 'chapel'] },
    };
  }
  if (!next.unlocks.buildings.includes('training_grounds')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, buildings: [...next.unlocks.buildings, 'training_grounds'] },
    };
  }
  return next;
},
```

- [ ] **Step 4: Run tests — expect passing**

Run: `npx vitest run src/run/__tests__/milestones.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS overall.

- [ ] **Step 5: Commit**

```bash
git add src/run/milestones.ts src/run/__tests__/milestones.test.ts
git commit -m "Training Grounds — milestone handler appends to unlocks.buildings"
```

---

## Phase 7 — Camp scene refactor + Training Grounds tile

### Task 7: Refactor `camp_scene.ts` to a lookup-driven tile build loop; conditionally show Training Grounds tile

**Files:**
- Modify: `src/scenes/camp_scene.ts` (replace per-building hardcoded x-coords with a tile array + loop)
- Modify: `src/main.ts` (register `TrainingGroundsPanelScene`)

- [ ] **Step 1: Refactor `camp_scene.ts` create() — replace per-building build calls with a lookup loop**

Read the current `create()` method (line 14-39). Find the existing block:

```typescript
this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Blacksmith', 300, 0x665533, 100, 120, 'blacksmith_panel');
this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital', 580, 0x885566, 100, 100, 'hospital_panel');
if (appState.get().unlocks.buildings.includes('chapel')) {
  this.buildBuilding('Chapel', 720, 0x886688, 90, 110, 'chapel_panel');
  this.buildBuilding('Expeditions', 850, 0x998866, 80, 60, 'expeditions_panel');
} else {
  this.buildBuilding('Expeditions', 720, 0x998866, 80, 60, 'expeditions_panel');
}
```

Replace with:

```typescript
type CampTile = {
  name: string; key: string; color: number; width: number; height: number;
};
const tiles: CampTile[] = [
  { name: 'Tavern',     key: 'tavern_panel',     color: 0x664433, width: 100, height: 110 },
  { name: 'Blacksmith', key: 'blacksmith_panel', color: 0x665533, width: 100, height: 120 },
  { name: 'Barracks',   key: 'barracks_panel',   color: 0x555555, width: 100, height: 130 },
  { name: 'Hospital',   key: 'hospital_panel',   color: 0x885566, width: 100, height: 100 },
];
const unlockedBuildings = appState.get().unlocks.buildings;
if (unlockedBuildings.includes('chapel')) {
  tiles.push({ name: 'Chapel', key: 'chapel_panel', color: 0x886688, width: 90, height: 110 });
}
if (unlockedBuildings.includes('training_grounds')) {
  tiles.push({ name: 'Training', key: 'training_grounds_panel', color: 0x668866, width: 100, height: 120 });
}
tiles.push({ name: 'Expeditions', key: 'expeditions_panel', color: 0x998866, width: 80, height: 60 });

const FIRST_X = 180;
const STEP_X  = tiles.length >= 7 ? 125 : 130;
tiles.forEach((tile, i) => {
  this.buildBuilding(tile.name, FIRST_X + i * STEP_X, tile.color, tile.width, tile.height, tile.key);
});
```

The `STEP_X = tiles.length >= 7 ? 125 : 130` is the camp-tile-overflow mitigation noted in the spec's Risks section. With Chapel + Training Grounds both unlocked, 7 tiles at step 125 end at `180 + 6×125 = 930`, fitting within 960 with margin.

- [ ] **Step 2: Register `TrainingGroundsPanelScene` in `src/main.ts`**

The actual scene class lands in Task 8. For now, add an import + registration entry that points at the file path that will be created next.

Find the existing scene-registration array (search for `chapel_panel` or `'expeditions_panel'`). Add `TrainingGroundsPanelScene` alongside `ChapelPanelScene`:

```typescript
import { TrainingGroundsPanelScene } from '@scenes/training_grounds_panel_scene';
// …
scene: [
  /* existing scenes */
  ChapelPanelScene,
  TrainingGroundsPanelScene,
],
```

Note: this import will fail to compile until Task 8 creates the file. **Defer Step 2 to the start of Task 8**, OR create a placeholder file now with just an empty class to keep the build green:

```typescript
// src/scenes/training_grounds_panel_scene.ts (TEMPORARY PLACEHOLDER)
import * as Phaser from 'phaser';
export class TrainingGroundsPanelScene extends Phaser.Scene {
  constructor() { super('training_grounds_panel'); }
}
```

Task 8 replaces the body. Easier path: do the import + registration in Task 8 instead and limit Task 7 to the camp_scene refactor.

**Recommendation:** drop Step 2 from Task 7 — do the main.ts registration in Task 8 Step 1, where the scene is also created. Task 7 is camp-scene-only.

- [ ] **Step 3: Manual smoke test**

Camp tile click on Training Grounds (once unlocked) currently fails — there's no scene registered yet. Skip the manual smoke for now; Task 8 closes the loop.

Run: `npm test`
Expected: PASS overall — camp_scene has no unit tests, and the refactor is renderer-only.

Run: `npm run build`
Expected: clean (no new import broken).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/camp_scene.ts
git commit -m "Training Grounds — refactor camp_scene to lookup-driven tile loop"
```

---

## Phase 8 — Training Grounds panel scene

### Task 8: Create `TrainingGroundsPanelScene` with drag-into-slot UX

**Files:**
- Create: `src/scenes/training_grounds_panel_scene.ts`
- Modify: `src/main.ts` (register the scene)

This task is implementation-heavy (≈400-500 LOC) but tested manually rather than via unit tests — scene UX is hand-tested per the repo's existing pattern (Hunter / Chapel did the same).

- [ ] **Step 1: Create the scene skeleton**

Create `src/scenes/training_grounds_panel_scene.ts`:

```typescript
import * as Phaser from 'phaser';
import { TRAINEE_PRO_RATE, TRAINEE_SLOT_CAPACITY, nextLevel } from '@camp/building_levels';
import { listHeroes } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import type { Hero } from '@heroes/hero';
import type { BuildingLevel } from '@save/save';
import { HeroCard } from '@ui/widgets';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W  = 920;
const PANEL_H  = 500;

const TITLE_Y    = 50;
const SUBTITLE_Y = 80;

const SLOT_Y = 175;
const SLOT_W = 180;
const SLOT_H = 90;
const SLOT_LABEL_Y = 120;

const ELIGIBLE_LABEL_Y = 245;
const ELIGIBLE_Y_BASE  = 295;
const ELIGIBLE_Y_STRIDE = 60;
const ELIGIBLE_COLS = 4;

const UPGRADE_Y = 460;
const CLOSE_X = PANEL_CX + PANEL_W / 2 - 30;
const CLOSE_Y = TITLE_Y;

function slotXs(capacity: number): readonly number[] {
  // Center capacity slot cards horizontally on PANEL_CX with 200px center-to-center.
  const stride = 200;
  const totalWidth = (capacity - 1) * stride;
  const firstX = PANEL_CX - totalWidth / 2;
  return Array.from({ length: capacity }, (_, i) => firstX + i * stride);
}

export class TrainingGroundsPanelScene extends Phaser.Scene {
  constructor() { super('training_grounds_panel'); }

  create(): void {
    // Dim overlay
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel chrome
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x668866);

    const state = appState.get();
    const level = state.buildingLevels.training_grounds;
    const capacity = TRAINEE_SLOT_CAPACITY[level];
    const proRate = TRAINEE_PRO_RATE[level];
    const slotsUsed = state.traineeHeroIds.filter((id) => id !== null).length;

    this.add.text(PANEL_CX, TITLE_Y, `Training Grounds · Lv ${level}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#aaddaa',
    }).setOrigin(0.5);
    this.add.text(
      PANEL_CX, SUBTITLE_Y,
      `Slots: ${slotsUsed} / ${capacity} · Trainees gain ${Math.round(proRate * 100)}% of run XP`,
      { fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa' },
    ).setOrigin(0.5);

    this.add.text(PANEL_CX, SLOT_LABEL_Y, 'Trainee slots', {
      fontFamily: 'monospace', fontSize: '14px', color: '#cccccc',
    }).setOrigin(0.5);

    this.buildSlotsAndDrag(state.traineeHeroIds, capacity);

    this.add.text(PANEL_CX, ELIGIBLE_LABEL_Y, 'Eligible heroes (drag to a slot):', {
      fontFamily: 'monospace', fontSize: '14px', color: '#cccccc',
    }).setOrigin(0.5);

    this.buildUpgradeButton(level);
    this.buildCloseButton();
  }

  /* further methods land in subsequent steps */
}
```

- [ ] **Step 2: Implement the slot drop-zones + drag interactions**

Inside the class, add the slot-rendering and drag-handler methods. This is the heaviest section — port from `expeditions_panel_scene.ts:254-340`.

```typescript
private buildSlotsAndDrag(traineeIds: readonly (string | null)[], capacity: number): void {
  const xs = slotXs(capacity);
  const state = appState.get();
  const allHeroes = listHeroes(state.roster);

  // 1) Slot drop-zones (always rendered, capacity count).
  const slotDropZones: Phaser.GameObjects.Rectangle[] = xs.map((x) => {
    const zone = this.add
      .rectangle(x, SLOT_Y, SLOT_W, SLOT_H, 0x000000, 0)
      .setStrokeStyle(1, 0x668866, 0.7)
      .setInteractive({ dropZone: true });
    return zone;
  });

  // 2) Slot cards — render the assigned hero, or an "(empty)" label.
  xs.forEach((x, slotIndex) => {
    const slotId = traineeIds[slotIndex] ?? null;
    if (slotId === null) {
      this.add.text(x, SLOT_Y, '(empty)', {
        fontFamily: 'monospace', fontSize: '13px', color: '#666666',
      }).setOrigin(0.5);
      return;
    }
    const hero = allHeroes.find((h) => h.id === slotId);
    if (!hero) {
      // Orphan — normalizeSaveFile should have scrubbed this, but render safely.
      this.add.text(x, SLOT_Y, '(missing)', {
        fontFamily: 'monospace', fontSize: '13px', color: '#aa6666',
      }).setOrigin(0.5);
      return;
    }
    const card = new HeroCard(this, x, SLOT_Y, hero, { draggable: true, compact: true });
    this.makeSlotCardDraggable(card, slotIndex, slotDropZones);
  });

  // 3) Eligible grid — every hero NOT currently in a slot.
  const assignedSet = new Set(traineeIds.filter((id): id is string => id !== null));
  const eligible = allHeroes.filter((h) => !assignedSet.has(h.id));
  eligible.forEach((hero, i) => {
    const col = i % ELIGIBLE_COLS;
    const row = Math.floor(i / ELIGIBLE_COLS);
    const x = PANEL_CX - 360 + col * 240;
    const y = ELIGIBLE_Y_BASE + row * ELIGIBLE_Y_STRIDE;
    const card = new HeroCard(this, x, y, hero, { draggable: true, compact: true });
    this.makeEligibleCardDraggable(card, hero.id, slotDropZones);
  });
}

private makeSlotCardDraggable(
  card: HeroCard,
  fromSlotIndex: number,
  slotDropZones: readonly Phaser.GameObjects.Rectangle[],
): void {
  const homeX = card.x;
  const homeY = card.y;

  card.events.on('dragstart', () => { /* visual lift omitted */ });
  card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
    card.x = pointer.x;
    card.y = pointer.y;
  });
  card.events.on('drop', (_p: Phaser.Input.Pointer, dropZone: Phaser.GameObjects.GameObject) => {
    const toSlotIndex = slotDropZones.indexOf(dropZone as Phaser.GameObjects.Rectangle);
    if (toSlotIndex < 0 || toSlotIndex === fromSlotIndex) {
      card.x = homeX; card.y = homeY;
      return;
    }
    // Swap slot contents
    this.updateSlots((ids) => {
      const next = ids.slice();
      const tmp = next[fromSlotIndex];
      next[fromSlotIndex] = next[toSlotIndex];
      next[toSlotIndex] = tmp;
      return next;
    });
    this.scene.restart();
  });
  card.events.on('dragend', (_p: Phaser.Input.Pointer, _dx: number, _dy: number, dropped: boolean) => {
    if (!dropped) {
      // Dropped outside any slot → unassign this slot.
      this.updateSlots((ids) => ids.map((id, i) => (i === fromSlotIndex ? null : id)));
      this.scene.restart();
    }
  });
}

private makeEligibleCardDraggable(
  card: HeroCard,
  heroId: string,
  slotDropZones: readonly Phaser.GameObjects.Rectangle[],
): void {
  const homeX = card.x;
  const homeY = card.y;

  card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
    card.x = pointer.x;
    card.y = pointer.y;
  });
  card.events.on('drop', (_p: Phaser.Input.Pointer, dropZone: Phaser.GameObjects.GameObject) => {
    const toSlotIndex = slotDropZones.indexOf(dropZone as Phaser.GameObjects.Rectangle);
    if (toSlotIndex < 0) {
      card.x = homeX; card.y = homeY;
      return;
    }
    this.updateSlots((ids) => ids.map((id, i) => (i === toSlotIndex ? heroId : id)));
    this.scene.restart();
  });
  card.events.on('dragend', (_p: Phaser.Input.Pointer, _dx: number, _dy: number, dropped: boolean) => {
    if (!dropped) {
      card.x = homeX; card.y = homeY;
    }
  });
}

private updateSlots(
  fn: (ids: readonly (string | null)[]) => readonly (string | null)[],
): void {
  appState.update((s) => ({ ...s, traineeHeroIds: fn(s.traineeHeroIds) }));
}
```

- [ ] **Step 3: Implement the upgrade button**

```typescript
private buildUpgradeButton(level: BuildingLevel): void {
  const next = nextLevel('training_grounds', level);
  if (!next) return;   // already L3
  const state = appState.get();
  const canAfford = balance(state.vault) >= next.upgradeCost;

  const label = `Upgrade to L${next.level} — ${next.upgradeCost}g`;
  const bg = this.add.rectangle(PANEL_CX, UPGRADE_Y, 280, 36, canAfford ? 0x336633 : 0x333333)
    .setStrokeStyle(2, canAfford ? 0x66aa66 : 0x555555);
  this.add.text(PANEL_CX, UPGRADE_Y, label, {
    fontFamily: 'monospace', fontSize: '14px', color: canAfford ? '#aaddaa' : '#666666',
  }).setOrigin(0.5);

  if (!canAfford) return;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => {
    appState.update((s) => {
      const nextVault = spend(s.vault, next.upgradeCost);
      return {
        ...s,
        vault: nextVault,
        buildingLevels: { ...s.buildingLevels, training_grounds: next.level },
        traineeHeroIds: [...s.traineeHeroIds, null],
      };
    });
    this.scene.restart();
  });
}
```

- [ ] **Step 4: Implement the close button**

```typescript
private buildCloseButton(): void {
  const bg = this.add.rectangle(CLOSE_X, CLOSE_Y, 40, 30, 0x333333).setStrokeStyle(1, 0x666666);
  this.add.text(CLOSE_X, CLOSE_Y, '×', {
    fontFamily: 'monospace', fontSize: '18px', color: '#cccccc',
  }).setOrigin(0.5);
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => this.scene.stop());
}
```

- [ ] **Step 5: Register the scene in `src/main.ts`**

Find the scene registration array and add:

```typescript
import { TrainingGroundsPanelScene } from '@scenes/training_grounds_panel_scene';
// …
scene: [
  /* existing scenes */
  TrainingGroundsPanelScene,
],
```

- [ ] **Step 6: Build verification**

Run: `npm run build`
Expected: clean.

Run: `npm test`
Expected: PASS overall — no new unit tests, no breakage in existing.

- [ ] **Step 7: Manual smoke test (post-implementation)**

Force-unlock Training Grounds via the dev console or by manually editing `localStorage`'s save (add `'training_grounds'` to `unlocks.buildings`). Open the camp scene, click the Training tile:

- Panel opens with N slot cards (N = 2 at L1).
- Eligible grid shows roster heroes minus any assigned.
- Drag a hero from grid → empty slot → slot is filled; reopen → assignment persists.
- Drag from filled slot → empty slot → swap.
- Drag a slot card outside any drop zone → slot empties.
- Click Upgrade → L2; 3rd slot appears.

Don't block on UX polish at this step — just verify the data path is alive.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/training_grounds_panel_scene.ts src/main.ts
git commit -m "Training Grounds — panel scene with drag-into-slot UX"
```

---

## Phase 9 — Run-completion hooks (cashout + wipe + toast)

### Task 9: Call `grantTraineeXp` from cashout (`camp_screen_scene.ts`) and wipe (`corridor_scene.ts`); render the one-liner toast

**Files:**
- Modify: `src/scenes/camp_screen_scene.ts` (cashout hook + toast on cashout result)
- Modify: `src/scenes/corridor_scene.ts` (wipe hook + toast on wipe result)

These are scene-only changes; no new unit tests (per repo pattern). Manual smoke at the end.

- [ ] **Step 1: Cashout hook — `camp_screen_scene.ts:171-210` (`onLeave`)**

At the top of the file, add the import:

```typescript
import { grantTraineeXp } from '@camp/trainee_xp';
```

Find the existing `onLeave` method (line 171-210). It currently uses `appState.update((s) => { … return applyPendingMilestones(next, …); })`. Refactor to compute trainee-xp BEFORE the milestone application, and stash the result for the toast.

The cashout path's `runState` carries `traineeXpBase` directly; read it from `run` (the `runState` snapshot already captured at line 172).

Refactor:

```typescript
private onLeave(): void {
  const run = appState.get().runState!;
  const { outcome } = cashout(run);
  const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
  const lostIds = new Set(outcome.heroesLost.map((h) => h.id));

  const activeIds = [
    ...outcome.heroesReturned.map((h) => h.id),
    ...outcome.heroesFallen.map((h) => h.id),
    ...outcome.heroesLost.map((h) => h.id),
  ];

  appState.update((s) => {
    const vault = credit(s.vault, outcome.goldBanked);
    const stash = addItems(s.stash, outcome.itemsBanked);
    let roster = s.roster;
    for (const survivor of outcome.heroesReturned) {
      if (roster.heroes.some((h) => h.id === survivor.id)) {
        roster = updateHero(roster, survivor);
      }
    }
    for (const id of fallenIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    for (const id of lostIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    roster = tickRosterWounds(roster, hospitalTickAmount(s.buildingLevels.hospital));
    const next: SaveFile = {
      ...s,
      vault,
      stash,
      roster,
      hospitalTreatmentsRemaining: hospitalTreatmentCap(s.buildingLevels.hospital),
      runState: undefined,
      runRngState: undefined,
    };
    const grant = grantTraineeXp(next, run.traineeXpBase, activeIds);
    return applyPendingMilestones(grant.state, outcome.milestonesTriggered);
  });

  this.scene.start('camp');
}
```

Add a `SaveFile` import at the top if it isn't there already (likely is — `RunState` is imported via `'@run/run_state'`).

**Toast on the cashout result view:** the cashout result is a separate render path. `onLeave` is the "Leave" button handler that DISPATCHES the transition to camp. The trainee-XP toast belongs on the result-summary view that's rendered when the player arrives at the camp_screen state pre-leave.

Re-read `camp_screen_scene.ts:create()` (line 35-) — this is where the cashout summary is rendered. The toast goes here, before the player clicks Leave. But the grant doesn't happen until the player clicks Leave — chicken-and-egg.

**Resolution:** compute the would-be grant in `create()` (without mutating state) by calling `grantTraineeXp` on a hypothetical `next` SaveFile. Display the toast immediately. The actual grant in `onLeave` applies it. The two calls produce identical `xpPerTrainee` and `eligibleCount`.

Add to `create()` after the existing pack pill rendering (around line 78):

```typescript
// Trainee XP preview — same math the cashout grant will use on Leave.
const previewState = appState.get();
const previewActiveIds = [
  ...run.party.map((h) => h.id),
  ...run.fallen.map((h) => h.id),
  ...run.lost.map((h) => h.id),
];
const preview = grantTraineeXp(previewState, run.traineeXpBase, previewActiveIds);
if (preview.eligibleCount > 0) {
  const trainees = preview.eligibleCount;
  const xp = preview.xpPerTrainee;
  this.add.text(
    480, 160,
    `Training Grounds: ${trainees} trainee${trainees === 1 ? '' : 's'} will gain ${xp} XP.`,
    { fontFamily: 'monospace', fontSize: '14px', color: '#aaddaa' },
  ).setOrigin(0.5);
}
```

Adjust `y=160` if it overlaps the pack pill at `y=130` — tune to the layout (e.g., move to `y=170` if needed).

- [ ] **Step 2: Wipe hook — `corridor_scene.ts:1296-1325` (`onWipeReturn`)**

At the top of the file, add:

```typescript
import { grantTraineeXp } from '@camp/trainee_xp';
```

Refactor `onWipeReturn`:

```typescript
private onWipeReturn(): void {
  const wipe = this.wipeOutcome!;
  const fallenIds = new Set(wipe.heroesFallen.map((h) => h.id));
  const lostIds = new Set(wipe.heroesLost.map((h) => h.id));

  const activeIds = [
    ...wipe.heroesFallen.map((h) => h.id),
    ...wipe.heroesLost.map((h) => h.id),
  ];

  appState.update((s) => {
    let roster = s.roster;
    for (const id of fallenIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    for (const id of lostIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    roster = tickRosterWounds(roster, hospitalTickAmount(s.buildingLevels.hospital));
    const next: SaveFile = {
      ...s,
      roster,
      hospitalTreatmentsRemaining: hospitalTreatmentCap(s.buildingLevels.hospital),
      runState: undefined,
      runRngState: undefined,
    };
    const grant = grantTraineeXp(next, wipe.traineeXpBase, activeIds);
    return applyPendingMilestones(grant.state, wipe.milestonesTriggered);
  });

  this.scene.start('camp');
}
```

**Toast on the wipe-result view:** the wipe panel is rendered around `corridor_scene.ts:1203-1294` (the `renderWipePanel` or similar method — search for `wipe.heroesFallen.length`). Add the preview line below the existing summary lines:

Read `corridor_scene.ts:1200-1294` and find the spot where the fallen/lost summary lines are pushed into the panel container. After the last summary line, insert:

```typescript
const previewState = appState.get();
const previewActiveIds = [
  ...wipe.heroesFallen.map((h) => h.id),
  ...wipe.heroesLost.map((h) => h.id),
];
const preview = grantTraineeXp(previewState, wipe.traineeXpBase, previewActiveIds);
if (preview.eligibleCount > 0) {
  const trainees = preview.eligibleCount;
  const xp = preview.xpPerTrainee;
  const toast = this.add.text(
    480, /* compute y based on existing summary stack */,
    `Training Grounds: ${trainees} trainee${trainees === 1 ? '' : 's'} will gain ${xp} XP.`,
    { fontFamily: 'monospace', fontSize: '14px', color: '#aaddaa' },
  ).setOrigin(0.5);
  /* push toast into the wipe panel's container */
}
```

(The exact y-coordinate and container-push pattern depends on the existing wipe panel structure — match what the implementer sees in the file at that line range.)

- [ ] **Step 3: Verify build and tests still pass**

Run: `npm run build`
Expected: clean.

Run: `npm test`
Expected: PASS overall.

- [ ] **Step 4: Manual smoke test**

End-to-end run:
1. Force-unlock Training Grounds (edit save in localStorage to include `'training_grounds'` in `unlocks.buildings`).
2. Open Training Grounds, assign 1-2 heroes to slots.
3. Start an expedition with DIFFERENT heroes (so trainees are bench-only).
4. Cash out at the first boss → result panel shows "Training Grounds: 2 trainees will gain X XP." Click Leave → return to camp.
5. Open Barracks → confirm the trainees' XP increased by X (visible on their hero cards if level didn't change).
6. Repeat with a deliberate wipe (low-level party against tier-2 boss) → wipe panel shows the same toast → return to camp → trainees still gained XP (per the "time spent training" framing).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/camp_screen_scene.ts src/scenes/corridor_scene.ts
git commit -m "Training Grounds — cashout + wipe hooks grant trainee XP, render toast"
```

---

## Phase 10 — gdd patch + final verification

### Task 10: gdd §6 row 7 patch + final smoke

**Files:**
- Modify: `gdd.md` (row 7 description)

- [ ] **Step 1: Patch gdd §6 row 7**

In `gdd.md`, find line 199 (the Training Grounds row). Current text:

```
| **Training Grounds** *(unlock)* | Benched heroes passively gain XP from every completed run (active or not). XP gain is pro-rated against what an active hero of the same level would have earned on that run, so deep runs train better. Gained on both cashout and wipe; wipes pay less. | L1: 2 trainee slots, 25% pro-rated XP / L2: 3 slots, 40% / L3: 4 slots, 55%. Unlocks: first Sunken Keep clear. |
```

Replace with:

```
| **Training Grounds** *(unlock)* | Benched heroes assigned to trainee slots passively gain XP from every completed run, pro-rated against what an active hero earned on that run — so deep runs train better. Gained on every completed run regardless of outcome; trainee XP reflects time spent training. | L1: 2 trainee slots, 25% pro-rated XP / L2: 3 slots, 40% / L3: 4 slots, 55%. Unlocks: first Sunken Keep clear. |
```

Key changes:
- "Benched heroes" → "Benched heroes assigned to trainee slots" (the slot mechanic is explicit).
- "(active or not)" parenthetical dropped (replaced by the assignment language).
- "of the same level" dropped (the implementation's XP base is the run's cleared-node yield sum, independent of trainee level).
- "Gained on both cashout and wipe; wipes pay less." → "Gained on every completed run regardless of outcome; trainee XP reflects time spent training." (matches locked decision).

- [ ] **Step 2: Run the full verification gate**

Run: `npm test`
Expected: PASS overall (≥1848 tests + the new ones — exact baseline at implementation time).

Run: `npm run build`
Expected: clean.

Run: `npx tsc --noEmit`
Expected: clean (already covered by build, but verifies types in isolation).

- [ ] **Step 3: End-to-end smoke**

1. Fresh save (clear localStorage). Start a fresh run, clear Crypt — Paladin unlocks (existing milestone), Training Grounds remains locked.
2. Run Sunken Keep, clear floor-3 boss → cash out → on return to camp, Training Grounds tile appears alongside Chapel.
3. Open Training Grounds → assign 2 heroes → close → reopen → assignments persist.
4. Run a Crypt expedition with different heroes → cash out → toast shows "Training Grounds: 2 trainees will gain X XP."
5. Confirm trainees' XP increased in Barracks.
6. Upgrade Training Grounds to L2 → 3 slots appear → assign one more.
7. Wipe a run → toast on wipe panel; trainees still gained XP.
8. Dismiss an assigned trainee via Barracks → reopen Training Grounds → that slot is empty (normalize scrub).

- [ ] **Step 4: Commit**

```bash
git add gdd.md
git commit -m "Training Grounds — gdd §6 row 7 patch (drop wipes-pay-less, clarify slot mechanic)"
```

---

## Self-Review Checklist (writing-plans skill)

### Spec coverage

Walking each section of the spec:

- **Scope: BuildingId widening** — Task 1 ✓
- **Scope: BUILDING_LEVELS.training_grounds + TRAINEE_* constants** — Task 1 ✓
- **Scope: RunState.traineeXpBase accumulator + 2 grant sites** — Task 4 ✓
- **Scope: WipeOutcome.traineeXpBase** — Task 4 ✓
- **Scope: SaveFile.traineeHeroIds + normalize scrub** — Task 2 ✓
- **Scope: grantTraineeXp helper module** — Task 5 ✓
- **Scope: Training Grounds panel scene with drag UX** — Task 8 ✓
- **Scope: Camp tile + lookup-driven build loop** — Task 7 ✓
- **Scope: Milestone handler extension** — Task 6 ✓
- **Scope: main.ts scene registration** — Task 8 ✓
- **Scope: Save schema v4 → v5 + migration** — Task 3 ✓
- **Scope: createDefaultUnlocks unchanged; createFreshSave updated** — Task 2 ✓
- **Scope: normalizeSaveFile orphan scrub** — Task 2 ✓
- **Scope: Run-completion hooks** — Task 9 ✓
- **Scope: One-liner toast on result panels** — Task 9 ✓
- **Scope: gdd §6 row 7 patch** — Task 10 ✓
- **Scope: Tests in lockstep** — covered task-by-task (1-6, 9) ✓

### Placeholder scan

No "TBD", "TODO", "fill in", "similar to" patterns. Every code block is concrete.

One soft spot: Task 9 Step 2's wipe-toast y-coordinate is described as "compute y based on existing summary stack" — this is intentional because the wipe panel layout requires reading the file at implementation time, but the surrounding context (push into the wipe panel's container, after the last summary line) is concrete enough that the implementer can resolve it from the file. Acceptable.

### Type consistency

- `grantTraineeXp` signature in Task 5 (`(state, traineeXpBase, activeHeroIds) → { state, xpPerTrainee, eligibleCount }`) matches the call sites in Task 9.
- `TRAINEE_SLOT_CAPACITY` and `TRAINEE_PRO_RATE` exports in Task 1 match the imports in Task 5 and Task 8.
- `SaveFile.traineeHeroIds: readonly (string | null)[]` defined in Task 2 matches usage in Task 5 (`state.traineeHeroIds` iteration) and Task 8 (`s.traineeHeroIds` mutation).
- `RunState.traineeXpBase: number` defined in Task 4 matches read in Task 9 (`run.traineeXpBase`).
- `WipeOutcome.traineeXpBase` defined in Task 4 matches read in Task 9 (`wipe.traineeXpBase`).

### Decomposition check

Each task ends in a passing test + clean build state. Order matters:
- Task 1 introduces the type widening that Task 2 depends on.
- Task 2 introduces `traineeHeroIds` that Task 5's tests construct.
- Task 4 introduces `traineeXpBase` that Task 5 ignores but Task 9 reads.
- Task 5's helper is consumed by Task 9.
- Task 7 (camp tile) and Task 8 (panel scene) can be reordered if convenient — Task 7's camp scene refactor compiles without the panel scene if Task 8's main.ts registration is deferred.

No circular dependencies; no task requires output from a later task.

---

## Execution

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.
