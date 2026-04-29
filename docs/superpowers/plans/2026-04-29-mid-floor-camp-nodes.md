# Mid-Floor Camp Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `'camp'` Node variant to the dungeon graph as a fork-branch type. Players landing on a camp node choose Heal Party (+25% maxHp to each living hero), Treat Wound (player picks hero + wound), or Leave Dungeon (full cashout, identical to post-boss flow, no boss-kill requirement).

**Architecture:** Four sequential tasks, each landing a green test suite and one commit.

1. `applyCampNodeEffect` data-layer module (heal_party + treat_wound). Pure addition; no Node union change yet.
2. Extend the `Node` discriminated union with the `'camp'` variant + scene type-narrowing shims (combat_scene guard, dungeon_scene glyph). No production path produces camp nodes yet.
3. `chooseCampNodeEffect` on RunState (delegates to applyCampNodeEffect; routes `'leave'` to cashout) + relax `cashout()` status guard + dungeon_scene auto-leave stub for camp.
4. Floor generator switches the fork from a 3-shape RNG to 6 shapes, adding `camp_vs_combat`, `camp_vs_shop`, `camp_vs_elite`. Camp nodes now appear in the wild; the stub from Task 3 handles them.

After Task 4, camp nodes are reachable end-to-end. The picker overlay (Cluster B · 4) replaces the auto-leave stub later.

**Tech Stack:** TypeScript, Vitest. No Phaser imports under `src/dungeon/`, `src/data/`, `src/run/`.

**Spec:** `docs/superpowers/specs/2026-04-29-mid-floor-camp-nodes-design.md`. Read it before starting.

**Numerical knobs (from spec §2.2 / §4):**

- `HEAL_PARTY_PERCENT = 0.25`
- 6 fork shapes uniformly weighted (1/6 each).

---

## Task 1: `applyCampNodeEffect` foundation

Add the data-layer module that resolves Heal Party and Treat Wound effects against a `RunState`. Pure addition — no Node union change, no run_state op, no floor-gen change. After this task, `applyCampNodeEffect` is reachable from tests but no production caller invokes it yet.

**Files:**
- Create: `src/dungeon/camp_node.ts`
- Create: `src/dungeon/__tests__/camp_node.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/dungeon/__tests__/camp_node.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { createHero, type Hero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import { applyCampNodeEffect, HEAL_PARTY_PERCENT } from '../camp_node';
import type { RunState } from '../../run/run_state';
import type { Wound } from '../../data/types';

function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('priest', 'P', 'h2', 'quick', 'body1'),
  ];
}

function makeRunState(partyOverrides: Partial<Hero>[] = []): RunState {
  const party = makeParty().map((h, i) => ({ ...h, ...(partyOverrides[i] ?? {}) }));
  return {
    dungeonId: 'crypt',
    seed: 1,
    party,
    pack: { gold: 0, items: [] },
    currentFloorNumber: 1,
    currentFloorNodes: [],
    currentNodeId: '',
    awaitingFork: false,
    status: 'in_dungeon',
    fallen: [],
  };
}

describe('applyCampNodeEffect — heal_party', () => {
  it('grants each hero +round(maxHp * HEAL_PARTY_PERCENT) HP', () => {
    const rs = makeRunState([
      { currentHp: 1, maxHp: 20 },
      { currentHp: 5, maxHp: 24 },
      { currentHp: 10, maxHp: 16 },
    ]);
    const result = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.party[0].currentHp).toBe(1 + Math.round(20 * HEAL_PARTY_PERCENT));   // 1 + 5 = 6
    expect(result.party[1].currentHp).toBe(5 + Math.round(24 * HEAL_PARTY_PERCENT));   // 5 + 6 = 11
    expect(result.party[2].currentHp).toBe(10 + Math.round(16 * HEAL_PARTY_PERCENT));  // 10 + 4 = 14
  });

  it('caps healing at maxHp (no overflow)', () => {
    const rs = makeRunState([
      { currentHp: 19, maxHp: 20 },
      { currentHp: 24, maxHp: 24 },
      { currentHp: 12, maxHp: 16 },
    ]);
    const result = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.party[0].currentHp).toBe(20); // 19 + 5 = 24, capped at 20
    expect(result.party[1].currentHp).toBe(24); // already at max
    expect(result.party[2].currentHp).toBe(16); // 12 + 4 = 16, exactly at max
  });

  it('does not touch the fallen list', () => {
    const rs = makeRunState();
    const fallenHero = makeParty()[0];
    const rsWithFallen: RunState = { ...rs, fallen: [{ ...fallenHero, currentHp: 0 }] };
    const result = applyCampNodeEffect(rsWithFallen, { kind: 'heal_party' }, createRng(1));
    expect(result.fallen).toEqual(rsWithFallen.fallen);
    expect(result.fallen[0].currentHp).toBe(0);
  });

  it('leaves wounds untouched', () => {
    const wounds: Wound[] = [{ id: 'bruised', runsRemaining: 5 }];
    const rs = makeRunState([{ currentHp: 1, maxHp: 20, wounds }]);
    const result = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.party[0].wounds).toEqual(wounds);
  });
});

describe('applyCampNodeEffect — treat_wound', () => {
  it('removes the specified wound; other wounds intact', () => {
    const wounds: Wound[] = [
      { id: 'bruised', runsRemaining: 5 },
      { id: 'hobbled', runsRemaining: 3 },
      { id: 'winded',  runsRemaining: 2 },
    ];
    const rs = makeRunState([{ wounds }]);
    const result = applyCampNodeEffect(
      rs,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 1 },
      createRng(1),
    );
    expect(result.party[0].wounds).toHaveLength(2);
    expect(result.party[0].wounds[0]).toEqual({ id: 'bruised', runsRemaining: 5 });
    expect(result.party[0].wounds[1]).toEqual({ id: 'winded',  runsRemaining: 2 });
  });

  it('leaves other heroes untouched', () => {
    const rs = makeRunState([
      { wounds: [{ id: 'bruised', runsRemaining: 5 }] },
      { wounds: [{ id: 'hobbled', runsRemaining: 3 }] },
      { wounds: [] },
    ]);
    const result = applyCampNodeEffect(
      rs,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 },
      createRng(1),
    );
    expect(result.party[0].wounds).toEqual([]);
    expect(result.party[1].wounds).toEqual([{ id: 'hobbled', runsRemaining: 3 }]);
    expect(result.party[2].wounds).toEqual([]);
  });

  it('leaves currentHp untouched', () => {
    const rs = makeRunState([
      { currentHp: 10, maxHp: 20, wounds: [{ id: 'bruised', runsRemaining: 5 }] },
    ]);
    const result = applyCampNodeEffect(
      rs,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 },
      createRng(1),
    );
    expect(result.party[0].currentHp).toBe(10);
  });

  it('throws on heroIndex out of range', () => {
    const rs = makeRunState();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 99, woundIndex: 0 }, createRng(1)),
    ).toThrow();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: -1, woundIndex: 0 }, createRng(1)),
    ).toThrow();
  });

  it('throws on woundIndex out of range', () => {
    const rs = makeRunState([{ wounds: [{ id: 'bruised', runsRemaining: 5 }] }]);
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 0, woundIndex: 5 }, createRng(1)),
    ).toThrow();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 0, woundIndex: -1 }, createRng(1)),
    ).toThrow();
  });

  it('throws if hero has empty wounds array', () => {
    const rs = makeRunState();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 }, createRng(1)),
    ).toThrow();
  });
});

describe('applyCampNodeEffect — determinism', () => {
  it('same input → same output for heal_party', () => {
    const rs = makeRunState([{ currentHp: 5, maxHp: 20 }]);
    const a = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    const b = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(a).toEqual(b);
  });

  it('HEAL_PARTY_PERCENT is exactly 0.25', () => {
    expect(HEAL_PARTY_PERCENT).toBe(0.25);
  });
});
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run: `npx vitest run src/dungeon/__tests__/camp_node.test.ts`

Expected: FAIL — `Cannot find module '../camp_node'`.

- [ ] **Step 1.3: Create the camp_node module**

Create `src/dungeon/camp_node.ts` with this exact content:

```typescript
import type { Rng } from '../util/rng';
import type { RunState } from '../run/run_state';

export type CampNodeChoice =
  | { kind: 'heal_party' }
  | { kind: 'treat_wound'; heroIndex: number; woundIndex: number }
  | { kind: 'leave' };

export const HEAL_PARTY_PERCENT = 0.25;

// `rng` is reserved for future variance (e.g. random wound-pick mode).
// No current effect consumes RNG; the parameter exists for API parity with
// other apply-effect functions in the codebase.
export function applyCampNodeEffect(
  runState: RunState,
  choice: Exclude<CampNodeChoice, { kind: 'leave' }>,
  _rng: Rng,
): RunState {
  if (choice.kind === 'heal_party') {
    const newParty = runState.party.map((hero) => {
      const healed = Math.round(hero.maxHp * HEAL_PARTY_PERCENT);
      return { ...hero, currentHp: Math.min(hero.maxHp, hero.currentHp + healed) };
    });
    return { ...runState, party: newParty };
  }

  // treat_wound
  const { heroIndex, woundIndex } = choice;
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(`applyCampNodeEffect: heroIndex ${heroIndex} out of range [0, ${runState.party.length})`);
  }
  const hero = runState.party[heroIndex];
  if (hero.wounds.length === 0) {
    throw new Error(`applyCampNodeEffect: hero at index ${heroIndex} has no wounds to treat`);
  }
  if (woundIndex < 0 || woundIndex >= hero.wounds.length) {
    throw new Error(`applyCampNodeEffect: woundIndex ${woundIndex} out of range [0, ${hero.wounds.length})`);
  }
  const newWounds = hero.wounds.filter((_, i) => i !== woundIndex);
  const newParty = runState.party.map((h, i) =>
    i === heroIndex ? { ...h, wounds: newWounds } : h,
  );
  return { ...runState, party: newParty };
}
```

- [ ] **Step 1.4: Run the test and verify it passes**

Run: `npx vitest run src/dungeon/__tests__/camp_node.test.ts`

Expected: PASS — all 12 cases green.

- [ ] **Step 1.5: Run the full suite to confirm no regressions**

Run: `npm test && npx tsc --noEmit`

Expected: All existing tests green; total = previous total + 12. tsc clean.

- [ ] **Step 1.6: Commit**

```bash
git add src/dungeon/camp_node.ts src/dungeon/__tests__/camp_node.test.ts
git commit -m "feat(dungeon): applyCampNodeEffect (heal_party, treat_wound)"
```

---

## Task 2: `Node` union extension + scene shims

Add the `'camp'` variant to the `Node` discriminated union. The combat-scene defensive guard must extend to handle the new variant so tsc stays green (camp nodes have no `encounter` field). Add a placeholder glyph in `dungeon_scene.ts` for icon-row rendering. After this task, the type system is ready for camp nodes; no production code path produces them yet.

**Files:**
- Modify: `src/dungeon/node.ts`
- Modify: `src/scenes/combat_scene.ts:59`
- Modify: `src/scenes/dungeon_scene.ts:156-160`

- [ ] **Step 2.1: Confirm baseline is green**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green.

- [ ] **Step 2.2: Extend the `Node` union**

Open `src/dungeon/node.ts`. Find the `Node` type definition. Replace it with:

```typescript
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[] };
```

- [ ] **Step 2.3: Run tsc to find consumers that need updating**

Run: `npx tsc --noEmit`

Expected: An error in `src/scenes/combat_scene.ts` because the `'shop'` early-return narrows the union to `combat | elite | boss | camp`, but `camp` lacks the `encounter` property used at line ~68 (`buildCombatState(run.party, node.encounter)`).

- [ ] **Step 2.4: Extend the combat-scene defensive guard**

Open `src/scenes/combat_scene.ts`. Find the `'shop'` early-return (around line 59):

```typescript
if (node.type === 'shop') {
  // Shouldn't happen — the dungeon scene's handleArrival auto-leaves
  // shops before they reach combat. Defensive guard keeps the type
  // system happy.
  console.warn('CombatScene entered with shop currentNode; returning to dungeon');
  this.scene.start('dungeon');
  return;
}
```

Replace with:

```typescript
if (node.type === 'shop' || node.type === 'camp') {
  // Shouldn't happen — the dungeon scene's handleArrival routes shop and
  // camp nodes away from combat. Defensive guard keeps the type system
  // happy and catches state-machine bugs.
  console.warn(`CombatScene entered with non-combat node type '${node.type}'; returning to dungeon`);
  this.scene.start('dungeon');
  return;
}
```

- [ ] **Step 2.5: Add the camp glyph to the dungeon-scene icon row**

Open `src/scenes/dungeon_scene.ts`. Find the glyph mapping (around line 156–160):

```typescript
const glyph =
  node.type === 'boss' ? '☠' :
  node.type === 'shop' ? '🛒' :
  node.type === 'elite' ? '💀' :
  '⚔';
```

Replace with:

```typescript
const glyph =
  node.type === 'boss'  ? '☠' :
  node.type === 'shop'  ? '🛒' :
  node.type === 'elite' ? '💀' :
  node.type === 'camp'  ? '🏕' :
  '⚔';
```

- [ ] **Step 2.6: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. No test count change (type-only task).

- [ ] **Step 2.7: Commit**

```bash
git add src/dungeon/node.ts src/scenes/combat_scene.ts src/scenes/dungeon_scene.ts
git commit -m "feat(dungeon): add 'camp' variant to Node union + scene type shims"
```

---

## Task 3: `chooseCampNodeEffect` on RunState + `cashout()` relaxation + dungeon-scene auto-leave stub

Add the RunState operation that wraps `applyCampNodeEffect` and routes `'leave'` to `cashout()`. Relax the `cashout()` status guard to accept "in_dungeon at a camp node." Add the dungeon-scene auto-leave stub for camp (always `heal_party`) so that when Task 4 produces camp nodes in the wild, the run keeps progressing without the picker UI (Cluster B · 4).

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`
- Modify: `src/scenes/dungeon_scene.ts:232-245`

- [ ] **Step 3.1: Write failing tests for `chooseCampNodeEffect` and cashout-from-camp**

Open `src/run/__tests__/run_state.test.ts`. Add `chooseCampNodeEffect` to the existing imports from `'../run_state'`:

```typescript
import {
  cashout,
  chooseCampNodeEffect,
  chooseNextNode,
  completeCombat,
  currentNode,
  leaveShop,
  nextNodeChoices,
  playerPath,
  pressOn,
  purchaseItem,
  startRun,
} from '../run_state';
```

Then near the end of the file (after the `makeEliteRun` helper added in the elite task), add this new helper + describe block:

```typescript
function makeCampRun(seed = 1): ReturnType<typeof startRun> {
  // Hand-build a RunState whose currentNode is a camp node so we can test
  // chooseCampNodeEffect in isolation, independent of floor-gen changes
  // (those land in Task 4).
  const rs = startRun('crypt', makeParty(), seed, createRng(seed));
  const campId = 'crypt-f1-camp-test';
  const bossId = rs.currentFloorNodes.find((n) => n.type === 'boss')!.id;
  const campNode: Node = {
    id: campId,
    type: 'camp',
    nextNodeIds: [bossId],
  };
  return {
    ...rs,
    currentFloorNodes: [...rs.currentFloorNodes, campNode],
    currentNodeId: campId,
  };
}

describe('chooseCampNodeEffect — heal_party', () => {
  it('advances currentNodeId and heals every hero by 25% maxHp', () => {
    const rs0 = makeCampRun();
    const damaged: ReturnType<typeof startRun> = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = chooseCampNodeEffect(damaged, { kind: 'heal_party' }, createRng(1));
    expect(result.runState.currentNodeId).toBe('crypt-f1-boss');
    for (let i = 0; i < result.runState.party.length; i++) {
      const hero = result.runState.party[i];
      expect(hero.currentHp).toBe(1 + Math.round(hero.maxHp * 0.25));
    }
  });

  it('returns no outcome (only leave returns one)', () => {
    const rs = makeCampRun();
    const result = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.outcome).toBeUndefined();
  });
});

describe('chooseCampNodeEffect — treat_wound', () => {
  it('advances currentNodeId and removes the wound', () => {
    const rs0 = makeCampRun();
    const wounded: ReturnType<typeof startRun> = {
      ...rs0,
      party: rs0.party.map((h, i) =>
        i === 0 ? { ...h, wounds: [{ id: 'bruised' as const, runsRemaining: 5 }] } : h,
      ),
    };
    const result = chooseCampNodeEffect(
      wounded,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 },
      createRng(1),
    );
    expect(result.runState.currentNodeId).toBe('crypt-f1-boss');
    expect(result.runState.party[0].wounds).toEqual([]);
  });
});

describe('chooseCampNodeEffect — leave (cashout)', () => {
  it('returns CashoutOutcome and ends the run', () => {
    const rs0 = makeCampRun();
    const withGold: ReturnType<typeof startRun> = {
      ...rs0,
      pack: { gold: 50, items: [] },
    };
    const result = chooseCampNodeEffect(withGold, { kind: 'leave' }, createRng(1));
    expect(result.outcome).toBeDefined();
    expect(result.outcome!.goldBanked).toBe(50);
    expect(result.outcome!.heroesReturned).toEqual(withGold.party);
    expect(result.runState.status).toBe('ended');
  });

  it('works on floor 1 with no boss beaten (no penalty/conditions)', () => {
    const rs = makeCampRun();
    expect(rs.currentFloorNumber).toBe(1);
    const result = chooseCampNodeEffect(rs, { kind: 'leave' }, createRng(1));
    expect(result.outcome).toBeDefined();
    expect(result.runState.status).toBe('ended');
  });
});

describe('chooseCampNodeEffect — validation', () => {
  it('throws if currentNode is not a camp', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1))).toThrow();
  });

  it('throws if status is not in_dungeon', () => {
    const rs = makeCampRun();
    const ended: ReturnType<typeof startRun> = { ...rs, status: 'ended' };
    expect(() => chooseCampNodeEffect(ended, { kind: 'heal_party' }, createRng(1))).toThrow();
  });
});

describe('cashout — accepts camp nodes', () => {
  it('accepts in_dungeon + camp currentNode (no throw)', () => {
    const rs = makeCampRun();
    expect(() => cashout(rs)).not.toThrow();
    const { runState, outcome } = cashout(rs);
    expect(runState.status).toBe('ended');
    expect(outcome.heroesReturned).toEqual(rs.party);
  });

  it('still throws on in_dungeon at non-camp nodes', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    // currentNode is preamble combat, not camp.
    expect(() => cashout(rs)).toThrow();
  });

  it('still throws on status === ended', () => {
    const rs = makeCampRun();
    const ended: ReturnType<typeof startRun> = { ...rs, status: 'ended' };
    expect(() => cashout(ended)).toThrow();
  });
});
```

- [ ] **Step 3.2: Run the failing tests**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t 'chooseCampNodeEffect|cashout — accepts camp nodes'`

Expected: FAIL — `chooseCampNodeEffect is not exported` and the cashout-from-camp test fails on the existing status-guard throw.

- [ ] **Step 3.3: Relax `cashout()` status guard**

Open `src/run/run_state.ts`. Find the `cashout` function (around line 245). Replace its body:

```typescript
export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  const atCamp = runState.status === 'in_dungeon' &&
                 currentNode(runState).type === 'camp';
  if (runState.status !== 'camp_screen' && !atCamp) {
    throw new Error(`cashout: must be at camp_screen or camp node, got status='${runState.status}'`);
  }
  const outcome: CashoutOutcome = {
    goldBanked: totalGold(runState.pack),
    itemsBanked: runState.pack.items,
    heroesReturned: runState.party,
    heroesLost: runState.fallen,
  };
  return {
    runState: { ...runState, status: 'ended' },
    outcome,
  };
}
```

The short-circuit AND in `atCamp` ensures `currentNode(runState)` is only called when `status === 'in_dungeon'`. `currentNode` itself throws on other statuses, so the order matters.

- [ ] **Step 3.4: Add `chooseCampNodeEffect` to run_state.ts**

In the same file (`src/run/run_state.ts`), add the new import at the top:

```typescript
import { applyCampNodeEffect, type CampNodeChoice } from '../dungeon/camp_node';
```

Then add `chooseCampNodeEffect` as a new exported function. Place it after `chooseNextNode` (around line 105) for proximity:

```typescript
export function chooseCampNodeEffect(
  runState: RunState,
  choice: CampNodeChoice,
  rng: Rng,
): { runState: RunState; outcome?: CashoutOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`chooseCampNodeEffect: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'camp') {
    throw new Error(`chooseCampNodeEffect: current node is type '${cur.type}', not 'camp'`);
  }
  if (choice.kind === 'leave') {
    return cashout(runState);
  }
  const newRunState = applyCampNodeEffect(runState, choice, rng);
  return {
    runState: {
      ...newRunState,
      currentNodeId: cur.nextNodeIds[0],
    },
  };
}
```

- [ ] **Step 3.5: Run the new tests and verify they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: PASS — all existing run_state tests + the new chooseCampNodeEffect tests + the new cashout-from-camp tests.

- [ ] **Step 3.6: Add the dungeon-scene auto-leave stub for camp**

Open `src/scenes/dungeon_scene.ts`. Add the import at the top:

```typescript
import { chooseCampNodeEffect } from '../run/run_state';
```

(Verify `createRngFromState` is already imported; it should be since the scene already uses it. If not, add it from `'../util/rng'`.)

Find `handleArrival` (around line 232–249):

```typescript
private handleArrival(): void {
  const run = appState.get().runState;
  if (!run) return;

  if (run.awaitingFork) {
    this.setState('awaiting_fork_pick');
    return;
  }

  const node = currentNode(run);
  if (node.type === 'shop') {
    this.scene.launch('shop_overlay');
    this.scene.pause();
    return;
  }

  this.startCombatAtCurrentNode();
}
```

Add the camp branch between the shop branch and the `startCombatAtCurrentNode()` fallthrough:

```typescript
private handleArrival(): void {
  const run = appState.get().runState;
  if (!run) return;

  if (run.awaitingFork) {
    this.setState('awaiting_fork_pick');
    return;
  }

  const node = currentNode(run);
  if (node.type === 'shop') {
    this.scene.launch('shop_overlay');
    this.scene.pause();
    return;
  }
  if (node.type === 'camp') {
    // Stub: auto-apply heal_party and advance. Cluster B · 4 replaces this
    // with a picker overlay launch (matching the shop_overlay pattern).
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      console.warn('handleArrival: camp node reached without runRngState');
      return;
    }
    const rng = createRngFromState(rngState);
    const result = chooseCampNodeEffect(run, { kind: 'heal_party' }, rng);
    appState.update((s) => ({
      ...s,
      runState: result.runState,
      runRngState: rng.getState(),
    }));
    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();
    this.setState('walking_to_next');
    return;
  }

  this.startCombatAtCurrentNode();
}
```

- [ ] **Step 3.7: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Test count delta from Task 1 baseline: +12 (Task 1) + ~9 (chooseCampNodeEffect + cashout-from-camp).

- [ ] **Step 3.8: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts src/scenes/dungeon_scene.ts
git commit -m "feat(run): chooseCampNodeEffect + cashout-from-camp + scene stub"
```

---

## Task 4: Floor generator 6-shape fork RNG

Replace the 3-shape fork RNG with a 6-shape RNG that includes `camp_vs_combat`, `camp_vs_shop`, `camp_vs_elite`. Each shape is uniformly weighted at 1/6. Update `findFloorWithShape` in the test helper, add per-shape coverage tests for the 3 new shapes, and replace the 3-shape distribution test with a 6-shape version. After this task, camp nodes appear in the wild and the auto-leave stub from Task 3 handles them end-to-end.

**Files:**
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 4.1: Update floor tests for the 6-shape RNG**

Open `src/dungeon/__tests__/floor.test.ts`. Replace the existing "fork branches are exactly the pair from one fork shape" test (currently asserts `Set(['combat+shop', 'combat+elite', 'elite+shop'])`):

Find:

```typescript
it('fork branches are exactly the pair from one fork shape', () => {
  // Across many seeds, the fork-branch type pair is one of three shapes.
  const seenShapes = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branchTypes = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!.type)
      .sort()
      .join('+');
    seenShapes.add(branchTypes);
  }
  expect(seenShapes).toEqual(new Set(['combat+shop', 'combat+elite', 'elite+shop']));
});
```

Replace with:

```typescript
it('fork branches are exactly the pair from one of six fork shapes', () => {
  const seenShapes = new Set<string>();
  for (let seed = 1; seed <= 600; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branchTypes = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!.type)
      .sort()
      .join('+');
    seenShapes.add(branchTypes);
  }
  expect(seenShapes).toEqual(new Set([
    'combat+shop',
    'combat+elite',
    'elite+shop',
    'camp+combat',
    'camp+shop',
    'camp+elite',
  ]));
});
```

Find the existing distribution test:

```typescript
it('three fork shapes are roughly evenly distributed across seeds', () => {
  const counts = { shop_vs_combat: 0, elite_vs_combat: 0, elite_vs_shop: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const types = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!.type)
      .sort()
      .join('+');
    if (types === 'combat+shop')  counts.shop_vs_combat += 1;
    else if (types === 'combat+elite') counts.elite_vs_combat += 1;
    else if (types === 'elite+shop')   counts.elite_vs_shop += 1;
  }
  // Expected ~100 each (1/3 of 300). Loose lower bound: at least 60.
  expect(counts.shop_vs_combat).toBeGreaterThanOrEqual(60);
  expect(counts.elite_vs_combat).toBeGreaterThanOrEqual(60);
  expect(counts.elite_vs_shop).toBeGreaterThanOrEqual(60);
});
```

Replace with:

```typescript
it('six fork shapes are roughly evenly distributed across seeds', () => {
  const counts = {
    shop_vs_combat: 0,
    elite_vs_combat: 0,
    elite_vs_shop: 0,
    camp_vs_combat: 0,
    camp_vs_shop: 0,
    camp_vs_elite: 0,
  };
  for (let seed = 1; seed <= 600; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const types = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!.type)
      .sort()
      .join('+');
    if (types === 'combat+shop')       counts.shop_vs_combat += 1;
    else if (types === 'combat+elite') counts.elite_vs_combat += 1;
    else if (types === 'elite+shop')   counts.elite_vs_shop += 1;
    else if (types === 'camp+combat')  counts.camp_vs_combat += 1;
    else if (types === 'camp+shop')    counts.camp_vs_shop += 1;
    else if (types === 'camp+elite')   counts.camp_vs_elite += 1;
  }
  // Expected ~100 each (1/6 of 600). Loose lower bound: at least 60.
  expect(counts.shop_vs_combat).toBeGreaterThanOrEqual(60);
  expect(counts.elite_vs_combat).toBeGreaterThanOrEqual(60);
  expect(counts.elite_vs_shop).toBeGreaterThanOrEqual(60);
  expect(counts.camp_vs_combat).toBeGreaterThanOrEqual(60);
  expect(counts.camp_vs_shop).toBeGreaterThanOrEqual(60);
  expect(counts.camp_vs_elite).toBeGreaterThanOrEqual(60);
});
```

Find `findFloorWithShape` (helper at the bottom of the file). Replace the type signature and matches block to handle 6 shapes:

```typescript
function findFloorWithShape(
  shape:
    | 'shop_vs_combat'
    | 'elite_vs_combat'
    | 'elite_vs_shop'
    | 'camp_vs_combat'
    | 'camp_vs_shop'
    | 'camp_vs_elite',
  maxSeeds = 600,
): { nodes: ReturnType<typeof generateFloor>['nodes']; fork: { type: string }[] } {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branches = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!)
      .map((n) => ({ type: n.type }));
    const types = branches.map((b) => b.type).sort();
    const matches =
      (shape === 'shop_vs_combat'  && types[0] === 'combat' && types[1] === 'shop')  ||
      (shape === 'elite_vs_combat' && types[0] === 'combat' && types[1] === 'elite') ||
      (shape === 'elite_vs_shop'   && types[0] === 'elite'  && types[1] === 'shop')  ||
      (shape === 'camp_vs_combat'  && types[0] === 'camp'   && types[1] === 'combat') ||
      (shape === 'camp_vs_shop'    && types[0] === 'camp'   && types[1] === 'shop')   ||
      (shape === 'camp_vs_elite'   && types[0] === 'camp'   && types[1] === 'elite');
    if (matches) return { nodes, fork: branches };
  }
  throw new Error(`no '${shape}' floor in first ${maxSeeds} seeds`);
}
```

Add three new per-shape tests inside the existing `describe('generateFloor — Crypt', ...)` block (after the `elite_vs_shop` test, around line 178):

```typescript
it('camp_vs_combat shape: fork branches are exactly one camp and one combat', () => {
  const { fork } = findFloorWithShape('camp_vs_combat');
  expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'combat']);
});

it('camp_vs_shop shape: fork branches are exactly one camp and one shop', () => {
  const { fork } = findFloorWithShape('camp_vs_shop');
  expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'shop']);
});

it('camp_vs_elite shape: fork branches are exactly one camp and one elite', () => {
  const { fork } = findFloorWithShape('camp_vs_elite');
  expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'elite']);
});
```

- [ ] **Step 4.2: Run the floor tests and verify they fail**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: FAIL — `findFloorWithShape('camp_vs_combat')` etc. throw because the floor generator still produces only 3 shapes. The 6-shape distribution test fails on lower-bound 60 for the camp shapes.

- [ ] **Step 4.3: Update `floor.ts` to the 6-shape fork RNG**

Open `src/dungeon/floor.ts`. Replace the entire body of the file with:

```typescript
import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng, WeightedOption } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import { composeEliteEncounter } from './elite';
import type { Node } from './node';
import { floorScale } from './scaling';
import { generateShop } from './shop';

type ForkShape =
  | 'shop_vs_combat'
  | 'elite_vs_combat'
  | 'elite_vs_shop'
  | 'camp_vs_combat'
  | 'camp_vs_shop'
  | 'camp_vs_elite';

const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  { value: 'shop_vs_combat',  weight: 1 },
  { value: 'elite_vs_combat', weight: 1 },
  { value: 'elite_vs_shop',   weight: 1 },
  { value: 'camp_vs_combat',  weight: 1 },
  { value: 'camp_vs_shop',    weight: 1 },
  { value: 'camp_vs_elite',   weight: 1 },
];

export function generateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): { nodes: readonly Node[]; startNodeId: string } {
  const dungeon = DUNGEONS[dungeonId];
  const scale = floorScale(floorNumber);

  const idPrefix = `${dungeonId}-f${floorNumber}`;
  const id0 = `${idPrefix}-n0`;
  const id1 = `${idPrefix}-n1`;
  const id2a = `${idPrefix}-n2a`;
  const id2b = `${idPrefix}-n2b`;
  const idBoss = `${idPrefix}-boss`;

  // Roll fork shape and which branch (A or B) gets the more-distinguished
  // node. Drawn first so RNG consumption order downstream stays deterministic.
  const shape: ForkShape = rng.weighted(FORK_SHAPE_WEIGHTS);
  const specialOnBranchA = rng.next() < 0.5;

  const enc0 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc1 = composeCombatEncounter(dungeon.enemyPool, scale, rng);

  // Conditionally compose only the encounters/inventory the rolled shape
  // requires. Camp nodes consume no RNG (pure data construction).
  const usesCombatBranch =
    shape === 'shop_vs_combat' ||
    shape === 'elite_vs_combat' ||
    shape === 'camp_vs_combat';
  const usesEliteBranch =
    shape === 'elite_vs_combat' ||
    shape === 'elite_vs_shop' ||
    shape === 'camp_vs_elite';
  const usesShopBranch =
    shape === 'shop_vs_combat' ||
    shape === 'elite_vs_shop' ||
    shape === 'camp_vs_shop';
  const usesCampBranch =
    shape === 'camp_vs_combat' ||
    shape === 'camp_vs_shop' ||
    shape === 'camp_vs_elite';

  const combatBranchEnc = usesCombatBranch
    ? composeCombatEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const eliteBranchEnc = usesEliteBranch
    ? composeEliteEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const shopBranchInv = usesShopBranch ? generateShop(floorNumber, rng).inventory : undefined;

  const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);

  // Build the two branch nodes per shape. `specialOnBranchA` decides which
  // side gets the more-distinguished node.
  const buildCombatBranch = (id: string): Node => {
    if (combatBranchEnc === undefined) {
      throw new Error(`generateFloor: combatBranchEnc undefined for shape '${shape}'`);
    }
    return { id, type: 'combat', encounter: combatBranchEnc, nextNodeIds: [idBoss] };
  };
  const buildEliteBranch = (id: string): Node => {
    if (eliteBranchEnc === undefined) {
      throw new Error(`generateFloor: eliteBranchEnc undefined for shape '${shape}'`);
    }
    return { id, type: 'elite', encounter: eliteBranchEnc, nextNodeIds: [idBoss] };
  };
  const buildShopBranch = (id: string): Node => {
    if (shopBranchInv === undefined) {
      throw new Error(`generateFloor: shopBranchInv undefined for shape '${shape}'`);
    }
    return { id, type: 'shop', inventory: shopBranchInv, nextNodeIds: [idBoss] };
  };
  const buildCampBranch = (id: string): Node => {
    if (!usesCampBranch) {
      throw new Error(`generateFloor: camp branch not in shape '${shape}'`);
    }
    return { id, type: 'camp', nextNodeIds: [idBoss] };
  };

  let node2a: Node;
  let node2b: Node;
  switch (shape) {
    case 'shop_vs_combat':
      node2a = specialOnBranchA ? buildShopBranch(id2a)   : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildShopBranch(id2b);
      break;
    case 'elite_vs_combat':
      node2a = specialOnBranchA ? buildEliteBranch(id2a)  : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildEliteBranch(id2b);
      break;
    case 'elite_vs_shop':
      node2a = specialOnBranchA ? buildEliteBranch(id2a)  : buildShopBranch(id2a);
      node2b = specialOnBranchA ? buildShopBranch(id2b)   : buildEliteBranch(id2b);
      break;
    case 'camp_vs_combat':
      node2a = specialOnBranchA ? buildCampBranch(id2a)   : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildCampBranch(id2b);
      break;
    case 'camp_vs_shop':
      node2a = specialOnBranchA ? buildCampBranch(id2a)   : buildShopBranch(id2a);
      node2b = specialOnBranchA ? buildShopBranch(id2b)   : buildCampBranch(id2b);
      break;
    case 'camp_vs_elite':
      node2a = specialOnBranchA ? buildCampBranch(id2a)   : buildEliteBranch(id2a);
      node2b = specialOnBranchA ? buildEliteBranch(id2b)  : buildCampBranch(id2b);
      break;
  }

  const nodes: Node[] = [
    { id: id0, type: 'combat', encounter: enc0, nextNodeIds: [id1] },
    { id: id1, type: 'combat', encounter: enc1, nextNodeIds: [id2a, id2b] },
    node2a,
    node2b,
    { id: idBoss, type: 'boss', encounter: encBoss, nextNodeIds: [] },
  ];

  return { nodes, startNodeId: id0 };
}
```

- [ ] **Step 4.4: Run the floor tests and verify they pass**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: PASS — all updated and new shape tests green.

- [ ] **Step 4.5: Update `advanceToBossNode` test helper to walk through camp nodes**

The `advanceToBossNode` helper in `src/run/__tests__/run_state.test.ts` currently handles `'shop'` (via leaveShop) and `'combat' | 'elite'` (via completeCombat). With camp nodes now appearing in the wild, the helper may encounter `'camp'` if it picks a camp branch at a fork. Add the camp branch.

Open `src/run/__tests__/run_state.test.ts`. Find `advanceToBossNode` (around line 53). Replace its body:

```typescript
function advanceToBossNode(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    const node = currentNode(rs);
    if (node.type === 'boss') return rs;
    if (node.type === 'shop') {
      rs = leaveShop(rs);
      continue;
    }
    if (node.type === 'camp') {
      rs = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(99)).runState;
      continue;
    }
    // node.type is 'combat' or 'elite' — both go through completeCombat
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    if (rs.awaitingFork) {
      const choices = nextNodeChoices(rs);
      const combatBranch =
        choices.find((n) => n.type === 'combat') ??
        choices.find((n) => n.type === 'elite') ??
        choices[0];
      rs = chooseNextNode(rs, combatBranch.id);
    }
  }
}
```

The new branch handles camp nodes by always picking `heal_party` (matches the dungeon-scene auto-leave stub).

- [ ] **Step 4.6: Run the full suite end-to-end**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total test count delta from baseline:
- +12 (Task 1: applyCampNodeEffect)
- 0 (Task 2: type-only)
- +9 (Task 3: chooseCampNodeEffect + cashout-from-camp)
- +3 (Task 4: 3 new shape coverage tests; existing shape-set test and distribution test extended in place; 1 net new = +3 actually since 3 new tests added, 0 net replacement)

Total: ~+24 tests. Run twice back-to-back to verify determinism (RNG is seed-stable; output should be identical).

- [ ] **Step 4.7: Smoke-check determinism**

Run: `npm test` again.

Expected: identical pass count, identical seed-bound test outputs.

- [ ] **Step 4.8: Commit**

```bash
git add src/dungeon/floor.ts src/dungeon/__tests__/floor.test.ts src/run/__tests__/run_state.test.ts
git commit -m "feat(dungeon): 6-shape fork RNG (camp_vs_combat | camp_vs_shop | camp_vs_elite)"
```

---

## Closing checklist

- [ ] **All 4 tasks landed in 4 commits**, each with green tests and green tsc.
- [ ] **No imports of `phaser`** under `src/dungeon/`, `src/data/`, `src/run/`. Verify via:
  ```bash
  grep -r "from 'phaser'" src/dungeon src/data src/run || echo "OK — no phaser imports"
  ```
  Expected output: `OK — no phaser imports`.
- [ ] **`gdd.md`** is the design source of truth. The deliberate gdd override (camp = full cashout, no boss-kill requirement) is documented in the spec §1 and HISTORY entry.
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Cluster B · 4 — Camp node UI (3-button picker overlay: Heal Party / Treat Wound / Leave). Replaces the auto-leave stub at `dungeon_scene.ts` `handleArrival`.
  - Sharpen weapons effect — deferred. Add a TODO entry when temp-buff mechanic is needed for another feature.
- [ ] **HISTORY.md migration** — once the user confirms work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster A · 11 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.
