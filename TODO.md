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

### 19 · 🔥 CRITICAL: Event overlay throws when outcome panel renders after applying a choice

- **What:** Picking any choice on an event card throws `Error: event_overlay: current node is 'boss', not 'event'` after `applyChoice` runs. Reproduced on the `starving_merchant` "Bleed for him" choice but the same code path fires for every applied choice.
- **Why:** `EventOverlayScene.rerender()` unconditionally calls `this.currentCard()` at the top, but `applyChoice` has already advanced `currentNodeId` via `chooseNextNode` before `setOverlayState('outcome')` triggers the rerender. By the time `currentCard()` reads `currentNode`, it's the next node (often a boss/combat) and the type-guard throws. Regression introduced in the just-shipped Cluster B · 5 (Event card UI).
- **Tier:** 2 (bug fix of a Tier 2 feature)
- **Acceptance:**
  - Picking any choice on any card resolves cleanly through the outcome panel.
  - Dismissing the outcome panel correctly advances to the next node (boss/combat/etc).
  - Fix scope: move the `currentCard()` call out of the unconditional path in `rerender()` — only call it when `state === 'card'` or `state === 'hero_picker'` (the picker title doesn't currently use the card, but `applyChoice`'s `currentCard()` lookup uses `initialRs` so it's pre-advance and safe). The `'outcome'` state should not call `currentCard()` at all — it has everything it needs in `this.lastOutcome`.
- **Touches:** `src/scenes/event_overlay_scene.ts`.
- **Source:** `bugs.md` (2026-04-30 user repro).

### 20 · 🐛 HIGH: Shop "Manage Gear" leaves shop overlay on top, traps player

- **What:** Clicking "Manage Gear" in the shop overlay launches `equip_panel` but doesn't pause/hide the shop overlay. The shop renders on top, equip-panel is unreachable, and the player can't recover or continue.
- **Why:** `shop_overlay_scene.ts:213` calls `this.scene.launch('equip_panel', { returnTo: 'shop_overlay' })` without a corresponding `this.scene.pause()` (or `setVisible(false)`). Compare to other launch sites (e.g. `camp_scene.buildBuilding` → `scene.launch + scene.pause`).
- **Tier:** 2 (bug fix of a Tier 2 feature)
- **Acceptance:**
  - Clicking "Manage Gear" hides/pauses shop overlay; equip panel is fully interactive.
  - Closing equip panel resumes shop overlay; player can buy more, leave, or click Manage Gear again.
  - Player can never end up with both overlays visible and interactive.
- **Touches:** `src/scenes/shop_overlay_scene.ts` (the `Manage Gear` click handler), possibly `src/scenes/equip_panel_scene.ts` (verify it correctly resumes its `returnTo` scene on close).
- **Source:** `bugs.md` (2026-04-30 user repro).

### 21 · 🐛 Combat results modal omits Fallen heroes

- **What:** The post-combat "Victory" results panel lists per-hero HP changes for survivors but doesn't indicate which heroes Fell in the fight. A hero who died gets no line at all — silent loss.
- **Why:** `dungeon_scene.processCombatReturn` shows the result panel built from `run.party`, which by then has already been pruned to survivors. Need to also display fallen heroes (from the just-resolved combat) in the panel.
- **Tier:** 2 (bug fix)
- **Acceptance:**
  - Each hero who Fell in the just-completed combat appears in the results panel with a clear "Fallen" indicator (e.g. "{name}: Fallen" in pinkish-red `#cc8888` matching the existing Fallen color from cashout-summary / wipe panel).
  - If 0 heroes Fell, behavior is unchanged.
  - Source the fallen list from `combatResult.fallenHeroIds` or equivalent (verify the data is available at the point the panel renders).
- **Touches:** `src/scenes/dungeon_scene.ts` (the result panel construction in `processCombatReturn`).
- **Source:** `bugs.md` (2026-04-30 user observation).

### 22 · Hero level not shown anywhere in the UI

- **What:** Heroes have a `level` field (Cluster A · 7) and gain XP / level up, but the level number isn't displayed on `HeroCard`, in Barracks, or anywhere else. Players can't see their heroes' levels.
- **Why:** Cluster A · 7 (Hero leveling + level-5 perks) shipped the data layer; Cluster B · 8 (Level-up perk picker) handles the perk choice on level-up but doesn't surface the resting-state level. Closes the visibility gap.
- **Tier:** 2 (visibility gap on a Tier 2 feature)
- **Acceptance:**
  - Hero level shown on `HeroCard` (suggest a small `Lv N` badge near the name or class).
  - Same level visible in the Barracks detail pane (likely automatic if HeroCard is reused there).
  - Color/styling distinct enough to read at a glance but not visually noisy.
- **Touches:** `src/ui/hero_card.ts`, possibly `src/scenes/barracks_panel_scene.ts` if level should be more prominent in the detail view.
- **Source:** `bugs.md` (2026-04-30 user observation).

### 23 · Camp-node choice → next encounter feels jarring (no transition beat)

- **What:** When the player picks Heal Party or Treat Wound at a mid-floor camp node, the overlay closes and the dungeon scene immediately walks the party into the next encounter with no acknowledgment of the choice's effect.
- **Why:** UX polish gap. `camp_node_overlay_scene.applyHealParty` and `applyTreatWound` both `closeAndResume()` immediately on commit; the dungeon's RESUME handler then triggers the walk-to-next animation. Compare to event overlay (Cluster B · 5) which shows an outcome panel beat first. A brief "Healed: +X HP across party" beat or a small visual confirm before walking would land the choice better.
- **Tier:** 2 (UX polish; not a functional bug)
- **Acceptance:**
  - After a camp-node choice (Heal Party / Treat Wound), some kind of acknowledgment beat plays before walking to the next node. Options to consider:
    - (a) Brief outcome panel (modeled on event UI's outcome) showing per-hero HP delta or treated wound, with Dismiss button.
    - (b) Brief auto-dismissed flash on the dungeon HUD ("+15 HP across party").
    - (c) Status-bar toast with the result.
  - Pick whichever fits best during brainstorming; (a) is most consistent with the event-overlay pattern.
- **Touches:** `src/scenes/camp_node_overlay_scene.ts`, possibly `src/scenes/dungeon_scene.ts`.
- **Source:** `bugs.md` (2026-04-30 user observation).

### 24 · Long trait names overflow Barracks hero display

- **What:** Trait names that exceed some implicit width break out of the trait box / hero display area in the Barracks panel — visually leaks past the container border.
- **Why:** Layout bug. Either the trait label text isn't constrained by a `wordWrap` width, or the container clipping isn't enforced. Probably a one-line `wordWrap: { width: N }` fix in the Barracks scene's trait-rendering call.
- **Tier:** 2 (visual bug)
- **Acceptance:**
  - Heroes whose trait has a long name (e.g., the longest entry in `TRAITS`) render the trait inside the Barracks layout without overflow.
  - If the trait name truly cannot fit at the existing font size, either wrap, truncate with ellipsis, or shrink the font — pick one and document.
- **Touches:** `src/scenes/barracks_panel_scene.ts`, possibly `src/ui/hero_card.ts` if the same trait rendering is shared.
- **Source:** `bugs.md` (2026-04-30 user screenshot at `c:\Users\admin\Downloads\Screenshot 2026-04-30 233030.png`).

### 12 · Equip-from-stash at Barracks

- **What:** Add an equip/unequip flow inside the Barracks scene that reads from `state.stash` and writes through `equip()` / `unequip()` to the selected hero's equipment slots. Mirrors the mid-run `equip_panel_scene.ts` interaction but with stash as the item pool instead of pack.
- **Why:** gdd §6 explicitly: "Inspect stats, **equip gear from stash**, set formation defaults, retire heroes." Today nothing reads stash for equip purposes — the Blacksmith reads it for upgrades, but stash items can never get onto a camp hero. Heroes who survive a run cannot wear the loot you banked. This is a load-bearing gap in the meta-progression loop.
- **Tier:** 2
- **Acceptance:**
  - In Barracks, the selected hero's equipment slots are clickable; clicking opens a stash-item picker filtered to the slot.
  - Picking a stash item swaps it onto the hero (`equip(hero, item, slot)`); the displaced item, if any, returns to stash.
  - Unequipping a slot (other than weapon — weapon must always be present per `equip.ts`) sends the item back to stash.
  - Stat-preview on swap uses the existing `previewStats` helper from `items/selectors.ts` for UX parity with `equip_panel_scene.ts`.
- **Touches:** `src/scenes/barracks_panel_scene.ts` (extend the detail pane with slot widgets + picker), possibly a small extracted helper in `src/ui/`.
- **Source:** ad-hoc audit 2026-04-30 (gdd §6 alignment).

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

### 16 · Tavern reroll

- **What:** Add a "Reroll Candidates" button to the Tavern panel that costs gold (suggest 25g L1) and replaces the current 3 candidates with a fresh `generateCandidates(rng, unlockedClasses)` roll. Threads the run-RNG / a fresh camp RNG appropriately.
- **Why:** gdd §6 explicit: L1 Tavern has reroll for gold cost. Today, the Tavern shows 3 fixed candidates per visit with no way to reroll — players are locked into whatever spawns. Removes a meaningful agency lever from recruitment.
- **Tier:** 2
- **Acceptance:**
  - "Reroll · {N}g" button in the Tavern; greyed when player can't afford.
  - Click deducts gold via `spend(vault, REROLL_COST)`, calls `generateCandidates`, and persists the new candidate set in scene state.
  - The Tavern's candidate list lives in scene state currently (no save persistence per visit) — confirm before changing that contract.
- **Touches:** `src/scenes/tavern_panel_scene.ts`, possibly a new `REROLL_COST` constant in `src/camp/buildings/tavern.ts`.
- **Source:** ad-hoc audit 2026-04-30 (gdd §6 alignment).

### 17 · Outfit + hat rendering on paperdoll

- **What:** Extend `heroToLoadout` to also read `equipment.outfit` and `equipment.hat` and pass their `spriteId` values into the paperdoll. Currently only weapon + shield are wired into the rendered loadout.
- **Why:** gdd: "Equipment drives both **look** and stats." Stats are wired (`applyEquipmentStats` reads all 4 slots); rendering is not. As soon as Cluster C · 2 ships real outfit/hat sprites, this wire-up lights up the visual side. Pre-Cluster-C-2, the wiring is harmless because both placeholder spriteIds are `'0'` (no visible change).
- **Tier:** 2
- **Acceptance:**
  - `heroToLoadout` returns a `Loadout` containing `outfit?` and `hat?` sprite indices when those slots are populated.
  - `Paperdoll` already renders these layers (per `render/paperdoll.ts` ordering: body → legs → feet → outfit → hair → hat → shield → weapon); confirm before changing.
  - All current sites that use `heroToLoadout` (combat scene, dungeon scene, equip panel, event overlay hero picker, etc.) automatically benefit.
- **Touches:** `src/render/hero_loadout.ts`, possibly `src/render/paperdoll.ts` if the `Loadout` type needs expansion.
- **Source:** ad-hoc audit 2026-04-30. Pairs with — and is gated on — Cluster C · 2 sprites.

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

## Cluster A — Pure-TS data layer

Modules under `src/combat/`, `src/heroes/`, `src/items/`, `src/dungeon/`, `src/events/`, `src/run/`, `src/camp/`, `src/data/`, `src/util/`, `src/save/`. Cluster shipped 1–15; resurrected 2026-04-30 for one pre-launch cleanup item.

### 16 · Save loader silently discards old-version saves

- **What:** When a save's `version` is older than `CURRENT_SCHEMA_VERSION` and no migration is registered for that version, `migrate()` returns `null` and `load()` returns `null` without emitting a `console.warn`. The boot scene then generates a fresh save with no indication that an old save was thrown away.
- **Why:** The other null-return paths in `load()` (corrupt JSON, shape mismatch, future version, paired-rng-state violation) all warn — only the no-migration-registered path is silent. Currently a non-issue because the user is the only player, the schema is pinned at 1, and discards are intentional. Worth fixing before launch when player saves are real.
- **Tier:** 2 (pre-launch hygiene)
- **Acceptance:**
  - When `migrate()` returns `null` due to no registered migration for an older version, `load()` emits `console.warn('load: discarding save with unsupported version N (current is M)')` (or equivalent) and returns `null`.
  - Repro: with a future `CURRENT_SCHEMA_VERSION = 2`, plant `localStorage.setItem('pixel-battle-game/save', JSON.stringify({ version: 1, roster: {}, vault: {}, unlocks: {} }))` and reload — confirm the warn now fires.
- **Touches:** `src/save/save.ts` (one-line addition after the `if (!migrated) return null;` block).
- **Source:** `bugs.md` (2026-04-26 entry, surfaced via Claude-in-Chrome v1-discard test).

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
