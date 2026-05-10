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

Original Tier 2 scope from gdd §10 is complete (entries 1–28 shipped). Entries 29+ surface deferred Tier 2 polish discovered in the 2026-05-01 post-Tier-2 audit — items that match the gdd's Tier 2 design but weren't part of the original cut.

### 52 · Cleanup stale boss_sprites_candidate_*.png in public/assets/sprites/temp/

- **What:** Remove the leftover `boss_sprites_candidate_*.png` files in `public/assets/sprites/temp/`. These predate the pixui adoption work but were noticed during the Cluster B · 45 sub-spec 2 whole-implementation review.
- **Why:** Dead files in a tracked directory cause confusion ("are these used? safe to delete?"). Each new contributor hits the same question.
- **Tier:** 2 (cleanup)
- **Acceptance:** Files deleted; verify no source code references them via grep before deletion.
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06).

---

### 50 · Windows shim robustness in vite.config.ts

- **What:** Two robustness improvements for the pixel-tools Windows shim block in `vite.config.ts`:
  - **Arch detection.** Currently hardcodes `win32-x64` binary name. Will throw with a descriptive message on win32-arm64 (per the existsSync guard added during Cluster B · 45 sub-spec 2 review), but the message points at "the shim strategy" without explaining how to fix it. Detect `process.arch` and select the right binary suffix; fall back to a clearer error if pixel-tools doesn't ship that arch.
  - **Read-only `node_modules/.cache/` fallback.** Some CI runners (Bazel, Nix hermetic builds) have read-only node_modules. The current `mkdirSync` + `copyFileSync` will throw raw EACCES errors. Wrap in try/catch with a contextual error: "pixel-tools Windows shim needs writable `node_modules/.cache/`; configure your CI to allow this OR run on a non-Windows runner."
- **Why:** Both are latent issues. Today's setup works on x64 Windows + writable cache. Future ARM Windows laptops or hermetic CI will hit cryptic errors with no clear path forward.
- **Tier:** 2 (robustness; non-blocking until a real ARM/CI scenario hits)
- **Acceptance:**
  - Use `process.arch` to compute binary suffix (`win32-${arch}`).
  - Wrap `mkdirSync`/`copyFileSync` in try/catch; throw with actionable message on failure.
  - Manual test: confirm dev server still starts cleanly on win32-x64 (no regression).
- **Touches:** `vite.config.ts`.
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06).

---

### 49 · scene.restart() performance check on hospital under rapid clicking

- **What:** Hospital uses `scene.restart()` for every state change (hero selection, treat, upgrade) — 4 sites in `hospital_panel_scene.ts`. Each restart triggers full UI teardown + rebuild. Verify there's no perceptible lag, dropped frames, or memory growth under rapid clicking — particularly when the wounded list is full and the player rapidly clicks through heroes + treats.
- **Why:** The pattern carried over from the pixui era and was preserved by the 2026-05-09 in-house widget migration unchanged. Per-interaction full rebuilds may bite at scale or on lower-end devices. Worth quantifying — other panels (barracks, equip, blacksmith) follow the same pattern, so a measured answer informs whether a future in-place update strategy is worth the complexity.
- **Tier:** 2 (perf check)
- **Acceptance:**
  - Manual test: Open hospital with 6 wounded heroes. Rapidly click between heroes for 30s. Observe FPS counter (Phaser dev tools or browser perf panel). Verify no drops below 30fps, no growing memory.
  - If perf is fine: file a HISTORY-style note confirming.
  - If perf is bad: brainstorm in-place update strategy or cap restart frequency.
- **Touches:** none (measurement task; results may trigger follow-up code change).
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06); pattern survived 2026-05-09 pixui removal.

---

### 47 · Theme palette: revisit mana_soul vs game's gold/dark-gray identity

- **What:** `src/ui/widgets/theme.ts` currently runs a hybrid: mana_soul atlas frames (cream `0xfbe4af` text, blue panel chrome) for panels and buttons, but game-native gold (`0xffcc66`) and dark-gray (`0x1a1a1a`) for selection states + row backgrounds. The 2026-05-09 widget migration adopted this blend without a deliberate visual-design pass. Open question: does the blend read as cohesive, or does it look like two themes welded together?
- **Why:** Visual consistency across camp panels. The hybrid is functional but the assets/colors weren't co-designed. May warrant a side-by-side review (open Tavern + Hospital + Blacksmith back-to-back) and either (a) commit to the hybrid as the final identity and tune any remaining clashes, or (b) replace mana_soul atlas frames with game-themed art (gold/dark-gray panels) for a unified gold-on-dark look.
- **Tier:** 2 (visual polish; non-blocking)
- **Acceptance:**
  - Side-by-side smoke check across all camp panels.
  - Decision: keep hybrid (and tune `theme.ts` tints if anything reads off) OR retheme to fully game-native (means new atlas art under `assets/ui.yaml` and a new packed atlas).
  - May reveal that the hybrid is fine and this entry retires without code changes.
- **Touches:** `src/ui/widgets/theme.ts` (tint tuning); potentially `assets/ui.yaml` + new sprite art (full retheme path).
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06); rescoped 2026-05-09 after widget migration.

---

### 46 · Hospital wounded list pagination / overflow indicator

- **What:** `hospital_panel_scene.ts:152` caps the wounded list at `VISIBLE_ROWS` via `wounded.slice(0, VISIBLE_ROWS)`. With more wounded heroes than fit, the rest are silently dropped — no scrollbar, no "+N more" indicator. A player can't tell if/which heroes are missing.
- **Why:** Real UX bug at the edge case. Late-game with many heroes wounded across runs, the player may be unable to access some of them via the hospital UI.
- **Tier:** 2 (UX bug)
- **Acceptance:**
  - Either pagination (matching blacksmith's pattern) OR a visible "+N more" text row when `wounded.length > VISIBLE_ROWS`.
  - Pagination preferred for parity with other panels.
  - Cap-edge state: when exactly `VISIBLE_ROWS` heroes are wounded, no overflow indicator should appear.
- **Touches:** `src/scenes/hospital_panel_scene.ts`.
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06); concern carries over post-pixui.

---

### 59 · HeroCard labels migrate to bitmap fonts

- **What:** `src/ui/widgets/hero_card.ts:121-173` renders the four card labels (name, class+level, inline HP, trait) via raw `scene.add.text({ fontFamily: 'monospace', ... })`. Every other widget — Button labels, panel headers via `createBitmapText`, in-scene captions — uses the `mana_soul` bitmap fonts. HeroCards next to bitmap-font headers in any panel render visibly different typography.
- **Why:** Visual consistency across all camp panels. Each consumer of HeroCard (Tavern, Barracks, Hospital, Equip, Expeditions, Perk, Event, camp_screen) would benefit. Migration replaces inline `color: '#xxxxxx'` with numeric tints and `fontSize: '12px'` with bitmap-font sizes.
- **Tier:** 2 (visual polish)
- **Acceptance:**
  - Four labels migrated to `createBitmapText`: name, class line, HP text (inline with class line on small cards), trait line.
  - Wound-badge emoji at `hero_card.ts:213` stays on raw `scene.add.text` — bitmap fonts can't render emoji (constant upstream limitation, confirmed in pixui-era HISTORY).
  - Visual smoke check: Tavern + Barracks + Hospital all show consistent typography between HeroCards and surrounding panel text.
  - Pick bitmap-font sizes that approximate the current pixel sizes without requiring new font assets.
- **Touches:** `src/ui/widgets/hero_card.ts` (~30 LOC).
- **Source:** UI widgets audit (2026-05-10).

---

### 60 · `assertWidgetAssetsLoaded` policy: every panel or none

- **What:** `assertWidgetAssetsLoaded(scene)` is called in 3 scenes (`tavern_panel_scene.ts`, `camp_screen_scene.ts`, `expeditions_panel_scene.ts`) and skipped in 10 others (blacksmith, barracks, hospital, equip, event_overlay, perk_overlay, shop_overlay, treasure_room_overlay, camp_node_overlay, plus dev scenes). Same goal — guard against BootScene preload regressions — but inconsistent application.
- **Why:** The current half-and-half state is the worst of both. Either the assert pays for itself (panels show a clear "atlas missing" error beating the cryptic Phaser failure) and every panel calls it, OR BootScene's promise of "loaded once globally for all scenes" (`boot_scene.ts:34-41`) is enough and the 3 callsites are over-defensive.
- **Tier:** 2 (consistency / DX)
- **Acceptance:**
  - Decision in implementation: every-panel adoption OR fully-remove from the 3 current sites.
  - If every-panel: add the assert call to the 10 panels missing it.
  - If remove-all: drop the call from the 3 current sites; remove the export from `widgets/index.ts` and the helper from `widgets/text.ts`.
- **Touches:** Either 10 scene files (add) or 5 (3 scenes + `text.ts` + `index.ts`).
- **Source:** UI widgets audit (2026-05-10).

---

### 61 · Drop dead theme colors `textDark`, `textDim`

- **What:** `src/ui/widgets/theme.ts:42-63` declares `textDark: 0x111343` and `textDim: 0x7bb6bc` in the `COLOR` map. Cross-codebase grep returns zero consumers for either. `textDim` also duplicates `textDisabled`'s value (both `0x7bb6bc`).
- **Why:** Theme cleanup. Dead entries blur the line between "intentional palette" and "abandoned experiment"; removing them makes the remaining colors a tighter signal of what the widget system actually expresses.
- **Tier:** 2 (cleanup)
- **Acceptance:**
  - Remove `textDark` and `textDim` from `COLOR` in `theme.ts`.
  - Re-verify no consumers via `Grep "COLOR\.(textDark|textDim)"` before deletion.
- **Touches:** `src/ui/widgets/theme.ts` (~2 lines).
- **Source:** UI widgets audit (2026-05-10).

---

### 58 · Deterministic camp RNG via `SaveFile.campRngState`

- **What:** Add a persisted `campRngState: number` field to `SaveFile` and migrate the 5 camp-side `createRng(Date.now())` sites (`boot_scene.ts:45`, `tavern_panel_scene.ts:69, 219, 239`, `blacksmith_panel_scene.ts:767`) to read/write through it — mirroring the run-time `runRngState` pattern (`createRngFromState(state.campRngState)` → roll → write `campRngState: rng.getState()`). Replaces the current ad-hoc seeding which can't be replayed or seeded for testing.
- **Why:** Today's camp RNG is non-deterministic — Tavern hire rolls, reroll candidate generation, and blacksmith upgrade rolls all seed from `Date.now()`, so they can't be reproduced for save-load consistency tests, replay debugging, or balance audits. The architecturally correct fix mirrors the run-time pattern (`runRngState` field + `createRngFromState`/`getState` flow) already deeply consistent across 8 in-run scenes. Originally scoped out of #56 because it required a schema bump; the 2026-05-10 lift of the pre-launch schema-pin policy unblocks it.
- **Tier:** 2 (architecture quality / correctness; non-blocking)
- **Acceptance:**
  - Bump `CURRENT_SCHEMA_VERSION` from 1 to 2 in `src/save/migration.ts`; register `MIGRATIONS[1]` to add `campRngState: Date.now()` to existing v1 saves.
  - Add `campRngState: number` to `SaveFile` (required, not optional — `createFreshSave` seeds it with `Date.now()` once at save creation).
  - Migrate the 5 camp-side seeding sites listed above: each reads `appState.get().campRngState`, calls `createRngFromState`, then writes `campRngState: rng.getState()` after rolling.
  - `expeditions_panel_scene.ts:444` (run-start seeding) should consume from `campRngState` to seed the new run's `runRngState` — threads determinism across the camp→run boundary instead of double-`Date.now()`.
  - All 1716 tests still green; add test coverage for the migration + the seed/state flow at one camp site (Tavern is the easiest fixture).
- **Touches:** `src/save/save.ts` (SaveFile field), `src/save/migration.ts` (bump + migration), `src/save/boot.ts` (createFreshSave), `src/scenes/{boot,tavern_panel,blacksmith_panel,expeditions_panel}_scene.ts`. New tests in `src/save/__tests__/`.
- **Source:** Cluster B · 56 audit (2026-05-10); unblocked same-day by lifted pre-launch schema-pin policy.

---

### 42 · Tavern: pre-leveled hero candidates at higher cost (deferred)

- **What:** Tavern hires are always level-1 fresh recruits regardless of when in the run progression you visit. User suggested higher-level pre-leveled candidates appearing at proportionally higher cost.
- **Why:** Late-game Tavern hires are weak compared to surviving roster heroes; the pre-leveled-at-cost mechanic gives late-game players a meaningful Tavern decision. Not gdd-promised; pure feature suggestion.
- **Tier:** 3 (post-launch / Tier 3 feature)
- **Acceptance:**
  - **Needs brainstorming first** to define the level-rolling and cost-scaling rules.
  - Possible model: 10% chance per Tavern visit of a level-N candidate where N scales with player progression; cost = `HIRE_COST × N`.
  - Or: separate "Veteran Tavern" L4 building unlock that always rolls level-N candidates.
- **Touches:** `src/camp/buildings/tavern.ts` (candidate generation), `src/scenes/tavern_panel_scene.ts` (cost display per candidate), possibly `src/camp/building_levels.ts` (Tavern L4).
- **Source:** bugs.md (2026-05-01) — feature suggestion bundled with the Tavern reroll bug (split during scoping).

---

## Cluster D — Tier 3 content

Tier 3 scope from gdd §10. The Crypt is the only dungeon today; Tier 3 adds dungeons 2–4, unlock classes (Paladin, Hunter), unlock buildings (Chapel, Training Grounds), legendary tier, milestone achievements, level-10 perks, NG+. Most Tier 3 unlocks gate on first Sunken Keep clear, so Sunken Keep is the natural first task.

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

### 2 · Bespoke hat sprites (or rename items to existing frames)

- **What:** Resolve the placeholder `spriteId: '0'` for `hat_cap` ("Cap") and `hat_hood` ("Hood") in `BASE_ITEMS`. Two paths: (i) draw new "Cap" + "Hood" sprite frames and add them to `spritenames.txt`, or (ii) rename the items to match an existing head frame in the catalog (e.g., `hat_cap` → "Helmet" using `fullhelmet_1`; `hat_hood` → "Wizard Cowl" using `wizardhat_1`). Decision in brainstorming.
- **Why:** 2026-05-01 audit (Cluster C · 2 verification) found the head-frame catalog (`crown_*`, `fullhelmet_*`, `jesterhat_*`, `wingedhelmet_*`, `wizardhat_*`) contains no semantic match for "Cap" or "Hood." Outfits had direct matches in the existing catalog and were promoted to Cluster B · 31 (no new art needed); hats genuinely require either new art OR a content rename. The placeholder-guard from Cluster B · 17 keeps the current state safe but visually empty for hats.
- **Tier:** 1 (originally part of items foundation) — non-blocking now that placeholders work.
- **Acceptance:**
  - Decision in brainstorming: new art (≥2 frames: 1 cap + 1 hood; ideally with 2+ variants each for cosmetic distinction across rarities) OR rename the BASE_ITEMS entries to match existing frames (smallest blast radius, no new art).
  - **If new art:** `spritenames.txt` updated; `npm run generate:names` run; output committed. `hat_cap` and `hat_hood` in `src/data/items.ts` reference the new `SPRITE_NAMES.head.*` frames.
  - **If rename:** BASE_ITEMS `name` + `spriteId` fields both updated; verify the renamed strings read sensibly in the Equip panel + Stash UI + tooltip text. `baseId` keys in `BASE_ITEMS` may need a parallel rename for consistency (`hat_cap` → `hat_helmet` etc.) — assess save-schema impact in brainstorming.
  - Either way: placeholder-guard for these slots in `hero_loadout.ts` is no longer load-bearing (could be removed in a follow-up if both paths land).
- **Touches:** `public/assets/sprites/base_sprites.png` (if new art), `spritenames.txt` (if new art), `src/render/sprite_names.generated.ts` (regenerated if new art), `src/data/items.ts` (2 spriteId fields, possibly 2 name fields and/or baseId keys if rename).
- **Source:** Cluster A task 4 HISTORY entry (2026-04-27 · Gear rarity tiers + items foundation), refined by Cluster C · 2 verification (2026-05-01).

### 3 · Bespoke art for the Drowned King boss (high priority)

- **What:** Replace the placeholder `bossSprite: 0` (which reuses Bone Lich's frame) in `ENEMY_VISUALS.drowned_king` with a bespoke 32×32 sprite. Drowned-knight in armor with a crown silhouette per gdd §4 / spec-2 design.
- **Why:** Marquee art moment for tier 2. Until this ships, the Drowned King visually mirrors Bone Lich, undermining the "different boss, different fight" promise of spec 2.
- **Tier:** 3 (originally) — non-blocking now that placeholders work, but high priority within Cluster C.
- **Acceptance:**
  - New 32×32 frame added to `BOSS_SHEET`.
  - `ENEMY_VISUALS.drowned_king.bossSprite` updated to point at the new frame.
  - Optionally: keep `bodyScale: 2` for the same visual size as Bone Lich.
- **Touches:** `public/assets/sprites/boss_sprites.png`, `spritenames.txt` (if BOSS_SHEET frames are named), `src/render/enemy_sprites.ts`.
- **Source:** spec 2 (2026-05-06).

### 4 · Bespoke art for Sunken Keep minion bodies (lower priority)

- **What:** Replace placeholder `ENEMY_BODY` reuse in `ENEMY_VISUALS` for `drowned_knight`, `brine_crab`, `drowned_sailor`, `siren` with bespoke 16×16 sprites.
- **Why:** Sunken Keep currently shares enemy silhouettes with Crypt enemies (skeleton/zombie/cultist palettes). Drowned Knight and skeleton_warrior render visually identically (same body + sword). Bespoke art makes the dungeon visually distinct.
- **Tier:** 3 (originally) — non-blocking; placeholders work.
- **Acceptance:**
  - New `ENEMY_BODY` constants added (`drowned_knight`, `brine_crab`, `drowned_sailor`, `siren`) with new 16×16 frames in the enemy sheet.
  - `ENEMY_VISUALS` mappings updated to point at the new bodies.
  - Brine Crab in particular benefits from a non-humanoid silhouette (it's tagged `'beast'` but currently uses zombie body).
- **Touches:** `public/assets/sprites/enemy_sprites.png`, `src/render/enemy_sprites.ts`.
- **Source:** spec 2 (2026-05-06).
