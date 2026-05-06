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

### 1 · Sunken Keep — Spec 2: content + art + first-Crypt-clear handler

- **What:** Drop in the Sunken Keep dungeon now that spec 1's plumbing landed (2026-05-05 HISTORY). All foundation work is done: `DungeonTier`, multi-dungeon Expeditions UI with locked-card path, tier-aware balance, milestone registry. Spec 2 is strictly additive content.
- **Why:** Activates the Tier 3 cascade. First Sunken Keep clear gates Hunter, Chapel, Training Grounds, and the Sunken Keep gear tier (gdd §9). First Crypt clear unlocks Sunken Keep — handler ships in this spec.
- **Tier:** 3
- **Acceptance** (additive — no refactors needed):
  - Add `'sunken_keep'` to the `DungeonId` union in `src/data/types.ts`.
  - Add `DUNGEONS['sunken_keep']` entry in `src/data/dungeons.ts`: `tier: 2`, `floorsPerRun: ?`, `rowsPerFloor: ?` (pick density carefully — the Phase 2b quota generator depends on row count), `enemyPool`, `bossId`, `unlockRequirement: 'Defeat the Bone Lich'`.
  - Add 4 minion `EnemyId`s + 1 boss `EnemyId` to `src/data/types.ts`, definitions to `src/data/enemies.ts`, sprite mappings to `src/render/enemy_sprites.ts`. Boss is bespoke 32×32 per `BOSS_SHEET` pattern.
  - Pick real values for `TIER_SCALING_SLOPE[2]`, `TIER_RARITY_FLOOR_BONUS[2]`, `TIER_GOLD_MULTIPLIER[2]` in `src/dungeon/scaling.ts` and `src/dungeon/loot.ts`.
  - Pick the per-tier color palette for the tier badge in `src/scenes/expeditions_panel_scene.ts` (currently a placeholder).
  - Add `'first_crypt_clear'` to `MilestoneId` in `src/data/types.ts`.
  - Register `MILESTONES['first_crypt_clear']` handler in `src/run/milestones.ts` that adds `'sunken_keep'` to `state.unlocks.dungeons` (idempotent — checks first).
  - Update `detectBossMilestones` body: `if (dungeonId === 'crypt' && floorNumber === DUNGEONS.crypt.floorsPerRun) return ['first_crypt_clear']`.
  - Art can ship with placeholders initially per Cluster C precedent; bespoke sprites are Cluster C follow-up.
- **Touches:** `src/data/types.ts`, `src/data/dungeons.ts`, `src/data/enemies.ts`, `src/data/abilities.ts` (new boss/minion abilities), `src/dungeon/scaling.ts`, `src/dungeon/loot.ts` (tier-2 numbers), `src/render/enemy_sprites.ts`, `src/run/milestones.ts`, `spritenames.txt` + `npm run generate:names` (for art).
- **Source:** spec 1 ships at `docs/superpowers/specs/2026-05-05-sunken-keep-foundation-design.md` (Hand-off to spec 2 section). gdd §4 (dungeon table) + §5 (tier-scaling) + §9 (milestone unlocks).

### 2 · Display-vs-credit mismatch for elite gold in result panel (pre-existing)

- **What:** `corridor_scene.ts:1090` displays `COMBAT_NODE_REWARD × floor` (= 15 × floor) for non-boss combat, including elite nodes. But `completeCombat` actually credits `ELITE_NODE_GOLD × floor` (= 30 × floor). Result panel UI under-reports elite gold.
- **Why:** Surfaced during spec 1's Task 6 review (corridor_scene preview was being threaded with `goldMultiplier`). Fix is small but out of scope for spec 1 (pre-existing, unrelated to tier work).
- **Tier:** 2 (UI/UX bug)
- **Acceptance:**
  - Result-panel reward calc branches on `elite` separately, using `ELITE_NODE_REWARD` (define a const matching `ELITE_NODE_GOLD` in run_state.ts, or import from there).
  - Spot-check that the duplicated `COMBAT_NODE_REWARD`/`BOSS_NODE_REWARD` constants in corridor_scene.ts vs the `*_NODE_GOLD` originals in run_state.ts are kept in sync (or deduplicated by importing from one source — the cleaner fix).
- **Touches:** `src/scenes/corridor_scene.ts`.
- **Source:** spec 1 Task 6 quality review (2026-05-05).

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
