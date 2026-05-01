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

Everything in this cluster may import `phaser`. Core logic lives in Cluster A modules; scenes only orchestrate and render. Entries 1–11 shipped; 12+ surface gameplay-loop, visibility, and bug-fix work audited from gdd §6 / §10 and `bugs.md` against current HISTORY (2026-04-30).

### 13 · Floor-modifier visibility in combat

- **What:** Surface enemy modifiers (`armored`, `venomous`, `enraged`) on the combat scene — at minimum, a small badge or label below each enemy nameplate listing active modifier names. Optionally, a one-line "Modifiers in effect: …" status line at fight start.
- **Why:** Cluster A · 12 (Floor-milestone enemy modifiers) shipped the data layer — Armored / Venomous / Enraged each carry a real combat effect — but no UI references modifiers anywhere (`Grep src/scenes/**` for `modifier` returns zero hits). Players get hit by extra defense, poison ticks, or a sudden attack spike without any signal. Closes the visibility gap on Tier 2's "scaling milestones within a dungeon" feature.
- **Tier:** 2
- **Acceptance:**
  - Each enemy with at least one modifier shows badge text (e.g., "Armored", "Venomous") near its sprite/nameplate.
  - Modifier names use a consistent color (suggest an orange / amber to read as "watch out") and use `MODIFIERS[id].name` for the label so future-added modifiers don't need scene edits.
  - Bosses (which never roll modifiers per Cluster A · 12 HISTORY) just don't render the badge — no special branch needed.
- **Touches:** `src/scenes/combat_scene.ts` (or wherever enemy nameplates render), `src/data/modifiers.ts` (read-only).
- **Source:** ad-hoc audit 2026-04-30.

### 14 · Retire hero from Barracks

- **What:** Add a "Retire" button to the Barracks hero detail pane. Clicking it shows a confirm dialog ("This frees the slot. The hero is gone forever. No refund."); confirm calls `removeHero(roster, hero.id)` and rebuilds the panel.
- **Why:** gdd §6 explicit: "retire heroes (frees a slot, no refund)." The `removeHero` function exists in `roster.ts` but nothing calls it. Players who fill 12 slots with bad rolls or unwanted classes have no way to free space short of waiting for a combat death — a real meta-progression friction.
- **Tier:** 2
- **Acceptance:**
  - "Retire" button visible in Barracks hero detail; styled to look destructive (red/dark).
  - Confirm-dialog overlay (or inline two-step: "Retire" → "Confirm Retire") prevents accidental clicks.
  - On confirm: `removeHero` runs, `appState.update` persists, panel rebuilds; the just-retired hero falls out of the list.
  - Disabled when retiring would drop the roster below the minimum needed to start a run (3 heroes) — or, simpler: always allowed and players can re-recruit at the Tavern.
- **Touches:** `src/scenes/barracks_panel_scene.ts`.
- **Source:** ad-hoc audit 2026-04-30 (gdd §6 alignment).

### 15 · Wound-effect display in combat HUD

- **What:** Show wound badges on the party-side combat HUD. Each hero with `wounds.length > 0` gets a small `🩸 N` badge near their nameplate (matching the HeroCard convention from Cluster B · 9). Optional tooltip: list each wound's effect via the existing `describeWoundEffect` helper.
- **Why:** Cluster B · 9 added wound badges to HeroCard / Barracks. Combat — the surface where wound effects actually fire — doesn't show them. A hero fighting at -2 Attack from Winded has no on-screen indicator of why their numbers look off. The data is right there in `hero.wounds`.
- **Tier:** 2
- **Acceptance:**
  - Heroes in combat with `wounds.length > 0` render a `🩸 N` badge near their nameplate (color `#ff6666` for visual parity with HeroCard).
  - Hovering / tapping the badge shows the wound-effect summary (one line per wound) — defer if the combat scene doesn't support hover.
- **Touches:** `src/scenes/combat_scene.ts`, possibly a shared widget in `src/ui/`.
- **Source:** ad-hoc audit 2026-04-30.

### 18 · Noticeboard signature-enemy preview

- **What:** Add a "Signature enemies" section to the dungeon-list card in the Noticeboard, rendering a small icon row (sprite frames) for the dungeon's `enemyPool`. Optionally: tier label and floor-length badge.
- **Why:** gdd §5: "Each dungeon shows its tier, expected floor length, and a preview of the **signature enemies** and loot." Today the card shows name + theme + "3 floors" only. Marginal while The Crypt is the only dungeon, but turns into "obviously missing" the moment a 2nd dungeon ships — better to land it now while there's no data-shape pressure.
- **Tier:** 2
- **Acceptance:**
  - Dungeon card renders enemy sprites for each id in `DUNGEONS[id].enemyPool` plus the boss sprite (visually distinguished, e.g. larger or with a crown icon).
  - Tier label rendered (currently DungeonDef has no `tier` field — defer if introducing one is out of scope; otherwise add it via a single-line type/data extension).
  - Loot preview deferred — too speculative without dungeon-specific loot pools.
- **Touches:** `src/scenes/noticeboard_panel_scene.ts`, possibly `src/data/dungeons.ts` (tier field) and `src/data/types.ts` (DungeonDef extension).
- **Source:** ad-hoc audit 2026-04-30 (gdd §5 alignment).

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
