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

### 20 · Combat speed toggle persists between combats

- **What:** The combat scene's FF (1× / 3×) toggle currently resets to 1× on every new combat. Persist the player's last choice so they only have to click it once per session (or once ever).
- **Why:** Players who prefer 3× playback have to re-toggle every fight — that's 4 clicks per floor in Tier 1 (3 combats + 1 boss), more in deeper floors. Pure friction; the toggle exists *because* the unmodified speed feels slow once you've seen the rhythm. Surfaced during task 18 (camp_screen) smoke testing.
- **Tier:** 2 (QoL polish, not Tier 1 critical)
- **Acceptance:**
  - Player toggles to 3× in combat A. Combat A ends. Combat B starts. Speed is still 3×; the FF button reflects 3×; tweens/time are scaled.
  - The `tweens.timeScale = 1` / `time.timeScale = 1` reset in the shutdown handler (`combat_scene.ts:82-83`) is reconciled — either kept (and the new state restored on the next `create()`) or removed (with the next scene's expectations updated).
  - **Open design call (resolve at brainstorm time):** in-session only (a module-level variable in `combat_scene.ts`, lost on page reload) vs cross-session (saved to `appState` as a top-level `preferences: { combatSpeed: 1 | 3 }` — survives reload). Cross-session is the standard ARPG/auto-battler convention; in-session is simpler and probably enough. Either is acceptable for the first pass.
  - If cross-session: extend the save schema (bump version if needed), default new saves to `1`, no migration needed for existing saves (treat missing as `1`).
- **Touches:** `src/scenes/combat_scene.ts` (read persisted value in `create()`, write on toggle, drop or adjust shutdown reset). If cross-session: also `src/save/save.ts` (schema), `src/scenes/app_state.ts` (no change — `appState.update` already handles it), possibly `src/save/migrations.ts`.
- **Source:** ad-hoc, smoke testing during task 18.

### 19 · Enemy art for Crypt

- **What:** Produce sprites for the 4 Crypt enemy types + 1 boss. Placeholder reuse of existing NPC frames is acceptable for Tier 1; bespoke pixel art can come later.
- **Why:** Combat scene needs enemy sprites. Without this, enemies are unrenderable.
- **Tier:** 1
- **Acceptance:**
  - Every enemy id referenced by `data/enemies.ts` maps to a valid sprite frame — either new pixels drawn in LibreSprite or reuse of existing NPC frames from the catalog.
  - `spritenames.txt` updated with the new / mapped entries; `npm run generate:names` run and output committed.
  - Boss is visually distinguishable (scaled up, unique frame, or outlined).
- **Touches:** `public/assets/sprites/base_sprites.png` (if drawing), `spritenames.txt`, `src/render/sprite_names.generated.ts` (regenerated).
