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

### 5 · Dungeon & linear floor generation

- **What:** Floor generator for The Crypt — 3 combat nodes + 1 boss node, linear, no forks/shops/events (Tier 1 scope).
- **Why:** Dungeon scene needs a floor structure to walk through; run state needs a node sequence to advance through.
- **Tier:** 1
- **Acceptance:**
  - `src/dungeon/floor.ts` exposes `generateFloor(dungeonId, floorNumber, rng)` → ordered list of node definitions.
  - All non-boss nodes are Combat type, drawing enemies from the dungeon's pool.
  - Scaling is a flat per-floor multiplier on enemy HP / damage (per `gdd.md` §4).
  - Boss node always terminates the floor.
  - `src/data/dungeons.ts` defines The Crypt (name, theme, floor length, enemy pool reference, boss id).
- **Touches:** `src/dungeon/floor.ts`, `src/dungeon/node.ts`, `src/dungeon/scaling.ts`, `src/data/dungeons.ts`.
- **Source:** `gdd.md` §4.

### 6 · Run state & gold-only pack

- **What:** Model the in-progress expedition: party HP/positions, current floor number, current node index, and the pack (gold only in Tier 1).
- **Why:** Binds combat and dungeon together. Drives scene transitions (dungeon → combat → next node → boss → camp screen).
- **Tier:** 1
- **Acceptance:**
  - `src/run/run_state.ts` models `RunState` with helpers for entering a node, completing combat (apply HP and pack deltas), transitioning to camp screen, transitioning to next floor, and handling wipes.
  - `src/run/pack.ts` handles pack math — Tier 1 is gold-only (`addGold`, `totalGold`, `empty`).
  - Cashout returns `{ goldBanked }`; wipe returns `{ packLost, heroesLost }`. No gear handling yet (Tier 2 adds it).
  - Tests cover: state transitions, pack math, cashout and wipe outcomes, floor advancement.
- **Touches:** `src/run/run_state.ts`, `src/run/pack.ts`, `src/run/camp_screen.ts`, `src/run/__tests__/*`.

### 7 · Roster & vault

- **What:** Persistent camp state — roster of heroes (with cap) and the banked vault gold.
- **Why:** Survives between runs. Consumed by recruitment, Barracks UI, and the Leave transition (banks pack gold into vault).
- **Tier:** 1
- **Acceptance:**
  - `src/camp/roster.ts` manages a list of heroes with add / remove / getById operations. Enforces a 12-hero cap (Barracks upgrades are Tier 2+).
  - `src/camp/vault.ts` is a gold accumulator with `credit`, `spend`, `balance`. No negative balance allowed.
  - Dead heroes are removed from the roster on wipe or Fallen.
  - Tests cover: cap enforcement, vault invariants.
- **Touches:** `src/camp/roster.ts`, `src/camp/vault.ts`, `src/camp/__tests__/*`.

### 8 · Recruitment logic

- **What:** Tavern candidate generation — roll 3 candidates, each with class, body sprite, name, and trait.
- **Why:** The Tavern UI renders what this produces, and the initial save-file creation needs a starter roster.
- **Tier:** 1
- **Acceptance:**
  - `src/camp/buildings/tavern.ts` exposes a function to generate candidates using the seeded RNG.
  - Candidates draw class from the unlocked pool (Tier 1 = Knight / Archer / Priest only).
  - Body sprite drawn from the player race × gender catalog (4 races × 2 genders).
  - Names from `src/data/names.ts` (a ~50-name list is enough for Tier 1).
  - Trait from `src/data/traits.ts` — Tier 1 subset of ~6 traits (Stout, Quick, Sturdy, Cowardly, Sharp-eyed, Nervous).
- **Touches:** `src/camp/buildings/tavern.ts`, `src/data/names.ts`, `src/data/traits.ts`.
- **Source:** `gdd.md` §3 (Recruitment roll).

### 9 · Save / load via localStorage

- **What:** Serialize `Roster + Vault + Unlocks` to localStorage; load on boot; treat missing or corrupt save as a fresh-game trigger.
- **Why:** Without this, every refresh wipes progress — the whole persistent-roster premise dies.
- **Tier:** 1
- **Acceptance:**
  - `src/save/save.ts` defines a versioned `SaveFile` type and `save()` / `load()` helpers.
  - Schema version embedded; `src/save/migration.ts` stub exists for future migrations.
  - Tests cover: roundtrip preserves roster and vault; missing save yields default new-game state; corrupt JSON yields default new-game state + a console warning, no crash.
- **Touches:** `src/save/save.ts`, `src/save/migration.ts`, `src/save/__tests__/save.test.ts`.

---

## Cluster B — Scenes & UI (Phaser)

Everything in this cluster may import `phaser`. Core logic lives in Cluster A modules; scenes only orchestrate and render.

### 10 · Boot scene + asset preload + save-aware routing

- **What:** Entry scene that preloads the sprite sheet and resolves save state, then transitions into the appropriate next scene.
- **Why:** Every other scene assumes assets are loaded and save state has been resolved. Also the correct replacement for `MainScene` as the default start scene.
- **Tier:** 1
- **Acceptance:**
  - `src/scenes/boot_scene.ts` preloads `base_sprites.png` and any new atlases.
  - On complete, asks `save/save.ts` for the current save. If present, transitions to camp scene with loaded state. If absent, creates a fresh save with a starter roster (3 heroes — one of each class) and transitions.
  - `src/main.ts` updated to register `BootScene` first; dev scenes (`main_scene`, `explorer_scene`) stay registered but are no longer auto-started.
- **Touches:** `src/scenes/boot_scene.ts`, `src/main.ts`.

### 11 · Hero card widget

- **What:** A reusable Phaser Container that renders a hero (paperdoll + name + class + core stats). Used by Tavern, Barracks, Camp Screen.
- **Why:** Shared UI. One component instead of three drifting reimplementations.
- **Tier:** 1
- **Acceptance:**
  - `src/ui/hero_card.ts` exports a class taking a `Hero` instance.
  - Configurable size (e.g., `small` for list rows, `large` for inspection).
  - Exposes a click handler for selection.
  - Updates when hero state changes (HP bar, dead state overlay).
- **Touches:** `src/ui/hero_card.ts`.

### 12 · Camp scene shell

- **What:** The village hub scene — clickable "buildings" (Tavern, Barracks, Noticeboard) that each open their panel.
- **Why:** The player's home base between runs. Where boot routes to and every run ends (cashout or wipe).
- **Tier:** 1
- **Acceptance:**
  - `src/scenes/camp_scene.ts` renders three building entry points (sprites or labeled boxes — placeholder OK for Tier 1).
  - Clicking a building opens its panel (Tavern / Barracks / Noticeboard).
  - Panel close returns to camp scene.
  - HUD shows current vault gold balance.
- **Touches:** `src/scenes/camp_scene.ts`.

### 13 · Tavern UI

- **What:** Panel showing 3 candidates with hire buttons.
- **Why:** Primary way new heroes enter the roster.
- **Tier:** 1
- **Acceptance:**
  - Panel opens over camp scene with 3 candidates generated via `camp/buildings/tavern.ts`, each rendered as a large hero card.
  - Hire button disabled if vault balance < cost or roster is at cap (with reason shown).
  - On hire: deducts cost, adds to roster, re-rolls that candidate slot.
  - Close button returns to camp.
- **Touches:** `src/ui/tavern_panel.ts`.

### 14 · Barracks UI

- **What:** Panel listing the roster; click a hero to inspect their full stats and abilities.
- **Why:** Lets the player see their roster and plan. Also the home Tier 2 will extend with equip and formation-default editing.
- **Tier:** 1
- **Acceptance:**
  - Opens as a panel over camp scene, lists all roster heroes via small hero cards.
  - Click a card to open a detail view (larger card + ability list + stats table).
  - No equip / swap operations in Tier 1 (no gear drops yet).
  - Close button returns to camp.
- **Touches:** `src/ui/barracks_panel.ts`.

### 15 · Noticeboard & party picker

- **What:** Panel for starting a run — pick a dungeon, then pick 3 heroes and assign them to formation slots 1 / 2 / 3.
- **Why:** The "begin a run" entry point. Where setup decisions land.
- **Tier:** 1
- **Acceptance:**
  - Noticeboard shows available dungeons (Tier 1: only The Crypt).
  - Selecting a dungeon opens a party picker.
  - Party picker shows all living, non-injured roster heroes; player assigns three of them into slots 1 / 2 / 3 via click or drag.
  - Descend button enabled only when 3 heroes are slotted; on click, constructs the initial `RunState` and transitions to the dungeon scene.
- **Touches:** `src/ui/noticeboard_panel.ts`, `src/ui/formation_editor.ts`.

### 16 · Dungeon scene

- **What:** Side-scrolling scene where the party walks through a floor. Each node triggers its payload (combat → combat scene; boss → combat scene; post-boss → camp screen scene).
- **Why:** The forward-motion connective tissue between camp setup and combat readout.
- **Tier:** 1
- **Acceptance:**
  - `src/scenes/dungeon_scene.ts` takes a `RunState` and renders the party walking in formation using paperdolls.
  - Approaches each node and triggers it (Tier 1: all non-boss nodes are combat).
  - On combat complete, updates `RunState` (HP + pack), continues to next node, or transitions to camp screen after boss.
  - On wipe: shows a wipe summary and returns to camp scene with heroes removed from the roster and pack discarded.
- **Touches:** `src/scenes/dungeon_scene.ts`.

### 17 · Combat scene

- **What:** Renders 3v3–4 ranked combat and animates playback of the combat log produced by the engine. Fast-forward toggle.
- **Why:** The readout of all the setup decisions. The scene that sells the game.
- **Tier:** 1
- **Acceptance:**
  - `src/scenes/combat_scene.ts` takes a starting `CombatState`, calls the engine to produce a log, then plays the log back with simple animations — attacker steps forward on attack, defender flashes on hit, HP bars tick, dead combatants collapse.
  - Position changes (shove / pull / swap) visibly animate.
  - Fast-forward toggle switches between 1× and 3× playback.
  - On combat end, returns control to dungeon scene with updated `RunState`.
- **Touches:** `src/scenes/combat_scene.ts`.

### 18 · Camp Screen (post-boss)

- **What:** The risk / reward decision screen — shows the pack, the party condition, Leave / Press On buttons.
- **Why:** The emotional centerpiece of the design. The whole gambling loop lands here.
- **Tier:** 1
- **Acceptance:**
  - `src/scenes/camp_screen_scene.ts` shows current pack gold total and party hero cards with HP.
  - Any Fallen heroes are listed (Tier 1: no equipment recovery since there's no gear flow, but the lost heroes are still named).
  - **Leave** button banks pack gold to vault, returns survivors to roster, transitions to camp scene. Saves first.
  - **Press On** button advances the floor in `RunState`, generates the next floor, transitions to dungeon scene. Saves first.
- **Touches:** `src/scenes/camp_screen_scene.ts`.

### 19 · Enemy art for Crypt

- **What:** Produce sprites for the 4 Crypt enemy types + 1 boss. Placeholder reuse of existing NPC frames is acceptable for Tier 1; bespoke pixel art can come later.
- **Why:** Combat scene needs enemy sprites. Without this, enemies are unrenderable.
- **Tier:** 1
- **Acceptance:**
  - Every enemy id referenced by `data/enemies.ts` maps to a valid sprite frame — either new pixels drawn in LibreSprite or reuse of existing NPC frames from the catalog.
  - `spritenames.txt` updated with the new / mapped entries; `npm run generate:names` run and output committed.
  - Boss is visually distinguishable (scaled up, unique frame, or outlined).
- **Touches:** `public/assets/base_sprites.png` (if drawing), `spritenames.txt`, `src/render/sprite_names.generated.ts` (regenerated).
