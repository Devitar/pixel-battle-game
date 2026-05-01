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

### 29 · Building level upgrades

- **What:** Add L2/L3 progression for the camp buildings per gdd §6's table. Tavern: L1=3 candidates, L2=4, L3=5 + better trait odds. Barracks: L1=12 slots, L2=16, L3=20. Blacksmith: L1=common→uncommon, L2=+uncommon→rare, L3=+rare→epic (epic-tier itself is a separate Tier-3 unlock). Hospital: L1=1 wound/run cheap, L2=2, L3=3 + faster time-heal.
- **Why:** Today every building is conceptually L1; gdd §6 promises a meta-progression ladder that the gold economy is missing. Closes a real gold-sink gap (currently nothing to spend banked vault gold on past mid-game beyond Tavern hires + Hospital + Blacksmith upgrades). Each level upgrade is a meaningful long-term decision target.
- **Tier:** 2
- **Acceptance:**
  - Each building has a `level: 1 | 2 | 3` field in save state. Save schema bump + migration path (default missing → 1).
  - Camp scene shows an "Upgrade" affordance per building — cost, what unlocks, disabled when at max level or insufficient gold.
  - **Tavern L2/L3:** show 4/5 candidates per visit. Trait-odds tuning is a separate sub-task (or defer — base impl ships level-based candidate counts only).
  - **Barracks L2/L3:** roster cap 16/20. Slot grid scales (current 2-column × 6-row → 2×8 → 2×10). Verify Barracks panel layout still fits 460×220 detail pane and 380×360 list pane at 20 slots.
  - **Blacksmith L2/L3:** L1 only allows common→uncommon. L2 unlocks +uncommon→rare. L3 unlocks +rare→epic (epic rarity is itself a separate task — defer this sub-bullet until epic exists).
  - **Hospital L2/L3:** treat 2/3 wounds per visit (current UX treats one at a time; L2/L3 either changes the picker to multi-select or just removes the one-per-visit cap).
  - Single tunables file (likely `src/camp/building_levels.ts`) holds upgrade costs + unlock metadata.
- **Touches:** `src/camp/buildings/*`, `src/scenes/camp_scene.ts`, `src/scenes/tavern_panel_scene.ts`, `src/scenes/barracks_panel_scene.ts`, `src/scenes/hospital_panel_scene.ts`, `src/scenes/blacksmith_panel_scene.ts`, `src/save/*`, new `src/camp/building_levels.ts`.
- **Source:** gdd §6 (per-building upgrade column).

### 31 · Wire up outfit sprites (no new art needed)

- **What:** Replace the placeholder `spriteId: '0'` entries in `BASE_ITEMS` for `outfit_cloth` and `outfit_leather` with real frame names from `SPRITE_NAMES.torso.*`. The catalog already contains `clotharmor_*` (6 colors × 3 tiers, 18 frames) and `leatherarmor_tier1-5` (5 frames) — direct visual matches for "Cloth Robes" and "Leather Tunic." No new art needed.
- **Why:** Cluster A · 4 (Gear rarity tiers) HISTORY noted `'0'` placeholders shipped because "no bespoke frames existed yet" — but the 2026-05-01 audit (Cluster C · 2 verification) found the outfit frames DO exist in `spritenames.txt` and just need referencing. Currently the placeholder-guard in `hero_loadout.ts` (added by Cluster B · 17) safely skips the layer for outfits, so heroes wearing equipped cloth/leather outfits render as if no outfit equipped — a real visual gap with a free fix. (Hats remain a Cluster C art task — no semantic match in the catalog for "Cap" or "Hood.")
- **Tier:** 2 polish
- **Acceptance:**
  - `outfit_cloth` in `src/data/items.ts` references a real `SPRITE_NAMES.torso.clotharmor_*` frame (e.g., `String(SPRITE_NAMES.torso.clotharmor_blue1)`); pick a frame whose color reads cleanly with the existing hero body palettes.
  - `outfit_leather` references `String(SPRITE_NAMES.torso.leatherarmor_tier1)` (or another tier — common-rarity item suggests tier 1).
  - The two outfit variants are visually distinguishable when rendered on a hero (verify by spawning a Knight + outfit_cloth and a Knight + outfit_leather in the explorer dev scene OR via Equip panel + paperdoll preview).
  - The placeholder-guard in `hero_loadout.ts` continues to work for the still-placeholder hats — verify by inspection that `'0'` still maps to "skip layer."
  - tsc + tests + build green; no test count change.
- **Touches:** `src/data/items.ts` (2 spriteId fields), possibly verify `src/render/hero_loadout.ts` placeholder guard.
- **Source:** Cluster C · 2 verification (2026-05-01) — outfit half of the original task; hats split out to a slimmer Cluster C entry.

### 30 · Brainstorm + ship dungeon travel impact

- **What:** Per ideas.md #3 — make travel between dungeon rooms non-instant and meaningful. Walking animation (heroes bob between nodes), a low-% chance of surprise encounters (combat/event/merchant) every quarter-step, passive HP changes during travel (heal if healthy, take damage if wounded/sick), hero chatter snippets for charm.
- **Why:** Today the dungeon scene is essentially a hub between combat/shop/event screens — almost all of the play experience IS the combat scene. Adding travel beats spreads the play surface, opens room for charm and personality, and gives the dungeon its own atmosphere distinct from combat.
- **Tier:** 2 polish (scope-dependent; could touch Tier 3 if surprise-encounter system is broad).
- **Acceptance:**
  - **Needs brainstorming first** — the idea is a paragraph in `ideas.md #3`; design pass should decompose into discrete sub-tasks. Likely sub-tasks:
    - Walking animation (visual): hero bob/sway tween between current and next node icon.
    - Travel-time pacing (scene state machine): non-zero transition delay; player can fast-forward.
    - Surprise-encounter mechanic (RNG + node-injection logic): low-% per quarter-step, draws from combat / merchant / event pools.
    - Passive HP changes: per-step heal/damage modeled on hero condition (wounds, statuses).
    - Hero chatter: text snippets + display widget. Could be its own task.
  - Some sub-tasks likely warrant their own brainstorms (especially surprise-encounter mechanic — what's the encounter pool? how do node graphs handle injected nodes?).
- **Touches:** `src/scenes/dungeon_scene.ts`, `src/dungeon/*` (encounter draws), `src/data/events.ts` (potentially), new chatter data module.
- **Source:** ideas.md #3.

---

## Cluster D — Tier 3 content

Tier 3 scope from gdd §10. The Crypt is the only dungeon today; Tier 3 adds dungeons 2–4, unlock classes (Paladin, Hunter), unlock buildings (Chapel, Training Grounds), legendary tier, milestone achievements, level-10 perks, NG+. Most Tier 3 unlocks gate on first Sunken Keep clear, so Sunken Keep is the natural first task.

### 1 · Sunken Keep (2nd dungeon)

- **What:** Build the second-tier dungeon per gdd §4 — flooded castle theme, 4 nodes per floor (currently The Crypt has 3-floor runs; verify floor structure semantics), drowned knights + sea-beasts enemy pool, themed boss.
- **Why:** Marquee Tier 3 task. Activates Tier 2 infrastructure that's been waiting for a 2nd dungeon to become meaningful (tier label deferred from B · 18; signature-enemy preview comparison; modifier visibility across new enemies). Unlocks the downstream Tier 3 cascade — Paladin class (gates on first Crypt clear, but the milestone-unlock plumbing doesn't exist yet); Chapel + Training Grounds + Hunter class (gate on first Sunken Keep clear).
- **Tier:** 3
- **Acceptance:**
  - **Needs decomposition during brainstorming** — likely sub-tasks:
    - **Pre-task:** add `tier` field to `DungeonDef` + render in Expeditions card (deferred from B · 18 HISTORY — explicitly noted as "land it together with the 2nd dungeon when tier 1 vs tier 2 becomes meaningful").
    - **Data layer:** dungeon def, 4 minion enemies + 1 boss with stats / abilities / preferred slots / tags. Boss is bespoke (32×32 frame per `BOSS_SHEET` pattern).
    - **Balance:** scaling tweaks per gdd §5 — richer loot pool, gold multiplier, steeper scaling rate. May need a `tier` parameter threaded through `rollLoot` / `pickRarity` / `floorScale`.
    - **Art:** new enemy + boss sprites in `spritenames.txt`, regenerate, update `enemy_sprites.ts` visual mappings. Could ship with placeholders initially per Cluster C precedent.
    - **Milestone-unlock plumbing:** event-emit + handler for "first Crypt clear" and "first Sunken Keep clear" — currently no infrastructure exists for this. May warrant its own task.
  - Per gdd §4: 4 nodes per floor (verify whether "floor length" in current `DungeonDef.floorLength` field means nodes-per-floor or floors-per-run; the Crypt has `floorLength: 3` and the dungeon scene shows 3 floors per run).
  - Boss visually distinguishable, themed (sea-creature / drowned knight silhouette per gdd §4).
- **Touches:** `src/data/dungeons.ts`, `src/data/types.ts` (`DungeonDef.tier`), `src/data/enemies.ts`, `src/data/abilities.ts`, `src/dungeon/*` (scaling), `spritenames.txt` + `npm run generate:names`, `src/render/enemy_sprites.ts`, `src/scenes/expeditions_panel_scene.ts` (tier label render), possibly new `src/run/milestones.ts` for unlock plumbing.
- **Source:** gdd §4 (dungeon table) + §5 (tier-scaling) + §9 (milestone unlocks).

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
