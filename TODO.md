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

### 30 · Dungeon gameplay redesign (travel impact + fog-of-war + loot rooms + linear variance)

- **What:** A coherent rework of the dungeon-scale player experience, decomposing into many sub-tasks. Combines:
  - Travel impact (ideas.md #3) — non-instant travel between rooms, walking animation, surprise encounters, passive HP changes, hero chatter.
  - Icon-row fog-of-war + fork visualization (former Cluster B · 38) — today `playerPath` lies about topology and reveals all future content.
  - Travel animation between non-combat nodes (former Cluster B · 39).
  - Loot rooms + linear-node variance (former Cluster B · 46) — new treasure node type, reduced combat loot rate, mixed-type linear preamble nodes.
- **Why:** Today the dungeon scene is essentially a hub between combat/shop/event screens — almost all of the play experience IS the combat scene. Each sub-area on its own is a feature pitch; together they're a single coherent "what is dungeon gameplay" pass. Designing them separately would force re-coordination at each sub-task (e.g., a treasure node type needs an icon-row glyph; the icon-row fog-of-war design needs to know what node types exist; travel animation needs to know about node types and surprise-encounters). One brainstorm pass produces a unified plan; sub-tasks ship independently.
- **Tier:** 2 polish (scope-dependent; could touch Tier 3 if surprise-encounter system or treasure rooms grow).
- **Acceptance:**
  - **Needs brainstorming first** — the unified pass should decompose into discrete sub-tasks shippable individually. Likely sub-tasks:
    - **Icon-row fog-of-war** (from #38): today `playerPath` (run_state.ts:380) returns a single linear path even at forks, defaulting to branch 0 — the icon row LIES about topology. Plus all future node types are revealed up-front. Decision needed: hide future entirely (strict A), show topology with `?` content (B), or strict + boss-anchored (C); icon row stays 1D vs. visualizes branches. Touches `dungeon_scene.ts:155-185` (`buildNodes`) and `dungeon_scene.ts:669-685` (`refreshNodeColors`).
    - **Fork-picker glyph fix** (discovered while scoping #38): `dungeon_scene.ts:457` has its own glyph map that's `boss/shop` only and falls through to `'⚔'` for elite/camp/event branches — fork branches of those types render as crossed swords. Trivial fix; folded here to ship with the broader rework.
    - **Travel animation** (from #39): leaving shop/event nodes (and combat → next-node) currently snaps to next state instantly. Heroes should bob/sway between current and next node icon; player can fast-forward.
    - **Travel-time pacing** (scene state machine): non-zero transition delay; player can fast-forward.
    - **Loot rooms (treasure node)** (from #46): new `'treasure'` Node variant in `src/dungeon/node.ts`. `rollLoot` extended with a `'treasure'` kind (single drop, ~uncommon-or-rare weighted, scaled by floor depth like elite drops). Auto-open on arrival + brief result panel (similar shape to TODO #43's post-combat loot panel) showing the rolled item, auto-added to pack. No new interactive "open / leave" UI — avoids click complexity.
    - **Floor gen — fork shapes** (from #46): extend fork-shape RNG from 10 shapes (5 branch types × C(5,2)) to 15 (6 branch types × C(6,2)). Define which pairings are valid (e.g., is treasure-vs-treasure allowed?).
    - **Floor gen — linear-node variance** (from #46): per non-fork node, weighted random draw with combat at high probability (~70–80%) and the 5 alternatives at low. Tunable in `src/dungeon/floor.ts`. Today linear nodes are always combat.
    - **Combat loot rate** (from #46): drop the per-combat loot-roll RNG from 50% to a value (~20%?) so treasure rooms feel meaningful as the primary loot source on non-elite/boss floors. Tune in `src/dungeon/loot.ts`.
    - **Treasure-room icon glyph**: companion to fog-of-war work; the new node type needs a glyph.
    - **Surprise-encounter mechanic** (RNG + node-injection logic): low-% per quarter-step, draws from combat / merchant / event pools.
    - **Passive HP changes**: per-step heal/damage modeled on hero condition (wounds, statuses).
    - **Hero chatter**: text snippets + display widget. Could be its own task.
  - Some sub-tasks likely warrant their own brainstorms (especially surprise-encounter mechanic — what's the encounter pool? how do node graphs handle injected nodes? — and the fog-of-war A/B/C decision).
  - Manual verification (overall): Crypt run shows mixed node types in linear preamble; forks include treasure-room options; treasure rooms drop loot and add to pack; combat loot drops are noticeably rarer; player can't see future node types beyond the next; travel between nodes feels acknowledged.
- **Touches:** `src/scenes/dungeon_scene.ts`, `src/run/run_state.ts` (`playerPath` may need a fork-aware variant), `src/dungeon/node.ts` (Node variant), `src/dungeon/floor.ts` (fork shapes + linear variance), `src/dungeon/loot.ts` (treasure roll + reduce combat rate), `src/data/events.ts` (potentially), new chatter data module, possibly new `src/scenes/treasure_room_overlay_scene.ts` (or inline). No save schema change expected.
- **Source:** ideas.md #1 + #3, plus folded-in former Cluster B · 38 (icon-row fog-of-war), · 39 (travel animation), · 46 (loot rooms + linear variance). User-directed merge 2026-05-02 — rolling #46 into #30 because both touch dungeon-scale gameplay and would force re-coordination if shipped separately.
- **Source:** ideas.md #3, plus folded-in former Cluster B · 38 (2026-05-02 scoping discovered the entry's described bug was stale; actual bug is fork visualization + fog-of-war) and former Cluster B · 39 (travel animation, subset).

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
