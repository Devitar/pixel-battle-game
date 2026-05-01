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
