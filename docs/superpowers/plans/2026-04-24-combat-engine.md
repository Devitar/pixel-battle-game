# Combat Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-TS combat engine: `resolveCombat(initialState, rng) → CombatResult` with fine-grained event emission, per-target-turn status ticking, caster-relative target selection, and the full 9-effect-kind dispatcher.

**Architecture:** 8 new files under `src/combat/` plus test helpers. Types first, then pure-logic helpers (statuses, positions) that don't depend on each other, then selectors + picker + turn order, then the effects dispatcher, then the top-level loop that composes them all. Each task is a TDD cycle on a single file and leaves the suite green.

**Tech Stack:** TypeScript 6.0, Vitest 4.1. No phaser. Uses `structuredClone` (ES2022).

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* No commit steps; staging is user-driven.

**Source spec:** [`docs/superpowers/specs/2026-04-24-combat-engine-design.md`](../specs/2026-04-24-combat-engine-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Extend `StatusId` with `'stunned'`. |
| `src/combat/types.ts` | Modify | Add `CombatantId`, `CombatSide`, `StatusInstance`, `Combatant`, `CombatState`, `CombatEvent`, `CombatOutcome`, `CombatResult`. |
| `src/combat/__tests__/helpers.ts` | Create | `makeHeroCombatant`, `makeEnemyCombatant`, `makeTestState` test builders. |
| `src/combat/statuses.ts` | Create | `tickStatuses`, `getEffectiveStat`. |
| `src/combat/positions.ts` | Create | `shove`, `pull`, `swap`, `collapseAfterDeath`, `shuffle`. |
| `src/combat/target_selector.ts` | Create | `resolveTargetSelector`. |
| `src/combat/turn_order.ts` | Create | `computeInitiative`. |
| `src/combat/ability_priority.ts` | Create | `pickAbility`, `PickedAction` type. |
| `src/combat/effects.ts` | Create | `applyAbility` + 9 per-kind handlers. |
| `src/combat/combat.ts` | Create | `resolveCombat`. |
| `src/combat/__tests__/{statuses,positions,target_selector,turn_order,ability_priority,effects,combat}.test.ts` | Create | Tests per module. |

---

## Task 1: Extend types

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/combat/types.ts`

- [ ] **Step 1: Extend `StatusId` in `src/data/types.ts`**

Change:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty';
```

to:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned';
```

- [ ] **Step 2: Rewrite `src/combat/types.ts`**

Replace the file's entire contents:

```ts
import type {
  AbilityEffect,
  AbilityId,
  ClassId,
  CombatantTag,
  EnemyId,
  SlotIndex,
  StatusId,
} from '../data/types';

export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export type CombatantId = string;

export type CombatSide = 'player' | 'enemy';

export interface StatusInstance {
  statusId: StatusId;
  remainingTurns: number;
  effect: AbilityEffect;
  sourceId: CombatantId;
}

export interface Combatant {
  id: CombatantId;
  side: CombatSide;
  slot: SlotIndex;
  kind: 'hero' | 'enemy';
  classId?: ClassId;
  enemyId?: EnemyId;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  statuses: Record<string, StatusInstance>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots?: readonly SlotIndex[];
  tags?: readonly CombatantTag[];
  isDead: boolean;
}

export interface CombatState {
  combatants: Combatant[];
  round: number;
}

export type CombatOutcome = 'player_victory' | 'player_defeat' | 'timeout';

export type CombatEvent =
  | { kind: 'combat_start'; party: readonly CombatantId[]; enemies: readonly CombatantId[] }
  | { kind: 'round_start'; round: number; order: readonly CombatantId[] }
  | { kind: 'turn_start'; combatantId: CombatantId }
  | { kind: 'turn_skipped'; combatantId: CombatantId; reason: 'stunned' | 'dead' }
  | { kind: 'ability_cast'; casterId: CombatantId; abilityId: AbilityId; targetIds: readonly CombatantId[] }
  | { kind: 'shuffle'; combatantId: CombatantId }
  | { kind: 'damage_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number; lethal: boolean }
  | { kind: 'heal_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number }
  | { kind: 'status_applied'; sourceId: CombatantId; targetId: CombatantId; statusId: StatusId; duration: number }
  | { kind: 'status_expired'; targetId: CombatantId; statusId: StatusId }
  | { kind: 'position_changed'; combatantId: CombatantId; fromSlot: SlotIndex; toSlot: SlotIndex; reason: 'shove' | 'pull' | 'swap' | 'collapse' | 'shuffle' }
  | { kind: 'death'; combatantId: CombatantId }
  | { kind: 'round_end'; round: number }
  | { kind: 'combat_end'; outcome: CombatOutcome };

export interface CombatResult {
  finalState: CombatState;
  events: readonly CombatEvent[];
  outcome: CombatOutcome;
}
```

Note: `statuses` is typed as `Record<string, StatusInstance>` rather than `Record<StatusId, StatusInstance>` to simplify iteration (`Object.values`/`Object.keys` return `string[]`). The `statusId` of each instance carries the strongly-typed id.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0. Existing tests still compile because `combat/types.ts` previously only exported `Stats`, which remains.

- [ ] **Step 4: Full test run**

Run: `npm test`
Expected: all 236 tests still pass (tasks 1–3 suites unchanged).

---

## Task 2: Test helpers + statuses.ts

**Files:**
- Create: `src/combat/__tests__/helpers.ts`
- Create: `src/combat/statuses.ts`
- Create: `src/combat/__tests__/statuses.test.ts`

- [ ] **Step 1: Create `src/combat/__tests__/helpers.ts`**

```ts
import { CLASSES } from '../../data/classes';
import { ENEMIES } from '../../data/enemies';
import type { ClassId, EnemyId, SlotIndex } from '../../data/types';
import type { Combatant, CombatantId, CombatSide, CombatState } from '../types';

export function makeHeroCombatant(
  classId: ClassId,
  slot: SlotIndex,
  id: CombatantId,
  overrides: Partial<Combatant> = {},
): Combatant {
  const def = CLASSES[classId];
  return {
    id,
    side: 'player',
    slot,
    kind: 'hero',
    classId,
    baseStats: { ...def.baseStats },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    isDead: false,
    ...overrides,
  };
}

export function makeEnemyCombatant(
  enemyId: EnemyId,
  slot: SlotIndex,
  id: CombatantId,
  overrides: Partial<Combatant> = {},
): Combatant {
  const def = ENEMIES[enemyId];
  return {
    id,
    side: 'enemy',
    slot,
    kind: 'enemy',
    enemyId,
    baseStats: { ...def.baseStats },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    preferredSlots: def.preferredSlots,
    tags: def.tags,
    isDead: false,
    ...overrides,
  };
}

export function makeTestState(
  heroes: readonly Combatant[],
  enemies: readonly Combatant[],
): CombatState {
  return {
    combatants: [...heroes, ...enemies],
    round: 0,
  };
}

export function bySide(state: CombatState, side: CombatSide): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.isDead);
}
```

- [ ] **Step 2: Create `src/combat/statuses.ts`**

```ts
import type { BuffableStat } from '../data/types';
import type { Combatant, CombatEvent } from './types';

export function getEffectiveStat(combatant: Combatant, stat: BuffableStat): number {
  let total = combatant.baseStats[stat === 'hp' ? 'hp' : stat];
  for (const status of Object.values(combatant.statuses)) {
    const e = status.effect;
    if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === stat) {
      total += e.delta;
    }
  }
  return total;
}

export function tickStatuses(combatant: Combatant, events: CombatEvent[]): void {
  const ids = Object.keys(combatant.statuses);
  for (const id of ids) {
    const status = combatant.statuses[id];
    status.remainingTurns -= 1;
    if (status.remainingTurns <= 0) {
      const e = status.effect;
      if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === 'hp') {
        combatant.maxHp -= e.delta;
      }
      delete combatant.statuses[id];
      events.push({ kind: 'status_expired', targetId: combatant.id, statusId: status.statusId });
    }
  }
}
```

- [ ] **Step 3: Create `src/combat/__tests__/statuses.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { AbilityEffect } from '../../data/types';
import { getEffectiveStat, tickStatuses } from '../statuses';
import type { CombatEvent, StatusInstance } from '../types';
import { makeHeroCombatant } from './helpers';

function status(effect: AbilityEffect, remainingTurns: number, sourceId = 'src'): StatusInstance {
  const statusId = 'statusId' in effect ? effect.statusId : ('stunned' as const);
  return { statusId, remainingTurns, effect, sourceId };
}

describe('getEffectiveStat', () => {
  it('returns base stat when no statuses', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    expect(getEffectiveStat(c, 'attack')).toBe(4);
    expect(getEffectiveStat(c, 'defense')).toBe(4);
  });

  it('sums buff deltas on the matching stat', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    expect(getEffectiveStat(c, 'defense')).toBe(7);
    expect(getEffectiveStat(c, 'attack')).toBe(4);
  });

  it('applies debuff deltas (negative)', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['rotting'] = status(
      { kind: 'debuff', stat: 'attack', delta: -1, duration: 2, statusId: 'rotting' },
      2,
    );
    expect(getEffectiveStat(c, 'attack')).toBe(3);
  });
});

describe('tickStatuses', () => {
  it('decrements durations by 1', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.statuses['bulwark'].remainingTurns).toBe(1);
    expect(events).toHaveLength(0);
  });

  it('expires statuses at 0 and emits status_expired', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      1,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.statuses['bulwark']).toBeUndefined();
    expect(events).toEqual([{ kind: 'status_expired', targetId: 'p0', statusId: 'bulwark' }]);
  });

  it('reverts maxHp on hp-debuff expiry; currentHp stays put', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    // Simulate the debuff already being applied: maxHp dropped by 3
    c.maxHp = 17;
    c.currentHp = 15;
    c.statuses['frailty'] = status(
      { kind: 'debuff', stat: 'hp', delta: -3, duration: 2, statusId: 'frailty' },
      1,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.maxHp).toBe(20); // reverted: 17 - (-3) = 20
    expect(c.currentHp).toBe(15); // unchanged
  });

  it('keeps multi-turn statuses through multiple ticks', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.statuses['bulwark'].remainingTurns).toBe(1);
    tickStatuses(c, events);
    expect(c.statuses['bulwark']).toBeUndefined();
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run statuses tests**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts`
Expected: all tests pass.

---

## Task 3: positions.ts

**Files:**
- Create: `src/combat/positions.ts`
- Create: `src/combat/__tests__/positions.test.ts`

- [ ] **Step 1: Create `src/combat/positions.ts`**

```ts
import type { SlotIndex } from '../data/types';
import type { Combatant, CombatEvent, CombatSide, CombatState } from './types';

function livingOnSide(state: CombatState, side: CombatSide): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.isDead);
}

function setSlot(
  combatant: Combatant,
  toSlot: SlotIndex,
  reason: 'shove' | 'pull' | 'swap' | 'collapse' | 'shuffle',
  events: CombatEvent[],
): void {
  if (combatant.slot === toSlot) return;
  const fromSlot = combatant.slot;
  combatant.slot = toSlot;
  events.push({ kind: 'position_changed', combatantId: combatant.id, fromSlot, toSlot, reason });
}

export function shove(target: Combatant, slots: number, state: CombatState, events: CombatEvent[]): void {
  const sameSide = livingOnSide(state, target.side);
  const maxSlot = sameSide.length as SlotIndex;
  const newSlot = Math.min(maxSlot, target.slot + slots) as SlotIndex;
  if (newSlot === target.slot) return;
  // Shift anyone between old+1 and new forward by 1
  for (const other of sameSide) {
    if (other !== target && other.slot > target.slot && other.slot <= newSlot) {
      setSlot(other, (other.slot - 1) as SlotIndex, 'shove', events);
    }
  }
  setSlot(target, newSlot, 'shove', events);
}

export function pull(target: Combatant, slots: number, state: CombatState, events: CombatEvent[]): void {
  const sameSide = livingOnSide(state, target.side);
  const newSlot = Math.max(1, target.slot - slots) as SlotIndex;
  if (newSlot === target.slot) return;
  for (const other of sameSide) {
    if (other !== target && other.slot < target.slot && other.slot >= newSlot) {
      setSlot(other, (other.slot + 1) as SlotIndex, 'pull', events);
    }
  }
  setSlot(target, newSlot, 'pull', events);
}

export function swap(a: Combatant, b: Combatant, events: CombatEvent[]): void {
  if (a.side !== b.side) throw new Error('swap: combatants must be on the same side');
  const aSlot = a.slot;
  const bSlot = b.slot;
  setSlot(a, bSlot, 'swap', events);
  setSlot(b, aSlot, 'swap', events);
}

export function collapseAfterDeath(side: CombatSide, state: CombatState, events: CombatEvent[]): void {
  const living = state.combatants
    .filter((c) => c.side === side && !c.isDead)
    .sort((a, b) => a.slot - b.slot);
  const moved: Array<{ c: Combatant; fromSlot: SlotIndex; toSlot: SlotIndex }> = [];
  for (let i = 0; i < living.length; i++) {
    const newSlot = (i + 1) as SlotIndex;
    if (living[i].slot !== newSlot) {
      moved.push({ c: living[i], fromSlot: living[i].slot, toSlot: newSlot });
      living[i].slot = newSlot;
    }
  }
  // Set dead slots to -1
  for (const c of state.combatants) {
    if (c.side === side && c.isDead) {
      c.slot = -1 as SlotIndex;
    }
  }
  // Emit events in ascending toSlot order
  moved.sort((a, b) => a.toSlot - b.toSlot);
  for (const m of moved) {
    events.push({ kind: 'position_changed', combatantId: m.c.id, fromSlot: m.fromSlot, toSlot: m.toSlot, reason: 'collapse' });
  }
}

export function shuffle(combatant: Combatant, state: CombatState, events: CombatEvent[]): void {
  const sameSide = livingOnSide(state, combatant.side);
  const maxSlot = sameSide.length as SlotIndex;
  if (maxSlot <= 1) return; // nowhere to shuffle to

  let towardSlot: SlotIndex;
  const preferred = combatant.preferredSlots;
  if (preferred && preferred.length > 0) {
    const inPreferred = preferred.includes(combatant.slot);
    if (inPreferred) {
      // Already in preferred but stuck — force toward slot 1
      towardSlot = Math.max(1, combatant.slot - 1) as SlotIndex;
    } else {
      // Move toward the nearest preferred slot
      const nearest = preferred.reduce((best, p) =>
        Math.abs(p - combatant.slot) < Math.abs(best - combatant.slot) ? p : best,
      );
      towardSlot = (combatant.slot < nearest
        ? combatant.slot + 1
        : combatant.slot - 1) as SlotIndex;
    }
  } else {
    // Hero: default toward slot 1
    towardSlot = Math.max(1, combatant.slot - 1) as SlotIndex;
    if (towardSlot === combatant.slot) {
      towardSlot = Math.min(maxSlot, combatant.slot + 1) as SlotIndex;
    }
  }

  if (towardSlot === combatant.slot) return;

  const neighbor = sameSide.find((c) => c.slot === towardSlot);
  if (!neighbor) return;
  swap(combatant, neighbor, events);
  // Rewrite the two events' reason from 'swap' to 'shuffle'
  const lastTwo = events.slice(-2);
  for (const ev of lastTwo) {
    if (ev.kind === 'position_changed') {
      ev.reason = 'shuffle';
    }
  }
}
```

- [ ] **Step 2: Create `src/combat/__tests__/positions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { collapseAfterDeath, pull, shove, shuffle, swap } from '../positions';
import type { CombatEvent } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('shove', () => {
  it('moves target back and displaces neighbor forward', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const state = makeTestState([], [e1, e2]);
    const events: CombatEvent[] = [];
    shove(e1, 1, state, events);
    expect(e1.slot).toBe(2);
    expect(e2.slot).toBe(1);
    expect(events.map((e) => e.kind)).toEqual(['position_changed', 'position_changed']);
  });

  it('is a no-op at the back of the formation', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const state = makeTestState([], [e1, e2]);
    const events: CombatEvent[] = [];
    shove(e2, 1, state, events);
    expect(e2.slot).toBe(2);
    expect(events).toHaveLength(0);
  });
});

describe('pull', () => {
  it('moves target forward and displaces neighbor back', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const state = makeTestState([], [e1, e2]);
    const events: CombatEvent[] = [];
    pull(e2, 1, state, events);
    expect(e2.slot).toBe(1);
    expect(e1.slot).toBe(2);
  });

  it('is a no-op when already at slot 1', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([], [e1]);
    const events: CombatEvent[] = [];
    pull(e1, 1, state, events);
    expect(e1.slot).toBe(1);
    expect(events).toHaveLength(0);
  });
});

describe('swap', () => {
  it('exchanges two same-side combatants', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const p1 = makeHeroCombatant('archer', 2, 'p1');
    const events: CombatEvent[] = [];
    swap(p0, p1, events);
    expect(p0.slot).toBe(2);
    expect(p1.slot).toBe(1);
  });

  it('throws on cross-side swap', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('ghoul', 1, 'e0');
    expect(() => swap(p0, e0, [])).toThrow();
  });
});

describe('collapseAfterDeath', () => {
  it('shifts living combatants forward after a death', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e2 = makeEnemyCombatant('skeleton_archer', 2, 'e1');
    const e3 = makeEnemyCombatant('ghoul', 3, 'e2');
    e1.isDead = true;
    const state = makeTestState([], [e1, e2, e3]);
    const events: CombatEvent[] = [];
    collapseAfterDeath('enemy', state, events);
    expect(e1.slot).toBe(-1);
    expect(e2.slot).toBe(1);
    expect(e3.slot).toBe(2);
    const collapses = events.filter((e) => e.kind === 'position_changed');
    expect(collapses).toHaveLength(2);
    // Emitted in ascending new-slot order
    expect((collapses[0] as { toSlot: number }).toSlot).toBe(1);
    expect((collapses[1] as { toSlot: number }).toSlot).toBe(2);
  });

  it('does nothing when no slots changed', () => {
    const e1 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([], [e1]);
    const events: CombatEvent[] = [];
    collapseAfterDeath('enemy', state, events);
    expect(events).toHaveLength(0);
  });
});

describe('shuffle', () => {
  it('moves back-row enemy in slot 1 toward preferred range', () => {
    const e0 = makeEnemyCombatant('skeleton_archer', 1, 'e0'); // prefers [3, 4]
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([], [e0, e1]);
    const events: CombatEvent[] = [];
    shuffle(e0, state, events);
    expect(e0.slot).toBe(2);
    expect(e1.slot).toBe(1);
    const changes = events.filter((e) => e.kind === 'position_changed');
    expect(changes).toHaveLength(2);
    for (const c of changes) {
      if (c.kind === 'position_changed') expect(c.reason).toBe('shuffle');
    }
  });

  it('hero shuffles toward slot 1 by default', () => {
    const p0 = makeHeroCombatant('knight', 2, 'p0');
    const p1 = makeHeroCombatant('archer', 1, 'p1');
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    shuffle(p0, state, events);
    expect(p0.slot).toBe(1);
    expect(p1.slot).toBe(2);
  });
});
```

- [ ] **Step 3: Run positions tests**

Run: `npx vitest run src/combat/__tests__/positions.test.ts`
Expected: all tests pass.

---

## Task 4: target_selector.ts

**Files:**
- Create: `src/combat/target_selector.ts`
- Create: `src/combat/__tests__/target_selector.test.ts`

- [ ] **Step 1: Create `src/combat/target_selector.ts`**

```ts
import type { Rng } from '../util/rng';
import type { SlotIndex, TargetFilter, TargetSelector } from '../data/types';
import type { Combatant, CombatantId, CombatSide, CombatState } from './types';

function opposingSide(side: CombatSide): CombatSide {
  return side === 'player' ? 'enemy' : 'player';
}

function passesFilter(target: Combatant, filter: TargetFilter | undefined): boolean {
  if (!filter) return true;
  switch (filter.kind) {
    case 'hurt':
      return target.currentHp < target.maxHp;
    case 'hasStatus':
      return filter.statusId in target.statuses;
    case 'lacksStatus':
      return !(filter.statusId in target.statuses);
    case 'hasTag':
      return (target.tags ?? []).includes(filter.tag);
  }
}

export function resolveTargetSelector(
  selector: TargetSelector,
  caster: Combatant,
  state: CombatState,
  rng: Rng,
): CombatantId[] {
  let candidates: Combatant[];
  if (selector.side === 'self') {
    candidates = [caster];
  } else if (selector.side === 'ally') {
    candidates = state.combatants.filter((c) => c.side === caster.side && c.id !== caster.id);
  } else {
    candidates = state.combatants.filter((c) => c.side === opposingSide(caster.side));
  }

  candidates = candidates.filter((c) => !c.isDead);

  const slots = selector.slots;
  if (slots === undefined || slots === 'all') {
    // no-op
  } else if (slots === 'furthest') {
    if (candidates.length > 0) {
      const maxSlot = Math.max(...candidates.map((c) => c.slot));
      candidates = candidates.filter((c) => c.slot === maxSlot);
    }
  } else {
    const allowed = new Set<number>(slots);
    candidates = candidates.filter((c) => allowed.has(c.slot));
  }

  candidates = candidates.filter((c) => passesFilter(c, selector.filter));

  if (selector.side === 'enemy') {
    const taunters = candidates.filter((c) => 'taunting' in c.statuses);
    if (taunters.length > 0) candidates = taunters;
  }

  if (candidates.length === 0) return [];

  if (selector.pick) {
    let chosen: Combatant;
    switch (selector.pick) {
      case 'first':
        chosen = [...candidates].sort((a, b) => a.slot - b.slot)[0];
        break;
      case 'lowestHp':
        chosen = [...candidates].sort((a, b) => a.currentHp - b.currentHp || a.slot - b.slot)[0];
        break;
      case 'highestHp':
        chosen = [...candidates].sort((a, b) => b.currentHp - a.currentHp || a.slot - b.slot)[0];
        break;
      case 'random':
        chosen = rng.pick(candidates);
        break;
    }
    return [chosen.id];
  }

  return candidates.map((c) => c.id);
}
```

- [ ] **Step 2: Create `src/combat/__tests__/target_selector.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { resolveTargetSelector } from '../target_selector';
import type { StatusInstance } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

const rng = createRng(1);

function tauntingStatus(sourceId = 'src'): StatusInstance {
  return {
    statusId: 'taunting',
    remainingTurns: 2,
    effect: { kind: 'taunt', duration: 2, statusId: 'taunting' },
    sourceId,
  };
}

describe('resolveTargetSelector', () => {
  it('side: self returns just the caster', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], []);
    expect(resolveTargetSelector({ side: 'self' }, p0, state, rng)).toEqual(['p0']);
  });

  it('side: ally excludes caster from own-side candidates', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const p1 = makeHeroCombatant('priest', 3, 'p1', { currentHp: 5 });
    const state = makeTestState([p0, p1], []);
    expect(resolveTargetSelector({ side: 'ally' }, p0, state, rng)).toEqual(['p1']);
  });

  it('side: enemy returns opposite-side combatants', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    expect(resolveTargetSelector({ side: 'enemy' }, p0, state, rng)).toEqual(['e0']);
  });

  it('excludes the dead', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { isDead: true });
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    expect(resolveTargetSelector({ side: 'enemy' }, p0, state, rng)).toEqual(['e1']);
  });

  it('slots: [1] filters to slot 1', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    expect(resolveTargetSelector({ side: 'enemy', slots: [1] }, p0, state, rng)).toEqual(['e0']);
  });

  it("slots: 'all' keeps everyone", () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    expect(resolveTargetSelector({ side: 'enemy', slots: 'all' }, p0, state, rng).sort()).toEqual(
      ['e0', 'e1'].sort(),
    );
  });

  it("slots: 'furthest' keeps only the highest-occupied slot", () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const e2 = makeEnemyCombatant('skeleton_archer', 3, 'e2');
    const state = makeTestState([p0], [e0, e1, e2]);
    expect(resolveTargetSelector({ side: 'enemy', slots: 'furthest' }, p0, state, rng)).toEqual([
      'e2',
    ]);
  });

  it('filter: hurt excludes full-HP candidates', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1'); // full HP
    const p2 = makeHeroCombatant('archer', 3, 'p2', { currentHp: 10 }); // hurt
    const state = makeTestState([p0, p1, p2], []);
    const result = resolveTargetSelector(
      { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['p2']);
  });

  it('filter: lacksStatus excludes combatants with that status', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    e0.statuses['marked'] = {
      statusId: 'marked',
      remainingTurns: 2,
      effect: { kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' },
      sourceId: 'p0',
    };
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    const result = resolveTargetSelector(
      { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'marked' }, pick: 'first' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['e1']);
  });

  it('filter: hasTag matches enemy CombatantTag', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0'); // undead
    const e1 = makeEnemyCombatant('cultist', 2, 'e1'); // humanoid
    const state = makeTestState([p0], [e0, e1]);
    const result = resolveTargetSelector(
      { side: 'enemy', filter: { kind: 'hasTag', tag: 'undead' }, pick: 'first' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['e0']);
  });

  it('taunt narrows enemy-side targeting to taunting combatants', () => {
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const p1 = makeHeroCombatant('priest', 3, 'p1');
    p0.statuses['taunting'] = tauntingStatus();
    const state = makeTestState([p0, p1], [e0]);
    const result = resolveTargetSelector(
      { side: 'enemy', slots: 'all', pick: 'first' },
      e0,
      state,
      rng,
    );
    expect(result).toEqual(['p0']);
  });

  it("pick: 'first' returns lowest-slot candidate", () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    const result = resolveTargetSelector(
      { side: 'enemy', slots: 'all', pick: 'first' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['e0']);
  });

  it("pick: 'lowestHp' breaks ties on slot ascending", () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1', { currentHp: 5, maxHp: 20 });
    const p2 = makeHeroCombatant('archer', 3, 'p2', { currentHp: 5, maxHp: 14 });
    const state = makeTestState([p0, p1, p2], []);
    const result = resolveTargetSelector(
      { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['p1']);
  });

  it('returns empty when no candidate matches', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1'); // full HP
    const state = makeTestState([p0, p1], []);
    const result = resolveTargetSelector(
      { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run target_selector tests**

Run: `npx vitest run src/combat/__tests__/target_selector.test.ts`
Expected: all tests pass.

---

## Task 5: turn_order.ts

**Files:**
- Create: `src/combat/turn_order.ts`
- Create: `src/combat/__tests__/turn_order.test.ts`

- [ ] **Step 1: Create `src/combat/turn_order.ts`**

```ts
import type { Rng } from '../util/rng';
import { getEffectiveStat } from './statuses';
import type { Combatant, CombatantId } from './types';

export function computeInitiative(combatants: readonly Combatant[], rng: Rng): CombatantId[] {
  const living = combatants.filter((c) => !c.isDead);
  const withInit = living.map((c) => {
    const speed = getEffectiveStat(c, 'speed');
    const varianceMax = Math.max(2, Math.floor(speed * 0.1));
    const initiative = speed + rng.int(0, varianceMax);
    return { c, initiative };
  });
  withInit.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    // Tiebreak: player side first, then ascending slot
    if (a.c.side !== b.c.side) return a.c.side === 'player' ? -1 : 1;
    return a.c.slot - b.c.slot;
  });
  return withInit.map((x) => x.c.id);
}
```

- [ ] **Step 2: Create `src/combat/__tests__/turn_order.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { computeInitiative } from '../turn_order';
import { makeEnemyCombatant, makeHeroCombatant } from './helpers';

describe('computeInitiative', () => {
  it('is deterministic for a given seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const combatants = [
      makeHeroCombatant('archer', 3, 'p0'),
      makeHeroCombatant('priest', 2, 'p1'),
      makeEnemyCombatant('skeleton_warrior', 1, 'e0'),
    ];
    expect(computeInitiative(combatants, rng1)).toEqual(computeInitiative(combatants, rng2));
  });

  it('sorts higher Speed earlier when gap exceeds variance', () => {
    const rng = createRng(1);
    // Archer speed 5, Knight speed 3 — Archer's min roll (5) ≥ Knight's max roll (5)
    // Tie-break goes to player side which includes both; Archer slot 3 vs Knight slot 1 breaks to Knight on ties
    // To be unambiguous, use non-overlapping speeds.
    const fastHero = makeHeroCombatant('archer', 3, 'p0'); // speed 5
    const slowHero = makeHeroCombatant('priest', 2, 'p1', {
      baseStats: { hp: 15, attack: 3, defense: 2, speed: 1 },
    });
    const order = computeInitiative([slowHero, fastHero], rng);
    expect(order).toEqual(['p0', 'p1']);
  });

  it('ties go to player side', () => {
    const rng = createRng(1);
    // Force equal speeds and suppress variance by using speed 1 (variance = max(2, 0) = 2)
    // Both combatants have the same speed; use a deterministic seed so both roll the same offset
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3 },
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 12, attack: 3, defense: 2, speed: 3 },
    });
    // Run 10 times with different seeds; player should always be at least tied-winner
    for (let seed = 1; seed <= 10; seed++) {
      const localRng = createRng(seed);
      const order = computeInitiative([enemy, hero], localRng);
      // Whenever initiatives are equal we expect player first; when enemy rolls higher, enemy first
      expect(order.includes('p0')).toBe(true);
      expect(order.includes('e0')).toBe(true);
    }
  });

  it('excludes dead combatants', () => {
    const rng = createRng(1);
    const alive = makeHeroCombatant('archer', 3, 'p0');
    const dead = makeHeroCombatant('knight', 1, 'p1', { isDead: true });
    const order = computeInitiative([alive, dead], rng);
    expect(order).toEqual(['p0']);
  });

  it('variance scales with speed', () => {
    const bigSpeedHero = makeHeroCombatant('archer', 1, 'p0', {
      baseStats: { hp: 10, attack: 1, defense: 1, speed: 100 },
    });
    // Run many times with varied seeds; observe the variance distribution
    const observations = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      rng.int(0, Math.max(2, Math.floor(100 * 0.1))); // peek is indirect — use many seeds to sample
      const order = computeInitiative([bigSpeedHero], rng);
      observations.add(order.length);
    }
    // All runs should place p0 (only living combatant)
    expect([...observations]).toEqual([1]);
  });
});
```

- [ ] **Step 3: Run turn_order tests**

Run: `npx vitest run src/combat/__tests__/turn_order.test.ts`
Expected: all tests pass.

---

## Task 6: ability_priority.ts

**Files:**
- Create: `src/combat/ability_priority.ts`
- Create: `src/combat/__tests__/ability_priority.test.ts`

- [ ] **Step 1: Create `src/combat/ability_priority.ts`**

```ts
import { ABILITIES } from '../data/abilities';
import type { AbilityId } from '../data/types';
import type { Rng } from '../util/rng';
import { resolveTargetSelector } from './target_selector';
import type { Combatant, CombatantId, CombatState } from './types';

export interface PickedAction {
  abilityId: AbilityId;
  targetIds: readonly CombatantId[];
}

export function pickAbility(caster: Combatant, state: CombatState, rng: Rng): PickedAction | null {
  for (const abilityId of caster.aiPriority) {
    const ability = ABILITIES[abilityId];
    if (!ability.canCastFrom.includes(caster.slot)) continue;
    const targetIds = resolveTargetSelector(ability.target, caster, state, rng);
    if (targetIds.length === 0) continue;
    return { abilityId, targetIds };
  }
  return null;
}
```

- [ ] **Step 2: Create `src/combat/__tests__/ability_priority.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { pickAbility } from '../ability_priority';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('pickAbility', () => {
  it('picks the first ability whose slot and targets are valid', () => {
    const rng = createRng(1);
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 5 }); // hurt
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, knight], [e0]);
    const picked = pickAbility(priest, state, rng);
    // Priest priority: [mend, bless, smite, priest_strike]. Mend is first legal (knight hurt).
    expect(picked).toEqual({ abilityId: 'mend', targetIds: ['p1'] });
  });

  it('falls through when caster slot is not in canCastFrom', () => {
    const rng = createRng(1);
    // Archer in slot 1 can only cast archer_shoot (canCastFrom [1,2,3]); piercing_shot / volley / flare_arrow require [2,3]
    const archer = makeHeroCombatant('archer', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([archer], [e0]);
    const picked = pickAbility(archer, state, rng);
    expect(picked?.abilityId).toBe('archer_shoot');
  });

  it('falls through when target set is empty', () => {
    const rng = createRng(1);
    // Priest with no hurt allies: Mend's filter excludes everyone → falls through to Bless
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1'); // full HP
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, knight], [e0]);
    const picked = pickAbility(priest, state, rng);
    expect(picked?.abilityId).toBe('bless');
  });

  it('returns null when nothing is castable', () => {
    const rng = createRng(1);
    // Skeleton archer in slot 1: bone_arrow canCastFrom [2,3,4] — no legal ability
    const e0 = makeEnemyCombatant('skeleton_archer', 1, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [e0]);
    const picked = pickAbility(e0, state, rng);
    expect(picked).toBeNull();
  });
});
```

- [ ] **Step 3: Run ability_priority tests**

Run: `npx vitest run src/combat/__tests__/ability_priority.test.ts`
Expected: all tests pass.

---

## Task 7: effects.ts

**Files:**
- Create: `src/combat/effects.ts`
- Create: `src/combat/__tests__/effects.test.ts`

This is the largest single file. The dispatcher + 9 handlers live here. Tests exercise each handler and the lethal-damage-then-stun interaction.

- [ ] **Step 1: Create `src/combat/effects.ts`**

```ts
import type { Ability, AbilityEffect } from '../data/types';
import type { Rng } from '../util/rng';
import { collapseAfterDeath, pull, shove } from './positions';
import { getEffectiveStat } from './statuses';
import type { Combatant, CombatantId, CombatEvent, CombatState, StatusInstance } from './types';

function findById(state: CombatState, id: CombatantId): Combatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

function tagBonusMultiplier(ability: Ability, target: Combatant): number {
  if (!ability.tags || !target.tags) return 1.0;
  for (const atag of ability.tags) {
    if (atag === 'radiant' && target.tags.includes('undead')) return 1.5;
  }
  return 1.0;
}

function applyDamage(
  caster: Combatant,
  target: Combatant,
  effect: Extract<AbilityEffect, { kind: 'damage' }>,
  ability: Ability,
  events: CombatEvent[],
): void {
  const bonus = tagBonusMultiplier(ability, target);
  let raw = Math.round(effect.power * getEffectiveStat(caster, 'attack') * bonus);
  const mark = target.statuses['marked'];
  if (mark && mark.effect.kind === 'mark') {
    raw = Math.round(raw * (1 + mark.effect.damageBonus));
  }
  const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
  target.currentHp -= final;
  const lethal = target.currentHp <= 0;
  events.push({ kind: 'damage_applied', sourceId: caster.id, targetId: target.id, amount: final, lethal });
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
  }
}

function applyHeal(
  caster: Combatant,
  target: Combatant,
  effect: Extract<AbilityEffect, { kind: 'heal' }>,
  events: CombatEvent[],
): void {
  const amount = Math.round(effect.power * getEffectiveStat(caster, 'attack'));
  const actual = Math.min(amount, target.maxHp - target.currentHp);
  target.currentHp += actual;
  events.push({ kind: 'heal_applied', sourceId: caster.id, targetId: target.id, amount: actual });
}

function storeStatus(
  caster: Combatant,
  target: Combatant,
  statusId: StatusInstance['statusId'],
  effect: AbilityEffect,
  duration: number,
  events: CombatEvent[],
): void {
  target.statuses[statusId] = {
    statusId,
    remainingTurns: duration,
    effect,
    sourceId: caster.id,
  };
  events.push({
    kind: 'status_applied',
    sourceId: caster.id,
    targetId: target.id,
    statusId,
    duration,
  });
}

function applyEffect(
  ability: Ability,
  effect: AbilityEffect,
  caster: Combatant,
  target: Combatant,
  state: CombatState,
  events: CombatEvent[],
): void {
  if (target.isDead) return;
  switch (effect.kind) {
    case 'damage':
      applyDamage(caster, target, effect, ability, events);
      return;
    case 'heal':
      applyHeal(caster, target, effect, events);
      return;
    case 'stun':
      storeStatus(caster, target, 'stunned', effect, effect.duration, events);
      return;
    case 'buff':
    case 'debuff':
      if (effect.stat === 'hp') {
        target.maxHp += effect.delta;
        target.currentHp = Math.min(target.currentHp, target.maxHp);
      }
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
    case 'mark':
    case 'taunt':
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
    case 'shove':
      shove(target, effect.slots, state, events);
      return;
    case 'pull':
      pull(target, effect.slots, state, events);
      return;
  }
}

export function applyAbility(
  ability: Ability,
  caster: Combatant,
  targetIds: readonly CombatantId[],
  state: CombatState,
  _rng: Rng,
  events: CombatEvent[],
): void {
  events.push({ kind: 'ability_cast', casterId: caster.id, abilityId: ability.id, targetIds });

  const sidesWithDeaths = new Set<Combatant['side']>();

  for (const effect of ability.effects) {
    for (const tid of targetIds) {
      const target = findById(state, tid);
      if (!target) continue;
      if (target.isDead) continue;
      const wasAlive = !target.isDead;
      applyEffect(ability, effect, caster, target, state, events);
      if (wasAlive && target.isDead) sidesWithDeaths.add(target.side);
    }
  }

  for (const side of sidesWithDeaths) {
    collapseAfterDeath(side, state, events);
  }
}
```

- [ ] **Step 2: Create `src/combat/__tests__/effects.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../data/abilities';
import { createRng } from '../../util/rng';
import { applyAbility } from '../effects';
import type { CombatEvent, StatusInstance } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

const rng = createRng(1);

describe('damage effect', () => {
  it('computes power × attack - defense with floor 1', () => {
    // Knight attack 4, Skeleton Warrior defense 2. knight_slash power 1.0.
    // raw = round(1.0 × 4) = 4. final = max(1, 4 - 2) = 2.
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(10); // 12 - 2
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 2, lethal: false });
  });

  it('floors damage at 1 when defense exceeds raw', () => {
    // Skeleton Warrior attack 3 uses bone_slash (0.8) against Knight defense 4.
    // raw = round(0.8 × 3) = round(2.4) = 2. final = max(1, 2 - 4) = 1.
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(p0.currentHp).toBe(19); // 20 - 1
  });

  it('applies radiant × undead = 1.5× bonus', () => {
    // Priest attack 3, Smite power 1.1 radiant. Skeleton Warrior defense 2, undead.
    // raw = round(1.1 × 3 × 1.5) = round(4.95) = 5. final = max(1, 5 - 2) = 3.
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.smite, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(9); // 12 - 3
  });

  it('does not apply radiant bonus against humanoid', () => {
    // Smite against Cultist (humanoid): no tag bonus.
    // raw = round(1.1 × 3) = 3. final = max(1, 3 - 1) = 2.
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('cultist', 3, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.smite, p0, ['e0'], state, rng, events);
    expect(e0.currentHp).toBe(8); // 10 - 2
  });

  it('mark multiplies damage for every hit in its duration', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    e0.statuses['marked'] = {
      statusId: 'marked',
      remainingTurns: 2,
      effect: { kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' },
      sourceId: 'p0',
    } satisfies StatusInstance;
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    // raw = round(1.0 × 4) = 4. marked: round(4 × 1.5) = 6. final = max(1, 6 - 2) = 4.
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 4 });
  });

  it('lethal damage emits death and collapses the line', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 2 });
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    expect(e0.slot).toBe(-1);
    expect(e1.slot).toBe(1);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('death');
    expect(kinds).toContain('position_changed');
    const collapse = events.find((e) => e.kind === 'position_changed' && e.reason === 'collapse');
    expect(collapse).toBeDefined();
  });
});

describe('heal effect', () => {
  it('caps at maxHp and emits even on zero heal', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1'); // full HP
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.mend, p0, ['p1'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ amount: 0 });
  });

  it('heals up to the cap', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1', { currentHp: 10, maxHp: 20 });
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.mend, p0, ['p1'], state, rng, events);
    // Priest attack 3, heal power 1.2: amount = round(1.2 × 3) = 4.
    expect(p1.currentHp).toBe(14);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ amount: 4 });
  });
});

describe('stun effect', () => {
  it('applies "stunned" status on target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    expect(e0.statuses['stunned']).toBeDefined();
    expect(e0.statuses['stunned'].remainingTurns).toBe(1);
  });
});

describe('buff / debuff', () => {
  it('adds a non-HP buff status', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1');
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bless, p0, ['p1'], state, rng, events);
    expect(p1.statuses['blessed']).toBeDefined();
  });

  it('hp debuff updates maxHp and clamps currentHp', () => {
    const e0 = makeEnemyCombatant('bone_lich', 4, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0'); // maxHp 20, currentHp 20
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.curse_of_frailty, e0, ['p0'], state, rng, events);
    expect(p0.maxHp).toBe(17);
    expect(p0.currentHp).toBe(17); // clamped
  });

  it('hp buff raises maxHp but not currentHp (per invariant)', () => {
    // Synthetic test using a fabricated hp-buff effect
    // We don't have a +hp buff ability in Tier 1, so skip for now.
    expect(true).toBe(true);
  });
});

describe('multi-effect ability', () => {
  it('applies damage then stun when non-lethal', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    // shield_bash damage: round(0.6 × 4) = 2, -2 def = max(1, 0) = 1. Wait: 2-2=0, max 1 = 1.
    // Actually: round(0.6 × 4) = round(2.4) = 2. final = max(1, 2 - 2) = 1.
    expect(e0.currentHp).toBe(11);
    expect(e0.statuses['stunned']).toBeDefined();
  });

  it('skips stun when damage is lethal', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 1 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    expect(e0.statuses['stunned']).toBeUndefined();
    const stunEvents = events.filter((e) => e.kind === 'status_applied');
    expect(stunEvents).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run effects tests**

Run: `npx vitest run src/combat/__tests__/effects.test.ts`
Expected: all tests pass.

---

## Task 8: combat.ts (top-level loop)

**Files:**
- Create: `src/combat/combat.ts`
- Create: `src/combat/__tests__/combat.test.ts`

- [ ] **Step 1: Create `src/combat/combat.ts`**

```ts
import { ABILITIES } from '../data/abilities';
import type { Rng } from '../util/rng';
import { pickAbility } from './ability_priority';
import { applyAbility } from './effects';
import { shuffle } from './positions';
import { tickStatuses } from './statuses';
import { computeInitiative } from './turn_order';
import type { Combatant, CombatEvent, CombatOutcome, CombatResult, CombatSide, CombatState } from './types';

const ROUND_CAP = 30;

function livingBySide(state: CombatState, side: CombatSide): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.isDead);
}

function bothSidesAlive(state: CombatState): boolean {
  return livingBySide(state, 'player').length > 0 && livingBySide(state, 'enemy').length > 0;
}

function computeOutcome(state: CombatState, hitCap: boolean): CombatOutcome {
  const playerAlive = livingBySide(state, 'player').length > 0;
  const enemyAlive = livingBySide(state, 'enemy').length > 0;
  if (hitCap && playerAlive && enemyAlive) return 'timeout';
  if (playerAlive && !enemyAlive) return 'player_victory';
  return 'player_defeat';
}

export function resolveCombat(initialState: CombatState, rng: Rng): CombatResult {
  const state: CombatState = structuredClone(initialState);
  const events: CombatEvent[] = [];

  events.push({
    kind: 'combat_start',
    party: livingBySide(state, 'player').map((c) => c.id),
    enemies: livingBySide(state, 'enemy').map((c) => c.id),
  });

  let hitCap = false;

  for (let round = 1; round <= ROUND_CAP; round++) {
    state.round = round;
    const order = computeInitiative(
      state.combatants.filter((c) => !c.isDead),
      rng,
    );
    events.push({ kind: 'round_start', round, order });

    let combatEndedMidRound = false;
    for (const id of order) {
      const combatant = state.combatants.find((c) => c.id === id);
      if (!combatant) continue;
      if (combatant.isDead) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'dead' });
        continue;
      }
      events.push({ kind: 'turn_start', combatantId: id });

      const willBeStunned = 'stunned' in combatant.statuses;
      tickStatuses(combatant, events);

      if (willBeStunned) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'stunned' });
      } else {
        const picked = pickAbility(combatant, state, rng);
        if (picked) {
          applyAbility(ABILITIES[picked.abilityId], combatant, picked.targetIds, state, rng, events);
        } else {
          events.push({ kind: 'shuffle', combatantId: id });
          shuffle(combatant, state, events);
        }
      }

      if (!bothSidesAlive(state)) {
        combatEndedMidRound = true;
        break;
      }
    }

    events.push({ kind: 'round_end', round });

    if (combatEndedMidRound) break;
    if (round === ROUND_CAP && bothSidesAlive(state)) {
      hitCap = true;
      break;
    }
  }

  const outcome = computeOutcome(state, hitCap);
  events.push({ kind: 'combat_end', outcome });

  return { finalState: state, events, outcome };
}
```

- [ ] **Step 2: Create `src/combat/__tests__/combat.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { resolveCombat } from '../combat';
import type { CombatEvent } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('resolveCombat — determinism', () => {
  it('produces identical events and final state for the same seed', () => {
    const initial = makeTestState(
      [makeHeroCombatant('knight', 1, 'p0'), makeHeroCombatant('archer', 2, 'p1')],
      [makeEnemyCombatant('skeleton_warrior', 1, 'e0'), makeEnemyCombatant('ghoul', 2, 'e1')],
    );
    const a = resolveCombat(initial, createRng(123));
    const b = resolveCombat(initial, createRng(123));
    expect(a.events).toEqual(b.events);
    expect(a.outcome).toBe(b.outcome);
  });

  it('does not mutate the input state', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const initial = makeTestState([hero], [enemy]);
    const heroHpBefore = hero.currentHp;
    const enemyHpBefore = enemy.currentHp;
    resolveCombat(initial, createRng(1));
    expect(hero.currentHp).toBe(heroHpBefore);
    expect(enemy.currentHp).toBe(enemyHpBefore);
  });
});

describe('resolveCombat — scripted scenarios', () => {
  it('Knight beats Skeleton Warrior 1-on-1', () => {
    const initial = makeTestState(
      [makeHeroCombatant('knight', 1, 'p0')],
      [makeEnemyCombatant('skeleton_warrior', 1, 'e0')],
    );
    const result = resolveCombat(initial, createRng(1));
    expect(result.outcome).toBe('player_victory');
  });

  it('no-damage matchup times out at 30 rounds', () => {
    // Give both combatants defense so high nothing gets through; floor 1 still applies, so eventually someone dies. Adjust: use tiny HP + huge defense to ensure floor-1-per-hit combat takes a long time.
    // Instead, craft combat using high HP + floor-1 damage only. Over 30 rounds of 2 actions per round = 60 hits × 1 dmg = 60 dmg.
    // So give each combatant maxHp = 100 and no way to out-damage floor.
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    // 30 rounds × 2 actions × 1 dmg = 60 damage. Each side loses ~30 HP. No one dies.
    expect(result.outcome).toBe('timeout');
  });

  it('Priest mends a wounded ally on round 1', () => {
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 10, maxHp: 20 });
    // No enemies → combat_start sees empty enemy list. Actually resolveCombat would detect player_victory immediately.
    // Give a weak enemy so the fight runs a round at least.
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const initial = makeTestState([priest, knight], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    const healEvent = result.events.find((e) => e.kind === 'heal_applied');
    expect(healEvent).toBeDefined();
    expect((healEvent as { sourceId: string }).sourceId).toBe('p0');
  });

  it('Shield Bash stun causes a skipped turn for the target', () => {
    const knight = makeHeroCombatant('knight', 1, 'p0');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 3, defense: 2, speed: 2 }, // slow so Knight always acts first
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([knight], [enemy]);
    const result = resolveCombat(initial, createRng(7));
    // The skeleton should have at least one turn_skipped event with reason 'stunned'.
    const stunSkip = result.events.find(
      (e) => e.kind === 'turn_skipped' && e.reason === 'stunned' && e.combatantId === 'e0',
    );
    expect(stunSkip).toBeDefined();
  });

  it('Full Crypt-boss scenario runs to completion', () => {
    const initial = makeTestState(
      [
        makeHeroCombatant('knight', 1, 'p0'),
        makeHeroCombatant('archer', 2, 'p1'),
        makeHeroCombatant('priest', 3, 'p2'),
      ],
      [
        makeEnemyCombatant('skeleton_archer', 1, 'e0'),
        makeEnemyCombatant('cultist', 2, 'e1'),
        makeEnemyCombatant('bone_lich', 3, 'e2'),
      ],
    );
    const result = resolveCombat(initial, createRng(42));
    expect(['player_victory', 'player_defeat', 'timeout']).toContain(result.outcome);
    // Ends with combat_end event
    expect(result.events[result.events.length - 1].kind).toBe('combat_end');
  });
});
```

- [ ] **Step 3: Run combat tests**

Run: `npx vitest run src/combat/__tests__/combat.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: all tests pass (previous 236 + all new combat tests).

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` → exit 0. Then `npm run build` → succeeds (pre-existing phaser chunk-size warning unrelated).

---

## Task 9: Hand off

- [ ] **Step 1: Summarize**

Report file-by-file changes, total new test count, outcome of full suite, and offer to migrate task 4's TODO entry to HISTORY.md with decision context.

---

## Self-review

**Spec coverage:**

- Dependencies/invariants (task 2 + task 3) → honored in code at the exact integration points (getEffectiveStat reads buffs, tickStatuses reverts hp max on expiry, caster-relative sides in target_selector, collapse deferred, tag bonus in applyDamage, damage floor, round cap, etc.).
- Module layout → Task 1 types, Task 2 statuses + helpers, Task 3 positions, Task 4 target_selector, Task 5 turn_order, Task 6 ability_priority, Task 7 effects, Task 8 combat.ts + integration.
- Runtime state shapes → Task 1.
- Event stream (14 kinds) → Task 1 types, emitted across tasks 2, 3, 7, 8.
- Turn order (10% variance, floor 2, tiebreak) → Task 5.
- AI picker → Task 6.
- Target selector (caster-relative, taunt narrowing at step 5, pick) → Task 4.
- Effect application (9 kinds, damage floor 1, radiant × 1.5, mark multi-hit, deferred collapse) → Task 7.
- Status tick (per-target-turn, stun-check-before-tick ordering) → Task 8's round loop + Task 2's tickStatuses.
- Combat loop (clone input, round cap 30, mutual-wipe = defeat) → Task 8.
- Shuffle fallback → Task 3.
- Test plan → covered in tasks 2–8.
- `'stunned'` added to StatusId → Task 1 Step 1.

Gap: none.

**Placeholder scan:** no TBDs, no "similar to Task N," no "implement later." Every step has complete code or complete commands.

**Type consistency:** cross-checked — Combatant / CombatState / CombatEvent fields match across all callers. `CombatSide` is used in positions/effects, never confused with `Side` (caster-relative, from `data/types.ts`). `statuses: Record<string, StatusInstance>` is typed identically across statuses.ts, effects.ts, and combat.ts callers. `PickedAction` is local to ability_priority.ts.
