# Outfit Sprite Wire-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder `spriteId: '0'` for `outfit_cloth` (→ `clotharmor_tan1`, frame 335) and `outfit_leather` (→ `leatherarmor_tier1`, frame 171) in `BASE_ITEMS`, lighting up the existing torso art for cloth/leather outfits. Refresh the placeholder-guard comment in `hero_loadout.ts` so it accurately reflects that only hats remain on the sentinel.

**Architecture:** Two-line edit in `src/data/items.ts` (both spriteId fields update from `'0'` to real `String(SPRITE_NAMES.torso.*)` references) + one comment refresh in `src/render/hero_loadout.ts`. `SPRITE_NAMES` is already imported in items.ts. The placeholder-guard logic is unchanged — `hat_cap` and `hat_hood` keep using `'0'` until Cluster C · 2 lands.

**Tech Stack:** TypeScript. Pure-data layer change; no runtime / engine impact.

**Spec:** `docs/superpowers/specs/2026-05-01-outfit-sprite-wireup-design.md`. Read before starting — note especially §2 (frame choices and rationale) and §5 (verification approach).

---

## Task 1: Wire up outfit spriteIds + refresh comment

Single task; the change is mechanical and contained to two files.

**Files:**
- Modify: `src/data/items.ts`
- Modify: `src/render/hero_loadout.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1330 tests pass. Note for post-change comparison (target: still 1330 — no test changes).

- [ ] **Step 1.2: Update `outfit_cloth.spriteId` in `src/data/items.ts`**

Open `src/data/items.ts`. Find line 47:

```ts
outfit_cloth:   { baseId: 'outfit_cloth',   name: 'Cloth Robes',     slot: 'outfit',                              spriteId: '0' },
```

Replace with:

```ts
outfit_cloth:   { baseId: 'outfit_cloth',   name: 'Cloth Robes',     slot: 'outfit',                              spriteId: String(SPRITE_NAMES.torso.clotharmor_tan1) },
```

- [ ] **Step 1.3: Update `outfit_leather.spriteId` in `src/data/items.ts`**

In the same file, line 48:

```ts
outfit_leather: { baseId: 'outfit_leather', name: 'Leather Tunic',   slot: 'outfit',                              spriteId: '0' },
```

Replace with:

```ts
outfit_leather: { baseId: 'outfit_leather', name: 'Leather Tunic',   slot: 'outfit',                              spriteId: String(SPRITE_NAMES.torso.leatherarmor_tier1) },
```

`SPRITE_NAMES` is already imported on line 1 (`import { SPRITE_NAMES } from '@render/sprite_names.generated';`); no import change needed.

- [ ] **Step 1.4: Refresh the placeholder-guard comment in `src/render/hero_loadout.ts`**

Open `src/render/hero_loadout.ts`. The placeholder-guard comment spans lines 16–18:

```ts
// '0' is the placeholder sentinel for items without a real sprite frame yet
// (currently outfits + hats per Cluster C · 2). Returning undefined skips the
// layer entirely instead of rendering frame 0 as a stacked visual artifact.
```

Update the second line to reflect that outfits are now wired up:

```ts
// '0' is the placeholder sentinel for items without a real sprite frame yet
// (currently hats per Cluster C · 2 — outfits wired up in Cluster B · 31).
// Returning undefined skips the layer entirely instead of rendering frame 0
// as a stacked visual artifact.
```

The third line wraps slightly differently because the second line got shorter — adjust to keep ~80 char width. The guard logic at lines 19–23 is unchanged.

- [ ] **Step 1.5: Run tsc + tests + build to confirm green**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (1330 tests, no count change) / build succeeds.

If tsc fails: most likely a typo in the `SPRITE_NAMES.torso.*` reference. The valid keys are `clotharmor_tan1` (for outfit_cloth) and `leatherarmor_tier1` (for outfit_leather). Compare against `src/render/sprite_names.generated.ts` — search for `clotharmor_tan1` and `leatherarmor_tier1` to confirm they exist.

If a test fails: surprising. The change touches data, not behavior. Investigate what test depends on `outfit_cloth.spriteId === '0'` (probably the placeholder-guard test in `hero_loadout.test.ts` — but that test uses `hat_cap` or a generic mock, not `outfit_cloth`).

- [ ] **Step 1.6: Commit**

```bash
git add src/data/items.ts src/render/hero_loadout.ts
git commit -m "feat(items): wire up outfit sprites to existing torso frames

outfit_cloth → clotharmor_tan1 (frame 335)
outfit_leather → leatherarmor_tier1 (frame 171)

Both frames already existed in spritenames.txt — no new art needed.
Refreshes the hero_loadout.ts placeholder-guard comment to note that
only hats remain on the '0' sentinel."
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Single task landed in 1 commit** with green tsc + tests + build.
- [ ] **No new dependencies, no new files, no test count change** (1330 → 1330).
- [ ] **Placeholder guard logic untouched** in `hero_loadout.ts` — `hat_cap` and `hat_hood` still use `'0'`; the guard still returns `undefined` for them.
- [ ] **Manual play (optional, low value):** spawn a hero with a cloth or leather outfit equipped via Barracks Equip Gear (need a stash item to equip first; outfits drop from runs and can be banked at cashout). Paperdoll's torso layer should now render the chosen sprite where it used to be empty. Skip if confidence in tsc + the existing `hero_loadout.test.ts` placeholder-guard tests is sufficient.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 31 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.
