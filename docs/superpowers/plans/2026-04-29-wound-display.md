# Wound Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface hero wounds in two places: a `🩸 N` badge in the top-right corner of the `HeroCard` (both small and large variants) and a `WOUNDS` section in the Barracks detail pane that lists each wound by name + stat-effect description.

**Architecture:** Two sequential tasks, one per file. Both reuse `describeWoundEffect` shipped with Hospital UI; no data layer changes.

**Tech Stack:** TypeScript, Phaser 3. UI/scene-only; no unit tests (Phaser convention).

**Spec:** `docs/superpowers/specs/2026-04-29-wound-display-design.md`. Read before starting.

---

## Task 1: HeroCard wound badge

Add a `🩸 N` badge in the top-right corner of the HeroCard when `hero.wounds.length > 0` and the hero is not Fallen.

**Files:**
- Modify: `src/ui/hero_card.ts`

- [ ] **Step 1.1: Add the badge to `buildChildren`**

Open `src/ui/hero_card.ts`. Find the end of `buildChildren` — it currently ends with the `if (this.opts.onClick)` block at the bottom (around line 156). Add the badge **before** the `onClick` block so it renders on top of the card background:

```ts
if (this.hero.wounds.length > 0 && !isDead) {
  const badgeX = size === 'small' ? 75 : 125;
  const badgeY = size === 'small' ? -22 : -48;
  const badgeText = this.scene.add.text(
    badgeX,
    badgeY,
    `🩸 ${this.hero.wounds.length}`,
    {
      fontFamily: 'monospace',
      fontSize: size === 'small' ? '11px' : '13px',
      color: '#ff6666',
    },
  ).setOrigin(1, 0.5);
  this.add(badgeText);
}

if (this.opts.onClick) {
  // ... existing onClick block unchanged
}
```

The complete `buildChildren` end-of-method ordering after the change:

```ts
    // ... existing trait / stats render code ...

    if (this.hero.wounds.length > 0 && !isDead) {
      const badgeX = size === 'small' ? 75 : 125;
      const badgeY = size === 'small' ? -22 : -48;
      const badgeText = this.scene.add.text(
        badgeX,
        badgeY,
        `🩸 ${this.hero.wounds.length}`,
        {
          fontFamily: 'monospace',
          fontSize: size === 'small' ? '11px' : '13px',
          color: '#ff6666',
        },
      ).setOrigin(1, 0.5);
      this.add(badgeText);
    }

    if (this.opts.onClick) {
      background.setInteractive({ useHandCursor: true });
      background.on('pointerdown', this.opts.onClick);
    }
  }
```

- [ ] **Step 1.2: Run tsc and tests**

Run: `npx tsc --noEmit && npm test`

Expected: PASS / green. Total tests unchanged from baseline.

- [ ] **Step 1.3: Commit**

```bash
git add src/ui/hero_card.ts
git commit -m "feat(ui): wound count badge on HeroCard"
```

---

## Task 2: Barracks detail — `WOUNDS` section + dynamic ABILITIES shift

Insert a `WOUNDS` section between the trait line and the ABILITIES header in the Barracks detail pane. Use `Math.max(ABILITY_HEADER_Y, woundsCursor)` to keep no-wounds layouts identical to today.

**Files:**
- Modify: `src/scenes/barracks_panel_scene.ts`

- [ ] **Step 2.1: Add data-layer imports at the top of the file**

Open `src/scenes/barracks_panel_scene.ts`. The current imports include `WOUNDS` indirectly via `ABILITIES`/`TRAITS` etc. Add direct imports:

```ts
import { WOUNDS, describeWoundEffect } from '../data/wounds';
```

(Add this alongside the other `../data/...` imports near the top of the file.)

- [ ] **Step 2.2: Add `WOUNDS` section + dynamic ABILITIES shift in `rebuildDetail`**

Find `rebuildDetail` (around line 177). After the existing trait line render (around line 246, ending with `})),`), insert the wound section and switch the ABILITIES rendering to use a dynamic Y.

The existing trait line block ends with:

```ts
this.detailContainer.add(
  this.add.text(
    DETAIL_TEXT_X,
    172,
    `trait: ${traitDef.name} — ${traitDef.description}`,
    {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ccbbaa',
    },
  ),
);
```

Immediately after it, **before** the existing `this.detailContainer.add(this.add.text(ABILITY_X, ABILITY_HEADER_Y, 'ABILITIES', ...))` block, insert:

```ts
let woundsCursor = 192;

if (hero.wounds.length > 0) {
  this.detailContainer.add(
    this.add.text(DETAIL_TEXT_X, woundsCursor, 'WOUNDS', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ff6666',
    }),
  );
  woundsCursor += 18;

  for (const wound of hero.wounds) {
    const def = WOUNDS[wound.id];
    const desc = describeWoundEffect(def.effect);
    this.detailContainer.add(
      this.add.text(DETAIL_TEXT_X, woundsCursor, `${def.name} — ${desc}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#dddddd',
      }),
    );
    woundsCursor += 14;
  }

  woundsCursor += 6;
}

const abilityHeaderY = Math.max(ABILITY_HEADER_Y, woundsCursor);
const abilityBlockStartY = abilityHeaderY + (ABILITY_BLOCK_START_Y - ABILITY_HEADER_Y);
```

- [ ] **Step 2.3: Replace the constant Ys in the ABILITIES section with the dynamic ones**

The existing ABILITIES rendering (around lines 248-307) uses `ABILITY_HEADER_Y` and `ABILITY_BLOCK_START_Y` directly. Update the references to use the new locals:

Change line 249:

```ts
this.add.text(ABILITY_X, ABILITY_HEADER_Y, 'ABILITIES', {
```

to:

```ts
this.add.text(ABILITY_X, abilityHeaderY, 'ABILITIES', {
```

Change line 258 (the kit-status line):

```ts
this.add.text(ABILITY_X + 80, ABILITY_HEADER_Y, `· ${describeKitStatus(hero)}`, {
```

to:

```ts
this.add.text(ABILITY_X + 80, abilityHeaderY, `· ${describeKitStatus(hero)}`, {
```

Change line 266 (the abilities yCursor init):

```ts
let yCursor = ABILITY_BLOCK_START_Y;
```

to:

```ts
let yCursor = abilityBlockStartY;
```

The downstream `yCursor += ABILITY_NAME_LINE_HEIGHT` etc. continue to work — they're relative offsets.

- [ ] **Step 2.4: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green / build succeeds. No test count change.

- [ ] **Step 2.5: Commit**

```bash
git add src/scenes/barracks_panel_scene.ts
git commit -m "feat(barracks): show WOUNDS section in detail pane"
```

---

## Closing checklist

- [ ] **Both tasks landed in 2 commits**, with green tests + tsc + build.
- [ ] **No `phaser` imports outside `src/scenes/` and `src/ui/`** (unchanged from baseline).
- [ ] **Manual play verification:**
  - HeroCard with no wounds: no badge.
  - HeroCard with 1+ wounds: `🩸 N` badge in top-right; `N` matches actual wound count.
  - HeroCard with `isDead` (e.g. fallen-list rendering after wipe): no badge regardless of wound state.
  - Barracks detail for unwounded hero: layout matches current state (ABILITIES at y=215).
  - Barracks detail for wounded hero: `WOUNDS` header + name+description rows render between trait line and ABILITIES; ABILITIES section pushes down naturally.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 9 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +0 (UI/scene convention).
