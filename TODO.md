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

---

## Cluster B — Scenes & UI (Phaser)

Everything in this cluster may import `phaser`. Core logic lives in Cluster A modules; scenes only orchestrate and render.

### 17 · Combat scene

- **What:** Renders 3v3–4 ranked combat and animates playback of the combat log produced by the engine. Fast-forward toggle.
- **Why:** The readout of all the setup decisions. The scene that sells the game.
- **Tier:** 1
- **Acceptance:**
  - `src/scenes/combat_scene.ts` takes a starting `CombatState`, calls the engine to produce a log, then plays the log back with simple animations — attacker steps forward on attack, defender flashes on hit, HP bars tick, dead combatants collapse.
  - Position changes (shove / pull / swap) visibly animate.
  - Fast-forward toggle switches between 1× and 3× playback.
  - On combat end, returns control to dungeon scene with updated `RunState`.
  - **Refactor `dungeon_scene.startCombatAtCurrentNode`** (currently calls `resolveCombat` synchronously inline). After this task, the dungeon scene launches the combat scene, gets the `CombatResult` back via scene-data callback or shared registry, then continues with `completeCombat` + `appState.update`. The result panel + walk-to-next + camp_screen / wipe transitions stay where they are. (See task 16 HISTORY decisions.)
- **Touches:** `src/scenes/combat_scene.ts`, `src/scenes/dungeon_scene.ts`.

### 18 · Camp Screen (post-boss)

- **What:** The risk / reward decision screen — shows the pack, the party condition, Leave / Press On buttons.
- **Why:** The emotional centerpiece of the design. The whole gambling loop lands here.
- **Tier:** 1
- **Acceptance:**
  - `src/scenes/camp_screen_scene.ts` shows current pack gold total and party hero cards with HP.
  - Any Fallen heroes are listed (Tier 1: no equipment recovery since there's no gear flow, but the lost heroes are still named).
  - **Leave** button banks pack gold to vault, returns survivors to roster, transitions to camp scene. Saves first.
  - **Press On** button advances the floor in `RunState`, generates the next floor, transitions to dungeon scene. Saves first.
  - **Replaces task 16's stub.** The current `camp_screen_scene.ts` shows the run summary as plain text and exposes only a `Return to Camp` button (which does the cashout work — bank gold, update HP, remove fallen). The rewrite must add the `Press On` button and replace the text summary with party `HeroCard`s. The cashout logic in `returnToCamp` moves into the new `Leave` handler essentially unchanged. (See task 16 HISTORY decisions.)
- **Touches:** `src/scenes/camp_screen_scene.ts`.

### 19 · Enemy art for Crypt

- **What:** Produce sprites for the 4 Crypt enemy types + 1 boss. Placeholder reuse of existing NPC frames is acceptable for Tier 1; bespoke pixel art can come later.
- **Why:** Combat scene needs enemy sprites. Without this, enemies are unrenderable.
- **Tier:** 1
- **Acceptance:**
  - Every enemy id referenced by `data/enemies.ts` maps to a valid sprite frame — either new pixels drawn in LibreSprite or reuse of existing NPC frames from the catalog.
  - `spritenames.txt` updated with the new / mapped entries; `npm run generate:names` run and output committed.
  - Boss is visually distinguishable (scaled up, unique frame, or outlined).
- **Touches:** `public/assets/sprites/base_sprites.png` (if drawing), `spritenames.txt`, `src/render/sprite_names.generated.ts` (regenerated).
