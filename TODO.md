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

### 57 · Blacksmith rows pixui-ification (gated on tintable text or theme `selected` style)

- **What:** `blacksmith_panel_scene.ts` `buildUpgradeRow()` (lines ~283-358) and `buildSellRow()` (lines ~360-424) construct row chrome — background rectangle, name/affix/cost text, Upgrade/Sell button — entirely with raw Phaser `this.add.rectangle/.text/.existing` at absolute canvas coordinates rather than the pixui insert DSL. The item icon already uses `pixui.Image` correctly. The rest is intentional workaround.
- **Why:** Selection highlight requires per-row tinting of background fill (`0x2a2418` selected vs `0x1a1a1a`) and stroke (`0xffcc66` vs `0x222222`); cost-text colors flip on affordability (`#ffcc66` vs `#cc6666`); button bg/border/text all flip on canAfford. pixui's `TextArea` is `StyledComponent` (no `.internal`, no color tint), and pixui's theme has no `'selected'` button style yet (Cluster B · 48). Doing this in pixui today means dropping all three visual cues — meaningful UX regression for a sub-spec whose explicit goal was "no behavior changes." ShopOverlay's row pattern is achievable in pixui because it has none of these per-row tint needs.
- **Tier:** 2 (consistency cleanup; not blocking)
- **Acceptance:**
  - Triggered when ANY of: (a) Cluster B · 48 lands a `'selected'` button theme style usable for row backgrounds, (b) pixui exposes tintable text via a future `Renderable`-based label primitive, or (c) we extract a project-side `pixuiTintableText()` / `pixuiTintableRow()` helper.
  - Once a trigger fires: rewrite both row methods using `panel.insert.topLeft.frame(...)` row containers + pixui labels, matching ShopOverlay's row pattern.
  - Functional parity required — selection highlight, cost-affordability text color, and button-disabled visual must all remain visible after migration.
- **Touches:** `src/scenes/blacksmith_panel_scene.ts` (~140 LOC across two methods).
- **Source:** Cluster B · 45 sub-spec 3b spec compliance review (2026-05-07). Implementer chose raw Phaser as articulated workaround; reviewer flagged as partial migration; user accepted with this follow-up filed.

---

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

### 55 · `fixPixuiCanvasViewport` runtime sanity check + pixui version pin

- **What:** Two robustness improvements for `src/render/pixui_canvas_fix.ts`:
  - **(a) Runtime sanity check.** The fix monkey-patches pixui's private `_root._initialized` and `_root._children`. If pixui v0.3+ renames these fields or restructures the initialize state machine, the cast goes silent (`as unknown as` → `any` for missing fields) and the symptom is render-blank with no compile-time warning. Add a load-time check that `typeof internal._root._initialized === 'boolean'`; throw with a clear "pixui internals changed; pixui_canvas_fix.ts needs review" error if the assertion fails.
  - **(b) Version pin.** Verify `package.json` constrains `phaser-pixui` to `^0.2.x` (caret on a 0.x version pins to bug fixes only — minor bumps don't auto-apply). If currently `*` or unbounded, tighten.
- **Why:** Convert a latent fragility into an obvious load-time failure. pixui is a 0.x dep with a thin API surface; a minor bump that breaks our private-field reach would be very expensive to debug from a render-blank symptom alone.
- **Tier:** 2 (robustness; non-blocking until a real pixui upgrade scenario)
- **Acceptance:**
  - `pixui_canvas_fix.ts` throws a descriptive error if `_root._initialized` isn't a boolean (or other private-field assumptions don't hold).
  - `package.json` `phaser-pixui` constraint is `^0.2.1` (or whatever current; caret-on-0.x prevents minor bumps).
- **Touches:** `src/render/pixui_canvas_fix.ts`, `package.json`.
- **Source:** Cluster B · 45 sub-spec 3a Opus whole-impl review (2026-05-06).

---

### 54 · pixui `insert.left/right` origin gotcha — wrapper or doc

- **What:** pixui's `insert.left` returns origin `(Left, Center)` and `insert.right` returns `(Right, Center)`. The Center y-anchor means a y-offset like `y: 80` is from CANVAS CENTER (y=270 for our 540-tall canvas), not from canvas top. Hospital's `insert.left.frame({ y: 80, height: -80 })` rendered with bottom at y=580 — 40px past canvas bottom. Fixed by switching to `insert.topLeft` / `insert.topRight` (origin `(Left|Right, Top)`).
- **Why:** A real pixui API design pitfall. Sub-spec 3b (Blacksmith, ShopOverlay, CampNodeOverlay, TreasureRoomOverlay) and sub-spec 3c (Barracks, Equip, Expeditions, EventOverlay, PerkOverlay) will reach for `insert.left`/`right` naturally and re-discover the bug. Document or wrap before the next round of debugging.
- **Tier:** 2 (DX; prevents repeated re-discovery)
- **Acceptance:**
  - **Option A — Project-side wrapper.** Add `insertTopLeft` / `insertTopRight` helpers (or similar shape) in `src/render/pixui_canvas_fix.ts` (or new sibling file) that scenes call instead of pixui's `insert.left/right` for top-anchored layouts.
  - **Option B — Documentation.** Add a prominent comment block in `src/render/pixui_canvas_fix.ts` (or a notes file at `src/render/pixui_notes.md`) listing the API gotchas: `insert.left/right` origin, `insert.center.frame` y-offset semantics, `Container.attach` is append-only, `.internal` access pattern.
  - Decision in implementation: A or B based on whether wrapping pays off (probably B — cheaper, doesn't add an abstraction layer).
- **Touches:** `src/render/pixui_canvas_fix.ts`, possibly new `src/render/pixui_notes.md`.
- **Source:** Cluster B · 45 sub-spec 3a (hospital regression debug, 2026-05-06).

---

### 53 · PixuiHeroCard tooltip parity (wound-badge tap-to-toggle)

- **What:** Existing `HeroCard` (legacy Phaser implementation) has a wound-badge tap-to-toggle tooltip that shows wound details. `PixuiHeroCard` skips this — onPointerOver/onPointerOut are no-ops with a TODO comment. Tavern doesn't need it (fresh-hire candidates have no wounds), but Barracks (sub-spec 3c) does and will block on this work.
- **Why:** Without this tooltip, players in Barracks can't see wound details on a hero card (only the badge "🩸 N" is visible). Functional parity required before legacy `HeroCard` can be deleted in 3c.
- **Tier:** 2 (UX parity; required before sub-spec 3c Barracks migration)
- **Acceptance:**
  - PixuiHeroCard exposes a wound-badge widget when `hero.wounds.length > 0 && !isDead`.
  - Tap (or hover, depending on platform — match existing HeroCard's toggle behavior) shows tooltip with `WOUNDS[w.id].name — describeWoundEffect(...)` for each wound.
  - Tooltip rendering: reuse `createTooltip()` if practical (note: createTooltip requires a `Phaser.GameObjects.Container` parent for lifecycle binding — may need a transient scene-level parent since PixuiHeroCard is a pixui Container, not Phaser). Or build a pixui-native tooltip pattern (Frame + textArea anchored at scene root).
- **Touches:** `src/ui/pixui_hero_card.ts`, possibly `src/ui/tooltip.ts` (if signature needs adjustment to support non-Phaser-Container callers).
- **Source:** Cluster B · 45 sub-spec 3a Opus whole-impl review (2026-05-06). Implementer deferred during sub-spec 3a since Tavern doesn't surface the need.

---

### 52 · Cleanup stale boss_sprites_candidate_*.png in public/assets/sprites/temp/

- **What:** Remove the leftover `boss_sprites_candidate_*.png` files in `public/assets/sprites/temp/`. These predate the pixui adoption work but were noticed during the Cluster B · 45 sub-spec 2 whole-implementation review.
- **Why:** Dead files in a tracked directory cause confusion ("are these used? safe to delete?"). Each new contributor hits the same question.
- **Tier:** 2 (cleanup)
- **Acceptance:** Files deleted; verify no source code references them via grep before deletion.
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06).

---

### 51 · README + asset-pipeline docs update for pixui

- **What:** Update `README.md` to document the new asset layout (`assets/` root for pixui inputs, `public/packed_assets/` for build outputs), the `pixel-tools` Vite pipeline, and the Windows shim in `vite.config.ts`. Currently the README still describes the pre-pixui asset structure.
- **Why:** Fresh contributors will be confused by `assets/` (build-time inputs) vs `public/assets/` (existing game assets, served as-is) without an explanation. The Windows shim looks like dark magic without context.
- **Tier:** 2 (docs polish)
- **Acceptance:**
  - README section explains `assets/` (pixel-tools inputs, YAML-described, build-time-packed) vs `public/assets/` (existing game audio + Phaser spritesheets).
  - README references `vite.config.ts` and explains the Windows shim's purpose in 2-3 lines.
  - `vite/assets.mjs` gets brief field comments (one line per `source_path` / `destination_path` / `fonts` / `atlases`) for non-pixel-tools-familiar maintainers.
- **Touches:** `README.md`, `vite/assets.mjs`.
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

- **What:** pixui Frames are immutable, so hospital uses `scene.restart()` for every state change (hero selection, treat, upgrade). Each restart triggers full UI teardown + rebuild. Verify there's no perceptible lag, dropped frames, or memory growth under rapid clicking — particularly when the wounded list is at `LIST_MAX` and the player rapidly clicks through heroes + treats.
- **Why:** The architecture is "correct but expensive." Per-interaction full rebuilds may bite at scale or on lower-end devices. Worth quantifying before sub-spec 3 commits more panels to the same pattern.
- **Tier:** 2 (perf check; informs sub-spec 3 strategy)
- **Acceptance:**
  - Manual test: Open hospital with 6 wounded heroes. Rapidly click between heroes for 30s. Observe FPS counter (Phaser dev tools or browser perf panel). Verify no drops below 30fps, no growing memory.
  - If perf is fine: file a HISTORY-style note confirming.
  - If perf is bad: brainstorm in-place update strategy or cap restart frequency. May influence sub-spec 3's "should we keep using pixui everywhere?" decision.
- **Touches:** none (measurement task; results may trigger follow-up code change).
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06).

---

### 48 · pixui `selected` button style + remove dead branch

- **What:** Hospital's wounded-hero list passes `style: isSelected ? 'selected' : undefined` on each row button (`hospital_panel_scene.ts:118`-ish). The pixui theme has no `'selected'` style entry, so pixui silently falls back to the default — no visual selection indicator renders. Either:
  - **(A)** Add a `selected` style to `ui_theme.ts` (e.g., gold-outlined variant of the default button frame) so selection actually renders.
  - **(B)** Remove the `style: isSelected ? ...` branch entirely and rely on the inline comment to explain why selection isn't visualized.
- **Why:** Currently this is dead code that LOOKS like a working selection highlight. A maintainer reading the file will assume selection is visualized; debugging "why doesn't selected hero glow?" wastes time.
- **Tier:** 2 (UX polish + code clarity)
- **Acceptance:**
  - Decision in implementation: A (add style + theme entry) or B (remove branch).
  - If A: themed selected style renders distinctly from default; visible across all pixui list-button consumers (sub-spec 3 panels too).
  - If B: branch removed, inline comment explains intentional gap.
- **Touches:** `src/scenes/hospital_panel_scene.ts`, `src/render/ui_theme.ts` (if A).
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06).

---

### 47 · pixui theme palette to match game's gold/dark-gray identity

- **What:** Current `ui_theme.ts` adopts pixui example's `mana_soul` palette as-is: cream (`0xfbe4af`) / dark blue (`0x111343`) / cyan (`0x7bb6bc`). Our game's existing palette is gold (`#ffcc66`) accent on dark gray (`#222222`) panel. Hospital now looks visually distinct from Tavern/Barracks/Blacksmith/etc. — jarring for a player opening multiple panels in one camp session.
- **Why:** Visual consistency. Pixui's palette is used as tints over the sprite art; the underlying mana_soul art is themed (blue gradient frames, gold curly accents) so the color shift is more nuanced than just "switch hex codes." May require either custom theme tints or a visual-design judgment call about which palette to standardize on.
- **Tier:** 2 (visual polish)
- **Acceptance:**
  - Decision in implementation: retheme pixui to match existing game (gold/dark-gray) OR commit to mana_soul palette across the whole game (means migrating Tavern/Barracks/etc. visuals too).
  - If rethemed: hospital looks visually consistent with Tavern when opened back-to-back.
  - May reveal sprite-art constraints (mana_soul art is hardcoded blue frames; tinting can recolor but shape stays).
- **Touches:** `src/render/ui_theme.ts`. Possibly `assets/ui.yaml` if sprite swaps are needed.
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06).

---

### 46 · Hospital wounded list pagination / overflow indicator

- **What:** `hospital_panel_scene.ts` caps the wounded list at `LIST_MAX = 6`. With 7+ wounded heroes, the rest are silently dropped — no scrollbar, no "+N more" indicator. Combined with the pixui no-selection-highlight regression (Cluster B · 48), a player can't tell if/which heroes are missing.
- **Why:** Real UX bug at the edge case. Late-game with many heroes wounded across runs, the player may be unable to access some of them via the hospital UI.
- **Tier:** 2 (UX bug)
- **Acceptance:**
  - Either pagination (matching blacksmith's pattern from sub-spec 1 era) OR a visible "+N more" text row when `wounded.length > LIST_MAX`.
  - Pagination preferred for parity with other panels; but pixui's `insert` DSL may not have a clean pagination primitive — implementer evaluates.
  - Cap-edge state: when exactly `LIST_MAX` heroes are wounded, no overflow indicator should appear.
- **Touches:** `src/scenes/hospital_panel_scene.ts`.
- **Source:** Cluster B · 45 sub-spec 2 whole-impl review (2026-05-06).

---

### 45 · Migrate UI to phaser-pixui library — sub-spec 3c remaining

- **What:** Cross-cutting UI refactor adopting [phaser-pixui](https://github.com/skhoroshavin/phaser-pixui). Decomposed into three sub-specs at brainstorm time; first two complete, third decomposed further at the 2026-05-06 sub-spec-3 brainstorm. After 3b (2026-05-07), 6 of 11 panels run on pixui; only HeroCard-dependent panels remain.
- **Why:** Hand-rolled Phaser primitives produced systemic layout bugs (Cluster B · 44) and 60+ duplicated widget chains across panels. pixui provides a sprite-themed widget framework + asset pipeline. Path D chosen for the final migration: re-implement Paperdoll/HeroCard as pixui Container compositions so all panels can use one uniform pattern.
- **Tier:** 2 (UX infrastructure)
- **Status (2026-05-07):**
  - **Sub-spec 1 — Layout helpers + blacksmith migration: ✓ DONE.** See [HISTORY](HISTORY.md). Built `src/render/panel_layout.ts`; migrated blacksmith. After 3b, helpers have zero consumers — clean retirement candidate for 3c cleanup.
  - **Sub-spec 2 — pixui Hello-World on hospital: ✓ DONE.** See [HISTORY](HISTORY.md). Added pixui + pixel-tools, asset pipeline, Windows shim, theme module, hospital migrated. 7 follow-ups filed (Cluster B · 46–52).
  - **Sub-spec 3a — Foundation + Tavern PoC: ✓ DONE.** See [HISTORY](HISTORY.md). Extracted `fixPixuiCanvasViewport()`; built `PixuiPaperdoll` + `PixuiHeroCard`; migrated Tavern. Discovered + fixed scene.restart() viewport corruption and `insert.left/right` origin gotcha. 4 follow-ups filed (Cluster B · 53–56).
  - **Sub-spec 3b — Easy panels (no HeroCard): ✓ DONE (uncommitted).** See [HISTORY](HISTORY.md). Migrated TreasureRoomOverlay, ShopOverlay, CampNodeOverlay, Blacksmith. Validated `pixui.Dialog` (sell-confirm) and inline `pixui.Image` for item icons. `panel_layout.ts` orphaned. 1 follow-up filed (Cluster B · 57 — Blacksmith rows kept raw Phaser pending tintable-text support).
    - **Working-tree state at handoff (2026-05-07):** 4 modified files in `src/scenes/` (treasure_room_overlay_scene.ts, shop_overlay_scene.ts, camp_node_overlay_scene.ts, blacksmith_panel_scene.ts) — typecheck clean, 1730/1730 tests pass, spec compliance ✓ (one Blacksmith row finding accepted as workaround). Code-quality review and manual browser smoke of the 4 panels both still pending; user wraps these before commit.
  - **Sub-spec 3c — Remaining HeroCard panels + cleanup: ⏳ NEXT.** Migrate Barracks (HeroCard + paperdoll detail), Equip (Paperdoll + slot strip), Expeditions (HeroCard formation), EventOverlay (HeroCard), PerkOverlay (Paperdoll). Plus retire `panel_layout.ts` and legacy `paperdoll.ts` / `hero_card.ts` once their consumers migrate. Final README polish. Gated on Cluster B · 53 (PixuiHeroCard tooltip parity) before Barracks. Estimated ~3-5 days.
- **Acceptance:**
  - All 11 panel scenes (Hospital ✓, TreasureRoomOverlay ✓, ShopOverlay ✓, CampNodeOverlay ✓, Blacksmith ✓, Tavern ✓, Barracks, Equip, Expeditions, EventOverlay, PerkOverlay) extend `UiScene` and use pixui `insert` DSL + theme.
  - `PixuiPaperdoll` and `PixuiHeroCard` exist as reusable pixui Container compositions.
  - Sub-spec 1's `panel_layout.ts` retires (zero consumers after 3b); legacy `paperdoll.ts` / `hero_card.ts` retire once 3c finishes.
  - The follow-ups in Cluster B · 46–57 are addressed inline during 3c or filed forward.
- **Source:** `ideas.md` #5 (2026-05-06); brainstorm specs in `docs/superpowers/specs/`. Combat / Dungeon / Corridor scenes are out of scope (not panel-shaped).

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
