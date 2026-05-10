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

### 56 · Tavern RNG seeding audit — replace `createRng(Date.now())`

- **What:** `tavern_panel_scene.ts:51, 158, 178` use `createRng(Date.now())` for hire-replacement and reroll candidate generation. This is determinism-hostile (rerolling the same frame twice can give identical candidates if `Date.now()` resolution permits) and may diverge from how the rest of the codebase seeds RNG.
- **Why:** Determinism matters for save-load consistency (in-progress runs that depend on RNG outputs) and for testing. The original Phaser-based Tavern may have used a different seeding approach; the pixui rewrite carried `Date.now()` forward without auditing.
- **Tier:** 2 (correctness)
- **Acceptance:**
  - Audit how the rest of the codebase seeds RNG for camp-side actions (`@util/rng.ts`, save state, etc.). Look for a project-canonical pattern.
  - If the project uses `state.rngSeed` or similar persisted seed, Tavern should too — replace `Date.now()` with the canonical source.
  - If the project uses ad-hoc seeding everywhere (the existing pattern), confirm Tavern is consistent and document the rationale.
- **Touches:** `src/scenes/tavern_panel_scene.ts` (3 call sites). Possibly `@util/rng.ts` if a new `createCampRng()` helper is justified.
- **Source:** Cluster B · 45 sub-spec 3a Opus whole-impl review (2026-05-06).

---

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
