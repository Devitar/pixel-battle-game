# TODO

The actionable backlog. Every entry should carry enough context that a fresh session can pick it up without clarifying questions.

Priority is implicit in ordering: items higher in the file are higher priority. When a task is completed, move its entry to [`HISTORY.md`](HISTORY.md) with decision context added — don't leave it here.

## Format

One section per task.

```markdown
### Short task title

- **What:** the task in one line
- **Why:** the motivation — what this unblocks or improves
- **Tier:** 1 / 2 / 3 (per `gdd.md §10`)
- **Acceptance:** bullet list of "done when…" criteria, or implementation hints
- **Touches:** key files/folders expected to change (optional)
- **Source:** `bugs.md` / `ideas.md` / design note / ad-hoc (optional)
```

---

<!-- Add tasks below this line. Highest priority at the top. -->

## Cluster B — Scenes & UI / Tier 2 polish

Tier 2 scope from gdd §10 is substantially complete (entries 1–24 shipped). Entries 25+ surface latent bugs, combat-engine quality, and pre-launch hygiene work audited 2026-05-01 against current HISTORY. Entries may touch any layer (scenes, combat engine, build config) — kept under the Cluster B umbrella since Cluster A (pure-TS data layer) was closed at task 16.

### 27 · Rename Noticeboard → Expeditions

- **What:** Rename the camp building from "Noticeboard" to "Expeditions" across all player-facing UI strings. The building keeps all existing functionality.
- **Why:** From ideas.md #4 — short cosmetic improvement. "Expeditions" more directly conveys the building's purpose (pick a dungeon, descend) than the passive "Noticeboard."
- **Tier:** 2
- **Acceptance:**
  - All player-facing strings updated: camp tile label, panel title, any transition messaging.
  - Decision in brainstorming: rename the file/scene-key (`noticeboard_panel_scene.ts` / `'noticeboard_panel'`) too, or keep internal names and only change UI strings? Internal rename is more thorough but adds blast radius (main.ts registration, every `scene.launch` site).
  - tsc + tests + build stay green.
- **Touches:** `src/scenes/noticeboard_panel_scene.ts` (UI strings; possibly file rename + scene key), `src/scenes/camp_scene.ts` (tile label + launch site), possibly `src/main.ts` (scene registration).
- **Source:** ideas.md #4.

### 28 · Absolute import paths

- **What:** Configure absolute import aliases (e.g., `@camp/`, `@data/`, `@util/`, `@render/`, `@scenes/`, `@combat/`, `@dungeon/`, `@items/`, `@heroes/`, `@run/`, `@save/`, `@ui/`) so imports look like `import { listHeroes } from '@camp/roster'` instead of `import { listHeroes } from '../camp/roster'`. Configure both `vite.config.ts` (resolve.alias) and `tsconfig.json` (compilerOptions.paths). Migrate existing imports.
- **Why:** From ideas.md #5 — pre-launch maintenance refactor. Relative imports are fragile when files move and create churn during refactors. With ~100 `.ts` files across many folders, the relative-import noise has grown.
- **Tier:** 2
- **Acceptance:**
  - `vite.config.ts` + `tsconfig.json` carry matching `paths` aliases for each top-level `src/` folder.
  - Existing imports migrated. Decision in brainstorming: do intra-folder imports stay relative (common convention: absolute across folders, relative within a folder), or go absolute too?
  - tsc + tests + build stay green; no behavior change.
  - Vitest still resolves the aliases (vitest reads vite config by default; verify).
- **Touches:** `vite.config.ts`, `tsconfig.json`, every `.ts` file with cross-folder relative imports (~100 files for a complete migration).
- **Source:** ideas.md #5.

---

## Cluster C — Art polish (non-blocking)

Art tasks that aren't blocking gameplay. Enemies, heroes, and rooms already render with placeholder / reused frames; entries here replace placeholders with bespoke pixel art. Deprioritised relative to Clusters A/B.

### 1 · Bespoke enemy art for Crypt

- **What:** Produce dedicated sprites for the 4 Crypt enemy types + 1 boss, replacing the current placeholder NPC-frame mappings.
- **Why:** Enemies currently render via reused NPC frames (placeholder), which is functional but visually undifferentiated and doesn't read as "Crypt-themed." Bespoke art makes the dungeon feel distinct.
- **Tier:** 1 (originally) — non-blocking now that placeholders work.
- **Acceptance:**
  - Every enemy id referenced by `data/enemies.ts` maps to a dedicated sprite frame (no shared NPC frames where possible).
  - `spritenames.txt` updated with the new entries; `npm run generate:names` run and output committed.
  - Boss is visually distinguishable beyond just scale (unique frame or silhouette).
- **Touches:** `public/assets/sprites/base_sprites.png`, `spritenames.txt`, `src/render/sprite_names.generated.ts` (regenerated).

### 2 · Bespoke outfit + hat sprites for items system

- **What:** Replace the placeholder `spriteId: '0'` entries in `BASE_ITEMS` for `outfit_cloth`, `outfit_leather`, `hat_cap`, `hat_hood` with real sprite frames. Update `spritenames.txt` and regenerate the names module.
- **Why:** The items foundation (Cluster A task 4) shipped with `'0'` placeholder sprite IDs for outfits and hats because no bespoke frames existed yet. Heroes still render correctly because `heroToLoadout` only reads weapon + shield from equipment today, but the moment a future task wires outfit/hat sprites into the paperdoll those `'0'` values become visible bugs. Cleaning this up before that wiring lands keeps the item-display task clean.
- **Tier:** 1 (originally part of items foundation) — non-blocking now that placeholders work.
- **Acceptance:**
  - `outfit_cloth`, `outfit_leather`, `hat_cap`, `hat_hood` in `src/data/items.ts` reference real frame names from `SPRITE_NAMES.outfit.*` / `SPRITE_NAMES.hat.*` (or whatever family they belong to in `spritenames.txt`).
  - `spritenames.txt` carries the new entries; `npm run generate:names` run and output committed.
  - The two outfit variants are visually distinguishable; the two hat variants are visually distinguishable.
- **Touches:** `public/assets/sprites/base_sprites.png` (if new frames needed), `spritenames.txt`, `src/render/sprite_names.generated.ts` (regenerated), `src/data/items.ts` (4 spriteId fields).
- **Source:** Cluster A task 4 HISTORY entry (2026-04-27 · Gear rarity tiers + items foundation).
