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

## Cluster A — Foundation (pure TypeScript, no Phaser)

Nothing in this cluster should import `phaser`. All of it must be unit-testable via Vitest.

### 10 · Elite nodes

- **What:** Elite encounter generator: tougher enemy lineup (more enemies, modifiers like Armored / Enraged), guaranteed Rare drop on victory.
- **Why:** Real reward asymmetry at forks ("Elite or Shop?"). Without elites, all combats are interchangeable.
- **Tier:** 2
- **Acceptance:**
  - Elite generator boosts HP/damage and stamps a modifier; victory loot roll forces ≥ 1 Rare-rarity drop.
- **Touches:** `src/dungeon/elite.ts` (new), `src/dungeon/loot.ts`, tests. Visual marker is Cluster B task 10.
- **Source:** gdd §4 + §10 Tier 2.

### 11 · Mid-floor camp nodes

- **What:** Mid-floor rest nodes. Player picks one of: heal some HP, treat one Wound, sharpen weapons (small temp Attack buff next combat). Cannot cash out.
- **Why:** Drip recovery between fights without fully healing the party. Pairs with Wounds.
- **Tier:** 2
- **Acceptance:**
  - Camp-node effect resolution applied to `RunState`; one effect per visit.
  - Distinguished from the post-boss Camp Screen (cannot cash out).
- **Touches:** `src/dungeon/camp_node.ts` (new), `src/run/run_state.ts`, tests. UI is Cluster B task 4.
- **Source:** gdd §4 + §10 Tier 2.

### 12 · Floor-milestone enemy modifiers

- **What:** Modifiers introduced at milestone floors (5, 10, 15…): Armored (+Defense), Venomous (applies poison on hit), Enraged (+Attack scaling with damage taken). Floor generator stamps modifiers based on floor number.
- **Why:** Makes deeper floors mechanically distinct, not just numerically scaled — last bullet of the Tier 2 dungeon-depth set.
- **Tier:** 2
- **Acceptance:**
  - `data/modifiers.ts` (new) defines the modifier set; floor generator applies modifiers to enemy combatants based on floor number.
  - Tests cover at least 3 modifiers (Armored, Venomous, Enraged) and confirm their effects on combat resolution.
- **Touches:** `src/data/modifiers.ts`, `src/dungeon/floor_generator.ts`, `src/combat/combatant.ts`, tests.
- **Source:** gdd §4 + §10 Tier 2.

### 13 · Event system core

- **What:** Event card data structure (id, body text, 2 choice options, payload effects per option), deck shuffle, choice resolution. Effects can mutate `RunState` (HP changes, gold changes, hero "Lost", gear gain).
- **Why:** Foundation for the event deck (next task) and "Lost"-category events.
- **Tier:** 2
- **Acceptance:**
  - `data/events.ts` defines the card type and payload kinds.
  - `applyEventChoice(runState, card, choice, rng)` mutates run state for all payload kinds in scope.
  - Tests cover each payload kind (HP delta, gold, hero "Lost", gear add).
- **Touches:** `src/data/events.ts` (new), `src/run/event_resolver.ts` (new), tests. UI is Cluster B task 5.
- **Source:** gdd §7 + §10 Tier 2.

### 14 · Initial event deck (~20 cards)

- **What:** Author ~20 event cards. Mix of pure flavor gambles (HP-for-gold trades), party-cost cards (one hero Lost), reward cards (gear find).
- **Why:** Without content, the event system is a feature with nothing to show.
- **Tier:** 2
- **Acceptance:**
  - 20 cards in `data/events.ts`, split between a shared deck and Crypt-specific cards.
  - Each card uses payload kinds defined in task 13 — no new mechanics introduced here.
- **Touches:** `src/data/events.ts`.
- **Source:** gdd §7 + §10 Tier 2.

### 15 · "Lost" hero category

- **What:** Non-combat hero removal. The hero is gone permanently with all equipped gear, regardless of party survival. Triggered by event cards or hazard nodes.
- **Why:** Gdd-defined design lever ("Lost" worse than "Fallen") that gives event cards real teeth.
- **Tier:** 2
- **Acceptance:**
  - `RunState` exposes a `loseHero(heroIndex)` operation that strips the hero from the party and discards their equipped gear (does NOT transfer to pack — that's the Fallen path).
  - Save schema records "Lost" outcomes distinctly from "Fallen" (per gdd §8).
  - At least one event card in the deck triggers a Lost outcome.
- **Touches:** `src/run/run_state.ts`, `src/data/events.ts` (one card), save schema + migration, tests.
- **Source:** gdd §8 + §10 Tier 2.

---

## Cluster B — Scenes & UI (Phaser)

Everything in this cluster may import `phaser`. Core logic lives in Cluster A modules; scenes only orchestrate and render.

### 1 · Hospital building

- **What:** Hospital scene/screen on the camp hub. Lists wounded heroes; player spends gold per wound to clear it. Pairs with Cluster A task 3.
- **Why:** Without UI, the wound system is unusable from the player's side.
- **Tier:** 2
- **Acceptance:**
  - Hospital tile on camp scene opens the Hospital UI; UI lists each wounded hero, their wounds, per-wound treatment cost.
  - "Treat" deducts vault gold and clears the wound.
- **Touches:** `src/scenes/hospital_scene.ts` (new), camp scene wiring.
- **Source:** gdd §6 + §10 Tier 2.

### 2 · Blacksmith building

- **What:** Blacksmith scene/screen. Lists upgradeable stash items; player spends gold + materials to upgrade an item one rarity tier (capped per Blacksmith level: L1 → uncommon, L2 → rare, L3 → epic).
- **Why:** Pairs with gear rarity tiers — gives the player a long-term sink for vault gold and a path from common gear to rare.
- **Tier:** 2
- **Acceptance:**
  - Blacksmith tile opens the UI; UI lists stash items with current rarity, upgrade cost (gold + materials), and a disabled state when the cap is reached.
  - "Upgrade" deducts costs and bumps the item's rarity.
- **Touches:** `src/scenes/blacksmith_scene.ts` (new), camp scene wiring.
- **Source:** gdd §6 + §10 Tier 2.

### 4 · Camp node UI (mid-floor)

- **What:** UI for mid-floor camp nodes — three buttons: Rest (heal HP), Treat Wound (with a hero picker), Sharpen (temp Attack buff next combat). Pairs with Cluster A task 11.
- **Why:** Pairs with camp-node data; needed for the player to interact.
- **Tier:** 2
- **Acceptance:**
  - Camp-node entry overlays a 3-option picker; selecting an option resolves the effect and advances.
- **Touches:** `src/scenes/dungeon_scene.ts`, `src/scenes/camp_node_overlay.ts` (new).
- **Source:** gdd §4 + §10 Tier 2.

### 5 · Event card UI

- **What:** Event card overlay. Shows card body text and two choice buttons; on choice, payload effects apply via the core event resolver and an outcome panel summarises the result before dismissal. Pairs with Cluster A task 13.
- **Why:** Without UI, events are invisible to the player.
- **Tier:** 2
- **Acceptance:**
  - Event-node entry overlays the card; choice buttons call into `applyEventChoice`.
  - Outcome panel describes what changed (HP, gold, gear, hero loss) before the player advances.
- **Touches:** `src/scenes/event_overlay.ts` (new), dungeon scene wiring.
- **Source:** gdd §7 + §10 Tier 2.

### 9 · Wound display (hero card + Barracks)

- **What:** Show wounds on hero cards (icon + count) and a full breakdown in the Barracks detail view. Pairs with Cluster A task 3.
- **Why:** Wounds need to be visible everywhere a hero is shown so the player can plan around them.
- **Tier:** 2
- **Acceptance:**
  - Hero-card icon shows wound count when > 0.
  - Barracks hero detail lists each active wound with its stat deltas.
- **Touches:** `src/ui/hero_card.ts`, `src/scenes/barracks_scene.ts`.
- **Source:** gdd §7 + §10 Tier 2.

### 10 · Elite node visual marker

- **What:** Distinguish elite nodes from regular combat nodes in the dungeon scene's icon row (e.g., 💀 vs ⚔️ + glow / outline). Pairs with Cluster A task 10.
- **Why:** Player needs to see "harder fight, better loot" before committing — especially at forks.
- **Tier:** 2
- **Acceptance:**
  - Elite nodes render with a distinct icon and colour from regular combat nodes.
- **Touches:** `src/scenes/dungeon_scene.ts`.
- **Source:** gdd §4 + §10 Tier 2.

### 11 · "Lost" hero handling in scenes

- **What:** When a hero is "Lost" mid-run (per Cluster A task 15), surface it visibly: tombstone in the party UI for the remainder of the run; cashout / wipe summary lists Fallen and Lost separately ("X was Lost" vs "X Fell").
- **Why:** Without visible feedback, the design distinction between Fallen and Lost is invisible.
- **Tier:** 2
- **Acceptance:**
  - Party UI shows a tombstone slot for Lost heroes.
  - Cashout / wipe summary differentiates Fallen and Lost in the death list.
- **Touches:** `src/scenes/dungeon_scene.ts`, `src/scenes/camp_screen_scene.ts`, summary widget.
- **Source:** gdd §8 + §10 Tier 2.

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
