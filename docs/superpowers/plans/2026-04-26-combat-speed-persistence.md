# Combat speed persistence implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the player's combat-speed (1× or 3×) toggle to the save file so the choice survives both scene transitions and page reloads.

**Architecture:** Add an optional `preferences: { combatSpeed: 1 | 3 }` field to `SaveFile`. The combat scene reads it on `create()` (defaulting to `1`) and writes back via `appState.update()` whenever the player toggles. No save-version bump and no migration — old saves load unchanged because the field is optional and the loader's plausibility check only requires `version`.

**Tech Stack:** TypeScript, Vitest, Phaser (combat scene only).

**Spec:** `docs/superpowers/specs/2026-04-26-combat-speed-persistence-design.md`

---

## File Structure

- **Modify** `src/save/save.ts` — add `Preferences` interface + optional `preferences` field on `SaveFile`.
- **Modify** `src/save/__tests__/save.test.ts` — add round-trip test for `preferences`; add backward-compat test for old saves without it.
- **Modify** `src/scenes/combat_scene.ts` — read `preferences.combatSpeed` in `create()`, derive HUD initial state from it, call `playback.setSpeed()` after construction, persist in `toggleSpeed()`.
- **Modify** `TODO.md` — remove task 20.
- **Modify** `HISTORY.md` — add the completed entry with decision context.

No new files. No deletions.

---

## Task 1: Add `Preferences` type to the save schema

**Files:**
- Modify: `src/save/save.ts:10-17`
- Test: `src/save/__tests__/save.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/save/__tests__/save.test.ts` inside the existing `describe('save / load roundtrip', ...)` block (after the existing `it('save throws if runRngState present without runState', ...)` test on line 88):

```ts
  it('round-trips preferences.combatSpeed', () => {
    const storage = new MemoryStorage();
    const original: SaveFile = {
      ...makeBaseSave(),
      preferences: { combatSpeed: 3 },
    };
    save(original, storage);
    const loaded = load(storage);
    expect(loaded?.preferences).toEqual({ combatSpeed: 3 });
  });

  it('loads an old save without preferences (field is optional)', () => {
    const storage = new MemoryStorage();
    save(makeBaseSave(), storage);
    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.preferences).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify the first one fails to compile**

Run: `npx vitest run src/save/__tests__/save.test.ts`
Expected: TypeScript error on `preferences: { combatSpeed: 3 }` — "Object literal may only specify known properties, and 'preferences' does not exist in type 'SaveFile'." The second test will compile but is meaningful as a regression guard once the field exists.

- [ ] **Step 3: Add the `Preferences` interface and the optional field**

In `src/save/save.ts`, replace the `SaveFile` interface (currently lines 10-17) with:

```ts
export interface SaveFile {
  version: number;
  roster: Roster;
  vault: Vault;
  unlocks: Unlocks;
  runState?: RunState;
  runRngState?: number;
  preferences?: Preferences;
}

export interface Preferences {
  combatSpeed: 1 | 3;
}
```

No other changes to `save.ts` — `save()` and `load()` already pass through arbitrary optional fields via `JSON.stringify`/`JSON.parse`, and `migrate()` returns the parsed object as-is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/save/__tests__/save.test.ts`
Expected: PASS for both new tests, no regressions in existing tests.

- [ ] **Step 5: Run the full test suite to confirm no other regressions**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit when the user approves**

Per project convention (CLAUDE.md): do **not** create the commit unless the user explicitly asks. Leave the changes in the working tree and tell them what's staged-able.

---

## Task 2: Read the persisted speed in combat scene `create()`

**Files:**
- Modify: `src/scenes/combat_scene.ts:39-87`

- [ ] **Step 1: Replace the hardcoded `this.speed = 1` with a read from `appState`**

In `src/scenes/combat_scene.ts`, change line 42 from:

```ts
    this.speed = 1;
```

to:

```ts
    this.speed = appState.get().preferences?.combatSpeed ?? 1;
```

`appState` is already imported on line 12.

- [ ] **Step 2: Derive the FF HUD label from `this.speed`**

In `src/scenes/combat_scene.ts:125-131`, change the `ffLabel` construction so the initial text reflects the current speed. Replace:

```ts
    this.ffLabel = this.add
      .text(FF_X - FF_W / 2, FF_Y + FF_H / 2, '1×', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
```

with:

```ts
    this.ffLabel = this.add
      .text(FF_X - FF_W / 2, FF_Y + FF_H / 2, `${this.speed}×`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
```

- [ ] **Step 3: Derive the FF HUD stroke color from `this.speed`**

In `src/scenes/combat_scene.ts:121-124`, change the `ffBg` stroke so it's green when starting at 3×. Replace:

```ts
    this.ffBg = this.add
      .rectangle(FF_X, FF_Y, FF_W, FF_H, 0x222222)
      .setOrigin(1, 0)
      .setStrokeStyle(2, 0x666666);
```

with:

```ts
    this.ffBg = this.add
      .rectangle(FF_X, FF_Y, FF_W, FF_H, 0x222222)
      .setOrigin(1, 0)
      .setStrokeStyle(2, this.speed === 3 ? 0x44cc44 : 0x666666);
```

- [ ] **Step 4: Apply the speed to playback after construction**

In `src/scenes/combat_scene.ts`, after `this.playback = new CombatPlayback(...)` is constructed and before `void this.playback.run()` (currently around lines 67-86), add a `setSpeed` call. The existing block (after edit) should look like:

```ts
    this.playback = new CombatPlayback(
      this,
      result.events,
      this.actors,
      hud,
      combatState,
      displayNames,
    );
    this.playback.setSpeed(this.speed);
    this.playback.onComplete = () => {
      setCombatResult(result, rng.getState());
      this.scene.start('dungeon');
    };
```

`CombatPlayback.setSpeed` (`combat_playback.ts:98-101`) sets `scene.tweens.timeScale` and `scene.time.timeScale` — that's how playback speed is actually applied. Calling it once with `this.speed` correctly handles both `1` (re-applies the default after the shutdown reset) and `3` (restores the persisted preference).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. (This file is past the Phaser firewall, so no unit tests cover it directly — but the build and existing tests must remain green.)

---

## Task 3: Persist the toggle on player click

**Files:**
- Modify: `src/scenes/combat_scene.ts:139-144`

- [ ] **Step 1: Write back to `appState` inside `toggleSpeed()`**

In `src/scenes/combat_scene.ts`, replace the `toggleSpeed` method (currently lines 139-144) with:

```ts
  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 3 : 1;
    this.playback?.setSpeed(this.speed);
    this.ffLabel.setText(`${this.speed}×`);
    this.ffBg.setStrokeStyle(2, this.speed === 3 ? 0x44cc44 : 0x666666);
    appState.update((s) => ({
      ...s,
      preferences: { ...s.preferences, combatSpeed: this.speed },
    }));
  }
```

The `...s.preferences` spread is harmless when `s.preferences` is `undefined` (spreading `undefined` is a no-op in object spread) and forward-compatible when other preferences are added later.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Manual smoke test in the browser**

Run: `npm run dev` and open the dev server URL.

Verify:
1. Start a fresh save (clear localStorage in devtools first if needed). Enter combat. The FF button shows `1×` with a gray stroke. ✓
2. Click the FF button. It changes to `3×` with a green stroke; tweens visibly speed up. ✓
3. Finish the combat (let it auto-resolve). Enter the next combat. The FF button starts at `3×` with a green stroke; tweens are still fast. ✓
4. Reload the page (F5) mid-run. Resume into another combat. The FF button still starts at `3×`. ✓
5. Open devtools → Application → Local Storage → inspect the `pixel-battle-game/save` key. The JSON contains `"preferences":{"combatSpeed":3}`. ✓
6. Click the FF button to toggle back to `1×`. Reload. Next combat starts at `1×`. The localStorage value reads `"combatSpeed":1`. ✓

If any check fails, debug before moving on.

- [ ] **Step 5: Commit when the user approves**

Per project convention: do not commit without explicit user instruction. Report what's ready to be committed and wait.

---

## Task 4: Move the TODO entry to HISTORY

**Files:**
- Modify: `TODO.md` (remove task 20 section, lines 36-47)
- Modify: `HISTORY.md` (prepend the completed entry)

- [ ] **Step 1: Read `HISTORY.md` to match the existing entry format**

Read the top ~50 lines of `HISTORY.md` to see how recent entries are structured (heading style, metadata fields, body shape).

- [ ] **Step 2: Remove task 20 from `TODO.md`**

Delete the `### 20 · Combat speed toggle persists between combats` section and its bullets (currently lines 36-47 of `TODO.md`). Leave the `### 19 · Enemy art for Crypt` section untouched directly below it. Confirm no stray blank lines are left behind.

- [ ] **Step 3: Add the entry to the top of `HISTORY.md`**

Prepend a new section that captures:
- **What was done:** added optional `preferences.combatSpeed` to `SaveFile`; combat scene reads it on `create()` and persists on toggle.
- **Why cross-session over in-session:** save plumbing already existed via `appState.update()`, so the marginal cost was tiny; reload-friendliness matches ARPG convention; sets up a `preferences` slot for future settings (audio mute, autosave, etc.).
- **Why no schema bump or migration:** the field is optional; `load`'s `isPlausibleRawSave` only checks `version`; `migrate` passes extra fields through. Old saves load with `preferences === undefined` and behave as 1×.
- **Surprises / decisions during implementation:** record any (e.g., if the manual smoke test surfaced something not anticipated). If none, say so explicitly.

Match the heading and metadata style of the existing top entry exactly.

- [ ] **Step 4: Commit when the user approves**

Per project convention: report what's ready and wait for explicit instruction.

---

## Self-review (writer's pre-flight)

- **Spec coverage** — schema change (Task 1), read site (Task 2 steps 1–4), write site (Task 3 step 1), shutdown handler reasoning (already in spec; no code change needed because Task 2 step 4's `setSpeed(this.speed)` re-applies after the shutdown reset), tests (Task 1 steps 1, 3), manual acceptance (Task 3 step 4). All covered.
- **Placeholder scan** — no TBDs, no "handle edge cases", every code step shows the actual code.
- **Type consistency** — `Preferences` interface defined once in Task 1 with `combatSpeed: 1 | 3`; later tasks use exactly that name and shape. `appState.get()`, `appState.update()`, `playback.setSpeed()` all match the existing signatures verified in `app_state.ts:12-26` and `combat_playback.ts:98-101`.
- **Project conventions honored** — no auto-commits; commits gated on explicit user approval per `CLAUDE.md`.
