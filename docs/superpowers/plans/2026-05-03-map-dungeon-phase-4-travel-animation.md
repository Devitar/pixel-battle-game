# Map-Based Dungeon Scene — Phase 4 (Travel Animation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give travel between map nodes weight via tweened party-token movement, with a player-facing 1×/3× speed toggle (mirrored from the combat-speed precedent) so veteran players can speed past travel without skipping mid-travel events that Phase 6+ will introduce.

**Architecture:** Three substantive tasks plus housekeeping. The post-Phase-3 click-to-advance flow already routes ALL inter-node movement through the `setState('walking_to_next')` tween in `dungeon_scene.ts` — the existing 600ms cubic tween moves the party token from the just-cleared node to the clicked next node. So Phase 4 is smaller than originally scoped: (1) thread a persistent `walkSpeed: 1 | 3` preference through `Preferences` + save normalizer, (2) read it in the dungeon scene and apply as a duration divisor on `WALK_NEXT_DURATION` and `WALK_IN_DURATION`, (3) add a 1×/3× toggle button + F key binding mirroring `combat_scene.ts`. Plus minor cleanup of the now-dead `processCombatReturn` snap (currentNodeId no longer changes after `completeCombat`, so the snap is a no-op).

The 1×/3× choice rules out click-to-skip — Phase 6+ will add surprise encounters, passive HP changes, and hero chatter that fire mid-travel; click-to-skip would bypass them. Persistent speed scales the tween while still letting events fire at proportional points.

**Tech Stack:** TypeScript 6 (strict), Vitest 4, Phaser 4 (`tweens.add({ duration: ... })`, `Rectangle.setInteractive`, keyboard binding via `this.input.keyboard?.on('keydown-F', ...)`).

**Spec:** TODO.md Cluster B · 30 Phase 4 ("Heroes walk-tween between nodes when the player picks. Player can fast-forward.") plus the locked design choice from this conversation: **persistent 1×/3× preference, mirroring `Preferences.combatSpeed`** — chosen over click-to-skip because Phase 6+ adds mid-travel events that must not be bypassable. No separate spec file; the design fits in one paragraph and is captured here.

**Repo conventions** (from CLAUDE.md / memory):
- **No commits anywhere in this plan.** The user runs commits manually.
- The Phaser firewall: `save/` and `data/` files MUST NOT `import 'phaser'`. The Preferences extension is pure TS.
- Save schema stays at version 1; no migrations. `walkSpeed` is an additive optional field on `Preferences`; the existing `?? 1` read pattern handles old saves with no defaulting work in `normalizeSaveFile`.
- Don't materialize empty directories.
- HISTORY entries use the slim template (~15-25 lines).

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/save/save.ts` | **Modify** | Add `walkSpeed?: 1 \| 3` to `Preferences` interface. Optional — no normalizer change needed; the existing `?? 1` read pattern handles unset values. ~1 line. |
| `src/save/__tests__/save.test.ts` | **Modify** | Add a roundtrip test for `preferences.walkSpeed`. ~15 lines. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Read `walkSpeed` at create; apply as duration divisor on the two `tweenPartyTo` calls; add toggle button + F key; persist on toggle. Remove now-dead snap in `processCombatReturn`. ~50 lines net change. |
| `TODO.md` | **Modify** (Task 4) | Mark Phase 4 ✅ inline. |
| `HISTORY.md` | **Modify** (Task 4) | Slim entry at the top per template. |

No new files. The visibility / layout / generator modules from Phases 1-3 are untouched.

---

## Task 1: Preferences extension — `walkSpeed: 1 | 3`

After this task: green build, `Preferences` carries an optional `walkSpeed` field, save roundtrip preserves it, no scene changes yet.

**Files:**
- Modify: `src/save/save.ts`
- Modify: `src/save/__tests__/save.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1469 tests pass. Note the count.

- [ ] **Step 1.2: Add `walkSpeed` to the `Preferences` interface**

Open `src/save/save.ts`. Find the `Preferences` interface (around line 32) and add the field:

```ts
export interface Preferences {
  combatSpeed: 1 | 3;
  walkSpeed?: 1 | 3;
}
```

The `?` makes it optional, so existing saves with `preferences: { combatSpeed: 1 }` (no `walkSpeed`) load unchanged. Read sites use `?? 1` exactly as the combat-scene pattern does.

- [ ] **Step 1.3: Add a save-roundtrip test for `walkSpeed`**

Open `src/save/__tests__/save.test.ts`. Find the existing `round-trips preferences.combatSpeed` test (around line 102). Add a sibling test right after it:

```ts
it('round-trips preferences.walkSpeed', () => {
  const storage = new MemoryStorage();
  const original: SaveFile = {
    ...makeBaseSave(),
    preferences: { combatSpeed: 1, walkSpeed: 3 },
  };
  save(original, storage);
  const loaded = load(storage);
  expect(loaded?.preferences?.walkSpeed).toBe(3);
});

it('loads an old save with combatSpeed but no walkSpeed (field is optional)', () => {
  const storage = new MemoryStorage();
  const original: SaveFile = {
    ...makeBaseSave(),
    preferences: { combatSpeed: 3 },
  };
  save(original, storage);
  const loaded = load(storage);
  expect(loaded?.preferences?.combatSpeed).toBe(3);
  expect(loaded?.preferences?.walkSpeed).toBeUndefined();
});
```

- [ ] **Step 1.4: Run new tests**

Run: `npx vitest run src/save/__tests__/save.test.ts -t "walkSpeed"`

Expected: BOTH new tests pass.

- [ ] **Step 1.5: Full-suite run for Task 1**

Run: `npm test`

Expected: ALL tests pass; count up by 2 (1469 → 1471).

---

## Task 2: Speed-aware tween durations + dead-snap cleanup

After this task: party token tweens at 1× by default, but reads `appState.get().preferences?.walkSpeed ?? 1` and divides duration by it. The toggle UI doesn't exist yet (Task 3), so the field stays at 1 unless the player edits localStorage directly. Behavioral parity with current state — verifies the multiplier wiring without coupling to UI.

Also removes the now-dead snap in `processCombatReturn` (the click-to-advance change made it a no-op: `currentNodeId` doesn't change after `completeCombat`, so snapping the party token to it is moving from `(x, y)` to `(x, y)`).

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

- [ ] **Step 2.1: Add a `walkSpeed` field on the scene**

Open `src/scenes/dungeon_scene.ts`. Find the field declarations (around line 70-76, near `private layout`). Add:

```ts
private walkSpeed: 1 | 3 = 1;
```

- [ ] **Step 2.2: Read `walkSpeed` at scene create**

Find `create()` (around line 94). Right after the `state` retrieval and the in-dungeon guard (around line 109), add:

```ts
this.walkSpeed = state.preferences?.walkSpeed ?? 1;
```

Place it right before the `this.layout = computeMapLayout(...)` line so it's set before any rendering.

- [ ] **Step 2.3: Apply `walkSpeed` as duration divisor in `tweenPartyTo`**

Find the `tweenPartyTo` method (around line 343). Update the body:

```ts
private tweenPartyTo(
  targetX: number,
  targetY: number,
  duration: number,
  ease: string,
  onComplete: () => void,
): void {
  this.tweens.add({
    targets: this.partyToken,
    x: targetX,
    y: targetY,
    duration: duration / this.walkSpeed,
    ease,
    onComplete,
  });
}
```

Both `setState('walking_in')` and `setState('walking_to_next')` callers feed `WALK_IN_DURATION` (800) and `WALK_NEXT_DURATION` (600) respectively into this method, so the divisor automatically applies to both.

- [ ] **Step 2.4: Remove the dead snap in `processCombatReturn`**

Find `processCombatReturn` (around line 143). Remove these lines:

```ts
// Snap the party token to the post-combat current node so the result panel
// is anchored sensibly. Actual walk animation lives in Phase 4.
const posAfter = this.partyTokenPosFor(nextRun.currentNodeId);
this.partyToken.x = posAfter.x;
this.partyToken.y = posAfter.y;
```

Replace with a one-line comment so a future reader knows this is intentional:

```ts
// Post-Phase-3 click-to-advance: completeCombat no longer changes currentNodeId
// (player clicks the next node to advance), so the party token stays in place
// while the result panel shows. The walking_to_next tween in onResultDismiss →
// onNodeClicked handles the actual movement when the player picks.
```

- [ ] **Step 2.5: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1471 tests pass.

If anything breaks, the likely cause is a typo in the field name. Read the error and fix in place.

---

## Task 3: Speed toggle button + F key binding

After this task: player sees a 1×/3× toggle button at top-right of the dungeon scene; click or press F to toggle; the choice persists across sessions via localStorage. Mirrors `combat_scene.ts:132-159` line-for-line.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

- [ ] **Step 3.1: Add FF button position constants**

Open `src/scenes/dungeon_scene.ts`. Find the constants block (around line 27-67). Add after the existing layout constants (around line 35, near `NODE_RADIUS`):

```ts
const FF_X = 944;
const FF_Y = 48;
const FF_W = 60;
const FF_H = 24;
```

Position is just below the pack HUD (`hudPack` at y=16, height ~14px) — visible without overlapping. Width/height match `combat_scene.ts`.

- [ ] **Step 3.2: Add field declarations for the toggle**

Find the field declarations (around line 70-76). Add after `private walkSpeed: 1 | 3 = 1;` (from Task 2):

```ts
private ffBg!: Phaser.GameObjects.Rectangle;
private ffLabel!: Phaser.GameObjects.Text;
```

- [ ] **Step 3.3: Build the toggle in `buildHud`**

Find `buildHud` (around line 211). Append to the end of the method body, right after the `hudPack` setup:

```ts
this.ffBg = this.add
  .rectangle(FF_X, FF_Y, FF_W, FF_H, 0x222222)
  .setOrigin(1, 0)
  .setStrokeStyle(2, this.walkSpeed === 3 ? 0x44cc44 : 0x666666);
this.ffLabel = this.add
  .text(FF_X - FF_W / 2, FF_Y + FF_H / 2, `${this.walkSpeed}×`, {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: '#ffffff',
  })
  .setOrigin(0.5);
this.ffBg.setInteractive({ useHandCursor: true });
this.ffBg.on('pointerdown', () => this.toggleWalkSpeed());
this.input.keyboard?.on('keydown-F', () => this.toggleWalkSpeed());
```

- [ ] **Step 3.4: Add `toggleWalkSpeed` method**

Find a good spot for a new method — after `tweenPartyTo` (around line 360 post-Task-2) is fine. Add:

```ts
private toggleWalkSpeed(): void {
  this.walkSpeed = this.walkSpeed === 1 ? 3 : 1;
  this.ffLabel.setText(`${this.walkSpeed}×`);
  this.ffBg.setStrokeStyle(2, this.walkSpeed === 3 ? 0x44cc44 : 0x666666);
  appState.update((s) => ({
    ...s,
    preferences: {
      combatSpeed: s.preferences?.combatSpeed ?? 1,
      walkSpeed: this.walkSpeed,
    },
  }));
}
```

The `combatSpeed: s.preferences?.combatSpeed ?? 1` preserves the existing combat speed; the `Preferences` interface requires `combatSpeed` (it's not optional), so we have to keep it explicit on every update.

- [ ] **Step 3.5: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1471 tests pass. No new tests added (scene UI isn't unit-tested in this repo per the Phase 1 / Phase 3 precedent).

If typecheck complains about `combatSpeed` not being assignable when it's `undefined`, the issue is the `?? 1` fallback above — verify the Preferences spread looks like the snippet in step 3.4.

- [ ] **Step 3.6: Manual smoke test instructions**

Per memory ("skip browser smoke by default"), do NOT auto-launch the browser. Prepare these instructions for the user:

```
Phase 4 visual smoke-test checklist:
1. `npm run dev`, open http://localhost:5173.
2. Start a fresh expedition into the Crypt.
3. Initial walk-in tween: party should walk from off-screen to start node at
   normal speed (~800ms).
4. Top-right of HUD: see "1×" button below the pack info. Click it; should
   change to "3×" with a green stroke.
5. Click a next-row node; the walk tween should be ~3× faster (~200ms instead
   of ~600ms).
6. Press F key on keyboard; toggle back to 1×; confirm slower walks resume.
7. Refresh the page; the walkSpeed preference should persist (button shows
   whatever it was set to).
8. Confirm that combat-speed preference (in combat scene) is independent —
   changing one doesn't change the other.
```

Report results to the user; do not run a script-driven browser smoke unless asked.

---

## Task 4: TODO + HISTORY housekeeping

After this task: TODO marks Phase 4 ✅; HISTORY entry filed.

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 4.1: Mark Phase 4 done in TODO.md**

Open `TODO.md`. Find the Phase 4 line in entry #30 acceptance bullets:

```
  - **Phase 4 — Travel animation.** Heroes walk-tween between nodes when the player picks. Player can fast-forward. (Former #39.) *Result: travel has weight.*
```

Replace with:

```
  - **Phase 4 — Travel animation.** ✅ *Shipped 2026-05-03 (see HISTORY).* Inter-node walking already worked post-Phase-3 click-to-advance (the existing `walking_to_next` tween is no longer zero-distance once `completeCombat` stopped auto-advancing). Phase 4 added a persistent 1×/3× walk-speed preference (mirroring combat speed) — chosen over click-to-skip because Phase 6+ adds mid-travel events that must not be bypassable. Toggle button + F key binding in the dungeon HUD; persists via `Preferences.walkSpeed`.
```

(Verify exact original via Read; date should be today's per `currentDate` context.)

- [ ] **Step 4.2: Add the HISTORY entry**

Open `HISTORY.md`. Insert at the top (newest-first), following the slim template:

```markdown
### 2026-05-03 · Map-based dungeon scene — Phase 4 (travel animation) (Cluster B · 30)

- **Why:** TODO #30 Phase 4. Original framing was "heroes walk-tween between nodes; player can fast-forward." After Phase 3's click-to-advance change, the existing `walking_to_next` tween was no longer zero-distance — it already animates real inter-node movement. So Phase 4 was scoped down to: add the speed control + clean up the now-dead `processCombatReturn` snap.
- **Decisions:**
  - **Persistent 1×/3× preference over click-to-skip.** Click-to-skip would short-circuit any mid-travel event Phase 6+ adds (surprise encounters, passive HP changes, hero chatter). Persistent speed scales the tween while still letting events fire at proportional points. Mirrors the existing `Preferences.combatSpeed` pattern line-for-line; F key binding consistent with combat for one mental model: "F = fast-forward."
  - **`walkSpeed` is optional on `Preferences`.** Old saves with no `walkSpeed` read as `undefined`, fall back to 1 via `?? 1` at the read sites. No `normalizeSaveFile` change needed — the field is leaf-level optional, same as `Preferences` itself was when it was first added.
  - **`processCombatReturn` snap removed.** Post-Phase-3, `completeCombat` no longer changes `currentNodeId`, so the snap was moving the party token from `(x, y)` to `(x, y)`. Replaced with a comment so future readers know the absence is intentional.
- **Surprises:**
  - **Phase 4 was already 80% done.** The Phase 1 HISTORY entry called out that the existing tween scaffold "moves zero distance" and flagged Phase 4 as the place to fix it. The fix turned out to be Phase 3's click-to-advance change (chooseNextNode walks from old to new currentNodeId), not Phase 4's job at all. Phase 4 thus shrunk to the speed control plus cleanup.
- **Source:** TODO.md Cluster B · 30 Phase 4. Plan: `docs/superpowers/plans/2026-05-03-map-dungeon-phase-4-travel-animation.md`. Spec is the locked design captured in the plan header (mirrors Phase 1/3 convention). Test count delta: 1469 → 1471 (+2: walkSpeed roundtrip + old-save default).
```

- [ ] **Step 4.3: Final full-suite run**

Run: `npm test`

Expected: ALL 1471 tests pass.

- [ ] **Step 4.4: Report to the user**

Summarize: Phase 4 shipped. Files touched, test count delta, smoke-test checklist (from step 3.6) for the user to run. Done.
