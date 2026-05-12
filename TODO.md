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

## Cluster D — Tier 3 content

Tier 3 scope from gdd §10. The Sunken Keep cascade is fully shipped: Sunken Keep dungeon (Cluster D · 1, 2026-05-06), Paladin class (Cluster D · 3, 2026-05-06), Hunter class (Cluster D · 4, 2026-05-10), Chapel building (Cluster D · 5, 2026-05-11), Training Grounds building (Cluster D · 6, 2026-05-11), MAX_LEVEL bump + L10 perk tier (Cluster D · 7, 2026-05-12), Epic gear tier (Cluster D · 8, 2026-05-12). The remaining "legendary gear + L10 milestone" surface is broken down into entries 9-10 below. Future Tier 3 surface not yet scoped: dungeons 3-4 (Warren, Abyss), NG+ / Infinity mode, milestone achievements ("25 crits"), trait removal.

### 9 · Legendary tier + L10 milestone + named boss drops

- **What:** Add `'legendary'` rarity as the 5th tier. Author 4 hand-crafted named legendary items (2 per existing boss: Bone Lich, Drowned King) with fixed stats + a unique passive each. Wire a new milestone `first_hero_l10` that fires at the XP-grant site when any hero crosses L10; the milestone hard-gates legendary drops (pre-milestone, bosses drop a regular next-floor rarity-table roll; post-milestone, bosses drop one of their 2 named legendaries at random).
- **Why:** Marquee endgame reward; closes the gdd §9 "first hero reaches L10" milestone. Named legendaries are build-defining items that justify L10 leveling as a destination, not a treadmill.
- **Tier:** 3.
- **Acceptance:**
  - Depends on entries 7 (MAX_LEVEL=10) and 8 (Epic tier). Both must ship before this.
  - `Rarity` union includes `'legendary'`; `Item` shape extends with `legendaryId?: LegendaryId` and `legendaryPassive?: LegendaryPassiveId` (optional fields). Named items carry `legendaryId`; rarity = `'legendary'`; `affixes: []`; stats and passive looked up from a `LEGENDARY_DEFS` registry.
  - New `MilestoneId 'first_hero_l10'` registered in `src/run/milestones.ts`. Detection fires from the XP-grant code path in `run_state.ts` (both combat and surprise-combat paths) when any party hero crosses from <10 to ≥10. `SaveFile.unlocks.legendaryEnabled: boolean` flag (or `unlocks.rarities` array — pick during brainstorm).
  - 4 named legendaries authored: 2 themed to Bone Lich (Crypt), 2 themed to Drowned King (Sunken Keep). Each has slot, weaponType (if weapon), bespoke or reused sprite, fixed stats, and a unique passive that reuses entry 7's trigger/action palette.
  - Boss-drop substitution: at boss-loot resolution, if `unlocks.legendaryEnabled === true` AND the encounter is the dungeon's final boss, replace the loot roll with a random pick from `BOSS_LEGENDARIES[bossId]`. Otherwise normal loot table.
  - Random legendaries in non-boss content stay suppressed in this entry (entry 10 implements them).
  - UI rarity color (suggested: orange/gold); tooltip shows the named title + passive description.
  - Save migration: `unlocks.legendaryEnabled = false` added with default; idempotent.
- **Touches:** `src/data/types.ts`, `src/data/legendaries.ts` (new — registry + LegendaryPassiveDef table), `src/dungeon/loot.ts` (boss substitution), `src/run/milestones.ts`, `src/run/run_state.ts`, `src/save/save.ts` + migration, `src/combat/perk_hooks.ts` (legendary passives reuse the same hook system as L10 perks), tests.
- **Source:** Brainstorm 2026-05-12. Should brainstorm again before writing the plan — passive design for 4 named items + naming + flavor text deserves its own creative session.

### 10 · Random legendaries + curated unique-passive pool

- **What:** Allow legendaries to roll randomly from non-boss content (elite drops, chests, shops?) at low rate post-L10-milestone. Each random legendary rolls a unique passive from a curated `LEGENDARY_PASSIVE_POOL` (slot-restricted). Named-from-bosses (entry 9) and random-from-elsewhere are both available post-milestone.
- **Why:** Fills out the "legendaries appear in the loot pool" gdd §9 promise. Random legendaries give variance and reduce reliance on boss farming; the passive pool is its own creative palette distinct from named items.
- **Tier:** 3.
- **Acceptance:**
  - Depends on entry 9 (Item shape extension, milestone flag, hook system).
  - `LEGENDARY_PASSIVE_POOL: Record<ItemSlot, readonly LegendaryPassiveId[]>` — curated passives per slot. Each passive reuses entry 7's trigger/action palette (no new engine extensions).
  - Drop rate: post-milestone, ~1% on elite + chest loot. Probably suppressed on shops (paying gold for legendaries breaks the trade-off feel — confirm in brainstorm).
  - Random legendaries: `rarity = 'legendary'`, no `legendaryId`, has `legendaryPassive` rolled from `LEGENDARY_PASSIVE_POOL[slot]`. Affixes still roll (e.g., 3 affixes like an epic item) — passive is on top.
  - Tooltip displays the passive name + description; visually distinguishable from a named legendary (no special title, but legendary border).
- **Touches:** `src/dungeon/loot.ts`, `src/data/legendaries.ts` (passive pool table), tests.
- **Source:** Brainstorm 2026-05-12. Brainstorm-first before plan — passive pool curation is the creative work.

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
