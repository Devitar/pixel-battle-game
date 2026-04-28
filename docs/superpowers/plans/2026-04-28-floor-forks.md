# Floor Generation: Forks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Crypt floor from a linear list to a 5-node diamond DAG with one fork after the first preamble combat. Migrate `RunState` from index-based to id-based traversal and add the `nextNodeChoices` / `chooseNextNode` API the picker UI (Cluster B · 6) will consume.

**Architecture:** Two tasks. (1) The atomic graph migration — `Node.nextNodeIds` field, generator returns `{ nodes, startNodeId }`, `RunState.currentNodeId` + `awaitingFork`, traversal helpers, `completeCombat` fanout-1-vs-2 logic, plus all of `floor.test.ts` and `run_state.test.ts` updated. Big task but cohesive — the data shape change forces all consumers to update together. (2) Save-fixture cleanup, dungeon-scene migration to id-based reads, and the Tier 2 auto-pick stub for forks (Cluster B · 6 replaces the stub later). Each task ends with vitest green; tsc is clean only after Task 2.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4, Phaser 4. All core changes are inside the firewall (`dungeon/`, `run/`); the scene work in Task 2 uses Phaser but stays minimal.

**Spec:** [`docs/superpowers/specs/2026-04-28-floor-forks-design.md`](../specs/2026-04-28-floor-forks-design.md)

**Project policy reminder:** Per [`CLAUDE.md`](../../../CLAUDE.md), never run `git commit` without explicit user direction. Each task ends with a "stage and report" step — the user runs the commit themselves.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/node.ts` | **Modify** | Add `nextNodeIds: readonly string[]` to both `Node` variants. |
| `src/dungeon/floor.ts` | **Modify** | `generateFloor` returns `{ nodes, startNodeId }`; constructs the 5-node diamond. |
| `src/dungeon/__tests__/floor.test.ts` | **Modify** | Length 4→5; new fork-shape, terminality, reachability, uniqueness tests; existing tests adapted to `result.nodes`. |
| `src/run/run_state.ts` | **Modify** | Replace `currentNodeIndex` with `currentNodeId`; add `awaitingFork: boolean`; rewrite `currentNode`; add `nextNodeChoices` and `chooseNextNode`; update `startRun`, `pressOn`, `completeCombat` (fanout 1 vs 2). |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Replace index-based assertions with id-based; add fork-lifecycle, `nextNodeChoices`, `chooseNextNode` tests; existing fight-to-boss loops bridge the fork via `chooseNextNode`. |
| `src/save/__tests__/save.test.ts` | **Modify** | Two `currentNodeIndex: 0` fixtures become `currentNodeId: ''` plus `awaitingFork: false`. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Replace `run.currentNodeIndex` reads with a scene-private `pathPositionFor(run)` that derives the player-path index from the diamond shape; auto-pick branch A when `awaitingFork: true`. |
| `src/scenes/combat_scene.ts` | **Modify (1 line)** | The existing `currentNode(run)` import already works — verify no broken references. |

No changes to combat resolution, hero shape, perk/trait/leveling code, save migration code, encounter composition, or scaling.

---

## Task 1: Graph data model + traversal API (atomic migration)

**Goal:** Migrate the dungeon data model (`Node` adds `nextNodeIds`), generator (`generateFloor` returns `{ nodes, startNodeId }`, produces the diamond), and run-state (`currentNodeId` + `awaitingFork` + `nextNodeChoices` + `chooseNextNode` + `completeCombat` fanout-aware advance) in one cohesive change. Vitest is green by end of task; tsc has expected errors in `save.test.ts` fixtures and `dungeon_scene.ts` consumers, both closed by Task 2.

**Files:**
- Modify: `src/dungeon/node.ts`
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

This task has multiple TDD-able phases. Steps are grouped: write failing tests for the floor side; make floor changes pass; write failing tests for run-state side; make run-state changes pass.

### Phase A: Floor tests + generator changes

- [ ] **Step 1: Update existing floor tests for the new return shape**

In `src/dungeon/__tests__/floor.test.ts`, replace the entire file contents:

```ts
import { describe, expect, it } from 'vitest';
import { CRYPT_BOSS, CRYPT_POOL } from '../../data/enemies';
import { createRng } from '../../util/rng';
import { generateFloor } from '../floor';
import { floorScale } from '../scaling';

describe('generateFloor — Crypt', () => {
  it('is deterministic for the same seed', () => {
    const a = generateFloor('crypt', 1, createRng(42));
    const b = generateFloor('crypt', 1, createRng(42));
    expect(a).toEqual(b);
  });

  it('returns { nodes, startNodeId } shape', () => {
    const result = generateFloor('crypt', 1, createRng(1));
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(typeof result.startNodeId).toBe('string');
    expect(result.startNodeId.length).toBeGreaterThan(0);
  });

  it('floor 1 has 5 nodes: 4 combat + 1 boss (diamond)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    expect(nodes).toHaveLength(5);
    const combatCount = nodes.filter((n) => n.type === 'combat').length;
    const bossCount = nodes.filter((n) => n.type === 'boss').length;
    expect(combatCount).toBe(4);
    expect(bossCount).toBe(1);
  });

  it('startNodeId points to the unique source node', () => {
    const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(1));
    const start = nodes.find((n) => n.id === startNodeId);
    expect(start).toBeDefined();
    expect(start!.nextNodeIds).toHaveLength(1);
    // No other node points to the start.
    const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
    expect(referenced.has(startNodeId)).toBe(false);
  });

  it('fork structure: one node has 2 nextNodeIds, both branches converge at boss', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const forkSources = nodes.filter((n) => n.nextNodeIds.length === 2);
    expect(forkSources).toHaveLength(1);

    const fork = forkSources[0];
    expect(fork.type).toBe('combat');

    const bothBranches = fork.nextNodeIds.map((id) => nodes.find((n) => n.id === id)!);
    expect(bothBranches.every((b) => b.type === 'combat')).toBe(true);

    // Both branches' nextNodeIds point at the same single id (the boss).
    const branchNexts = bothBranches.map((b) => b.nextNodeIds);
    expect(branchNexts[0]).toHaveLength(1);
    expect(branchNexts[1]).toHaveLength(1);
    expect(branchNexts[0][0]).toBe(branchNexts[1][0]);

    const convergence = nodes.find((n) => n.id === branchNexts[0][0])!;
    expect(convergence.type).toBe('boss');
  });

  it('boss is the unique terminal (nextNodeIds.length === 0)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const terminals = nodes.filter((n) => n.nextNodeIds.length === 0);
    expect(terminals).toHaveLength(1);
    expect(terminals[0].type).toBe('boss');
  });

  it('every non-start node is reachable from some other node', () => {
    const { nodes, startNodeId } = generateFloor('crypt', 1, createRng(1));
    const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
    for (const node of nodes) {
      if (node.id === startNodeId) continue;
      expect(referenced.has(node.id), `node ${node.id} unreachable`).toBe(true);
    }
  });

  it('node ids are unique within a floor', () => {
    const { nodes } = generateFloor('crypt', 3, createRng(1));
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('propagates per-floor scale to every encounter', () => {
    for (const floorNumber of [1, 2, 5, 10]) {
      const expected = floorScale(floorNumber);
      const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
      for (const node of nodes) {
        expect(node.encounter.scale).toEqual(expected);
      }
    }
  });

  it('every combat encounter uses pool enemies only', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const combatNodes = nodes.filter((n) => n.type === 'combat');
    for (const node of combatNodes) {
      for (const placement of node.encounter.enemies) {
        expect(CRYPT_POOL).toContain(placement.enemyId);
      }
    }
  });

  it('boss encounter contains the Crypt boss at slot 3', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const boss = nodes.find((n) => n.type === 'boss')!;
    const bossPlacement = boss.encounter.enemies.find((p) => p.enemyId === CRYPT_BOSS);
    expect(bossPlacement).toBeDefined();
    expect(bossPlacement?.slot).toBe(3);
  });

  it('different floor numbers produce different node ids', () => {
    const f1 = generateFloor('crypt', 1, createRng(1));
    const f2 = generateFloor('crypt', 2, createRng(1));
    const f1Ids = new Set(f1.nodes.map((n) => n.id));
    const f2Ids = new Set(f2.nodes.map((n) => n.id));
    for (const id of f1Ids) {
      expect(f2Ids.has(id)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the floor tests to confirm they fail**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: failures — `generateFloor` returns `Node[]`, not `{ nodes, startNodeId }`; the existing nodes have no `nextNodeIds` field; only 4 nodes returned.

- [ ] **Step 3: Add `nextNodeIds` to `Node`**

In `src/dungeon/node.ts`, replace the `Node` type definition:

```ts
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss'; encounter: Encounter; nextNodeIds: readonly string[] };
```

- [ ] **Step 4: Rewrite `generateFloor` to produce the diamond**

In `src/dungeon/floor.ts`, replace the entire file contents:

```ts
import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import type { Node } from './node';
import { floorScale } from './scaling';

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

  // Encounters composed in graph order so the run's RNG produces
  // a deterministic graph for a given seed (including unchosen branches).
  const enc0 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc1 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc2a = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc2b = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);

  const nodes: Node[] = [
    { id: id0, type: 'combat', encounter: enc0, nextNodeIds: [id1] },
    { id: id1, type: 'combat', encounter: enc1, nextNodeIds: [id2a, id2b] },
    { id: id2a, type: 'combat', encounter: enc2a, nextNodeIds: [idBoss] },
    { id: id2b, type: 'combat', encounter: enc2b, nextNodeIds: [idBoss] },
    { id: idBoss, type: 'boss', encounter: encBoss, nextNodeIds: [] },
  ];

  return { nodes, startNodeId: id0 };
}
```

Note: `dungeon.floorLength` is no longer consumed by the generator. It's effectively obsolete data in `DungeonDef` for this task; keep it in place as a documentation artifact.

- [ ] **Step 5: Run the floor tests to confirm they pass**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: PASS. All shape, fork-structure, reachability, and determinism cases green. The full suite is broken at this point (run_state.ts now mismatches the generator's return shape) — that's expected and resolved in Phase B.

### Phase B: Run-state tests + traversal API + completeCombat

- [ ] **Step 6: Write failing tests for the new run-state API**

In `src/run/__tests__/run_state.test.ts`, find and replace the **whole test file** with the version below. Note that this rewrites multiple existing tests to use the new id-based API; the easiest way to keep the diff manageable is to rewrite the file end-to-end:

```ts
import { describe, expect, it } from 'vitest';
import { createHeroCombatant } from '../../combat/combatant';
import type { CombatResult, CombatState } from '../../combat/types';
import type { SlotIndex } from '../../data/types';
import { createHero, type Hero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import {
  cashout,
  chooseNextNode,
  completeCombat,
  currentNode,
  nextNodeChoices,
  pressOn,
  startRun,
} from '../run_state';

function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('priest', 'P', 'h2', 'quick', 'body1'),
  ];
}

function mockCombatResult(
  party: readonly Hero[],
  finalHps: readonly number[],
  outcome: CombatResult['outcome'],
): CombatResult {
  const combatants = party.map((hero, i) => {
    const finalHp = finalHps[i] ?? hero.currentHp;
    return createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
      baseStats: hero.baseStats,
      currentHp: finalHp,
      maxHp: hero.maxHp,
      isDead: finalHp <= 0,
    });
  });
  const state: CombatState = { combatants, round: 1, exhaustionLevel: 0 };
  return { finalState: state, events: [], outcome };
}

/**
 * Walks the run from the current node to (but not entering) the boss,
 * bridging the fork by always choosing the first branch.
 * Used by tests that need to reach the boss combat.
 */
function advanceToBossNode(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    const node = currentNode(rs);
    if (node.type === 'boss') return rs;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    if (rs.awaitingFork) {
      rs = chooseNextNode(rs, currentNode(rs).nextNodeIds[0]);
    }
  }
}

describe('startRun', () => {
  it('returns in_dungeon status with floor 1 generated', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.status).toBe('in_dungeon');
    expect(rs.currentFloorNumber).toBe(1);
    expect(rs.pack).toEqual({ gold: 0, items: [] });
    expect(rs.fallen).toEqual([]);
    expect(rs.currentFloorNodes).toHaveLength(5);
    expect(rs.awaitingFork).toBe(false);
  });

  it('currentNodeId equals the floor start node id', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.currentNodeId).toBe('crypt-f1-n0');
  });

  it('throws on party size != 3', () => {
    const rng = createRng(1);
    expect(() => startRun('crypt', [], 1, rng)).toThrow();
    expect(() => startRun('crypt', [createHero('knight', 'K', 'h0', 'quick', 'body1')], 1, rng)).toThrow();
    const four: Hero[] = [
      createHero('knight', 'K', 'h0', 'quick', 'body1'),
      createHero('archer', 'A', 'h1', 'quick', 'body1'),
      createHero('priest', 'P', 'h2', 'quick', 'body1'),
      createHero('knight', 'K2', 'h3', 'quick', 'body1'),
    ];
    expect(() => startRun('crypt', four, 1, rng)).toThrow();
  });
});

describe('currentNode', () => {
  it('returns the node matching currentNodeId', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const node = currentNode(rs);
    expect(node.id).toBe(rs.currentNodeId);
  });

  it('throws when status is not in_dungeon', () => {
    const rs = { ...startRun('crypt', makeParty(), 1, createRng(1)), status: 'camp_screen' as const };
    expect(() => currentNode(rs)).toThrow();
  });

  it('throws when currentNodeId is not in the floor', () => {
    const rs = { ...startRun('crypt', makeParty(), 1, createRng(1)), currentNodeId: 'bogus-id' };
    expect(() => currentNode(rs)).toThrow();
  });
});

describe('nextNodeChoices', () => {
  it('returns one node from the start (linear)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const choices = nextNodeChoices(rs);
    expect(choices).toHaveLength(1);
    expect(choices[0].id).toBe('crypt-f1-n1');
  });

  it('returns two nodes from the fork source (n1)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Clear n0 to advance to n1.
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.currentNodeId).toBe('crypt-f1-n1');
    const choices = nextNodeChoices(rs);
    expect(choices).toHaveLength(2);
    expect(choices.map((c) => c.id).sort()).toEqual(['crypt-f1-n2a', 'crypt-f1-n2b']);
  });
});

describe('chooseNextNode', () => {
  it('advances currentNodeId and clears awaitingFork', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.awaitingFork).toBe(true);
    rs = chooseNextNode(rs, 'crypt-f1-n2a');
    expect(rs.currentNodeId).toBe('crypt-f1-n2a');
    expect(rs.awaitingFork).toBe(false);
  });

  it('throws when chosen id is not in current node nextNodeIds', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(() => chooseNextNode(rs, 'crypt-f1-boss')).toThrow();
    expect(() => chooseNextNode(rs, 'bogus-id')).toThrow();
  });

  it('throws when status is not in_dungeon', () => {
    const rs = { ...startRun('crypt', makeParty(), 1, createRng(1)), status: 'camp_screen' as const };
    expect(() => chooseNextNode(rs, 'crypt-f1-n1')).toThrow();
  });
});

describe('completeCombat — victory on linear node', () => {
  it('advances currentNodeId to the single nextNodeId; awaitingFork stays false', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.currentNodeId).toBe('crypt-f1-n1');
    expect(rs2.awaitingFork).toBe(false);
    expect(rs2.status).toBe('in_dungeon');
  });

  it('drops fallen heroes from the party', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [10, 0, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.party).toHaveLength(2);
    expect(rs2.fallen).toHaveLength(1);
  });
});

describe('completeCombat — victory at fork source', () => {
  it('keeps currentNodeId at fork source; sets awaitingFork true', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Clear n0 to position at n1 (fork source).
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.currentNodeId).toBe('crypt-f1-n1');
    expect(rs.awaitingFork).toBe(false);
    // Now clear n1.
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    expect(rs2.currentNodeId).toBe('crypt-f1-n1');
    expect(rs2.awaitingFork).toBe(true);
    expect(rs2.status).toBe('in_dungeon');
  });
});

describe('completeCombat — victory on boss node', () => {
  it('flips status to camp_screen', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    const bossResult = mockCombatResult(rs.party, [5, 5, 5], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, bossResult, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.status).toBe('camp_screen');
  });
});

describe('completeCombat — defeat', () => {
  it('returns wipe outcome and clears party + pack', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeDefined();
    expect(rs2.status).toBe('ended');
    expect(rs2.party).toHaveLength(0);
    expect(rs2.pack).toEqual({ gold: 0, items: [] });
  });
});

describe('pressOn', () => {
  it('regenerates floor with new floorNumber and resets currentNodeId + awaitingFork', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');
    const rs2 = pressOn(rs, createRng(99));
    expect(rs2.status).toBe('in_dungeon');
    expect(rs2.currentFloorNumber).toBe(2);
    expect(rs2.currentNodeId).toBe('crypt-f2-n0');
    expect(rs2.awaitingFork).toBe(false);
  });
});

describe('cashout', () => {
  it('returns survivors and pack contents; ends the run', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    const itemsInPack = rs.pack.items;
    const { runState: rs2, outcome } = cashout(rs);
    expect(rs2.status).toBe('ended');
    expect(outcome.itemsBanked).toEqual(itemsInPack);
    expect(outcome.heroesReturned).toHaveLength(3);
  });

  it('throws when called outside camp_screen', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => cashout(rs)).toThrow();
  });
});

describe('completeCombat — XP awards', () => {
  it('awards 5×floor XP to survivors after a floor-1 combat-node victory', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(5);
      expect(hero.level).toBe(1);
    }
  });

  it('awards 30×floor XP after a boss victory', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    // Path so far = 3 combat clears (n0 + n1 + branch), so each survivor has 15 XP.
    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, bossResult, createRng(99));
    // 15 (combat) + 30 (boss) = 45.
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(45);
    }
  });

  it('does not award XP to dead heroes', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 0, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    expect(rs2.fallen).toHaveLength(1);
    expect(rs2.fallen[0].xp).toBe(0);
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(5);
    }
  });

  it('does not award XP on player_defeat', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    expect(rs2.party).toHaveLength(0);
    for (const hero of rs2.fallen) {
      expect(hero.xp).toBe(0);
    }
  });

  it('crossing the level-2 threshold applies stat bumps', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = {
      ...rs,
      party: rs.party.map((h) => ({ ...h, xp: 195 })),
    };
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(200);
      expect(hero.level).toBe(2);
    }
    const knight = rs2.party.find((h) => h.classId === 'knight')!;
    expect(knight.baseStats.defense).toBe(5); // base 4 + 1
  });

  it('crossing to level 5 sets pendingPerk', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = {
      ...rs,
      party: rs.party.map((h) => ({ ...h, xp: 3995, level: 4 })),
    };
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(4000);
      expect(hero.level).toBe(5);
      expect(hero.pendingPerk).toBe(true);
    }
  });
});

describe('completeCombat — loot drop', () => {
  it('drops items into the pack on victory', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    let foundItem = false;
    for (let attempt = 0; attempt < 30 && !foundItem; attempt++) {
      const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
      const { runState: next } = completeCombat(rs, result, createRng(attempt + 1));
      if (next.pack.items.length > rs.pack.items.length) {
        foundItem = true;
      }
      rs = next;
      if (rs.awaitingFork) {
        rs = chooseNextNode(rs, currentNode(rs).nextNodeIds[0]);
      }
      if (rs.status !== 'in_dungeon') {
        rs = startRun('crypt', makeParty(), 1, createRng(attempt + 100));
      }
    }
    expect(foundItem).toBe(true);
  });

  it('loot drops are deterministic per RNG state', () => {
    const a = startRun('crypt', makeParty(), 1, createRng(1));
    const b = startRun('crypt', makeParty(), 1, createRng(1));
    const ra = completeCombat(a, mockCombatResult(a.party, [20, 14, 15], 'player_victory'), createRng(7)).runState;
    const rb = completeCombat(b, mockCombatResult(b.party, [20, 14, 15], 'player_victory'), createRng(7)).runState;
    expect(ra.pack).toEqual(rb.pack);
  });

  it('completeCombat is pure (does not mutate input runState)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const before = JSON.stringify(rs);
    completeCombat(rs, mockCombatResult(rs.party, [15, 10, 10], 'player_victory'), createRng(99));
    expect(JSON.stringify(rs)).toBe(before);
  });
});
```

This rewrite keeps the structure of the original test file (same `describe` blocks, similar coverage) but:
- Replaces all `currentNodeIndex` references with `currentNodeId`.
- Adds the `advanceToBossNode` helper that bridges the fork via `chooseNextNode`.
- Adds new `describe` blocks for `nextNodeChoices`, `chooseNextNode`, and the fork-source `completeCombat` behavior.
- Updates the "boss XP" expectation to match the new floor shape: 3 combat clears (n0 + n1 + branch) before boss, so 15 XP + 30 boss = 45.

- [ ] **Step 7: Run the run-state tests to confirm they fail**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: failures across many tests — `currentNodeId`, `awaitingFork`, `nextNodeChoices`, `chooseNextNode` are not yet exported; existing `currentNodeIndex` references no longer compile (or fail at runtime).

- [ ] **Step 8: Update `RunState` shape and traversal helpers**

In `src/run/run_state.ts`, replace the file end-to-end with:

```ts
import type { DungeonId, Item, Wound } from '../data/types';
import { applyLevelUps, levelForXp, xpForBossNode, xpForCombatNode } from '../data/leveling';
import { DEFAULT_WOUND_RUNS_REMAINING } from '../data/wounds';
import { generateFloor } from '../dungeon/floor';
import { rollLoot } from '../dungeon/loot';
import type { Node } from '../dungeon/node';
import type { CombatEvent, CombatResult } from '../combat/types';
import type { Hero } from '../heroes/hero';
import type { Rng } from '../util/rng';
import { addGold, addItem, createPack, type Pack, totalGold } from './pack';

export type RunStatus = 'in_dungeon' | 'camp_screen' | 'ended';

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
}

export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesLost: readonly Hero[];
}

export interface WipeOutcome {
  packLost: Pack;
  heroesLost: readonly Hero[];
}

const PARTY_SIZE = 3;
const COMBAT_NODE_GOLD = 15;
const BOSS_NODE_GOLD = 100;

export function startRun(
  dungeonId: DungeonId,
  party: readonly Hero[],
  seed: number,
  rng: Rng,
): RunState {
  if (party.length !== PARTY_SIZE) {
    throw new Error(`startRun: party must have ${PARTY_SIZE} heroes, got ${party.length}`);
  }
  const { nodes, startNodeId } = generateFloor(dungeonId, 1, rng);
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
  };
}

export function currentNode(runState: RunState): Node {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`currentNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const node = runState.currentFloorNodes.find((n) => n.id === runState.currentNodeId);
  if (!node) {
    throw new Error(`currentNode: id '${runState.currentNodeId}' not in current floor`);
  }
  return node;
}

export function nextNodeChoices(runState: RunState): readonly Node[] {
  const cur = currentNode(runState);
  return cur.nextNodeIds.map((id) => {
    const n = runState.currentFloorNodes.find((x) => x.id === id);
    if (!n) {
      throw new Error(`nextNodeChoices: id '${id}' not in current floor`);
    }
    return n;
  });
}

export function chooseNextNode(runState: RunState, nextNodeId: string): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`chooseNextNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (!cur.nextNodeIds.includes(nextNodeId)) {
    throw new Error(
      `chooseNextNode: '${nextNodeId}' is not a valid next node from '${cur.id}'`,
    );
  }
  return {
    ...runState,
    currentNodeId: nextNodeId,
    awaitingFork: false,
  };
}

export function completeCombat(
  runState: RunState,
  result: CombatResult,
  rng: Rng,
): { runState: RunState; wipe?: WipeOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`completeCombat: status must be 'in_dungeon', got '${runState.status}'`);
  }

  const updatedPartyLiving: Hero[] = [];
  const newFallen: Hero[] = [];
  for (let i = 0; i < runState.party.length; i++) {
    const original = runState.party[i];
    const combatant = result.finalState.combatants.find((c) => c.id === `p${i}`);
    if (!combatant) {
      updatedPartyLiving.push(original);
      continue;
    }
    const newWounds = woundsFromEvents(result.events, `p${i}`);
    const updated: Hero = {
      ...original,
      currentHp: Math.max(0, combatant.currentHp),
      wounds: newWounds.length > 0 ? [...original.wounds, ...newWounds] : original.wounds,
    };
    if (combatant.isDead) {
      newFallen.push(updated);
    } else {
      updatedPartyLiving.push(updated);
    }
  }

  if (result.outcome === 'player_defeat') {
    const allLost: Hero[] = [
      ...runState.fallen,
      ...newFallen,
      ...updatedPartyLiving,
    ];
    const wipe: WipeOutcome = { packLost: runState.pack, heroesLost: allLost };
    return {
      runState: {
        ...runState,
        party: [],
        fallen: allLost,
        pack: createPack(),
        status: 'ended',
      },
      wipe,
    };
  }

  const completedNode = currentNode(runState);
  const isBoss = completedNode.type === 'boss';
  const fanout = completedNode.nextNodeIds;

  // XP awards — only on victory, only to surviving heroes.
  const xpReward = isBoss
    ? xpForBossNode(runState.currentFloorNumber)
    : xpForCombatNode(runState.currentFloorNumber);
  const partyAfterXp = updatedPartyLiving.map((hero) => {
    const newXp = hero.xp + xpReward;
    const newLevel = levelForXp(newXp);
    return applyLevelUps({ ...hero, xp: newXp }, hero.level, newLevel);
  });

  const reward = isBoss
    ? BOSS_NODE_GOLD * runState.currentFloorNumber
    : COMBAT_NODE_GOLD * runState.currentFloorNumber;
  let newPack = addGold(runState.pack, reward);

  const drop = rollLoot(rng, runState.currentFloorNumber, isBoss);
  if (drop) {
    newPack = addItem(newPack, drop);
  }

  for (const fallen of newFallen) {
    const eq = fallen.equipment;
    const items: Item[] = [eq.weapon, eq.shield, eq.outfit, eq.hat].filter(
      (i): i is Item => i !== undefined,
    );
    for (const item of items) {
      newPack = addItem(newPack, item);
    }
  }

  if (isBoss) {
    return {
      runState: {
        ...runState,
        party: partyAfterXp,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'camp_screen',
      },
    };
  }

  // Non-boss victory — advance based on fanout.
  if (fanout.length === 1) {
    return {
      runState: {
        ...runState,
        party: partyAfterXp,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'in_dungeon',
        currentNodeId: fanout[0],
      },
    };
  }

  // fanout.length === 2 — fork source. Stay at this node; flag awaitingFork.
  return {
    runState: {
      ...runState,
      party: partyAfterXp,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
      status: 'in_dungeon',
      awaitingFork: true,
    },
  };
}

export function pressOn(runState: RunState, rng: Rng): RunState {
  if (runState.status !== 'camp_screen') {
    throw new Error(`pressOn: status must be 'camp_screen', got '${runState.status}'`);
  }
  const nextFloor = runState.currentFloorNumber + 1;
  const { nodes, startNodeId } = generateFloor(runState.dungeonId, nextFloor, rng);
  return {
    ...runState,
    currentFloorNumber: nextFloor,
    currentFloorNodes: nodes,
    currentNodeId: startNodeId,
    awaitingFork: false,
    status: 'in_dungeon',
  };
}

export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  if (runState.status !== 'camp_screen') {
    throw new Error(`cashout: status must be 'camp_screen', got '${runState.status}'`);
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

function woundsFromEvents(events: readonly CombatEvent[], targetId: string): Wound[] {
  const wounds: Wound[] = [];
  for (const e of events) {
    if (e.kind === 'wound_inflicted' && e.combatantId === targetId) {
      wounds.push({ id: e.woundId, runsRemaining: DEFAULT_WOUND_RUNS_REMAINING });
    }
  }
  return wounds;
}
```

Note: this rewrite preserves the existing `woundsFromEvents` helper (currently at the bottom of `run_state.ts`). The function should be present in the current file — copy it verbatim into the new file ending. If the existing function has a slightly different name or signature, match the existing one.

- [ ] **Step 9: Run the run-state tests to confirm they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: PASS. All tests including fork-source, `nextNodeChoices`, `chooseNextNode`, XP awards, cashout, and pressOn green.

- [ ] **Step 10: Run the floor + run-state tests together**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts src/run/__tests__/run_state.test.ts`

Expected: PASS in both files.

- [ ] **Step 11: Run the full test suite**

Run: `npm test`

Expected: PASS in vitest. Test count goes up by ~9 (new fork tests). The save tests still fail at type-check time — that's expected; resolved in Task 2.

Run: `npx tsc --noEmit`

Expected: type errors in `src/save/__tests__/save.test.ts` fixtures (using `currentNodeIndex`), `src/scenes/dungeon_scene.ts` (using `run.currentNodeIndex`), and possibly `src/scenes/combat_scene.ts`. Note them; Task 2 resolves them.

- [ ] **Step 12: Stage and report**

```bash
git add src/dungeon/node.ts src/dungeon/floor.ts \
        src/dungeon/__tests__/floor.test.ts \
        src/run/run_state.ts src/run/__tests__/run_state.test.ts
git status
```

Tell the user: **"Task 1 ready. Floor diamond + RunState id-based traversal + fork API land in one cohesive change. Vitest green; tsc red on save fixtures and dungeon scene (resolved in Task 2). Suggested commit message: `feat(dungeon): graph-based floor with one fork per Crypt floor`. Awaiting your direction."**

---

## Task 2: Save fixtures + scene cleanup + auto-pick stub

**Goal:** Close the type-error gap. Update two `save.test.ts` fixtures, migrate the dungeon scene to id-based reads, add the Tier 2 auto-pick stub, and verify the combat scene needs no changes. After this task, `tsc --noEmit` is clean.

**Files:**
- Modify: `src/save/__tests__/save.test.ts`
- Modify: `src/scenes/dungeon_scene.ts`
- Verify (no changes expected): `src/scenes/combat_scene.ts`

- [ ] **Step 1: Update save fixtures**

In `src/save/__tests__/save.test.ts`, find the two locations that construct a `RunState` literal (currently around lines 47-57 and 75-85, both with `currentFloorNodes: []` and `currentNodeIndex: 0`). Replace each `currentNodeIndex: 0,` line with:

```ts
      currentNodeId: '',
      awaitingFork: false,
```

The empty string for `currentNodeId` is acceptable for the fixture because the test only verifies serialization round-trip, not runtime behavior.

- [ ] **Step 2: Run save tests to confirm they pass**

Run: `npx vitest run src/save/__tests__/save.test.ts`

Expected: PASS. All save round-trip and migration tests green.

- [ ] **Step 3: Add a `pathPositionFor` helper to dungeon_scene**

In `src/scenes/dungeon_scene.ts`, add a private method that derives the player's position along the icon row from the current run state. For the Tier 2 diamond, this is a BFS from the unique source node:

```ts
  /**
   * For the Tier 2 diamond floor (n0 → n1 → n2a/n2b → boss),
   * returns the player's position in the 4-step icon row.
   * Cluster B · 6 (fork picker UI) replaces this with a richer per-node renderer.
   */
  private pathPositionFor(run: ReturnType<typeof appState.get>['runState']): number {
    if (!run) return 0;
    const referenced = new Set(
      run.currentFloorNodes.flatMap((n) => [...n.nextNodeIds]),
    );
    const start = run.currentFloorNodes.find((n) => !referenced.has(n.id));
    if (!start) return 0;

    // BFS from start to currentNodeId.
    const visited = new Set<string>();
    let frontier: { id: string; depth: number }[] = [{ id: start.id, depth: 0 }];
    while (frontier.length > 0) {
      const next: typeof frontier = [];
      for (const { id, depth } of frontier) {
        if (id === run.currentNodeId) return depth;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = run.currentFloorNodes.find((n) => n.id === id);
        if (!node) continue;
        for (const nextId of node.nextNodeIds) next.push({ id: nextId, depth: depth + 1 });
      }
      frontier = next;
    }
    return 0;
  }
```

(Place this method near the existing private helpers; the exact location is up to the engineer.)

- [ ] **Step 4: Replace `currentNodeIndex` reads in dungeon_scene**

The current scene has these `currentNodeIndex` reads:

1. `this.partyContainer.x = this.partyXForNode(run.currentNodeIndex);` (around line 98)
2. `private currentNodeIndex(): number { return appState.get().runState!.currentNodeIndex; }` (around lines 228-230)
3. `const justCompletedIdx = isBoss ? run.currentNodeIndex : run.currentNodeIndex - 1;` (around line 240)
4. `const completedNode = run.currentFloorNodes[justCompletedIdx];` (around line 241)
5. `run.status === 'camp_screen' ? total : run.currentNodeIndex + 1;` (around line 394)
6. `if (i < run.currentNodeIndex) color = '#444444';` (around line 412)
7. `else if (i === run.currentNodeIndex && run.status === 'in_dungeon') color = '#ffcc66';` (around line 413)
8. `this.nodeLabels[i].setColor(i < run.currentNodeIndex ? '#555555' : '#aaaaaa');` (around line 416)

Replace each with the corresponding `pathPositionFor(run)` derivation. The simplest approach is to compute `const pos = this.pathPositionFor(run);` once at the top of each consuming method and use `pos` in place of `run.currentNodeIndex`.

For the `justCompletedIdx` calculation in `buildResultPanel` (around line 240), the logic is: "what node was just completed?" After a non-boss victory, `currentNodeId` has advanced to the next node, so `pos` is the next-step position; the just-completed step is `pos - 1`. After a fork-source victory (where `currentNodeId` *stays* at the fork), `pos` is still the fork-source's position; just-completed is `pos`. After a boss victory, status is `camp_screen` and `pos` is meaningless — fall back to the last node.

Cleanest replacement of `buildResultPanel`'s `justCompletedIdx` block:

```ts
    const isBoss = run.status === 'camp_screen';
    let completedNode: Node;
    if (isBoss) {
      // Find the boss node (unique terminal).
      completedNode = run.currentFloorNodes.find((n) => n.nextNodeIds.length === 0)!;
    } else if (run.awaitingFork) {
      // Just cleared the fork source — currentNodeId still points at it.
      completedNode = currentNode(run);
    } else {
      // Just cleared a linear node — currentNodeId has advanced; the just-completed
      // node is the one whose nextNodeIds contains the new current id.
      completedNode = run.currentFloorNodes.find((n) =>
        n.nextNodeIds.includes(run.currentNodeId),
      )!;
    }
```

Add the imports at the top of the file:

```ts
import {
  chooseNextNode,
  completeCombat,
  currentNode,
  type WipeOutcome,
} from '../run/run_state';
import type { Node } from '../dungeon/node';
```

`currentNode` is already imported by the combat scene; this scene just needs to add it.

For `partyXForNode(...)` calls, replace `run.currentNodeIndex` with `this.pathPositionFor(run)`.

For the icon-row coloring loop (around lines 408-417), replace `run.currentNodeIndex` with `pos`:

```ts
  private refreshNodeColors(): void {
    const run = appState.get().runState!;
    const pos = this.pathPositionFor(run);
    for (let i = 0; i < this.nodeIcons.length; i++) {
      const node = run.currentFloorNodes[i];
      const isBoss = node.type === 'boss';
      let color: string;
      if (i < pos) color = '#444444';
      else if (i === pos && run.status === 'in_dungeon') color = '#ffcc66';
      else color = isBoss ? '#cc6666' : '#888888';
      this.nodeIcons[i].setColor(color);
      this.nodeLabels[i].setColor(i < pos ? '#555555' : '#aaaaaa');
    }
  }
```

For `refreshHud` (around line 394):

```ts
  private refreshHud(): void {
    const run = appState.get().runState!;
    const total = run.currentFloorNodes.length;
    const pos = this.pathPositionFor(run);
    const displayIdx = run.status === 'camp_screen' ? total : pos + 1;
    this.hudFloor.setText(
      `The Crypt · Floor ${run.currentFloorNumber} · Node ${displayIdx} / ${total}`,
    );
    const itemCount = run.pack.items.length;
    const packLabel =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    this.hudPack.setText(packLabel);
  }
```

The private `currentNodeIndex(): number` getter (around line 228-230) becomes:

```ts
  private currentNodeIndex(): number {
    return this.pathPositionFor(appState.get().runState);
  }
```

Keep the method name to avoid renaming all call sites — it's now a derived value but the consumer surface is unchanged.

Note: `buildNodes` currently iterates `run.currentFloorNodes` to build icons. With the diamond, `currentFloorNodes` has 5 entries but the icon row only has 4 positions. **For Tier 2, `buildNodes` should iterate up to `min(currentFloorNodes.length, NODE_X.length)` (= 4) and skip the unchosen branch's node** — but identifying "the unchosen branch" is hard without picker state. Simplest Tier 2 approach: build only 4 icons (indices 0, 1, 2, 3) using `pathPositionFor`-style positions of the player path: start node at NODE_X[0], its single next at NODE_X[1], the chosen branch at NODE_X[2], boss at NODE_X[3]. Since the player hasn't picked yet at scene-init, default to branch A (`nextNodeIds[0]` of the fork source).

To avoid a bigger refactor, change `buildNodes` to:

```ts
  private buildNodes(): void {
    const run = appState.get().runState!;
    // Walk the default player path: start → linear next → fork source → branch A → boss.
    const path = this.defaultPlayerPath(run);
    for (let i = 0; i < path.length && i < NODE_X.length; i++) {
      const node = path[i];
      const glyph = node.type === 'boss' ? '☠' : '⚔';
      const x = NODE_X[i];
      const icon = this.add
        .text(x, NODE_Y, glyph, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#888888',
        })
        .setOrigin(0.5);
      const label = this.add
        .text(x, NODE_LABEL_Y, node.type, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      this.nodeIcons.push(icon);
      this.nodeLabels.push(label);
    }
  }

  /**
   * Tier 2 stub: returns the default player path through the diamond
   * (always picks branch A at forks). Cluster B · 6 replaces this with
   * a path that reflects actual player choices.
   */
  private defaultPlayerPath(run: ReturnType<typeof appState.get>['runState']): readonly Node[] {
    if (!run) return [];
    const referenced = new Set(
      run.currentFloorNodes.flatMap((n) => [...n.nextNodeIds]),
    );
    const start = run.currentFloorNodes.find((n) => !referenced.has(n.id));
    if (!start) return [];

    const path: Node[] = [start];
    let cur = start;
    while (cur.nextNodeIds.length > 0) {
      const nextId = cur.nextNodeIds[0]; // Always pick branch A.
      const next = run.currentFloorNodes.find((n) => n.id === nextId);
      if (!next) break;
      path.push(next);
      cur = next;
    }
    return path;
  }
```

This produces a 4-element path (n0, n1, n2a, boss) for the diamond.

- [ ] **Step 5: Add the awaitingFork auto-pick stub**

In `src/scenes/dungeon_scene.ts`, find `onResultDismiss` (around lines 301-314). Modify to handle `awaitingFork`:

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
      // Tier 2 stub — always pick branch A. Cluster B · 6 replaces this
      // with a picker overlay that lets the player choose.
      const cur = currentNode(run);
      appState.update((s) => ({
        ...s,
        runState: chooseNextNode(s.runState!, cur.nextNodeIds[0]),
      }));
    }

    this.setState('walking_to_next');
  }
```

- [ ] **Step 6: Verify combat_scene needs no changes**

Run: `grep -n 'currentNodeIndex' src/scenes/combat_scene.ts`

Expected: no matches. The combat scene only uses `currentNode(run)` (which is unchanged in interface — still returns a `Node`). If a match is found, replace with `currentNode(...)` analogously.

- [ ] **Step 7: Run the full test suite + type-check**

Run: `npm test`

Expected: PASS — all tests including save fixtures green.

Run: `npx tsc --noEmit`

Expected: clean. The type-error gap from Task 1 is closed.

- [ ] **Step 8: Stage and report**

```bash
git add src/save/__tests__/save.test.ts src/scenes/dungeon_scene.ts
git status
```

Tell the user: **"Task 2 ready. Save fixtures, dungeon scene migration, and Tier 2 auto-pick stub. tsc clean. Suggested commit message: `feat(scenes): id-based dungeon traversal with Tier 2 fork auto-pick`. Awaiting your direction. Manual smoke recommended: `npm run dev`, run a fight on Crypt floor 1, verify the run progresses through the diamond and reaches boss."**

---

## Post-implementation: TODO and HISTORY

After Task 2 is committed, the user typically migrates the TODO entry into HISTORY. Don't do this unprompted — wait for direction. The TODO entry to migrate is the Cluster A · 8 entry in [`TODO.md`](../../../TODO.md). Per the [slim HISTORY entry policy](../../../CLAUDE.md), keep the new HISTORY entry to ~15-25 lines: Why / Decisions / Surprises / Source.

Suggested HISTORY-entry sketch:

```markdown
### YYYY-MM-DD · Floor generation: forks (Cluster A · 8)

**Why:** Foundation for the gdd's "Descend" loop — until forks exist, dungeon floors are linear walks with no player agency between fights. This task converts the Crypt floor from a 4-node list to a 5-node diamond DAG, with one fork after the first preamble combat. The decision quality is low in Tier 2 (both branches are combat with different RNG-rolled enemy comp), but the data model and traversal API now slot cleanly into shop / elite / camp / event nodes (A · 9, 10, 11, 13/14) without further structural change.

**Decisions:**
- **Implicit forks via `nextNodeIds[]` on every node, not an explicit `fork` node type.** Graph shape lives entirely on edges; combat/boss variants gain one new field. No new node type with no encounter to filter out of combat paths.
- **`currentNodeId: string` replaces `currentNodeIndex: number`.** The `awaitingFork: boolean` flag distinguishes "in combat at this node" from "completed combat at this node, awaiting fork pick." Cleaner than overloading `RunStatus` with a new value that breaks save normalizer + scene transitions.
- **Tier 2 dungeon scene gets a stub auto-pick.** When `awaitingFork: true`, the scene calls `chooseNextNode(rs, nextNodeIds[0])` automatically. Cluster B · 6 (Fork picker UI) drops in via the same `chooseNextNode` API.
- **Saves predating the migration are discarded.** Pre-launch policy; loader's shape-mismatch check rejects old `currentNodeIndex` saves. Acceptable given current state.

**Surprises:**
- The dungeon scene's icon row had 8 separate `currentNodeIndex` reads — most of them got replaced with a derived `pathPositionFor(run)` BFS helper. The scene now correctly highlights the player's position even after mid-floor save restore.
- `dungeon.floorLength` (= 3 in `DungeonDef`) is now obsolete; the new generator hard-codes the diamond shape. Kept the field as documentation; A · 9-11 will introduce variable shapes per floor.

**Source:** TODO.md Cluster A · 8 → spec at `docs/superpowers/specs/2026-04-28-floor-forks-design.md` → plan at `docs/superpowers/plans/2026-04-28-floor-forks.md`.
```

---

## Self-review notes

Reviewed the plan against the spec:

- **Spec coverage:** All schema changes (Node, RunState, generateFloor return), all behavior (linear vs fork-source advance, boss path, awaitingFork lifecycle, traversal helpers), all save behavior (fixture updates), all listed tests (floor shape + reachability + uniqueness + determinism + run-state lifecycle) have explicit steps. The Tier 2 dungeon-scene stub also lands per spec Section 4.
- **Type consistency:** `currentNodeId: string`, `awaitingFork: boolean`, `nextNodeIds: readonly string[]`, `nextNodeChoices(rs)`, `chooseNextNode(rs, id)`, `currentNode(rs)`, `{ nodes, startNodeId }` from `generateFloor` — all spelling matches between Tasks 1 and 2.
- **No placeholders:** Every step has actual code or precise commands. The HISTORY-entry sketch uses `YYYY-MM-DD` because the completion date isn't known yet — documentation, not implementation.
- **Inter-task gap:** Task 1 leaves `tsc` red on save fixtures and dungeon scene. Vitest is green throughout because (a) the save fixture tests don't actually exercise the broken fields, and (b) the dungeon scene file isn't run by vitest. Task 2 closes the gap.
- **Test count:** Floor tests go from 8 cases to 12 (+4); run-state tests adjust upward from existing count by ~5 net (new fork tests minus consolidated cases). Net delta: ~+9.
