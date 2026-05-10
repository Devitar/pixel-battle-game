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

Tier 3 scope from gdd §10. Sunken Keep (Cluster D · 1, 2026-05-06) and Paladin (Cluster D · 3, 2026-05-06) shipped; the Crypt-clear → Paladin/Sunken-Keep cascade is wired. Entries below are the **first-Sunken-Keep-clear cascade** (Hunter + Chapel + Training Grounds, gdd §9), plus future Tier 3 surface (dungeons 3-4, legendary gear, level-10 perks, NG+) that hasn't been broken down yet.

### 4 · Hunter class — second unlockable

- **What:** Add the Hunter class (gdd §3 row 7): ranged + beast pet, prefers slot 3, sword/spear, primary stat Attack. Bonds with a pet that occupies slot 4 and acts on its own AI priority. Unlocks via the existing milestone-unlock infrastructure on first Sunken Keep clear, mirroring how Paladin (Cluster D · 3) unlocks on first Crypt clear.
- **Why:** First class unlock gated on tier-2 dungeon clear. Completes the "every dungeon clear unlocks a class" pattern through tier 2 (Crypt → Paladin already shipped; Sunken Keep → Hunter). Per gdd §9 meta-progression, first Sunken Keep clear unlocks Hunter + Chapel + Training Grounds + Sunken Keep gear tier; this is one leg of that triple.
- **Tier:** 3
- **Acceptance:**
  - **Needs brainstorming + spec first.** The pet system is the single biggest design risk — gdd §11 flags auto-battler AI priorities as the highest-leverage piece, and Hunter introduces a *separate* AI actor that occupies a party slot. Spec must address: pet stats (HP/attack/etc.), pet abilities, slot-4 occupation rules (does it count toward party-size 3?), target eligibility (pet as ally for heals/buffs?), pet death (Fallen / Lost? respawn? cooldown?), pet+Hunter formation interaction.
  - Reuse Paladin's milestone-handler pattern: extend or add a `first_sunken_keep_clear` handler that appends `'hunter'` to `unlocks.classes` (idempotent, mirroring Paladin's `first_crypt_clear` handler shape).
  - Hunter's abilities (3-4 + universal basic) defined in `data/abilities.ts`. Pet behavior likely needs a new system in `combat/` for "secondary actor with own AI."
  - Spec doc + plan + implementation, mirroring `docs/superpowers/specs/2026-05-06-paladin-class-design.md` structure.
- **Touches:** `src/data/{classes,abilities,perks}.ts`, `src/run/milestones.ts` (handler), `src/data/types.ts` (ClassId, MilestoneId widening), `src/combat/` (pet-actor system — new files likely), `src/heroes/hero.ts` (if pet state lives on hero), tests in lockstep across all of the above.
- **Source:** gdd §3 (class table — note: §3 says "first Warren clear" but §9 meta-progression says "first Sunken Keep clear"; §9 is canonical per the Paladin precedent — file a fix to gdd §3 row 7 alongside this work). Cluster D blurb placeholder.

---

### 5 · Chapel building — trait removal

- **What:** Add the Chapel camp building (gdd §6 row 6): L1-only (no tier progression), single function — remove a Trait from a hero for an expensive gold cost. Unlocks via the same `first_sunken_keep_clear` handler as Hunter and Training Grounds.
- **Why:** Trait removal is the player-facing utility for first Sunken Keep clear, alongside Hunter and Training Grounds. Lets the player escape negative traits on otherwise-promising heroes — a meaningful tool in the Tier 3 economy. Mechanically the simplest of the three Sunken Keep-gated unlocks (no candidate generation, no roll mechanics, no progression tiers).
- **Tier:** 3
- **Acceptance:**
  - **Needs brainstorming first** to define the gold cost (gdd says "expensive"; should balance against re-rolling via retire-and-rehire path) and the UI (hero picker → trait list → confirm dialog).
  - New camp scene: `chapel_panel_scene.ts`. Pattern can mirror Hospital's structure (list of heroes with traits + detail pane + confirm action) but simpler since there's no per-hero state to manage.
  - New `removeTrait(hero, ...)` data-layer function in `src/camp/roster.ts` or `src/heroes/hero.ts`.
  - Camp scene gets a new chapel tile that's hidden until the milestone fires (extend the milestone handler to also reveal the Chapel building entry alongside `unlocks.buildings`).
  - `BuildingId` widens to include `'chapel'`; `BuildingLevels` shape changes (Chapel is L1-only, may not need a level entry — design decision).
  - Save schema bump if `BuildingLevels` shape changes; mirror `MIGRATIONS[1]` pattern from Cluster B · 58.
- **Touches:** `src/scenes/chapel_panel_scene.ts` (new), `src/scenes/camp_scene.ts` (new tile), `src/camp/buildings/chapel.ts` (new), `src/camp/roster.ts` or `src/heroes/hero.ts` (removeTrait function), `src/run/milestones.ts` (extend handler), `src/save/save.ts` + `src/save/migration.ts` (if schema bumps), `src/data/types.ts` (BuildingId widening, possibly Unlocks shape).
- **Source:** gdd §6 (buildings table) + §9 (meta-progression). Cluster D blurb placeholder.

---

### 6 · Training Grounds building — passive XP for benched heroes

- **What:** Add the Training Grounds camp building (gdd §6 row 7): benched heroes assigned to trainee slots gain pro-rated XP from every completed run. L1-3 progression: L1=2 slots / 25% / L2=3 / 40% / L3=4 / 55%. XP awarded on both cashout AND wipe (wipe pays less per gdd). Unlocks via the `first_sunken_keep_clear` handler.
- **Why:** Solves the "benched heroes lag behind" problem — players keep an extended roster only if there's a reason to invest in non-active heroes. Makes the Tavern → Barracks → expedition path more meaningful for backups. Most mechanically novel of the three Sunken Keep-gated unlocks (introduces a new XP-economy channel).
- **Tier:** 3
- **Acceptance:**
  - **Needs brainstorming first** to nail down the XP math: "pro-rated against what an active hero of the same level would have earned on that run, so deep runs train better" (gdd §6) — spec must define the calculation (sum of XP earned by an active hero of matched level across all completed nodes? Just the boss node? Per-floor?), the wipe-pays-less rate, and the trainee slot management UI.
  - New camp scene: `training_grounds_panel_scene.ts` for trainee-slot assignment (pick hero → assign to slot, similar to Expeditions's party-slot picker).
  - Run-completion hook: `cashout` and `wipe` paths in `run/run_state.ts` need to compute trainee XP gain alongside their existing logic.
  - Trainee-slot state lives in `SaveFile` (new field, e.g., `traineeHeroIds: readonly string[]` capped at building level). Schema bump required.
  - `BuildingId` widens to include `'training_grounds'`; `BuildingLevels` already supports tiers via existing pattern (Tavern/Barracks/Blacksmith/Hospital all 1-3).
  - Camp scene gets a new training-grounds tile, hidden until the milestone fires.
- **Touches:** `src/scenes/training_grounds_panel_scene.ts` (new), `src/scenes/camp_scene.ts` (new tile), `src/camp/buildings/training_grounds.ts` (new), `src/camp/building_levels.ts` (training_grounds tier costs), `src/run/run_state.ts` (XP gain hook in cashout/wipe), `src/save/save.ts` + migration (schema bump for traineeHeroIds), `src/data/types.ts` (BuildingId), `src/run/milestones.ts` (extend handler).
- **Source:** gdd §6 (buildings table) + §9 (meta-progression). Cluster D blurb placeholder.

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
