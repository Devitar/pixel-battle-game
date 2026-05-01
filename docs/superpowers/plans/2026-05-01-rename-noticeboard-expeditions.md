# Rename Noticeboard → Expeditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the camp building from "Noticeboard" to "Expeditions" across all player-facing UI strings, code internals (file, class, scene key, imports), and design-doc references (gdd.md, CLAUDE.md, src/README.md). HISTORY.md and existing spec/plan files stay untouched as historical record.

**Architecture:** Pure rename, no behavior change. `git mv` for the file (preserves history); string-replace for symbols, scene keys, UI labels, and doc references. tsc + tests + build + a final grep verification confirm completeness.

**Tech Stack:** TypeScript, Phaser 3, plain markdown for docs.

**Spec:** `docs/superpowers/specs/2026-05-01-rename-noticeboard-expeditions-design.md`. Read before starting — note especially §4 (verification grep) and §7 (the scene-key-mismatch risk that tsc can't catch).

---

## Task 1: Code rename (file move + 3 source files)

**Files:**
- Rename: `src/scenes/noticeboard_panel_scene.ts` → `src/scenes/expeditions_panel_scene.ts`
- Modify: `src/scenes/expeditions_panel_scene.ts` (post-rename)
- Modify: `src/main.ts`
- Modify: `src/scenes/camp_scene.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1330 tests pass. Note for post-change comparison (target: still 1330, no test count change).

- [ ] **Step 1.2: Rename the scene file via `git mv`**

Run: `git mv src/scenes/noticeboard_panel_scene.ts src/scenes/expeditions_panel_scene.ts`

`git mv` preserves history. After this step, the file is at the new path but its contents still reference `Noticeboard`.

- [ ] **Step 1.3: Update class name, scene key, and panel title inside the renamed file**

Open `src/scenes/expeditions_panel_scene.ts`. Three changes:

Line 64 — change the class name:

```ts
// Old:
export class NoticeboardPanelScene extends Phaser.Scene {
// New:
export class ExpeditionsPanelScene extends Phaser.Scene {
```

Line 81 (inside the constructor) — change the Phaser scene key:

```ts
// Old:
super('noticeboard_panel');
// New:
super('expeditions_panel');
```

Line 152 (inside `setStage('dungeon_list')`) — change the panel title:

```ts
// Old:
this.titleText.setText('Noticeboard');
// New:
this.titleText.setText('Expeditions');
```

- [ ] **Step 1.4: Update `src/main.ts` import and registration**

Open `src/main.ts`. Two changes:

Line 17 — import:

```ts
// Old:
import { NoticeboardPanelScene } from './scenes/noticeboard_panel_scene';
// New:
import { ExpeditionsPanelScene } from './scenes/expeditions_panel_scene';
```

Line 42 — scenes-array entry:

```ts
// Old:
    NoticeboardPanelScene,
// New:
    ExpeditionsPanelScene,
```

- [ ] **Step 1.5: Update `src/scenes/camp_scene.ts` building label and scene key**

Open `src/scenes/camp_scene.ts`. Single change at line 20:

```ts
// Old:
this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
// New:
this.buildBuilding('Expeditions', 720, 0x998866, 80, 60, 'expeditions_panel');
```

The first arg is the player-facing tile label; the last arg is the Phaser scene key passed to `scene.launch`. Both flip together.

- [ ] **Step 1.6: Run tsc + tests + build to confirm code rename is consistent**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (1330 tests, no count change) / build succeeds.

If tsc fails: a missed import or class reference. Fix and re-run.
If a test fails: probably a stale reference somewhere — investigate before proceeding.

---

## Task 2: Doc rename (3 markdown files)

**Files:**
- Modify: `gdd.md`
- Modify: `CLAUDE.md`
- Modify: `src/README.md`

- [ ] **Step 2.1: Update `gdd.md` (six line touches)**

Open `gdd.md`. Six replacements across four sections:

Line 13 (§1):

```
Old: ... arrange their formation (slots 1 / 2 / 3), pick a dungeon from the noticeboard.
New: ... arrange their formation (slots 1 / 2 / 3), pick a dungeon from Expeditions.
```

Line 174 (§5):

```
Old: Before descending, the player picks their dungeon from the Noticeboard. Each dungeon ...
New: Before descending, the player picks their dungeon from Expeditions. Each dungeon ...
```

Line 197 (§6 buildings table — keep the rest of the row intact):

```
Old: | **Noticeboard** | Pick the next dungeon. Not upgraded directly — unlocks appear here as bosses are beaten. | n/a |
New: | **Expeditions** | Pick the next dungeon. Not upgraded directly — unlocks appear here as bosses are beaten. | n/a |
```

Line 207 (§6 typical visit — list item 5):

```
Old: 5. Noticeboard → dungeon → 3-hero pick → formation → go.
New: 5. Expeditions → dungeon → 3-hero pick → formation → go.
```

Line 304 (§10 Tier 1 retro description):

```
Old: - **Camp.** Tavern (fixed 3-candidate pool, no reroll), Barracks (12 slots, equip & formation), Noticeboard (Crypt only).
New: - **Camp.** Tavern (fixed 3-candidate pool, no reroll), Barracks (12 slots, equip & formation), Expeditions (Crypt only).
```

Line 344 (§11 risks — UI density note):

```
Old: - **UI density.** Camp alone has 5+ sub-panels (Barracks, Tavern, Blacksmith, Hospital, Noticeboard). The post-boss Camp Screen is its own UI. Combat overlays, equipment screen, map screen, event cards — UI is the largest single-scope risk.
New: - **UI density.** Camp alone has 5+ sub-panels (Barracks, Tavern, Blacksmith, Hospital, Expeditions). The post-boss Camp Screen is its own UI. Combat overlays, equipment screen, map screen, event cards — UI is the largest single-scope risk.
```

- [ ] **Step 2.2: Update `CLAUDE.md` (one line touch)**

Open `CLAUDE.md`. Single change at line 59 (Tier 1 build target description):

```
Old: - **Tier 1** — vertical slice: 3 classes (Knight, Archer, Priest), 1 dungeon (Crypt, 3 linear floors), 4 stats, basic camp (Tavern/Barracks/Noticeboard), pack + cashout/press-on, permadeath, save/load. This is the next build target.
New: - **Tier 1** — vertical slice: 3 classes (Knight, Archer, Priest), 1 dungeon (Crypt, 3 linear floors), 4 stats, basic camp (Tavern/Barracks/Expeditions), pack + cashout/press-on, permadeath, save/load. This is the next build target.
```

- [ ] **Step 2.3: Update `src/README.md` (one line touch — the `scenes/` directory row)**

Open `src/README.md`. The directory table at line 30 currently reads (the "scenes/" row):

```
| `scenes/` | Phaser scenes — the bridge between core and rendering. One scene per major game screen. | `boot_scene.ts`, `camp_scene.ts`, `dungeon_scene.ts`, `combat_scene.ts`, `camp_screen_scene.ts`, `noticeboard_scene.ts` |
```

Change `noticeboard_scene.ts` → `expeditions_panel_scene.ts` (this also fixes a pre-existing minor abbreviation slip — the actual file was always `noticeboard_panel_scene.ts`, not `noticeboard_scene.ts`):

```
| `scenes/` | Phaser scenes — the bridge between core and rendering. One scene per major game screen. | `boot_scene.ts`, `camp_scene.ts`, `dungeon_scene.ts`, `combat_scene.ts`, `camp_screen_scene.ts`, `expeditions_panel_scene.ts` |
```

---

## Task 3: Verify completeness via grep

**Files:** none modified — verification only.

- [ ] **Step 3.1: Grep for any remaining `noticeboard` references**

Run: `git grep -i "noticeboard"`

Expected matches (intentionally preserved):

- `HISTORY.md` — ~20 references describing past decisions when "Noticeboard" was the actual name. Historical record; do NOT edit.
- `docs/superpowers/specs/*.md` — past spec entries. Frozen artefacts; do NOT edit.
- `docs/superpowers/plans/*.md` — past plan entries. Frozen artefacts; do NOT edit.

If any match shows up in `src/`, `gdd.md`, `CLAUDE.md`, `src/README.md`, `bugs.md`, `ideas.md`, or `TODO.md`: a touch was missed. Fix before proceeding.

- [ ] **Step 3.2: Final tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (1330 tests, no count change) / build succeeds.

- [ ] **Step 3.3: Commit**

The `git mv` from step 1.2 already staged both halves of the rename (delete old + add new). Stage the remaining modifications by explicit path:

```bash
git add src/main.ts src/scenes/camp_scene.ts gdd.md CLAUDE.md src/README.md
git status   # sanity-check: file rename + 5 modifications, nothing else
git commit -m "rename(camp): Noticeboard → Expeditions across UI, code, docs

Renames the camp building everywhere player-facing and in code
internals (file via git mv, class, Phaser scene key, imports).
Updates gdd.md, CLAUDE.md, and src/README.md to match. HISTORY.md
and existing spec/plan files stay as historical record."
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit. Per CLAUDE.md, also: stage by explicit path rather than `git add -A` so unrelated files don't sneak in.)

---

## Closing checklist

- [ ] **Three tasks landed in 1 commit** (the rename is atomic — code + docs in lockstep) with green tsc + tests + build.
- [ ] **`git mv` used for the file rename** (not delete + create) — preserves git history across the rename.
- [ ] **No behavior change** — manual play confirms Expeditions tile + panel work identically to Noticeboard.
- [ ] **`git grep -i "noticeboard"` returns ONLY HISTORY.md + spec/plan references** (no `src/`, no `gdd.md`, no `CLAUDE.md`, no `src/README.md` matches).
- [ ] **Test count unchanged:** still 1330.
- [ ] **Manual play verification:**
  - Open the camp scene. The third building tile reads "Expeditions" (was "Noticeboard").
  - Click it. The panel title reads "Expeditions" (was "Noticeboard"). Sub-stages (dungeon list, party picker) work as before.
  - Pick a party, click Descend, verify the run starts normally.
  - ESC closes the panel; reopening starts fresh.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 27 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source). The new HISTORY entry uses "Expeditions"; existing HISTORY entries with "Noticeboard" stay untouched.
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** 0 (1330 → 1330). Pure rename, no test changes needed.
