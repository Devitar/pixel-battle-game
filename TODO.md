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

### 30 · Map-based dungeon scene (Slay-the-Spire-inspired)

- **What:** Replace the current dungeon scene's icon-row + party-walk-right hub layout with a map-based interface. The map IS the scene: heroes occupy nodes on a per-floor graph; the player picks the next node by clicking. Cartographer-style fog-of-war hides far-future content; the map grows as the party explores. Subsumes the prior #30 framing (travel impact) and absorbs the former #38 (icon-row fog-of-war), #39 (travel animation), and #46 (loot rooms + linear variance) as phases of this redesign.
- **Why:** Today's dungeon scene has structural problems (icon-row silently picks branch 0 at forks, lies about topology, reveals all future node types) AND lacks gameplay depth (linear preamble, no real exploration tension). The map paradigm fixes the visualization honestly while delivering on the gdd's "Expeditions" / Notice-Board fiction — heroes are a charting party going into the unknown. The cartographer-fog framing means the map records where you've been + a small visible horizon ahead, not a strategic-planning surface; player agency is "discover and choose" rather than "plan optimal path."
- **Tier:** 2 polish (multi-session redesign; some phases may touch Tier 3 if surprise-encounter content grows).
- **Locked design** (brainstormed 2026-05-02):
  - **Q1 — Map scope:** per-floor (3 maps per Crypt run, one per floor). Preserves the gdd §7 press-on/cashout decision between bosses; smallest run-state churn.
  - **Q2 — Visibility:** layered fog with **N=2 lookahead, total fog beyond, unanchored boss**. Past nodes stay revealed (cartographer log). Current row + 2-row lookahead show types. Beyond is blank space — no nodes, no edges. Boss is discovered when within N rows; not anchored at the end.
  - **Q3 — Density:** scaled by floor depth — Floor 1: 8 rows, Floor 2: 9 rows, Floor 3: 10 rows. 1–3 active nodes per row. Single boss terminal. ~12–15 nodes per floor; player path is 8–10 nodes.
  - **Q4 — Path constraints:** StS-strict edges. Each node has explicit predecessors; player can only move along edges. Generator rules: every node has ≥1 outgoing edge to next row (except boss); every node ≥1 incoming edge from prev row (except start); edges don't cross (visual cleanliness).
  - **Q5 — Layout:** horizontal, fits-on-screen. Rows go left-to-right (matches existing "party walks right" framing). Floor 3's 10 rows × ~90px = 900px wide → fits 960px viewport. No scroll.
  - **Q6 — Node distribution** (averages, generator-tunable): Combat ~55%, Elite ~10%, Shop 1/floor, Camp 1/floor, Treasure 1–2/floor, Event 1–2/floor, Boss = 1 terminal. Generator rules: first row combat-only (no shop-rush); no two same-type nodes adjacent within a row; no same-type nodes back-to-back along a path; penultimate row offers at least one camp or treasure (StS-style "rest before boss" cadence).
  - **Q7 — Surrounding chrome:** HUD top unchanged (floor number left, vault/pack gold right). Heroes shown as a small group indicator at their current node on the map. Status bar bottom unchanged (HP + wound badges). Old 4-slot icon row removed.
- **Acceptance:** decomposes into shippable phases, each leaving the game in a working state:
  - **Phase 1 — Map renderer scaffold.** ✅ *Shipped 2026-05-02 (see HISTORY).* Render the existing `currentFloorNodes` as an interactive graph (StS-strict edges, horizontal layout) instead of the icon row. Click a connected next-row node to advance. Heroes at their current node. Keep today's simple floor generator. The fork-picker glyph bug (former #38 sub-task) gets eaten here — the picker IS the map. *Result: visually transformed, functionally similar.*
  - **Phase 2 — Floor generator richness.** Generate 8/9/10-row floors with mixed node-type distribution per Q6, including the new treasure node type (former #46 data layer + fork shapes + linear variance + treasure-room UI all land here). *Result: the map has shape.*
  - **Phase 3 — Fog-of-war.** Implement Q2 (N=2 lookahead, total fog beyond, unanchored boss). Past nodes stay revealed; current row + lookahead show types; beyond is blank. *Result: cartographer feel.*
  - **Phase 4 — Travel animation.** Heroes walk-tween between nodes when the player picks. Player can fast-forward. (Former #39.) *Result: travel has weight.*
  - **Phase 5 — Combat loot rate reduction.** Drop combat loot from 50% to ~20%; treasure rooms become the predictable loot path. (Former #46 balance lever.) *Result: economy rebalanced.*
  - **Phase 6+ — Travel-time effects** (each its own brainstorm, building on Phase 4):
    - Surprise encounters (RNG + node-injection mid-edge).
    - Passive HP changes per step (heal if healthy, damage if wounded/sick).
    - Hero chatter (text snippets + display widget).
- **Touches:** `src/scenes/dungeon_scene.ts` (full rewrite Phase 1), `src/run/run_state.ts` (`playerPath` may need a fork-aware variant or removal — the picker is the map), `src/dungeon/node.ts` (treasure variant Phase 2), `src/dungeon/floor.ts` (richer generator Phase 2), `src/dungeon/loot.ts` (treasure roll + reduced combat rate Phases 2/5), `src/data/events.ts` (potentially), new chatter data module (Phase 6), possibly new `src/scenes/treasure_room_overlay_scene.ts` (Phase 2). No save schema change expected — the run-state shape (`Node[]` with `nextNodeIds`) already supports a richer DAG.
- **Source:** ideas.md #1 + #3, plus folded-in former Cluster B · 38 (icon-row fog-of-war / fork visualization), · 39 (travel animation), · 46 (loot rooms + linear variance). Reframed 2026-05-02 from "layer travel/fog onto existing icon-row scene" to "replace icon-row with StS-style map" after user observed the cartographer-party / Expeditions-fiction framing fits the genre better than icon-row patching. Multi-session redesign — Phases 1–3 are core; 4–6 are layered polish.

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
