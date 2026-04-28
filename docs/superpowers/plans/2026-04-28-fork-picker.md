# Fork Picker UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-pick stub in `dungeon_scene.ts` with a 2-button picker that shows when `awaitingFork: true`, plus extract the icon-row's path-walking helper into a tested `playerPath(rs)` function in `run_state.ts` so the icon row reflects the player's actual branch choice.

**Architecture:** Two tasks. (1) Pure-TS extraction — move the path-walking logic from the dungeon scene into `run_state.ts` as `playerPath(rs)`, made data-aware (follows `currentNodeId` through the graph). Fully TDD'd. (2) Phaser scene work — replace the auto-pick stub with a real picker (new `awaiting_fork_pick` state, `buildForkPicker` / `onForkPick` methods), add save-reload safety guards in `walking_in` / `walking_to_next` so reloads during `awaitingFork: true` don't re-fight the cleared fork source.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4, Phaser 4. Task 1 is inside the firewall (`run/`); Task 2 is Phaser-side scene rendering, untested per repo convention.

**Spec:** [`docs/superpowers/specs/2026-04-28-fork-picker-design.md`](../specs/2026-04-28-fork-picker-design.md)

**Project policy reminder:** Per [`CLAUDE.md`](../../../CLAUDE.md), never run `git commit` without explicit user direction. Each task ends with a "stage and report" step — the user runs the commit themselves.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/run/run_state.ts` | **Modify** | Add exported `playerPath(rs): readonly Node[]` plus internal `pickBranchToward` and `reachableFrom` helpers. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Add `describe('playerPath', ...)` block — 6 cases (start, fork-source awaiting, branch A, branch B, boss-ambiguity, length sanity). |
| `src/scenes/dungeon_scene.ts` | **Modify** | Add `'awaiting_fork_pick'` to `DungeonSceneState`; remove local `defaultPlayerPath` (replace with `playerPath` import); replace auto-pick stub with `setState('awaiting_fork_pick')`; add `buildForkPicker` / `onForkPick` / `destroyForkPicker`; add save-reload guards in `walking_in` / `walking_to_next` `onComplete` callbacks. |

No new files. No data, save schema, or combat changes.

---

## Task 1: `playerPath` helper + tests

**Goal:** Extract a pure helper that walks the current floor's diamond from the start node to the boss, picking the branch that contains `currentNodeId` at each fork. Default to branch index 0 when `currentNodeId` is ambiguous (start, fork source awaiting pick, post-convergence at boss).

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write the failing tests for `playerPath`**

In `src/run/__tests__/run_state.test.ts`, append a new `describe` block at the bottom of the file:

```ts
describe('playerPath', () => {
  it('at start node: path goes through branch A (default)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const path = playerPath(rs);
    expect(path.map((n) => n.id)).toEqual([
      'crypt-f1-n0',
      'crypt-f1-n1',
      'crypt-f1-n2a',
      'crypt-f1-boss',
    ]);
  });

  it('at fork source awaiting pick: path defaults to branch A', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.awaitingFork).toBe(true);
    const path = playerPath(rs);
    expect(path[2].id).toBe('crypt-f1-n2a');
  });

  it('after picking branch A: path goes through n2a', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = chooseNextNode(rs, 'crypt-f1-n2a');
    const path = playerPath(rs);
    expect(path[2].id).toBe('crypt-f1-n2a');
  });

  it('after picking branch B: path goes through n2b', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = chooseNextNode(rs, 'crypt-f1-n2b');
    const path = playerPath(rs);
    expect(path[2].id).toBe('crypt-f1-n2b');
  });

  it('at boss after branch B: falls back to branch A (ambiguity)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = chooseNextNode(rs, 'crypt-f1-n2b');
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.currentNodeId).toBe('crypt-f1-boss');
    const path = playerPath(rs);
    // Both branches reach boss; defaults to A.
    expect(path[2].id).toBe('crypt-f1-n2a');
  });

  it('returns 4-node player path for Crypt floor (not the 5-node graph)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const path = playerPath(rs);
    expect(path).toHaveLength(4);
  });
});
```

Add `playerPath` to the existing import line near the top of the file (currently imports `cashout`, `chooseNextNode`, `completeCombat`, `currentNode`, `nextNodeChoices`, `pressOn`, `startRun`):

```ts
import {
  cashout,
  chooseNextNode,
  completeCombat,
  currentNode,
  nextNodeChoices,
  playerPath,
  pressOn,
  startRun,
} from '../run_state';
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: failures — `playerPath` is not exported from `run_state.ts`.

- [ ] **Step 3: Add `playerPath` and its private helpers to `run_state.ts`**

In `src/run/run_state.ts`, append to the bottom of the file (after `cashout` and before `woundsFromEvents`):

```ts
/**
 * The player's traversal path through the current floor: from the start node
 * to (and including) the boss, picking the branch that contains `currentNodeId`
 * at each fork. Defaults to branch index 0 when ambiguous (player at start,
 * at fork source awaiting pick, or downstream of multiple branches).
 */
export function playerPath(runState: RunState): readonly Node[] {
  const referenced = new Set(
    runState.currentFloorNodes.flatMap((n) => [...n.nextNodeIds]),
  );
  const start = runState.currentFloorNodes.find((n) => !referenced.has(n.id));
  if (!start) return [];

  const path: Node[] = [start];
  let cur = start;
  while (cur.nextNodeIds.length > 0) {
    const nextId = pickBranchToward(runState, cur, runState.currentNodeId);
    const next = runState.currentFloorNodes.find((n) => n.id === nextId);
    if (!next) break;
    path.push(next);
    cur = next;
  }
  return path;
}

function pickBranchToward(rs: RunState, from: Node, target: string): string {
  if (from.nextNodeIds.length === 1) return from.nextNodeIds[0];
  // Multiple branches: pick the first one whose forward-reachable set contains target.
  for (const branchId of from.nextNodeIds) {
    if (reachableFrom(rs, branchId).has(target)) return branchId;
  }
  // Ambiguous: target isn't downstream of any branch (player at start / fork source)
  // OR is downstream of multiple (e.g., boss after convergence). Default to branch 0.
  return from.nextNodeIds[0];
}

function reachableFrom(rs: RunState, fromId: string): Set<string> {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = rs.currentFloorNodes.find((n) => n.id === id);
    if (node) for (const next of node.nextNodeIds) stack.push(next);
  }
  return seen;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: PASS. All 6 new `playerPath` cases green; existing run-state tests still green.

- [ ] **Step 5: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 6: Stage and report**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts
git status
```

Tell the user: **"Task 1 ready. `playerPath(rs)` helper exported with 6 unit-test cases covering start, fork-source, branch A, branch B, boss-ambiguity, and length sanity. Suggested commit message: `feat(run): playerPath helper for floor traversal`. Awaiting your direction."**

---

## Task 2: Dungeon scene picker + state machine + save-reload guards

**Goal:** Replace the auto-pick stub with a real picker. Add `awaiting_fork_pick` to the scene state machine, render two clickable icons at NODE_X[2] when entered, commit the player's choice via `chooseNextNode`, and guard `walking_in` / `walking_to_next` `onComplete` callbacks so a save-reload during `awaitingFork: true` doesn't re-fight the cleared fork source. Also drop the scene-private `defaultPlayerPath` in favor of the new `playerPath` import.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

This task is Phaser-coupled and untested by repo convention. Verification is via `npm test` + `npx tsc --noEmit` plus manual smoke in `npm run dev`.

- [ ] **Step 1: Add `playerPath` import; remove the local `defaultPlayerPath`**

In `src/scenes/dungeon_scene.ts`, update the run_state import to include `playerPath`:

```ts
import {
  chooseNextNode,
  completeCombat,
  currentNode,
  playerPath,
  type RunState,
  type WipeOutcome,
} from '../run/run_state';
```

Find the private `defaultPlayerPath` method (currently around lines 268-291) and **delete the entire method**, including its docstring.

Update the three call sites of `defaultPlayerPath` to call `playerPath` instead. The call sites are:

1. `buildNodes` (around line 141): `const path = this.defaultPlayerPath(run);` → `const path = playerPath(run);`
2. `refreshHud` (around line 465): `const path = this.defaultPlayerPath(run);` → `const path = playerPath(run);`
3. `refreshNodeColors` (around line 481): `const path = this.defaultPlayerPath(run);` → `const path = playerPath(run);`

Note: `playerPath` requires a non-undefined `RunState` argument (its signature is `(rs: RunState)`, no `undefined` allowed — the scene-private version accepted `RunState | undefined`). All three call sites already use `appState.get().runState!` (with the non-null assertion), so the argument is always defined. No type-narrowing needed.

- [ ] **Step 2: Add `'awaiting_fork_pick'` to the state union**

Find the `DungeonSceneState` type (currently around lines 14-18) and add the new state:

```ts
type DungeonSceneState =
  | 'walking_in'
  | 'walking_to_next'
  | 'showing_result'
  | 'awaiting_fork_pick'
  | 'showing_wipe';
```

- [ ] **Step 3: Add the `forkPicker` instance field**

Find the class instance fields (currently around lines 34-42) and add a `forkPicker?: Phaser.GameObjects.Container` field next to `resultPanel`:

```ts
  private resultPanel?: Phaser.GameObjects.Container;
  private forkPicker?: Phaser.GameObjects.Container;
```

In the `create()` method's reset block (around lines 49-53), add:

```ts
    this.resultPanel = undefined;
    this.forkPicker = undefined;
    this.wipeOutcome = undefined;
```

- [ ] **Step 4: Add the `awaiting_fork_pick` case to `setState`**

Find the `setState` switch (currently around lines 187-211). Add a new case before `'showing_result'`:

```ts
  private setState(next: DungeonSceneState): void {
    switch (next) {
      case 'walking_in':
        this.tweenPartyTo(
          this.partyXForNode(this.currentNodeIndex()),
          WALK_IN_DURATION,
          'Cubic.easeOut',
          () => {
            const run = appState.get().runState;
            if (run?.awaitingFork) {
              this.setState('awaiting_fork_pick');
            } else {
              this.startCombatAtCurrentNode();
            }
          },
        );
        break;
      case 'walking_to_next':
        this.tweenPartyTo(
          this.partyXForNode(this.currentNodeIndex()),
          WALK_NEXT_DURATION,
          'Cubic.easeInOut',
          () => {
            const run = appState.get().runState;
            if (run?.awaitingFork) {
              this.setState('awaiting_fork_pick');
            } else {
              this.startCombatAtCurrentNode();
            }
          },
        );
        break;
      case 'showing_result':
        this.buildResultPanel();
        break;
      case 'awaiting_fork_pick':
        this.buildForkPicker();
        break;
      case 'showing_wipe':
        this.buildWipePanel();
        break;
    }
  }
```

The `walking_in` and `walking_to_next` `onComplete` callbacks now check `awaitingFork` before starting combat — fixes the latent save-reload-during-fork bug noted in the spec.

- [ ] **Step 5: Replace the auto-pick stub with a state transition**

Find `onResultDismiss` (currently around lines 374-398). Replace the auto-pick block with:

```ts
  private onResultDismiss(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = undefined;
    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();

    const run = appState.get().runState!;
    if (run.status === 'camp_screen') {
      this.scene.start('camp_screen');
      return;
    }

    if (run.awaitingFork) {
      this.setState('awaiting_fork_pick');
      return;
    }

    this.setState('walking_to_next');
  }
```

The auto-pick logic (the `appState.update` with `chooseNextNode`) is gone — `onForkPick` does that work now.

- [ ] **Step 6: Add `buildForkPicker`, `onForkPick`, and `destroyForkPicker`**

Add the three methods to `DungeonScene`. Place them next to `buildResultPanel` (after `buildResultPanel` and before `onResultDismiss`):

```ts
  private buildForkPicker(): void {
    const run = appState.get().runState!;
    const cur = currentNode(run);
    const branchIds = cur.nextNodeIds;
    if (branchIds.length !== 2) return; // defensive — only render for actual forks

    const forkX = NODE_X[2]; // 540 for Crypt's diamond
    const upperY = 420;
    const lowerY = 500;
    const promptY = 380;

    const prompt = this.add
      .text(forkX, promptY, 'Choose a path:', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    const upper = this.buildForkOption(forkX, upperY, branchIds[0], 'branch A', run);
    const lower = this.buildForkOption(forkX, lowerY, branchIds[1], 'branch B', run);

    this.forkPicker = this.add.container(0, 0, [prompt, upper, lower]);
  }

  private buildForkOption(
    x: number,
    y: number,
    branchId: string,
    subtitle: string,
    run: RunState,
  ): Phaser.GameObjects.Container {
    const branchNode = run.currentFloorNodes.find((n) => n.id === branchId)!;
    const glyph = branchNode.type === 'boss' ? '☠' : '⚔';
    const typeLabel = branchNode.type;

    const bg = this.add
      .rectangle(0, 0, 36, 36, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
    const glyphText = this.add
      .text(0, -2, glyph, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const subtitleText = this.add
      .text(0, 24, subtitle, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);
    const labelText = this.add
      .text(0, 36, typeLabel, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffcc66));
    bg.on('pointerout', () => bg.setStrokeStyle(1, 0x444444));
    bg.on('pointerdown', () => this.onForkPick(branchId));

    return this.add.container(x, y, [bg, glyphText, subtitleText, labelText]);
  }

  private onForkPick(branchId: string): void {
    appState.update((s) => ({
      ...s,
      runState: chooseNextNode(s.runState!, branchId),
    }));
    this.destroyForkPicker();
    this.refreshNodeColors();
    this.setState('walking_to_next');
  }

  private destroyForkPicker(): void {
    this.forkPicker?.destroy(true);
    this.forkPicker = undefined;
  }
```

- [ ] **Step 7: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass — Task 1's `playerPath` tests cover the data-aware path logic; the picker rendering itself isn't tested.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 8: Stage and report**

```bash
git add src/scenes/dungeon_scene.ts
git status
```

Tell the user: **"Task 2 ready. Auto-pick stub replaced with real picker; `awaiting_fork_pick` state added; save-reload guards in walking transitions; local `defaultPlayerPath` removed in favor of imported `playerPath`. Suggested commit message: `feat(scenes): fork picker UI replaces auto-pick stub`. Awaiting your direction. Manual smoke recommended: `npm run dev`, clear floor 1's first combat (n0), see 'Choose a path:' picker, click branch B, confirm party walks to n2b and combat starts."**

---

## Post-implementation: TODO and HISTORY

After Task 2 is committed, the user typically migrates the TODO entry into HISTORY. Don't do this unprompted — wait for direction. The TODO entry to migrate is the Cluster B · 6 entry in [`TODO.md`](../../../TODO.md). Per the [slim HISTORY entry policy](../../../CLAUDE.md), keep the entry to ~15-25 lines: Why / Decisions / Surprises / Source.

Suggested HISTORY-entry sketch:

```markdown
### YYYY-MM-DD · Fork picker UI (Cluster B · 6)

**Why:** Closes the loop on Cluster A · 8 (forks). Without a picker, the auto-pick stub silently chose branch A every time — the player had no agency at forks. This task ships the picker overlay (in-scene, not modal), extracts the icon-row's path-walking helper into a tested `playerPath(rs)` function so the icon row reflects the player's actual choice, and fixes a latent save-reload bug where reloading during `awaitingFork: true` would re-fight the cleared fork source.

**Decisions:**
- **In-scene picker over modal overlay.** Forks are spatial in the gdd's framing — putting the picker at NODE_X[2] preserves that. Smallest blast radius too: no new scene file, just a state addition + render method.
- **`playerPath` is now data-aware.** Instead of always picking branch A, walks the graph from start, picking the branch whose reachable set contains `currentNodeId`. Defaults to branch 0 when ambiguous (start, fork source pre-pick, post-convergence at boss). Pure helper in `run_state.ts` — testable, reusable.
- **Save-reload guards added to `walking_in` and `walking_to_next`.** A latent bug pre-task: a save during `awaitingFork: true` would reload, walk-in, then re-fight the cleared fork source. The auto-pick stub masked this by firing in `onResultDismiss` and never letting `awaitingFork: true` reach a save. With a real picker, this had to be fixed properly — both walking transitions now check `awaitingFork` in their `onComplete` callbacks and route to `awaiting_fork_pick` instead of starting combat.

**Surprises:**
- The picker render is ~30 lines; the `playerPath` extraction is ~25 lines. Most of the task code is documentation and tests.
- Crypt forks are combat-vs-combat — both icons show ⚔ — so the differentiation comes from the "branch A" / "branch B" subtitles. Becomes more meaningful once shop/elite/event content lands.

**Source:** TODO.md Cluster B · 6 → spec at `docs/superpowers/specs/2026-04-28-fork-picker-design.md` → plan at `docs/superpowers/plans/2026-04-28-fork-picker.md`. Test count delta: +6 cases.
```

---

## Self-review notes

Reviewed the plan against the spec:

- **Spec coverage:** All sections covered. Scene state machine + flow → Task 2 step 4. Picker layout → Task 2 step 6. `playerPath` → Task 1 steps 3, plus Task 2 step 1 imports it. Save-reload safety → Task 2 step 4 (the `awaitingFork` checks in `walking_in` / `walking_to_next`). All 6 spec-mandated `playerPath` tests are explicit in Task 1 step 1.
- **Type consistency:** `playerPath(rs: RunState): readonly Node[]` signature matches between Task 1 implementation and Task 2 imports. `pickBranchToward` and `reachableFrom` are private helpers — only used inside `run_state.ts`. `awaiting_fork_pick` state name spelled identically across Task 2's state union, `setState` switch, `onResultDismiss` transition, and `walking_*` `onComplete` guards.
- **No placeholders:** Every step has actual code or precise commands. The HISTORY-entry sketch uses `YYYY-MM-DD` because the completion date isn't known yet — documentation, not implementation.
- **Inter-task compatibility:** Task 1 ends with `tsc` clean and full vitest green. Task 2 imports `playerPath` (Task 1's export), so Task 2 builds on Task 1's surface without breaking it. Task 2 also ends with `tsc` clean.
