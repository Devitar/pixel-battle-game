# Trait Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trait carried by every hero readable everywhere a hero is shown — full description on the large card (Tavern, Camp Screen) and a name+short-description line on the small card (Barracks list, Noticeboard party picker).

**Architecture:** Two tasks. (1) Add a required `shortDescription` field to `TraitDef`, populate all 12 entries with hand-tuned short forms (≤16 chars), and guard the field with two shape tests. (2) One-touch update to `src/ui/hero_card.ts` — the large card appends `description` to its existing trait line; the small card grows from 56 → 60 px tall (filling its existing 60 px slot allocation), tightens internal layout (name 14→12 px, HP bar 6→5 px, top padding 8→6 px), and gains a 10 px trait line below the HP bar.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4, Phaser 4. Card-rendering changes live on the Phaser side of the firewall — `src/ui/hero_card.ts` already imports `phaser`. No save schema, scene chrome, or layout-constant changes outside the widget itself.

**Spec:** [`docs/superpowers/specs/2026-04-28-trait-display-design.md`](../specs/2026-04-28-trait-display-design.md)

**Project policy reminder:** Per [`CLAUDE.md`](../../../CLAUDE.md), never run `git commit` without explicit user direction. Each task ends with a "stage and report" step — the user runs the commit themselves.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Add required `shortDescription: string` field to `TraitDef`. |
| `src/data/traits.ts` | **Modify** | Add `shortDescription` to all 12 trait entries. |
| `src/data/__tests__/traits.test.ts` | **Modify** | Per-trait shape checks: `shortDescription` is a non-empty string of length ≤ 16. |
| `src/ui/hero_card.ts` | **Modify** | Large card: append description to existing trait line. Small card: grow `SMALL_HEIGHT` 56→60, compress internal layout, add a new trait line below the HP bar at 10 px. |

No changes to `BarracksPanelScene`, `TavernPanelScene`, `NoticeboardPanelScene`, `CampScreenScene`, save schema, migration code, or any combat module. The card grows internally only — its bounding box stays 180×60 (matching the slot height it already lives in).

---

## Task 1: Add `shortDescription` data + tests

**Goal:** Add the required `shortDescription` field to `TraitDef`, populate all 12 traits with short forms, and guard the field with shape tests.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/traits.ts`
- Modify: `src/data/__tests__/traits.test.ts`

- [ ] **Step 1: Write the failing tests first**

In `src/data/__tests__/traits.test.ts`, append two new cases inside the existing `describe.each(EXPECTED_IDS)('trait %s', (id) => { ... })` block. Place them after the `'every statEffect condition has a recognized kind'` test (last existing case in the per-trait block):

```ts
    it('has a non-empty shortDescription', () => {
      expect(typeof TRAITS[id].shortDescription).toBe('string');
      expect(TRAITS[id].shortDescription.length).toBeGreaterThan(0);
    });

    it('shortDescription is at most 16 characters', () => {
      expect(TRAITS[id].shortDescription.length).toBeLessThanOrEqual(16);
    });
```

- [ ] **Step 2: Run traits tests to confirm they fail**

Run: `npx vitest run src/data/__tests__/traits.test.ts`

Expected: 24 failures (12 traits × 2 new shape checks), each reporting `TRAITS[id].shortDescription` is `undefined`.

- [ ] **Step 3: Add the `shortDescription` field to `TraitDef`**

In `src/data/types.ts`, find the `TraitDef` interface (currently lines 265-271 — `id`, `name`, `description`, `hpEffect?`, `statEffects?`) and add a required `shortDescription` field:

```ts
export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  shortDescription: string;
  hpEffect?: TraitHpEffect;
  statEffects?: readonly TraitStatEffect[];
}
```

Required, not optional. Asserted by Step 1's tests.

- [ ] **Step 4: Populate all 12 traits with `shortDescription` values**

In `src/data/traits.ts`, add a `shortDescription` line to every entry. Replace the entire `TRAITS` constant body with:

```ts
export const TRAITS: Record<TraitId, TraitDef> = {
  stout: {
    id: 'stout',
    name: 'Stout',
    description: '+10% HP',
    shortDescription: '+10% HP',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  quick: {
    id: 'quick',
    name: 'Quick',
    description: '+1 Speed',
    shortDescription: '+1 Spd',
    statEffects: [{ stat: 'speed', delta: 1 }],
  },
  sturdy: {
    id: 'sturdy',
    name: 'Sturdy',
    description: '+1 Defense',
    shortDescription: '+1 Def',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  sharp_eyed: {
    id: 'sharp_eyed',
    name: 'Sharp-eyed',
    description: '+1 Attack',
    shortDescription: '+1 Atk',
    statEffects: [{ stat: 'attack', delta: 1 }],
  },
  cowardly: {
    id: 'cowardly',
    name: 'Cowardly',
    description: '-1 Speed when in slot 1',
    shortDescription: '-1 Spd · S1',
    statEffects: [{ stat: 'speed', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
  nervous: {
    id: 'nervous',
    name: 'Nervous',
    description: '-1 Defense when in slot 1',
    shortDescription: '-1 Def · S1',
    statEffects: [{ stat: 'defense', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
  frail: {
    id: 'frail',
    name: 'Frail',
    description: '-10% HP',
    shortDescription: '-10% HP',
    hpEffect: { delta: -10, mode: 'percent' },
  },
  sluggish: {
    id: 'sluggish',
    name: 'Sluggish',
    description: '-1 Speed',
    shortDescription: '-1 Spd',
    statEffects: [{ stat: 'speed', delta: -1 }],
  },
  lucky: {
    id: 'lucky',
    name: 'Lucky',
    description: '+5% Crit',
    shortDescription: '+5% Crit',
    statEffects: [{ stat: 'crit', delta: 5 }],
  },
  slippery: {
    id: 'slippery',
    name: 'Slippery',
    description: '+5% Dodge',
    shortDescription: '+5% Dodge',
    statEffects: [{ stat: 'dodge', delta: 5 }],
  },
  wise: {
    id: 'wise',
    name: 'Wise',
    description: '+1 Mind',
    shortDescription: '+1 Mind',
    statEffects: [{ stat: 'mind', delta: 1 }],
  },
  bloodthirsty: {
    id: 'bloodthirsty',
    name: 'Bloodthirsty',
    description: '+2 Attack when below 50% HP',
    shortDescription: '+2 Atk <50%HP',
    statEffects: [{ stat: 'attack', delta: 2, condition: { kind: 'belowHpRatio', ratio: 0.5 } }],
  },
};
```

- [ ] **Step 5: Re-run traits tests to confirm they pass**

Run: `npx vitest run src/data/__tests__/traits.test.ts`

Expected: PASS. The 24 new shape assertions all green; the existing per-trait block plus the registry tests still pass.

- [ ] **Step 6: Run full test suite as a regression check**

Run: `npm test`

Expected: All tests pass. `shortDescription` is purely cosmetic data — no combat or save code reads it yet (the hero card update lands in Task 2), so no other test should be affected.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`

Expected: Clean. The required field on `TraitDef` is satisfied by all 12 entries; nothing else references `shortDescription` yet.

- [ ] **Step 8: Stage and report**

```bash
git add src/data/types.ts src/data/traits.ts src/data/__tests__/traits.test.ts
git status
```

Tell the user: **"Task 1 ready. `shortDescription` field added to `TraitDef`; all 12 traits populated; shape tests pin non-empty + ≤16-char invariants. Suggested commit message: `feat(traits): add shortDescription field for compact display`. Awaiting your direction to commit."**

---

## Task 2: Hero card visual updates

**Goal:** Render the trait+description on every card. Large card appends the long description to its existing trait line. Small card adds a new trait line at 10 px below the HP bar; the card grows 56 → 60 px tall (using its existing 60 px slot allocation) with mild internal compression (name 14→12 px, HP bar 6→5 px, top padding 8→6 px).

**Files:**
- Modify: `src/ui/hero_card.ts`

This task has no automated tests — `hero_card.ts` is on the Phaser side of the firewall and the repo has no `src/ui/__tests__/` directory by convention. Verification is the type-check, the existing test sweep (which renders no Phaser), and (optionally) manual smoke in `npm run dev`.

- [ ] **Step 1: Grow `SMALL_HEIGHT` from 56 to 60**

In `src/ui/hero_card.ts`, find the constants block near the top (around lines 16-22) and update:

```ts
const PAPERDOLL_SCALE_SMALL = 2;
const PAPERDOLL_SCALE_LARGE = 4;

const SMALL_WIDTH = 180;
const SMALL_HEIGHT = 60;
const LARGE_WIDTH = 280;
const LARGE_HEIGHT = 120;
```

Only `SMALL_HEIGHT` changes. The card's bounding box now matches the 60 px slot allocation it already lives in (`BarracksPanelScene.SLOT_BG_H = 60`, `NoticeboardPanelScene.HERO_BG_H = 60`).

- [ ] **Step 2: Compress small-card internal layout — top padding and name font**

In the `buildChildren` method, find the `nameText` block (around lines 71-81) and update so the small card uses 6 px top padding and 12 px font (large card unchanged):

```ts
    const nameText = this.scene.add.text(
      textX,
      -h / 2 + (size === 'small' ? 6 : 8),
      isDead ? `${this.hero.name} (Fallen)` : this.hero.name,
      {
        fontFamily: 'monospace',
        fontSize: size === 'small' ? '12px' : '18px',
        color: '#ffffff',
      },
    );
    this.add(nameText);
```

Only the small-card branches change: top-margin offset 8→6 and fontSize 14px→12px. The large card retains 8 px / 18 px.

- [ ] **Step 3: Compress small-card HP bar — height 6 → 5**

Find the HP-bar block (around lines 101-115) and parameterize the bar height:

```ts
    if (!isDead) {
      const barY = lastY + 4;
      const barW = size === 'small' ? 100 : 140;
      const barH = size === 'small' ? 5 : 6;
      const hpRatio = Math.max(0, this.hero.currentHp / this.hero.maxHp);
      const hpBarBg = this.scene.add
        .rectangle(textX, barY, barW, barH, 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x555555);
      const hpBarFill = this.scene.add
        .rectangle(textX, barY, barW * hpRatio, barH, this.hpColor(hpRatio))
        .setOrigin(0, 0);
      this.add(hpBarBg);
      this.add(hpBarFill);
      lastY = barY + barH;
    }
```

Three changes: introduce `barH`, use it in both `rectangle` calls (replacing the `6` literal), and update `lastY = barY + barH` (was `barY + 6`).

- [ ] **Step 4: Add the small-card trait line**

Insert a new block immediately after the HP-bar block (after the closing `}` of the `if (!isDead)` block, before the `if (size === 'large' && !isDead)` block):

```ts
    if (size === 'small' && !isDead) {
      const traitY = lastY + 2;
      const traitText = this.scene.add.text(
        textX,
        traitY,
        `${traitDef.name} · ${traitDef.shortDescription}`,
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ccbbaa',
        },
      );
      this.add(traitText);
    }
```

The `#ccbbaa` color matches the Barracks detail pane's trait line for consistency. No `trait:` prefix on the small card — saves chars and `Name · Detail` is recognizable in the roster context. The label uses `shortDescription`, not `description`.

- [ ] **Step 5: Update the large-card trait line to include the description**

Find the large-card trait-line block (currently around lines 127-132):

```ts
      const traitText = this.scene.add.text(textX, statsY + 14, `trait: ${traitDef.name}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
      });
      this.add(traitText);
```

Replace the trait-text construction so it includes the long description:

```ts
      const traitText = this.scene.add.text(
        textX,
        statsY + 14,
        `trait: ${traitDef.name} — ${traitDef.description}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#888888',
        },
      );
      this.add(traitText);
```

Only the third argument (the text content) and the formatting style change. Font, color, position unchanged.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

Expected: Clean. `traitDef.shortDescription` and `traitDef.description` are both required strings on `TraitDef`.

- [ ] **Step 7: Run the full test suite as a regression check**

Run: `npm test`

Expected: All tests pass. No widget tests exist; the suite verifies that data and combat/run code unaffected by widget changes.

- [ ] **Step 8: Stage and report**

```bash
git add src/ui/hero_card.ts
git status
```

Tell the user: **"Task 2 ready. Large card now shows full trait description; small card has a new trait line at 10 px (`Name · shortDescription`), card height 56→60 to fill its 60 px slot allocation. Suggested commit message: `feat(ui): show trait description on hero cards`. Awaiting your direction to commit. If you want a manual smoke before committing: `npm run dev` and visit Tavern + Barracks list."**

---

## Post-implementation: TODO and HISTORY

After Task 2 is committed, the user typically migrates the TODO entry into HISTORY. Don't do this unprompted — wait for direction. The TODO entry to migrate is the Cluster B · 7 entry in [`TODO.md`](../../../TODO.md). Per the [slim HISTORY entry policy](../../../CLAUDE.md), keep the new HISTORY entry to ~15-25 lines: Why / Decisions / Surprises / Source. Don't list shipped files (git diff has those).

Suggested HISTORY-entry sketch (write it on the day work completes, newest-on-top):

```markdown
### YYYY-MM-DD · Trait display on hero cards (Cluster B · 7)

**Why:** With the trait pool at 12 entries (Cluster A · 6), players needed the trait readable wherever a roster is shown. Pre-task the trait *name* rendered only on the large card and the *description* only on the Barracks detail pane — so Tavern players had to memorize what each trait does, and the Barracks list pane (where you spend most of your roster-management time) showed nothing about traits at all.

**Decisions:**
- **Always-visible inline description over hover tooltip.** The codebase has no tooltip widget and tooltips behave poorly on touch (mobile-landscape is supported). Inline text is one widget change versus net-new infrastructure plus a touch-fallback question. The TODO entry's "tooltip" wording is interpreted as "description must be reachable," not as a specific UI affordance.
- **Required `shortDescription` field over wrapping or width-growth.** Hand-tuned short forms (≤16 chars) keep the small-card layout uniform, the Barracks 2-column grid intact, and the Noticeboard slot height unchanged. Adds 12 strings; trivial maintenance.
- **No color treatment by trait sign.** Bloodthirsty is "positive but conditional," which muddies any sign-based scheme. Defer until it earns the complexity.

**Surprises:**
- The small card's existing 60 px slot allocation already had 4 px slack over the 56 px card. Growing `SMALL_HEIGHT` 56→60 to fill the slot, plus mild internal compression, fit the new trait line without any consuming-scene change.
- Bloodthirsty short form (`Bloodthirsty · +2 Atk <50%HP`) overflows the small-card text-row width budget by ~36 px. Acceptable: trait line is the last visual element, no right-side neighbor collides (190 px to next slot center), grow-the-card alternative was ~6 scene constant changes.

**Source:** TODO.md Cluster B · 7 → spec at `docs/superpowers/specs/2026-04-28-trait-display-design.md` → plan at `docs/superpowers/plans/2026-04-28-trait-display.md`. Test count delta: +24 (12 traits × 2 new shape checks).
```

---

## Self-review notes

Reviewed the plan against the spec:

- **Spec coverage:** Every change in the spec's "Module layout" table has a step. Schema change → Task 1 step 3. 12 `shortDescription` entries → Task 1 step 4. Large-card trait line → Task 2 step 5. Small-card trait line + height/compression → Task 2 steps 1-4. Both new tests → Task 1 step 1.
- **Type consistency:** `shortDescription` field is declared `string` on `TraitDef` (Task 1 step 3) and consumed as `traitDef.shortDescription` on the small card (Task 2 step 4). `description` field is unchanged and consumed on the large card (Task 2 step 5). No drift.
- **No placeholders:** Every step has actual code or an exact command. The HISTORY-entry sketch uses `YYYY-MM-DD` because the completion date isn't known yet — this is a documentation suggestion, not an implementation step.
- **Consuming-scene constants verified:** `BarracksPanelScene.SLOT_BG_H = 60` (line 41) and `NoticeboardPanelScene.HERO_BG_H = 60` (line 55) — both already 60, so growing `SMALL_HEIGHT` to 60 fits without scene changes.
