# Phase 6b — Hero Chatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add probabilistic class-specific, state-aware speech bubbles during travel. Pure flavor — no mechanical impact. ~54 hand-written lines across 6 classes × 3 conditions; one bubble per edge with 70% probability; speech bubble UI follows the speaking hero.

**Architecture:** Three tasks. (1) New `src/data/chatter.ts` module with the line table, the `ChatterCondition` type, and the `computeChatterCondition(hero)` helper — pure TS, fully unit-tested with bucket-coverage and condition-precedence assertions. (2) Wire chatter rolling + scheduling + speech-bubble rendering into `TravelScene` (~60 line addition). (3) TODO + HISTORY housekeeping.

**Tech Stack:** TypeScript 6 (strict), Vitest 4, Phaser 4 (`Graphics` for rounded-rect bubble + tail, `Text` for line content, `tweens.add` for fade in/hold/out, `time.delayedCall` for step-time scheduling).

**Spec:** `docs/superpowers/specs/2026-05-03-phase-6b-hero-chatter-design.md` (locked design from 2026-05-03 brainstorm).

**Repo conventions** (from CLAUDE.md / memory):
- **No commits anywhere in this plan.** The user runs commits manually.
- The Phaser firewall: `src/data/` MUST NOT `import 'phaser'`. The chatter data module + `computeChatterCondition` stay pure TS.
- Save schema stays at version 1; chatter is pure cosmetic, no state-mutation.
- Don't materialize empty directories.
- HISTORY entries use the slim template.
- **Content as TypeScript, not JSON** (per CLAUDE.md): chatter lines live in `src/data/chatter.ts` as a typed const.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/data/chatter.ts` | **Create** | `ChatterCondition` type; `CHATTER: Record<ClassId, Record<ChatterCondition, readonly string[]>>` table with 6 × 3 × ~3 = ~54 lines; `computeChatterCondition(hero): ChatterCondition` helper. ~80 lines (mostly content). |
| `src/data/__tests__/chatter.test.ts` | **Create** | Unit tests: every bucket has ≥1 line; `computeChatterCondition` precedence (critical > wounded > healthy) including the 30%-HP boundary. ~50 lines. |
| `src/scenes/travel_scene.ts` | **Modify** | Add chatter import + roll in `create()` after `buildHeroes`; `maybeScheduleChatter` and `spawnChatterBubble` private methods. ~70 lines added. |
| `TODO.md` | **Modify** (Task 3) | Mark Phase 6b ✅. |
| `HISTORY.md` | **Modify** (Task 3) | Slim entry at top. |

---

## Task 1: `chatter.ts` data module + tests

After this task: green build, all existing tests pass plus ~7 new chatter tests. Module exists with the full content; no scene wiring yet (Task 2).

**Files:**
- Create: `src/data/chatter.ts`
- Create: `src/data/__tests__/chatter.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1479 tests pass. Note the count.

- [ ] **Step 1.2: Create `src/data/chatter.ts`**

```ts
import type { Hero } from '@heroes/hero';
import type { ClassId } from './types';

export type ChatterCondition = 'critical' | 'wounded' | 'healthy';

const CRITICAL_HP_FRACTION = 0.3;

/**
 * Returns the chatter condition for a hero. Precedence: critical > wounded > healthy.
 *
 * - `critical`: currentHp / maxHp < 0.3 (regardless of wounds)
 * - `wounded`:  wounds.length > 0 (and not critical)
 * - `healthy`:  default
 */
export function computeChatterCondition(hero: Hero): ChatterCondition {
  if (hero.maxHp > 0 && hero.currentHp / hero.maxHp < CRITICAL_HP_FRACTION) {
    return 'critical';
  }
  if (hero.wounds.length > 0) {
    return 'wounded';
  }
  return 'healthy';
}

export const CHATTER: Record<ClassId, Record<ChatterCondition, readonly string[]>> = {
  knight: {
    healthy:  ['Forward.', 'Steel and stone.', 'Stand fast, friends.'],
    wounded:  ['I have had worse.', 'These bones ache.', 'Press on.'],
    critical: ['Hold me up...', 'If I fall, avenge me.', 'I can scarcely stand.'],
  },
  archer: {
    healthy:  ['Quiet, isn\'t it?', 'I see no movement.', 'Stay sharp.'],
    wounded:  ['This one will scar.', 'Should have ducked.', 'Mind your six.'],
    critical: ['Cover me...', 'I cannot draw the string.', 'Do not wait for me.'],
  },
  priest: {
    healthy:  ['May the light guide us.', 'We are not alone.', 'A blessing on this path.'],
    wounded:  ['I bear it gladly.', 'Faith carries me.', 'A small price.'],
    critical: ['Forgive my weakness...', 'The light fades...', 'Pray for me.'],
  },
  barbarian: {
    healthy:  ['More! More foes!', 'Bring them on.', 'I hunger for blood.'],
    wounded:  ['A scratch.', 'Pain is but wind.', 'Hah, is that all?'],
    critical: ['I will not... fall...', 'One more... fight...', 'Death will wait...'],
  },
  rogue: {
    healthy:  ['Watch your step.', 'Stay close.', 'I don\'t like this.'],
    wounded:  ['Shouldn\'t have done that.', 'Sloppy.', 'I\'m slowing down.'],
    critical: ['Need... a moment.', 'Can\'t keep up...', 'Leave me a knife.'],
  },
  mage: {
    healthy:  ['Curious markings here.', 'The air is thick with power.', 'I sense something.'],
    wounded:  ['My focus wavers.', 'The pain disrupts the threads.', 'Concentrate...'],
    critical: ['The spell fades...', 'My mind slips...', 'Hold me, I cannot...'],
  },
};
```

- [ ] **Step 1.3: Create `src/data/__tests__/chatter.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createHero } from '@heroes/hero';
import type { ClassId } from '../types';
import { CHATTER, computeChatterCondition } from '../chatter';

const ALL_CLASSES: readonly ClassId[] = ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'];
const ALL_CONDITIONS = ['healthy', 'wounded', 'critical'] as const;

describe('CHATTER table coverage', () => {
  it('every class has an entry', () => {
    for (const classId of ALL_CLASSES) {
      expect(CHATTER[classId], `class ${classId} missing from CHATTER`).toBeDefined();
    }
  });

  it('every (class, condition) bucket has ≥1 line', () => {
    for (const classId of ALL_CLASSES) {
      for (const condition of ALL_CONDITIONS) {
        const pool = CHATTER[classId][condition];
        expect(pool, `${classId}.${condition} bucket missing`).toBeDefined();
        expect(pool.length, `${classId}.${condition} pool is empty`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('all lines are non-empty strings', () => {
    for (const classId of ALL_CLASSES) {
      for (const condition of ALL_CONDITIONS) {
        for (const line of CHATTER[classId][condition]) {
          expect(line.length, `${classId}.${condition} has empty line`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('computeChatterCondition', () => {
  function makeHero(opts: { hp: number; maxHp: number; wounded: boolean }) {
    const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
    return {
      ...hero,
      currentHp: opts.hp,
      maxHp: opts.maxHp,
      wounds: opts.wounded ? [{ id: 'bruised' as const, runsRemaining: 5 }] : [],
    };
  }

  it('returns "critical" when HP / maxHp < 0.3 regardless of wounds', () => {
    expect(computeChatterCondition(makeHero({ hp: 5, maxHp: 20, wounded: false }))).toBe('critical');
    expect(computeChatterCondition(makeHero({ hp: 5, maxHp: 20, wounded: true }))).toBe('critical');
  });

  it('returns "wounded" when wounds.length > 0 and HP not critical', () => {
    expect(computeChatterCondition(makeHero({ hp: 15, maxHp: 20, wounded: true }))).toBe('wounded');
    expect(computeChatterCondition(makeHero({ hp: 20, maxHp: 20, wounded: true }))).toBe('wounded');
  });

  it('returns "healthy" when no wounds and HP ≥ 30%', () => {
    expect(computeChatterCondition(makeHero({ hp: 20, maxHp: 20, wounded: false }))).toBe('healthy');
    expect(computeChatterCondition(makeHero({ hp: 10, maxHp: 20, wounded: false }))).toBe('healthy');
  });

  it('boundary: HP / maxHp === 0.3 returns "wounded" if wounded, "healthy" if not (strict <)', () => {
    // Exactly 30% — strict < means NOT critical.
    expect(computeChatterCondition(makeHero({ hp: 6, maxHp: 20, wounded: false }))).toBe('healthy');
    expect(computeChatterCondition(makeHero({ hp: 6, maxHp: 20, wounded: true }))).toBe('wounded');
  });
});
```

- [ ] **Step 1.4: Run new tests**

Run: `npx vitest run src/data/__tests__/chatter.test.ts`

Expected: ALL 7 new tests pass.

- [ ] **Step 1.5: Full-suite run for Task 1**

Run: `npm test`

Expected: ALL tests pass; count up by 7 (1479 → 1486).

---

## Task 2: Wire chatter into TravelScene

After this task: chatter bubbles fire probabilistically during travel. Player-visible ship state.

**Files:**
- Modify: `src/scenes/travel_scene.ts`

- [ ] **Step 2.1: Add chatter imports**

Open `src/scenes/travel_scene.ts`. Find the imports block (top of file). Add:

```ts
import { CHATTER, computeChatterCondition } from '@data/chatter';
import type { Hero } from '@heroes/hero';
```

(`Hero` may already be imported — keep one import only.)

- [ ] **Step 2.2: Add chatter constants near the existing scene constants**

Find the constants block (around line 30 — `STEP_DURATION_MS`, `HP_TICK_STEP`, etc.). Add after `POPUP_DURATION_MS`:

```ts
const CHATTER_PROBABILITY = 0.7;
const CHATTER_FADE_IN_MS = 150;
const CHATTER_HOLD_MS = 2000;
const CHATTER_FADE_OUT_MS = 250;
const CHATTER_BUBBLE_BG = 0xf4ecd8;
const CHATTER_BUBBLE_BORDER = 0x2a2020;
const CHATTER_TEXT_COLOR = '#2a2020';
```

- [ ] **Step 2.3: Call `maybeScheduleChatter` from `create()`**

Find `create()` (the existing method that calls `this.startWalk()` last). Add a `maybeScheduleChatter` call right before `startWalk`:

```ts
    this.buildBackdrop();
    this.buildHud();
    this.buildHeroes(run.party);
    this.maybeScheduleChatter(run.party);
    this.startWalk();
  }
```

- [ ] **Step 2.4: Add `maybeScheduleChatter` method**

Add after the existing `startWalk` method:

```ts
  private maybeScheduleChatter(party: readonly Hero[]): void {
    if (Math.random() >= CHATTER_PROBABILITY) return;
    if (party.length === 0) return;
    const step = Math.random() < 0.5 ? 2 : 4;
    const heroIndex = Math.floor(Math.random() * party.length);
    const hero = party[heroIndex];
    const condition = computeChatterCondition(hero);
    const pool = CHATTER[hero.classId][condition];
    if (pool.length === 0) return; // safety
    const line = pool[Math.floor(Math.random() * pool.length)];

    // Schedule the bubble at the chosen step's time. Step N happens at
    // (N * STEP_DURATION_MS) into the travel; divide by walkSpeed to scale.
    const stepTimeMs = (step * STEP_DURATION_MS) / this.walkSpeed;
    this.time.delayedCall(stepTimeMs, () => this.spawnChatterBubble(heroIndex, line));
  }
```

- [ ] **Step 2.5: Add `spawnChatterBubble` method**

Add after `maybeScheduleChatter`:

```ts
  private spawnChatterBubble(heroIndex: number, line: string): void {
    const visual = this.heroVisuals[heroIndex];
    if (!visual) return;

    const text = this.add
      .text(0, 0, line, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: CHATTER_TEXT_COLOR,
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    const padX = 6;
    const padY = 4;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    const bubbleY = -(HERO_BODY_HALF * 2 + 16);

    const bg = this.add.graphics();
    bg.fillStyle(CHATTER_BUBBLE_BG, 1);
    bg.fillRoundedRect(-w / 2, bubbleY - h / 2, w, h, 3);
    bg.lineStyle(1, CHATTER_BUBBLE_BORDER, 1);
    bg.strokeRoundedRect(-w / 2, bubbleY - h / 2, w, h, 3);
    // Tail (small triangle pointing down to the hero).
    bg.fillStyle(CHATTER_BUBBLE_BG, 1);
    bg.fillTriangle(-3, bubbleY + h / 2, 3, bubbleY + h / 2, 0, bubbleY + h / 2 + 4);
    bg.lineStyle(1, CHATTER_BUBBLE_BORDER, 1);
    bg.lineBetween(-3, bubbleY + h / 2, 0, bubbleY + h / 2 + 4);
    bg.lineBetween(0, bubbleY + h / 2 + 4, 3, bubbleY + h / 2);

    text.setPosition(0, bubbleY);

    // Add as children of the hero's container so the bubble follows the hero.
    visual.container.add([bg, text]);

    // Fade in → hold (scaled by walkSpeed) → fade out.
    bg.setAlpha(0);
    text.setAlpha(0);
    this.tweens.add({
      targets: [bg, text],
      alpha: 1,
      duration: CHATTER_FADE_IN_MS,
      ease: 'Cubic.easeOut',
    });
    const holdMs = CHATTER_HOLD_MS / this.walkSpeed;
    this.time.delayedCall(CHATTER_FADE_IN_MS + holdMs, () => {
      this.tweens.add({
        targets: [bg, text],
        alpha: 0,
        duration: CHATTER_FADE_OUT_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          bg.destroy();
          text.destroy();
        },
      });
    });
  }
```

- [ ] **Step 2.6: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1486 tests pass. No new tests for the scene (per repo convention).

If typecheck fails on the `Hero` import (already imported), remove the duplicate.

- [ ] **Step 2.7: Manual smoke-test instructions**

Per memory ("skip browser smoke by default"), prepare these instructions for the user:

```
Phase 6b smoke-test checklist:
1. `npm run dev`, open http://localhost:5173.
2. Start a fresh Crypt expedition. Engage start node, win combat.
3. Click a next-row node → travel scene fires.
4. ~70% of travels should show a speech bubble above one of the three heroes
   at either step 2 (~3.0s in) or step 4 (~6.0s in).
   - Bubble: cream rounded rectangle with dark border + tail pointing to the
     hero, italic monospace text in dark color.
   - Bubble follows the hero as they walk (it's a child of the hero's container).
   - Fades in ~150ms, holds ~2s (or ~0.67s at 3× speed), fades out ~250ms.
5. ~30% of travels are silent (no chatter). This is intentional.
6. Take a wound (lose enough HP for a wound to be assigned during combat).
   Subsequent chatter from THAT hero should draw from the `wounded` bucket
   (e.g., Knight: "I have had worse." instead of "Forward.").
7. Drop a hero below 30% HP (without dying). Their chatter should draw from
   the `critical` bucket (e.g., Knight: "Hold me up...").
8. Confirm: chatter does NOT collide with the HP "+1"/"-1" popups at step 3
   (different timing slots).
9. Confirm: chatter from a hero respects their class — switch parties to see
   different lines per class.
```

---

## Task 3: TODO + HISTORY housekeeping

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 3.1: Mark Phase 6b done in TODO.md**

Open `TODO.md`. Find the Phase 6b bullet under entry #30. It currently reads:

```
    - **Phase 6b — Hero chatter.** Probabilistic chatter bubbles at step 2 / step 4. New chatter data module + display widget. Pure flavor; no mechanical impact. Layers onto Phase 6a's per-step infrastructure.
```

Replace with:

```
    - **Phase 6b — Hero chatter.** ✅ *Shipped 2026-05-03 (see HISTORY).* Class-specific + state-aware speech bubbles (54 lines across 6 classes × 3 conditions: healthy / wounded / critical). 70% probability per edge; bubble at step 2 or step 4 above a random hero, follows them as they walk, fade in / hold / fade out scaled by `walkSpeed`. Spec: `docs/superpowers/specs/2026-05-03-phase-6b-hero-chatter-design.md`.
```

- [ ] **Step 3.2: Add the HISTORY entry**

Open `HISTORY.md`. Insert at the top (newest first):

```markdown
### 2026-05-03 · Map-based dungeon scene — Phase 6b (hero chatter) (Cluster B · 30)

- **Why:** TODO #30 Phase 6b. Layers onto Phase 6a's per-step travel infrastructure with the first non-mechanical event type — class-specific speech bubbles that give each hero a recognizable voice during travel. Pure flavor; no gameplay state mutation.
- **Decisions:**
  - **Class-specific + state-aware over generic.** Each class has its own personality (Knight gruff, Priest pious, Mage scholarly, etc.); the cost was 6× the writing surface, but the payoff is recognizing your party's voices, which is exactly what flavor-chatter is for. State-awareness adds a `wounded` and a `critical` bucket per class — the same Knight grumbles differently when hurt than when fresh.
  - **Three conditions with strict precedence:** `critical` (HP < 30%) > `wounded` (any wound, not critical) > `healthy`. Exact 30% HP is `wounded`/`healthy` (strict `<`) — covered by a boundary test.
  - **One bubble per edge max, 70% probability.** ~17 chatter events per 24-edge run with ~54 lines means good variety; 30% silent edges are a feature, not a bug — keeps the chatter from feeling scripted.
  - **`Math.random` not run RNG.** Pure flavor, no save-determinism cost worth threading runRngState through the travel scene. Reload during travel may show different chatter — acceptable.
  - **Speech bubble as child of hero container.** The bubble follows the hero as they walk left-to-right. Cream rounded-rect + dark border + tail pointing down — reads unambiguously as speech.
  - **No repeat-avoidance.** Random-with-replacement; pool is large enough that within-run repeats are rare. If playtesting surfaces repetition, a per-run "recent" tracker can be added later.
- **Surprises:** None significant — Phase 6a's per-step infrastructure was a clean foundation.
- **Source:** TODO.md Cluster B · 30 Phase 6b. Spec: `docs/superpowers/specs/2026-05-03-phase-6b-hero-chatter-design.md`. Plan: `docs/superpowers/plans/2026-05-03-phase-6b-hero-chatter.md`. Test count delta: 1479 → 1486 (+7: chatter table coverage + condition precedence).
```

- [ ] **Step 3.3: Final full-suite run**

Run: `npm test`

Expected: ALL 1486 tests pass.

- [ ] **Step 3.4: Report to the user**

Summarize: Phase 6b shipped. Files touched (chatter data module + scene wiring), test count delta (1479 → 1486), smoke-test checklist (from step 2.7) for the user to run. Done.
