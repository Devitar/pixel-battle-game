# Rename Noticeboard → Expeditions — Design

- **TODO entry:** Cluster B · 27 (Rename Noticeboard → Expeditions).
- **Tier:** 2 (cosmetic — UI vocabulary alignment).
- **Date:** 2026-05-01.

## 1 · Scope

Rename the camp building from "Noticeboard" to "Expeditions" everywhere player-facing AND in code/design-doc internals. The rename covers UI strings, the Phaser scene file/class/key, all import sites, and the relevant gdd / CLAUDE.md / src/README.md references. HISTORY.md and existing spec/plan documents stay untouched as historical record.

**Out of scope:**

- **Retro-editing HISTORY.md.** ~20 references describe past decisions and ship dates when "Noticeboard" was the actual name. Falsifying the record is worse than the mild grep noise. New HISTORY entries (this task's migration, future tasks) will use "Expeditions."
- **Retro-editing existing spec/plan files in `docs/superpowers/specs/` and `docs/superpowers/plans/`.** Same reasoning — these were written when the name was "Noticeboard." They're frozen artefacts.
- **Save schema migration.** No scene name is serialized; nothing to migrate. Verified by grep — no save-related file references "noticeboard" in either string or code.
- **Test changes.** Verified by grep — no test references the scene key `'noticeboard_panel'` or imports `NoticeboardPanelScene`. Tests stay green without modification.
- **Reorganizing the building's behavior or layout.** This is a string-and-symbol rename only.

## 2 · Code changes

### 2a · Rename the file via `git mv`

```bash
git mv src/scenes/noticeboard_panel_scene.ts src/scenes/expeditions_panel_scene.ts
```

`git mv` preserves the file's history, so future `git log` / `git blame` traces still work across the rename.

### 2b · Inside the renamed file (`src/scenes/expeditions_panel_scene.ts`)

Three string/symbol changes:

| Line (old) | Old | New |
|---|---|---|
| 64 | `export class NoticeboardPanelScene extends Phaser.Scene {` | `export class ExpeditionsPanelScene extends Phaser.Scene {` |
| 81 | `super('noticeboard_panel');` | `super('expeditions_panel');` |
| 152 | `this.titleText.setText('Noticeboard');` | `this.titleText.setText('Expeditions');` |

### 2c · `src/main.ts`

Two changes:

| Line | Old | New |
|---|---|---|
| 17 | `import { NoticeboardPanelScene } from './scenes/noticeboard_panel_scene';` | `import { ExpeditionsPanelScene } from './scenes/expeditions_panel_scene';` |
| 42 | `    NoticeboardPanelScene,` | `    ExpeditionsPanelScene,` |

### 2d · `src/scenes/camp_scene.ts`

One change at line 20:

```ts
// Old:
this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
// New:
this.buildBuilding('Expeditions', 720, 0x998866, 80, 60, 'expeditions_panel');
```

The first arg (`'Noticeboard'`) is the player-facing tile label; the last arg (`'noticeboard_panel'`) is the Phaser scene key passed to `scene.launch`. Both flip together.

## 3 · Doc changes

### 3a · `gdd.md`

Six line touches across four sections:

| Line | Old | New |
|---|---|---|
| 13 (§1) | `pick a dungeon from the noticeboard` | `pick a dungeon from Expeditions` |
| 174 (§5) | `picks their dungeon from the Noticeboard` | `picks their dungeon from Expeditions` |
| 197 (§6 buildings table) | `\| **Noticeboard** \| Pick the next dungeon. ...` | `\| **Expeditions** \| Pick the next dungeon. ...` |
| 207 (§6 typical visit) | `Noticeboard → dungeon → 3-hero pick` | `Expeditions → dungeon → 3-hero pick` |
| 304 (§10 Tier 1) | `Noticeboard (Crypt only)` | `Expeditions (Crypt only)` |
| 344 (§11 risks) | `Barracks, Tavern, Blacksmith, Hospital, Noticeboard` | `Barracks, Tavern, Blacksmith, Hospital, Expeditions` |

### 3b · `CLAUDE.md`

One change at line 59 (Tier 1 build target description):

```
Old: ... basic camp (Tavern/Barracks/Noticeboard), pack + cashout/press-on, ...
New: ... basic camp (Tavern/Barracks/Expeditions), pack + cashout/press-on, ...
```

### 3c · `src/README.md`

One change at line 30 (the `scenes/` row of the directory table). Current text references `noticeboard_scene.ts` (the README abbreviates the file name; the actual file is `noticeboard_panel_scene.ts`). Update to match the new file name:

```
Old (excerpt): `boot_scene.ts`, `camp_scene.ts`, `dungeon_scene.ts`, `combat_scene.ts`, `camp_screen_scene.ts`, `noticeboard_scene.ts`
New (excerpt): `boot_scene.ts`, `camp_scene.ts`, `dungeon_scene.ts`, `combat_scene.ts`, `camp_screen_scene.ts`, `expeditions_panel_scene.ts`
```

(The README's `noticeboard_scene.ts` mention is itself slightly stale — the actual file was always `noticeboard_panel_scene.ts`. Fixing both the rename and the abbreviation in one step.)

## 4 · Verification by grep

After all changes are applied, run:

```bash
git grep -i "noticeboard"
```

Expected matches (intentionally preserved):

- All HISTORY.md references (~20).
- All `docs/superpowers/specs/*.md` and `docs/superpowers/plans/*.md` references that mention Noticeboard in past entries.

Anything else is a missed touch — investigate before claiming the rename is done.

## 5 · Files touched

| File | Change |
|---|---|
| `src/scenes/noticeboard_panel_scene.ts` | Renamed via `git mv` to `src/scenes/expeditions_panel_scene.ts`; inside: class, scene key, panel title updated. |
| `src/main.ts` | Import line + scenes-array entry updated. |
| `src/scenes/camp_scene.ts` | `buildBuilding` call's label + scene-key args updated. |
| `gdd.md` | Six line touches across §1, §5, §6, §10, §11. |
| `CLAUDE.md` | One line touch (Tier 1 build target description). |
| `src/README.md` | Directory-table reference updated (also fixes pre-existing abbreviation slip). |

No other files touched. No save schema change. No data layer change. No test change.

## 6 · Test plan

No new tests. Verification:

- `npx tsc --noEmit` green — catches any missed import or class-reference.
- `npm test` green (1330 tests, no count change) — no test references the renamed symbols.
- `npm run build` succeeds — confirms module resolution + Phaser scene-key wiring remain consistent.
- `git grep -i "noticeboard"` returns only HISTORY + spec/plan references.

**Manual play verification:**

- Open the camp scene. The third building tile reads "Expeditions" (was "Noticeboard").
- Click it. The panel that opens has title "Expeditions" (was "Noticeboard"). All sub-stages (dungeon list, party picker) work as before — same content, same buttons, same drag-drop, same Descend.
- ESC closes the panel; reopening works.

## 7 · Risk

Very low. Pure renaming with grep-verifiable completeness. No behavior change. tsc would catch any half-completed rename (a stale import or a mismatched scene key would produce a clear error). The Phaser scene key change at `super('expeditions_panel')` and the matching `'expeditions_panel'` in `camp_scene.ts:20` must flip together — tsc won't catch that mismatch (string keys aren't typed against Scene class names), but the manual verification step (clicking the tile and seeing the panel open) catches it immediately.

## 8 · Open questions

None at design time.
