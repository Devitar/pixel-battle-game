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

## Cluster B — Scenes & UI (Phaser)

Everything in this cluster may import `phaser`. Core logic lives in Cluster A modules; scenes only orchestrate and render.

### 2 · Blacksmith building

- **What:** Blacksmith scene/screen. Lists upgradeable stash items; player spends gold + materials to upgrade an item one rarity tier (capped per Blacksmith level: L1 → uncommon, L2 → rare, L3 → epic).
- **Why:** Pairs with gear rarity tiers — gives the player a long-term sink for vault gold and a path from common gear to rare.
- **Tier:** 2
- **Acceptance:**
  - Blacksmith tile opens the UI; UI lists stash items with current rarity, upgrade cost (gold + materials), and a disabled state when the cap is reached.
  - "Upgrade" deducts costs and bumps the item's rarity.
- **Touches:** `src/scenes/blacksmith_scene.ts` (new), camp scene wiring.
- **Source:** gdd §6 + §10 Tier 2.

### 5 · Event card UI

- **What:** Event card overlay. Shows card body text and two choice buttons; on choice, payload effects apply via the core event resolver and an outcome panel summarises the result before dismissal. Pairs with Cluster A task 13.
- **Why:** Without UI, events are invisible to the player.
- **Tier:** 2
- **Acceptance:**
  - Event-node entry overlays the card; choice buttons call into `applyEventChoice`.
  - Outcome panel describes what changed (HP, gold, gear, hero loss) before the player advances.
- **Touches:** `src/scenes/event_overlay.ts` (new), dungeon scene wiring.
- **Source:** gdd §7 + §10 Tier 2.

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
