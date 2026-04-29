# Fork Picker UI

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster B · 6 — gdd §4 + §10 Tier 2.

## Purpose

Replace the Tier 2 auto-pick stub in `dungeon_scene.ts` with a real picker so the player can choose between fork branches. The graph data model and traversal API (`nextNodeChoices`, `chooseNextNode`, `awaitingFork`) shipped in Cluster A · 8 — this task surfaces the choice as a 2-button picker positioned at the icon-row's branch slot, plus extracts the previously-private `defaultPlayerPath` helper into a tested `playerPath(rs)` function so the icon row reflects the player's actual path after they pick branch B.

## Dependencies and invariants

**Vocabulary already in place:**
- `Node.nextNodeIds: readonly string[]` — fork sources have length 2.
- `RunState.awaitingFork: boolean` — set true in `completeCombat` after fork-source victory; cleared by `chooseNextNode`.
- `nextNodeChoices(rs)`, `chooseNextNode(rs, id)`, `currentNode(rs)` — the API consumers use to read offered branches and commit a pick (`src/run/run_state.ts`).
- Auto-pick stub at `dungeon_scene.ts:387-395`:
  ```ts
  if (run.awaitingFork) {
    const cur = currentNode(run);
    appState.update((s) => ({ ...s, runState: chooseNextNode(s.runState!, cur.nextNodeIds[0]) }));
  }
  this.setState('walking_to_next');
  ```
- Existing `DungeonSceneState` union: `'walking_in' | 'walking_to_next' | 'showing_result' | 'showing_wipe'`.
- Existing private method `defaultPlayerPath(run)` walks the diamond by always picking branch A — used by `buildNodes`, `refreshHud`, `refreshNodeColors`.
- Layout constants: `NODE_X = [180, 360, 540, 720]`, `NODE_Y = 460`, canvas 960×540.

**Invariants this spec declares:**
- **Picker forces a choice; no auto-advance.** Once `awaitingFork: true` and the result panel is dismissed, the scene stays in `awaiting_fork_pick` until the player clicks one of the two icons.
- **Picker is in-scene, not modal.** Lives at NODE_X[2] = 540, vertically split. No new scene file; no `scene.launch` / `scene.pause`. Preserves the gdd's "spatial path branching" framing.
- **`playerPath(rs)` is the single source of truth for the icon row.** Both the dungeon scene and (future) the noticeboard / camp screen consume the same helper. Branch selection follows `currentNodeId`'s reachability; defaults to branch index 0 when ambiguous (start, fork source, post-convergence at boss).
- **No save schema change.** `awaitingFork` already persists; `currentNodeId` already persists. Mid-floor save during the picker shows the picker again on reload.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/run/run_state.ts` | **Modify** | Add exported `playerPath(rs): readonly Node[]` helper plus internal `pickBranchToward` and `reachableFrom` helpers. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Add `describe('playerPath', ...)` block — 6 cases covering start, fork-source, branch A, branch B, boss-ambiguity, and path-length sanity. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Add `'awaiting_fork_pick'` to `DungeonSceneState`; replace auto-pick stub with `setState('awaiting_fork_pick')`; add `buildForkPicker()` and `onForkPick(branchId)` methods; remove local `defaultPlayerPath` and import `playerPath` from `run_state`. |

No new files. No data changes, save schema changes, or modifications to combat / hero / leveling code.

## Schema changes

None. `Hero`, `RunState`, `Node`, save schema all unchanged.

## Behavior

### Scene state machine

`DungeonSceneState` gains `'awaiting_fork_pick'`:

```ts
type DungeonSceneState =
  | 'walking_in'
  | 'walking_to_next'
  | 'showing_result'
  | 'awaiting_fork_pick'
  | 'showing_wipe';
```

`setState` switch gains a case:

```ts
case 'awaiting_fork_pick':
  this.buildForkPicker();
  break;
```

### Flow at a fork

1. Combat at fork-source (n1) ends → existing `processCombatReturn` calls `setState('showing_result')`.
2. Player clicks the result panel → `onResultDismiss`.
3. `onResultDismiss` checks `run.awaitingFork`. If true: `setState('awaiting_fork_pick')` and **return** (no walk-to-next yet).
4. `buildForkPicker()` renders two clickable icon containers at NODE_X[2], stacked vertically.
5. Player clicks an icon → `onForkPick(branchId)` runs `appState.update(s => ({ ...s, runState: chooseNextNode(s.runState!, branchId) }))`, destroys the picker, calls `setState('walking_to_next')`.
6. Walking transition + combat at chosen branch — existing flow resumes.

The replacement for the auto-pick stub at `dungeon_scene.ts:387-395`:

```ts
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
```

### Picker layout

At NODE_X[2] = 540, vertically split:

- Upper option at `(540, 420)`.
- Lower option at `(540, 500)`.

Each option is a `Phaser.GameObjects.Container` with:
- 36×36 background `Phaser.GameObjects.Rectangle`, fill `0x1a1a1a`, stroke `0x444444` (1px).
- Node-type glyph (`⚔` combat, `☠` boss, etc.) centered, monospace 20px white.
- "branch A" / "branch B" subtitle 9px `#aaaaaa` directly below the glyph.
- The node-type label (`combat` / `boss`) 9px `#aaaaaa` below the subtitle.

A prompt label `Choose a path:` at `(540, 380)`, 12px `#ffcc66`, centered. Helps discoverability for first-time players.

**Hover (`pointerover` / `pointerover` on the bg rectangle):**
- Stroke becomes 2px `0xffcc66` (gold accent — matches existing camp UI hover).
- Cursor: `useHandCursor: true`.

**Click (`pointerdown` on the bg rectangle):**
- Calls `this.onForkPick(branchId)` with the corresponding `nextNodeIds[i]`.

**Tier 2 visual reality:** Crypt forks are combat-vs-combat — both icons show `⚔`. The "branch A" / "branch B" subtitles carry the differentiation. Once shop / elite / event content lands (A · 9-11, 13/14), branches use distinct glyphs and the subtitles become redundant — could be dropped at that time.

### `onForkPick`

```ts
private onForkPick(branchId: string): void {
  appState.update((s) => ({
    ...s,
    runState: chooseNextNode(s.runState!, branchId),
  }));
  this.destroyForkPicker();
  this.refreshNodeColors();  // chosen branch now reflects in icon row colours
  this.setState('walking_to_next');
}
```

`destroyForkPicker` walks the picker's stored containers and `.destroy(true)`s them. Implementation detail: `buildForkPicker` stores the picker root in `this.forkPicker?: Phaser.GameObjects.Container` (instance field added near `resultPanel`), and `destroyForkPicker` clears the reference.

### `playerPath(rs)` helper

Extracted from the dungeon scene's private `defaultPlayerPath` and made data-aware:

```ts
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
  for (const branchId of from.nextNodeIds) {
    if (reachableFrom(rs, branchId).has(target)) return branchId;
  }
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

**Branch selection rule:** at each fork, pick the first branch whose forward-reachable set contains `currentNodeId`. If `currentNodeId` isn't downstream of any branch (player at start or at fork source) or is downstream of multiple (e.g., boss after convergence), fall through to branch index 0.

### Dungeon scene migration

`dungeon_scene.ts`:
- Remove the private `defaultPlayerPath` method.
- Import `playerPath` from `run_state.ts` alongside the existing imports.
- Replace all 3 internal call sites (`buildNodes`, `refreshHud`, `refreshNodeColors`) with `playerPath(run)`.
- The behavior is identical for non-fork floors and for forks where the player hasn't picked yet (or has picked branch A). Differs after picking branch B — the icon row now correctly shows n2b at position 2.

### Save reload during a fork pick

`appState.update` persists after every state change, so `awaitingFork: true` lands in the save the moment `completeCombat` returns. If the user reloads the page while the result panel or fork picker is open, the save's `runState.awaitingFork` is true on next load.

On reload, `dungeon_scene.create()` runs without a combat handoff (handoffs are per-session in `combat_handoff.ts` and don't persist). The current code path falls through to `setState('walking_in')`, which tweens the party from offscreen to `partyXForNode(this.currentNodeIndex())` — for fork sources, that's NODE_X[1] = 360 — then calls `startCombatAtCurrentNode()`. **That last call re-fights the already-cleared fork source.** This is a latent bug pre-task that the auto-pick stub masked (the stub fired in `onResultDismiss` and effectively prevented `awaitingFork: true` from persisting beyond a single click).

**Fix:** in the `walking_in` state's `onComplete` callback in `setState`, check `awaitingFork` before calling `startCombatAtCurrentNode`. If true, transition to `awaiting_fork_pick` instead:

```ts
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
```

The `walking_to_next` callback also needs the same guard, in case a save lands between the walking-to-next animation start and combat start (rare but possible if Phaser is paused mid-tween):

```ts
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
```

Both branches: same shape. Could be DRY'd with a helper method `private startCombatOrPicker(): void` if the repetition reads as noise.

## Tests

### `src/run/__tests__/run_state.test.ts` — modify

New `describe('playerPath', ...)` block:

1. **At start node:** path is `[n0, n1, n2a, boss]` (branch A default — `currentNodeId` not downstream of either branch).
2. **At fork source after clearing n0 (currentNodeId = n1, awaitingFork = false):** still `[n0, n1, n2a, boss]` — same default since `n1` itself isn't downstream of either branch.
3. **At fork source awaiting pick (currentNodeId = n1, awaitingFork = true):** still default — `[n0, n1, n2a, boss]`.
4. **After picking branch A (`chooseNextNode(rs, 'crypt-f1-n2a')`):** `[n0, n1, n2a, boss]`.
5. **After picking branch B (`chooseNextNode(rs, 'crypt-f1-n2b')`):** `[n0, n1, n2b, boss]`.
6. **At boss after either branch:** `[n0, n1, n2a, boss]` — boss reachable from both branches; falls to branch index 0 (A) by the ambiguity rule.

Concrete test sketch:

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

**No automated picker UI tests** — Phaser scene rendering is untested per repo convention. Manual smoke: `npm run dev`, clear floor 1's first combat (n0), see "Choose a path:" with two `⚔` options, click either, confirm party walks to chosen node and combat starts.

**Estimated test count delta:** +6 new cases.

## Out of scope

- **Distinct branch glyphs.** Crypt forks are combat-vs-combat; same `⚔` icon both sides. Becomes meaningful once shop/elite/event content lands (A · 9-11, 13/14).
- **Branch difficulty/encounter previews.** Hovering over an option doesn't show enemy comp or expected reward. Could be added if forks become decision-heavy in deeper dungeons.
- **Visual line/edge connecting fork-source to options.** A literal "split path" graphic (Y-shaped lines) would reinforce the spatial metaphor but adds rendering complexity without much info gain. Consider for a future polish pass.
- **Keyboard / gamepad pick.** Mouse-only via `pointerdown`. Adding key bindings (`A` / `B` keys) is a polish task once accessibility is in scope.
- **Animations.** No tween for the picker's appearance/dismissal. Static shows on `setState('awaiting_fork_pick')`, static disappears on pick. Could add fade-in / fade-out later.

## Surprises / call-outs

- **Stub replacement is small (~5 lines).** The auto-pick is one if-branch; replacing with `setState('awaiting_fork_pick')` is a one-line change. Most of the task's code is the picker render method (~30 lines) and the `playerPath` extraction (~25 lines).
- **`playerPath` extraction has independent value.** Even without forks, having a tested helper for "the player's path through the floor" simplifies future scene work (camp_screen post-boss summary, noticeboard preview, etc.). Putting it in `run_state.ts` next to `currentNode` / `nextNodeChoices` keeps RunState's traversal API in one place.
- **Mid-floor save during fork picker** is a latent bug pre-task that the auto-pick stub masked — addressed concretely in the "Save reload during a fork pick" section above. Without the fix, a reload during `awaitingFork: true` re-fights the cleared fork source.
- **Tier 2 picker is "spatial-lite"** — vertical stack at one column, not a full Y-shaped split. The Y-shape would be rendering decoration; the data already says "two paths." Keeping it simple matches the codebase's overall aesthetic.
