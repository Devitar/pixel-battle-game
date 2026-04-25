# History

Completed work with the context that git history alone can't capture: decisions made, alternatives rejected, surprises encountered.

When a task in [`TODO.md`](TODO.md) is finished, its entry moves here — extended with what was actually shipped, what was decided during implementation, and anything a future session (or future-you) would want to know before building on top of it.

Entries are chronological with **newest at the top**.

## Format

One section per completed task.

```markdown
### YYYY-MM-DD · Short title

- **What shipped:** the outcome in one or two sentences
- **Why:** the motivation (carried over from the TODO entry)
- **Decisions:** key choices made during implementation, with brief reasoning
  - *Chose X over Y because …*
- **Alternatives considered:** options explicitly looked at and rejected, with the rejection reason
- **Surprises / lessons:** anything discovered during the work that's worth remembering
- **Touches:** files / folders changed (commit SHAs optional)
- **Source:** originating TODO entry or ad-hoc note
```

Not every field is required for every entry — a small bug fix may only need *What shipped / Decisions / Touches*. Use judgement; the goal is future-useful context, not bureaucracy.

---

<!-- Add completed entries below this line. Newest at the top. -->

### 2026-04-25 · Dungeon scene (Tier 1)

- **What shipped:**
  - `src/scenes/dungeon_scene.ts` — full rewrite of task 15's stub. Side-scrolling level: dark crypt-purple background, four node icons (3 ⚔ + 1 ☠) at fixed x positions (180/360/540/720), party paperdolls (3, scale 2) walking left-to-right between nodes via tween (800ms walk-in / 600ms inter-node). HUD top-left/right shows `The Crypt · Floor N · Node M / 4` + `Pack: Ng`; status bar at the bottom shows party HP. State-machine driven (`walking_in` / `walking_to_next` / `showing_result` / `showing_wipe`).
  - **Inline combat resolution.** `startCombatAtCurrentNode` snapshots party HP, calls `resolveCombat(combatState, this.rng)` synchronously, applies via `completeCombat`, persists paired `runState` + `runRngState` in one `appState.update`, then opens either the result or wipe panel.
  - **Single rng instance per scene lifetime.** `create()` calls `createRngFromState(saveFile.runRngState!)`; that instance is reused for every combat in the scene. Each `appState.update` writes `rng.getState()` paired with the new `runState` to honor the save invariant from task 9.
  - **Result panel** (320×180): `Victory!` + `+{N}g` + per-hero `name: -delta HP (cur/max)` (or `untouched`). Click bg to dismiss → walk to next node, or `scene.start('camp_screen')` if boss just completed.
  - **Wipe panel** (400×220): `Wipe!` + heroes-lost list + `Return to Camp` button. Click → atomic `appState.update` filters lost heroes out of `roster` and clears `runState`/`runRngState`, then `scene.start('camp')`.
  - `src/scenes/camp_screen_scene.ts` — throwaway stub with key `'camp_screen'`. Renders run summary (`Floor Cleared!`, theme line, `Pack: Ng · M survivors`, optional fallen list) + a `Return to Camp` button that does *real* cashout work (banks gold via `credit`, updates each surviving hero's HP via `updateHero`, removes fallen via `removeHero`, clears `runState`/`runRngState`). Task 18 replaces with Leave / Press On UI; the cashout logic moves into the Leave handler unchanged.
  - `src/scenes/boot_scene.ts` — modified routing: if `saveFile.runState` is present after load, `scene.start('dungeon')`; otherwise `scene.start('camp')`. Closes the page-reload-mid-run gap from task 15's risks.
  - `src/main.ts` — registers `CampScreenScene` after `DungeonScene`.
  - No new tests. Pure-logic deps (`completeCombat`, `cashout`, `pressOn`, `resolveCombat`, `removeHero`, `updateHero`, `credit`, `createRngFromState`, save invariant) are covered by tasks 4 / 6 / 7 / 9.
  - Design spec at `docs/superpowers/specs/2026-04-25-dungeon-scene-design.md`; plan at `docs/superpowers/plans/2026-04-25-dungeon-scene.md`.
- **Why:** First Tier 1 scene to actually run combat — closes the loop from "Descend at Noticeboard" through "fight nodes" to "cashout at camp_screen → bank gold → next run." Tier 1 is now end-to-end playable.
- **Decisions:**
  - *Inline combat resolution, no scene swap (clarifying option A).* Combat is mechanically invisible in this task — `resolveCombat` runs synchronously between frames. Result panel is the only visible feedback. Task 17 will refactor by introducing the combat scene as an animation layer; for Tier 1, this approach saves a stub combat scene + scene-data callback dance, both of which task 17 has to write for real anyway.
  - *Side-scrolling, paperdolls walking between nodes (visual approval).* Matches GDD §1's "party walks right through a floor." Static camera, fixed node x positions (180/360/540/720), party tweens between them. No camera scroll because Tier 1's 4 nodes fit in 960px.
  - *Auto-walk + auto-fire combat.* No "ready to fight" prompt at a node. Combat fires on tween-complete. One less click between nodes; Tier 1 doesn't gain anything from a manual trigger.
  - *State machine: 4 states.* `walking_in` / `walking_to_next` / `showing_result` / `showing_wipe`. Deliberately omitted `idle_at_node` — combat fires immediately. The state field itself ended up not being read anywhere (transitions are managed by the switch in `setState` firing synchronously), so it was dropped during execution as orphan state.
  - *Single rng for the scene's lifetime.* `createRngFromState(runRngState)` in `create()`; each combat advances it; `appState.update` after each combat persists `rng.getState()`. Splitting into per-combat rngs would break determinism on resume.
  - *Atomic `appState.update` for every state-changing transition.* Combat completion writes paired `runState` + `runRngState`. Wipe handler writes paired `roster` + cleared `runState`/`runRngState`. Camp_screen-stub's cashout writes paired `vault` + `roster` + cleared `runState`/`runRngState`. Save invariant from task 9 is honored everywhere.
  - *Boot routing is binary.* `saveFile.runState` present → `'dungeon'`, else `'camp'`. No "resume run prompt with abandon option." Player who wants to discard a run mid-play has no UI for it (intentional roughness for Tier 1).
  - *No abandon path in the dungeon.* ESC does nothing. Player closes the tab to "abandon" (run state persists; reopening lands them back here). Intentionally rougher than the task-15 stub's ESC-clears-runState. Players should commit to runs in Tier 1.
  - *Camp_screen stub does real cashout work.* Banks gold + updates HP + removes fallen. Task 18 reuses this code path behind the Leave button. Tempting to "stub" it as pure-display, but Tier 1 has to feel rewarding — pack gold needs to actually bank.
  - *Result panel reads post-combat state from `appState`.* The panel runs after `completeCombat`'s `appState.update`, so `run.party` has post-combat HP. The "before HP" comes from `preCombatHp` snapshot taken before `resolveCombat`. Identity preserved across `completeCombat` (same hero `id`s in new objects).
  - *Boss vs combat lookup branch in `buildResultPanel`.* `completeCombat` advances `currentNodeIndex` for combat nodes but not for boss (it sets `status='camp_screen'` instead). The `isBoss` check (`run.status === 'camp_screen'`) drives both `justCompletedIdx` (for the reward calculation) and `displayIdx` in `refreshHud`.
  - *Disabled-but-still-interactive panel-click pattern.* The result-panel `bg` rectangle is the only interactive object; the title/lines/dismiss-hint sit on top non-interactively, so clicks pass through to `bg`. Same idiom as Barracks' slot bg + Noticeboard's drag bg.
- **Alternatives considered:**
  - *Stub the combat scene now, launch via `scene.launch`* (clarifying option B). Rejected — task 17 has to write the combat scene for real anyway; preserving the seam in this task means writing a stub plus a callback mechanism just to throw both away. Inline resolution gets us to a playable Tier 1 faster.
  - *"Approach" prompt at each node, click-to-trigger combat.* Rejected — adds a click between every node walk and every combat. Fine for Tier 2 polish if players want it.
  - *Auto-dismiss the result panel after a delay.* Rejected — players should pace themselves. Click-to-continue keeps them in control.
  - *Confirm-to-abandon dialog on ESC.* Rejected for Tier 1 — closing the tab is a fine workaround during dev, and Tier 1 design favors commitment to runs.
  - *Camp_screen as a pure-display stub* (no real cashout). Rejected — Tier 1 has to feel rewarding; player needs gold to bank to actually use it. Real cashout in the stub means task 18 just adds Press On.
  - *Partial wipe semantics* (only the heroes who hit 0 HP are lost; survivors return to roster). Rejected — `completeCombat` treats `'player_defeat'` and `'timeout'` as full wipes by Tier 1 design (lose everything).
  - *Per-task incremental scaffolding for the dungeon scene rewrite.* Rejected up front — strict-mode `noUnusedLocals` killed it on Tavern/Barracks/Noticeboard. Three tasks bottom-up (camp_screen stub → boot routing → full rewrite) gave clean review boundaries while keeping each task typecheck-clean.
- **Surprises / lessons:**
  - **Strict mode caught three orphan fields during execution.** The spec described `state`, `wipePanel`, and `lastResult` as scene-local state, but the actual code never read any of them — `state` was assigned but never branched on; `wipePanel` was assigned but never destroyed; `lastResult` was assigned but `buildResultPanel` re-read from `appState`. Strict mode rejected the unused fields. Lesson for spec self-review: walk each declared private field through the implementation and verify it's read, not just written. The tendency is to over-spec scene state (because it makes the design feel "complete") when the scene only actually uses a subset.
  - **Inline combat resolution worked exactly as expected.** No scene-swap dance, no callback mechanism, no event registry. The full flow (snapshot HP → resolveCombat → completeCombat → appState.update → result panel) is ~25 lines. Task 17 will re-architect this, but for Tier 1 the simplicity is the point.
  - **Boot routing was three lines and huge UX impact.** "If runState, go to dungeon, else camp" closes a real gap that would have been bad to discover after task 18 ships. Spec for this task explicitly required closing the gap (per task 15's risks bequest); doing it bottom-up before the dungeon rewrite meant the smoke test could verify routing in isolation.
  - **The render-from-state pattern (re-reading appState in onResultDismiss instead of tracking local "completed" state) keeps the scene robust.** If anything mutated `runState` between `appState.update` and `onResultDismiss` (it can't in single-threaded JS, but defensive design is cheap here), the dismiss handler would still do the right thing because it reads canonical state.
  - **The `isBoss` branch in `buildResultPanel` and `refreshHud` is the trickiest piece of the scene.** `completeCombat` advances `currentNodeIndex` for combat nodes but not for the boss. Two read sites both need the branch. Off-by-one here would mis-attribute the just-completed node's gold reward (combat reward vs boss reward) and show the wrong "Node M / N" in the HUD. Documenting the asymmetry in `run_state.completeCombat`'s comments would help future maintainers — task 17 / 18 will both touch this code path.
  - **The four consecutive Cluster B tasks (13–16) all had clean spec self-reviews catching real layout/architecture bugs before plan writing.** Tavern's panel-card overflow, Barracks' three layout-arithmetic bugs, Noticeboard's drag-drop swap-logic edge cases, Dungeon's `walking_in` resume bug + orphan field cleanup. The combination of "layout arithmetic check" and "trace each declared private field through implementation" is now a load-bearing part of the spec self-review.
- **Touches:**
  - `src/scenes/dungeon_scene.ts` (rewritten)
  - `src/scenes/camp_screen_scene.ts` (new — stub with cashout)
  - `src/scenes/boot_scene.ts` (modified — routing)
  - `src/main.ts` (modified — `CampScreenScene` registration)
  - `docs/superpowers/specs/2026-04-25-dungeon-scene-design.md` (new)
  - `docs/superpowers/plans/2026-04-25-dungeon-scene.md` (new)
- **Source:** `TODO.md` Cluster B · Task 16. Related: `gdd.md` §1 (Descend phase) and §10 (Tier 1 build plan), task 4 HISTORY (`resolveCombat`), task 6 HISTORY (`RunState`, `completeCombat`, `cashout`, `pressOn`), task 9 HISTORY (save invariant — `runState`/`runRngState` pairing — load-bearing for the rng-threading invariant here), task 11 HISTORY (`Paperdoll` reuse), task 15 HISTORY (panel architecture, dungeon-stub-as-bridge precedent — pattern repeated here for camp_screen).

### 2026-04-25 · Noticeboard & party picker (Tier 1)

- **What shipped:**
  - `src/scenes/noticeboard_panel_scene.ts` — full rewrite of task 12's stub. Two-stage panel: stage 1 shows a single centered Crypt dungeon card with theme + floor count; stage 2 shows three slot drop-zones across the top (slot 1 left = front, slot 3 right = back) and a 3×3 eligible-heroes grid below, with drag-and-drop assignment. ← Back returns to stage 1; ESC closes the whole panel.
  - `src/scenes/dungeon_scene.ts` — throwaway stub (key `'dungeon'`). Renders `Dungeon (stub)`, summarises the active run, ESC clears `runState`/`runRngState` and `scene.start('camp')`. Same precedent as task 12 stubbing the panel scenes for downstream work.
  - `src/main.ts` — registers `DungeonScene` after the panel scenes.
  - First Phaser drag-and-drop in the codebase. Scene-level `drag`/`drop`/`dragend` handlers wired in `create()`; per-card `bg.setInteractive({ draggable: true })` + per-slot `zone.setInteractive({ dropZone: true })`. Drop-zone identity carried via `setData('slotIndex', i)`; dragged hero identity via `setData('heroId', hero.id)`.
  - Atomic Descend: single `appState.update` writes `runState` + `runRngState: rng.getState()` to honor the save pairing invariant from task 9. Then `scene.stop()` + `scene.start('dungeon')` — first scene to leave camp via `start` rather than `resume`.
  - No new tests. All pure-logic deps (`startRun`, `listHeroes`, save invariant, `createRng`/`getState`) covered by tasks 6/7/9.
  - Design spec at `docs/superpowers/specs/2026-04-25-noticeboard-party-picker-design.md`; plan at `docs/superpowers/plans/2026-04-25-noticeboard-party-picker.md`.
- **Why:** Primary "begin a run" entry point — where the player commits a 3-hero formation and persists `RunState` for the dungeon to consume. The picker is also where setup-phase strategy lands: which classes, which slots, who tanks slot 1 in the Crypt.
- **Decisions:**
  - *Two stages in one scene (clarifying option A).* `'dungeon_list'` → `'party_picker'` with a `setStage(next)` helper that tears down + rebuilds via a `stageContainer`. Common chrome (overlay, panel rect, title, close ×) persists. Preserves the architecture for Tier 2 dungeons (the single Crypt card becomes a vertical list of identical-shape cards) without scene-management churn (rejected option C: two separate panel scenes) or a UX seam to fix in Tier 2 (rejected option B: skip the dungeon list entirely for Tier 1).
  - *Drag-and-drop assignment (clarifying option C).* User chose the polished interaction over click-sequential (option A, simpler) or click-slot-targeted (option B, more clicks per assignment). Reordering is the use case where drag wins decisively — drag-onto-occupied is a swap; click-sequential would need 4 clicks per swap.
  - *Battle-line slot layout (visual option B).* Three slot zones in a horizontal row across the top, slot 1 (front) at left and slot 3 (back) at right — reads like the formation reads in combat. Eligible 3×3 grid below. Beat horizontal split (visual option A) where slots stack vertically on the right.
  - *Render-from-state pattern.* `formation: (Hero | null)[3]` is the canonical model; `eligibleHeroes` is captured once on stage entry. `refreshPickerLayout()` walks both arrays and repositions all cards based on the current state — drag visuals can drift mid-drag (cards follow the cursor), but every drop / cancel triggers a refresh that snaps the layout deterministically. Don't track "where is each card" alongside `formation`.
  - *Drop-zone identity via `setData`.* Each slot zone gets `setData('slotIndex', i)`; each draggable bg gets `setData('heroId', hero.id)`. The scene's `drop` handler reads both via `obj.getData('heroId')` / `zone.getData('slotIndex')` — no ad-hoc maps from game-object to slot index. Mirrors the Phaser idiom and lets us add more drop-target shapes later (e.g., a "discard" zone in a future "swap heroes mid-camp" flow) without reshaping the handlers.
  - *Drag handle is the bg rectangle, HeroCard is non-interactive.* Same pattern as Barracks (task 14) — clicks pass through the visual `HeroCard` to the underlying interactive `bg`. Keeps cursor consistent and avoids re-binding on stage rebuilds.
  - *Atomic `appState.update` for Descend.* Single producer writes `runState` (from `startRun(...)`) and `runRngState: rng.getState()` together. The save invariant in `src/save/save.ts:20` requires both fields to be both-present-or-both-absent; splitting into two updates would break it intermittently.
  - *`scene.start('dungeon')` not `scene.resume('camp')`.* Descend leaves camp permanently — camp is no longer the next scene to resume. Camp gets re-created from `create()` when control returns (via the dungeon stub's "abandon" path or, in the future, via task 16's wipe / cashout transitions).
  - *Dungeon scene stub created as part of this task.* Same precedent as task 12 stubbing the panel scenes. The `scene.start('dungeon')` call needs a registered scene to resolve; the stub fills that role. Renders the active run summary (`Run active: crypt, floor 1`) so dev-time smoke testing can confirm the runState was persisted.
  - *Stub's "abandon" clears the run.* `appState.update(s => ({ ...s, runState: undefined, runRngState: undefined }))` then `scene.start('camp')`. Convenient for dev — escape hatch back to camp during testing. Doesn't model real Tier 1 wipe semantics (heroes lost, pack discarded — handled by `completeCombat`'s wipe outcome). Real dungeon scene (task 16) will treat abandon as a wipe or disallow it.
  - *Eligibility = `currentHp > 0`.* No "injured" filter — the wound system is Tier 2. Heroes return to roster on cashout with their post-run HP; if any drop to 0 they're treated as fallen. So `currentHp > 0` is functionally "alive and willing to descend" in Tier 1.
  - *Disabled Descend stays interactive.* Same lesson from Tavern — the click handler short-circuits via the inline guard `if (!this.formation.every(...)) return;`. Avoids re-binding `setInteractive`/`disableInteractive` on every refresh.
  - *Single Descend reason text: `Need 3 heroes`.* No other Tier 1 failure mode (no "no save room," no "dungeon locked"). Tier 2 may add reasons if equip-required-by-dungeon constraints arrive.
  - *Slot drop zones have a transparent dashed-aspirational border.* Phaser doesn't render dashed strokes natively; the spec acknowledged this and the implementation uses solid muted color with empty placeholder text + color contrast doing the visual work. Acceptable Tier 1 polish.
  - *No "remember last party," no party stats preview, no eligibility sort/filter.* All Tier 2 polish per spec §Risks.
- **Alternatives considered:**
  - *Click-sequential / click-slot-targeted assignment* (clarifying options A/B). Rejected — drag-drop reordering matters once the player has 3 in the formation, and the swap-via-drag interaction is much smoother. The fallback if Phaser drag misbehaves on the target platform is one rule change in `placeHeroInSlot`.
  - *Skip the dungeon-list step in Tier 1* (clarifying option B). Rejected — would create a UX seam that Tier 2 has to fix. Single centered card is a one-click step at minimum tax.
  - *Two separate panel scenes* (clarifying option C: `noticeboard_panel` + `party_picker_panel`). Rejected — scene-management overhead (close one, launch the other, share state via scene-data) for no real gain. The two-stage internal model fits naturally in one scene.
  - *Horizontal split layout for the picker* (visual option A: list left, slots right). Rejected — slot-row-as-battle-line (option B) reads more naturally for a formation-based combat game.
  - *Effective-stats display in the eligibility list.* Not even considered for Tier 1 — same `hero.baseStats` + trait-line approach as Barracks. Players can dig into Barracks for full ability mechanics.
  - *Party-composition validation* (e.g., disallow 3 priests). Rejected by design — learning happens through play.
  - *Per-task incremental scaffolding* — rejected up front. Strict-mode `noUnusedLocals` rules it out, same lesson as Tavern + Barracks. Two tasks: stub + main wiring; full noticeboard rewrite.
- **Surprises / lessons:**
  - **Phaser's drag-and-drop "just worked" on first try.** No event-order surprises: `drop` fires before `dragend` when the drop hits a zone, with `dragend`'s `dropped` arg `true`. When dragend fires with `dropped: false`, only `dragend` ran. Splitting responsibility between handlers (`drop` updates state and re-renders; `dragend` only re-renders on cancel) is the clean pattern. Worth noting for future scenes that want drag-drop — the first one taught the codebase the pattern.
  - **State-driven render is load-bearing for drag-and-drop.** Trying to track "where is each card" alongside `formation` would be brittle (drag visuals are mutated mid-drag by the input plugin; cancel needs to undo the mutation). Deriving everything from `formation` + `eligibleHeroes` after every state change makes the cancel path a one-liner: "call `refreshPickerLayout()`." Same architectural instinct as immutable state in the core game logic, applied to UI.
  - **The two-stage `stageContainer` pattern is reusable.** Common chrome stays parented directly to the scene; stage-specific objects go in `stageContainer` and get `removeAll(true)`'d on transition. Saves the verbose "track every stage-1 object so you can destroy them later" plumbing. Future multi-stage panels (Tier 2's blacksmith with multiple tabs?) should reach for this.
  - **The save-invariant from task 9 was load-bearing again.** `runState` + `runRngState` must be paired. Doing the Descend update as one producer kept the pairing automatic — splitting it into two `appState.update` calls would break the invariant intermittently (auto-save runs after each, so a refresh between the two would see only one field set). The producer pattern in `appState.update` makes the right thing easy.
  - **`scene.start` vs `scene.resume` is a real distinction with consequences.** Descend uses `scene.start('dungeon')` because the player is leaving camp permanently. Camp's `RESUME` listener never fires for this path — when camp is re-entered later, it's via `scene.start('camp')` from the dungeon scene, which restarts camp from `create()`. Slight overhead, but the alternative ("keep camp paused while running a dungeon and resume on cashout") would deadlock the scene stack and prevent full save-then-quit-then-resume flows. First scene to use `start`-not-`resume` for outbound transitions; pattern likely repeats in task 17 (combat) and task 18 (camp screen).
  - **Three consecutive Cluster B tasks with zero plan bugs caught at execution time.** Tasks 13, 14, 15 — the spec self-review (layout arithmetic + interface-extension audit) and the explicit "Notes for the implementer" section have prevented the kinds of issues that bit tasks 8–9. Worth keeping both practices.
- **Touches:**
  - `src/scenes/noticeboard_panel_scene.ts` (rewritten)
  - `src/scenes/dungeon_scene.ts` (new)
  - `src/main.ts` (modified — `DungeonScene` registration)
  - `docs/superpowers/specs/2026-04-25-noticeboard-party-picker-design.md` (new)
  - `docs/superpowers/plans/2026-04-25-noticeboard-party-picker.md` (new)
- **Source:** `TODO.md` Cluster B · Task 15. Related: `gdd.md` §6 (Camp / Buildings · Noticeboard) and §10 (Tier 1 build plan), task 6 HISTORY (`startRun`, `RunState` shape), task 9 HISTORY (save invariant — `runState`/`runRngState` pairing), task 11 HISTORY (HeroCard `small` variant — third consumer here), task 12 HISTORY (panel overlay architecture, dungeon-stub precedent), task 14 HISTORY (split-pane reuse, bg-as-click-target pattern, "interactive disabled" pattern).

### 2026-04-25 · Barracks UI (Tier 1)

- **What shipped:**
  - `src/scenes/barracks_panel_scene.ts` — full rewrite of task 12's stub. Split-pane panel: 380×360 list pane on the left with a 2×6 grid of `HeroCard` `small` variants (filled or faded `empty` placeholder), 440×360 detail pane on the right with paperdoll, name/class, stats line, trait line, and four ability blocks rendered via the new `describeAbility` helper. Selection by hero id with `#ffcc66` 2px outline; auto-selects `roster.heroes[0]` on open.
  - `src/data/ability_describe.ts` — pure TS, ~110 lines. `describeAbility(ability) → { castLine, targetLine, effectLines }` synthesizes display text from `Ability.canCastFrom + target + effects`. Reusable later for combat tooltips (task 17).
  - `src/data/__tests__/ability_describe.test.ts` — 12 unit tests covering each effect kind (damage / heal / stun / buff / debuff / mark / taunt) and target shape (slots `[n]` / `'all'`, filters `hurt` / `lacksStatus` / `hasStatus` / `hasTag`, picks `lowestHp` / `'first'`).
  - +12 assertions (total 493, was 481).
  - Read-only — no `appState` mutation. Camp's `RESUME` listener fires on close as a no-op refresh.
  - Design spec at `docs/superpowers/specs/2026-04-25-barracks-ui-design.md`; plan at `docs/superpowers/plans/2026-04-25-barracks-ui.md`.
- **Why:** Lets the player inspect their roster and plan party composition. Per the user's "this is the true gameplay" framing, the detail pane goes beyond name+stats — it shows full ability mechanics (cast slots, target rule with filter/pick, every effect on its own line) so a player can reason about who pairs with whom before committing to a party at the noticeboard.
- **Decisions:**
  - *Split-pane layout (visual option A).* List left, detail right, both visible. Selected. Beats swap-mode (option B, two screens in one panel — more friction) and sub-panel overlay (option C, extra close stack). Best for browsing/comparing heroes quickly without losing context.
  - *Full ability breakdown (option C from clarifying questions).* User explicit: "this area is the true gameplay — knowing exactly how a hero works is crucial." Added the `describeAbility` helper rather than just listing names. Ability block format = name (13px bold) + combined `Cast: X · Target: Y` meta line + one `→ effect` line per `effects[]` entry.
  - *`describeAbility` lives in `src/data/`.* Pure TS, paired with `abilities.ts`. Data layer owns its own presentation; firewalled from Phaser. Tests mount `ABILITIES` directly — no fixtures needed. Reusable by the combat scene later for tooltips.
  - *Selection by hero id, not index.* Future-proofs against roster reordering and external mutation. Cheap insurance — Tier 1 doesn't reorder, but `selectHero(id)` keeps `rebuildDetail` correct under any data change.
  - *`bg` Rectangle as both click target and selection outline.* 184×60 (4px larger than `HeroCard` 180×56) with fill alpha 0 (transparent) and stroke `#ffcc66` toggled between alpha 0 (hidden) and alpha 1 (visible) on selection. Avoids the toggle-`setInteractive`/`disableInteractive` churn from earlier panels and keeps the cursor consistent.
  - *Auto-select `roster.heroes[0]` on open* (Q3 option A). No dead-pane-on-open. Selection isn't persisted in `SaveFile`/`appState`; each launch is fresh.
  - *Stat display is mixed-fidelity.* HP shows `hero.maxHp` (post-trait, since `computeMaxHp` bakes Stout's +10% at hero creation). ATK/DEF/SPD show `hero.baseStats` (pre-trait, since stat traits apply at combat time via `getEffectiveStat`). The trait line below resolves the inconsistency by being explicit (`trait: Quick — +1 Speed`). Rejected the alternative of computing effective stats in the UI — would duplicate `getEffectiveStat`'s slot-aware logic.
  - *Combined `Cast:` and `Target:` onto one meta line* (rather than two). Caught during spec self-review: 4 ability blocks at 4 lines each + gaps would have overflowed the 360px detail pane bottom by 21px. Combining into one line drops one row per block; total height ≈ 208px now fits with 7px clearance.
  - *Empty placeholder cells.* Slots beyond `heroes.length` render as faded 180×56 rectangles with `empty` text in muted gray. Visual consistency over blank space; trivial Tier-2 hook for "Recruit at Tavern" CTA buttons.
  - *No equip / formation default / dismiss.* Per spec scope and TODO §14 acceptance — read-only in Tier 1. Tier 2 replaces `selectHero`'s detail rebuild with an editable variant + action buttons.
  - *No sort / filter.* Roster cap is 12; the 2×6 grid handles it. Tier 2 may add filters when the class roster grows past 6.
- **Alternatives considered:**
  - *Swap-mode panel* (visual option B). Rejected — two distinct screens in one panel adds a back-button click for every hero comparison.
  - *Sub-panel overlay for detail* (visual option C). Rejected — adds a layer to the close stack and more visual chrome without payoff.
  - *Name-only ability rendering* (option A from clarifying questions, "compact"). Rejected per user emphasis on gameplay depth.
  - *Simple `name + one-line description` ability format* (option B). Rejected for the same reason — not enough info for party-comp planning.
  - *Effective-stats display* (compute trait + slot-aware modifiers in the UI). Rejected — would duplicate `getEffectiveStat` and require a slot-less variant for the camp context. The trait line resolves the inconsistency well enough.
  - *Per-task incremental scaffold* (Task 1 = chrome, Task 2 = list, Task 3 = detail, etc.). Rejected up front based on the Tavern lesson — strict-mode `noUnusedLocals` kills declare-ahead plans. Combined into two tasks (helper, then full scene rewrite).
- **Surprises / lessons:**
  - **The "any slot" naming was inconsistent between spec and data.** Spec called Bulwark "any slot," but Bulwark's `canCastFrom` is `[1, 2, 3]` (player has only 3 slots), not `[1, 2, 3, 4]`. My initial helper rendered it as `slot 1, 2, or 3`. Tests caught the mismatch on first run. Fix: treat both `[1,2,3]` (player full) and `[1,2,3,4]` (enemy full) as `'any slot'` — for either audience there is no positional restriction. Lesson: when the spec uses player-facing language ("any slot"), check what the data actually says — natural-language descriptions don't translate mechanically. The fix is in the helper, not the data.
  - **Spec self-review caught four layout-arithmetic bugs** (Tavern caught one, Barracks four). Pattern: when a spec specifies *both* container and content dimensions, sum content + gaps and verify fit; this caught panel-too-narrow (cards overflow), columns-abutting (no gap), rows-overflow (cards extend above pane top), and detail-pane-too-short (ability blocks overflow bottom). All fixed inline by adjusting coordinates / merging the cast+target lines. Adding "layout arithmetic check" to the spec-review mental model has now paid off twice.
  - **Pure-TS `describeAbility` paired with data was the right placement.** It's TDD-friendly (no Phaser to mock), reusable for future combat tooltips, and the test file mounts `ABILITIES` directly — no fixtures, no test-only synthetic data except for the single-slot edge case. The instinct to put presentation helpers in `src/ui/` would have made it harder to test and would have coupled it to Phaser-importing folders.
  - **Stroke-alpha toggling for selection outlines is cleaner than re-binding interactivity.** `setStrokeStyle(2, color, alpha)` accepts alpha as third arg. Toggling 0/1 hides/shows the outline without re-creating the rectangle or fiddling with `setInteractive`/`disableInteractive`. Worth carrying forward for any "highlightable click target" pattern (tavern's hire button used the same hand-cursor-stays approach but with fill, not stroke; this is the stroke variant).
  - **Visual companion's third outing was clean.** Split-pane was the obvious pick once seen vs. swap-mode (two screens, friction) and sub-panel overlay (extra close stack). Text descriptions of three layout structures would have taken multiple back-and-forth rounds. Same observation as task 12's camp layout — pattern: use the companion when the question is "how should this look in space," skip it for architecture or tradeoff discussions.
- **Touches:**
  - `src/scenes/barracks_panel_scene.ts` (rewritten)
  - `src/data/ability_describe.ts` (new)
  - `src/data/__tests__/ability_describe.test.ts` (new)
  - `docs/superpowers/specs/2026-04-25-barracks-ui-design.md` (new)
  - `docs/superpowers/plans/2026-04-25-barracks-ui.md` (new)
- **Source:** `TODO.md` Cluster B · Task 14. Related: `gdd.md` §6 (Camp / Buildings · Barracks) and §10 (Tier 1 build plan), task 11 HISTORY (HeroCard small variant — second consumer here), task 12 HISTORY (panel overlay architecture, RESUME-driven HUD refresh), task 13 HISTORY (Tavern UI — first panel consumer of the same close pattern), task 7 HISTORY (`roster.listHeroes`), task 8 HISTORY (`TraitDef.description` field surfaced here).

### 2026-04-25 · Tavern UI (Tier 1)

- **What shipped:**
  - `src/scenes/tavern_panel_scene.ts` — full rewrite of task 12's stub. 920×340 panel overlay; three large `HeroCard`s in a row at x=170/480/790; hire button + reason text per slot; footer HUD `Vault: Ng · Roster: M / 12` inside the panel; close × + ESC handler preserved from stub.
  - Hire flow: re-read `appState`, gate on `canAdd(roster) && balance(vault) >= 50`, single `appState.update` that combines `spend` + `addHero` (auto-saved by AppState), reroll that slot's candidate via `generateCandidate(rng, unlocks.classes)`, `card.setHero(...)` to repaint, then `refreshButtons()` + `refreshFooter()`.
  - First real consumer of `HeroCard` (task 11). No new tests — pure-logic deps already covered by tasks 7 and 8.
  - Design spec at `docs/superpowers/specs/2026-04-25-tavern-ui-design.md`; plan at `docs/superpowers/plans/2026-04-25-tavern-ui.md`.
- **Why:** Primary path for new heroes into the roster, and the most-touched gameplay surface in Cluster B's camp loop. First task that exercises HeroCard end-to-end.
- **Decisions:**
  - *Re-roll candidates on every panel open* (option A). No persistent tavern state in SaveFile — closing + reopening produces fresh candidates. Tier 1's "no reroll" rule from GDD §10 is preserved as "no reroll button," not "fixed-across-sessions candidates." Tier 2's paid-reroll button + cost addresses the implicit free-reroll exploit directly; Tier 1 accepts it.
  - *3 cards in a row* (visual option A). Visual companion mockup pulled the answer in one click — "browse the lineup" feel beats list-style "3 rows" (option B).
  - *Single atomic `appState.update` for hire.* Producer combines `spend(s.vault, HIRE_COST)` and `addHero(s.roster, hired)` so the auto-save reflects the consistent post-hire state. Single-threaded JS makes the read-then-write window safe even under rapid double-click — the second invocation re-reads `appState.get()` after the first's update.
  - *Per-slot reroll on hire.* Only the hired slot's candidate is replaced; the other two are untouched. Player keeps their other choices visible — feels like the tavern responding to their action, not the world resetting.
  - *Gold-first reason ordering.* When both gold and roster cap would block, the button shows "Not enough gold" (not "Roster full"). Reason: players refill gold faster than they free roster slots — the gold reason is the more actionable one.
  - *Buttons stay interactive in disabled state.* Hand cursor stays consistent across enabled/disabled; clicks while disabled are silent no-ops gated by `hire()`'s top guard. Cleaner than toggling `setInteractive`/`disableInteractive` on every refresh.
  - *Re-read `appState.get().unlocks.classes` on every reroll* rather than caching at scene create. Cheap (one record access). If Tier 3 ever exposes mid-Tavern unlocks that should affect the next roll, this is correct; if not, no harm.
  - *Hire button uses one shared enabled-state across all 3 slots.* All three light up or grey out together because the gating is global (vault gold + roster cap). If Tier 2 introduces per-candidate prices or class-specific cap rules, the loop becomes per-button.
  - *No new unit tests.* `hire()` is a 4-line composition of `spend` + `addHero` (tested in task 7) and `generateCandidate` (tested in task 8). The rest is Phaser glue. Smoke-tested in dev server against the spec's 11-step sequence.
  - *No keyboard hire shortcuts (1/2/3).* Hire is a destructive action — gold spend, permanent roster change — and benefits from a deliberate click. ESC still closes.
  - *Panel widened from spec's draft 880 → 920 during self-review.* Original layout claimed "cards stay inside" but the math didn't work: 280-wide cards at x=170/480/790 span x=30..930, overflowing an 880-wide panel (x=40..920) by 10px on each side. Caught inline before plan; close × position recalculated to (933, 113).
- **Alternatives considered:**
  - *Persistent candidates in SaveFile* (option B from clarifying). Rejected for Tier 1 — adds schema complexity for no Tier-1 payoff. If Tier 2 persists, the migration trivially adds `tavernCandidates: undefined`.
  - *3 rows with hire button beside each card* (visual option B). Rejected — "list" feel vs "browse the lineup" feel of A; A also reads better at the 920×340 panel size.
  - *Per-button enabled state.* Rejected — Tier 1 gating is global. Tier 2 may flip this if per-candidate prices or class-cap rules arrive.
  - *Cache `unlocks.classes` at scene create.* Rejected — one record access on each reroll is negligible; future-proofs against mid-Tavern unlock changes.
  - *Disable interactivity on grey buttons.* Rejected — toggling `setInteractive`/`disableInteractive` per refresh adds churn and inconsistent cursor feedback. Inline guard in `hire()` is simpler and equivalent.
  - *Per-task incremental scaffold during execution.* Rejected mid-execution — see Surprises below. Plan's Tasks 1–4 commit boundaries collapsed into a single rewrite.
- **Surprises / lessons:**
  - **Phaser scene instances are reused across `scene.launch` calls.** Class field initializers (`this.candidates = []`) run once when the scene is first added to the game; subsequent launches re-run `create()` but the JS instance persists. Without an explicit `this.candidates = []; this.hireButtons = []` at the top of `create()`, re-opening the panel would retain destroyed-game-object references from the prior session. The plan caught this in the "Notes for the implementer" section, but it's the kind of trap that would have produced a baffling bug on second open. Worth flagging for any future scene that holds per-launch state in fields.
  - **Strict-mode `noUnusedLocals` killed the "declare-ahead, wire later" plan strategy.** The plan had Task 1 lay down `SLOT_X`, `hireButtons`, `footerText`, etc. in advance and Tasks 2–4 progressively use them. `npx tsc --noEmit` rejected the Task 1 commit because seven identifiers were unused. Collapsed to a single rewrite mid-execution. Lesson for future plans: in strict-mode codebases, every task boundary must be typecheck-clean on its own — no forward declarations. Either combine tasks that share scaffolding, or stage the declarations alongside their first use.
  - **Spec self-review caught a layout overflow before the plan was even written.** The 880×340 panel + 280-wide cards math didn't add up; cards overflowed by 10px on each side. Pure arithmetic on the spec's own numbers, but easy to miss when sketching coordinates. Rule of thumb: when a spec specifies both container and content dimensions, sum the content + gaps and check it fits. (Specs that *infer* container dimensions from content avoid this entirely — something to consider for future layout specs.)
  - **The disabled-but-still-interactive pattern beat the toggle-interactivity pattern.** Cursor consistency + zero re-binding on every state change. The hire() top guard is the only safety net, and it's also the place that matters for testability. Worth carrying forward whenever a Phaser button has a "disabled but visible" state.
- **Touches:**
  - `src/scenes/tavern_panel_scene.ts` (rewritten)
  - `docs/superpowers/specs/2026-04-25-tavern-ui-design.md` (new)
  - `docs/superpowers/plans/2026-04-25-tavern-ui.md` (new)
- **Source:** `TODO.md` Cluster B · Task 13. Related: `gdd.md` §6 (Camp / Buildings · Tavern) and §10 (Tier 1 build plan), task 11 HISTORY (HeroCard widget, large variant consumed here), task 12 HISTORY (camp scene + panel overlay architecture, RESUME-driven HUD refresh), task 7 HISTORY (`vault.spend`, `roster.addHero`/`canAdd`/`listHeroes`), task 8 HISTORY (`generateCandidate`, `HIRE_COST`).

### 2026-04-25 · Camp scene shell (Tier 1)

- **What shipped:**
  - `src/scenes/camp_scene.ts` — rewritten from task 10's stub. Side-scrolling village hub with HUD (vault gold), three clickable buildings (Tavern / Barracks / Noticeboard) on a ground line, dev shortcut hint.
  - `src/scenes/tavern_panel_scene.ts` — stub overlay scene for task 13.
  - `src/scenes/barracks_panel_scene.ts` — stub overlay scene for task 14.
  - `src/scenes/noticeboard_panel_scene.ts` — stub overlay scene for task 15.
  - `src/main.ts` — registers the 3 new panel scenes alongside existing.
  - No new tests (Phaser glue; smoke-tested in dev server).
  - Design spec at `docs/superpowers/specs/2026-04-24-camp-scene-shell-design.md`; plan at `docs/superpowers/plans/2026-04-24-camp-scene-shell.md`.
- **Why:** Player's home base. Boot routes here; every run cashout/wipe returns here. After this task, the game has a navigable shell — stubs at the panel level, real flow at the scene level.
- **Decisions:**
  - *Overlay panel architecture (option B from brainstorming).* `scene.launch(panelKey)` + `scene.pause('camp')` opens a panel as a modal popover with the camp dimmed underneath. Close: `scene.stop()` + `scene.resume('camp')`. More DD-like feel than full scene swaps; camp stays in memory so HUD state isn't rebuilt from scratch on every panel close.
  - *Side-scrolling village layout (option C from visual brainstorming).* Three side-by-side mockups in the visual companion made this an instant pick — buildings on a ground line at varied heights, HUD top-left, dev hint bottom-right. GDD-aligned ("Camp is presented as a side-scrolling village"). Other options (HUD top-right with row of buildings, HUD as a bottom status bar) felt static by comparison.
  - *HUD refresh on `Phaser.Scenes.Events.RESUME`.* When a panel closes via `scene.resume('camp')`, Phaser fires the RESUME event on camp's event emitter. The handler re-reads `appState.get().vault` and calls `setText` on the gold text. Simplest reactive-state pattern that works without an event bus on AppState itself.
  - *Three near-duplicate panel stub files (no shared base class).* YAGNI — bodies will diverge significantly when filled in (Tavern shows candidate cards, Barracks shows roster list, Noticeboard shows dungeon list). A common base class would have to be torn apart for each. Stubs are ~40 lines each and will be replaced in tasks 13/14/15.
  - *Both ESC key and × button close the panel.* ESC for keyboard convenience, × button for mouse-only users and visual affordance. Both call the same `close()` helper that does `scene.stop()` + `scene.resume('camp')`.
  - *Dev shortcuts on `9` / `0`* (not `1`/`2`/`3`). Keeps the latter open for per-building hotkeys when Tier 1 / Tier 2 wants them. `9` → MainScene (paperdoll demo), `0` → ExplorerScene (sprite catalog).
  - *Tier 1 placeholder visuals — labeled rectangles.* Tavern brown (`#664433`), Barracks gray (`#555555`), Noticeboard tan (`#998866`). Tier 2+ adds sprite art. The `buildBuilding(...)` helper takes color + size as args; swapping to `buildBuildingSprite(...)` later is mechanical.
  - *Stub panel scenes are registered globally in `main.ts`.* Three scene-manager slots; negligible overhead. Registering up-front means tasks 13/14/15 don't have to also touch `main.ts` when they fill in the bodies.
- **Alternatives considered:**
  - *Full scene swap (option A) — `scene.start('tavern')` instead of overlay.* Rejected per user — overlay matches the GDD's modal-popover flavor and avoids reconstructing camp from scratch on every panel close.
  - *Panels as Containers inside camp scene (option C from architecture Q1).* Rejected — camp would become a fat state machine and scale poorly to Tier 2's 5+ buildings.
  - *One generic `placeholder_panel_scene.ts` parameterized by name.* Rejected — couples the three stubs together; tasks 13/14/15 would have to untangle them anyway when filling in.
  - *HUD top-right with row of buildings (visual option A).* Rejected — flat row of buildings feels static.
  - *HUD as a bottom status bar (visual option B).* Rejected — more game-UI-conventional but doesn't match the "village" tone.
  - *ESC-only or button-only close.* Rejected — both improves discoverability without UI clutter.
  - *Drop dev shortcuts entirely.* Rejected — useful during Cluster B development; can be removed later via an `import.meta.env.DEV` gate.
- **Surprises / lessons:**
  - **Three consecutive zero-plan-bug tasks (10, 11, 12) in Cluster B.** The interface-extension audit subsection has been a reliable "did I change any existing types?" prompt; combined with the smoke-test-via-real-consumer pattern (defer scene-level testing until the next consumer task), Cluster B's plan velocity is consistently clean. Worth carrying both forward.
  - **`Phaser.Scenes.Events.RESUME` is the right hook for HUD refresh** without needing a reactive AppState. The pattern is: caller pauses, panel does its thing (auto-saves to AppState/localStorage), panel close fires RESUME on the camp, camp re-reads. No pub/sub needed for Tier 1's "panels close after each meaningful action" model. If panels grow live-update needs (e.g., a Tavern that previews stat changes from gear loadout in real time), that's the point to revisit.
  - **Visual companion's second outing was clean.** Layout C (side-scrolling village) was the obvious GDD-aligned choice once seen as a mockup. Text descriptions of three layout variants would have taken multiple back-and-forth rounds; the visual pulled the answer out in one click. Pattern: use the companion when the question is "how should this look in space," skip it for architecture or tradeoff discussions.
  - **Three near-duplicate stub files in source is fine.** The "DRY = always extract common code" instinct is wrong here — the bodies will diverge in tasks 13/14/15, and a common base class would have to be torn apart for each. Recognizing when duplication is temporary (stubs) vs permanent (call sites) matters.
- **Touches:**
  - `src/scenes/camp_scene.ts` (rewritten)
  - `src/scenes/tavern_panel_scene.ts` (new)
  - `src/scenes/barracks_panel_scene.ts` (new)
  - `src/scenes/noticeboard_panel_scene.ts` (new)
  - `src/main.ts` (modified — scene registrations)
  - `docs/superpowers/specs/2026-04-24-camp-scene-shell-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-camp-scene-shell.md` (new)
- **Source:** `TODO.md` Cluster B · Task 12. Related: `gdd.md` §6 (Camp / Buildings), task 10 HISTORY (BootScene routes here; AppState singleton consumed by HUD), task 7 HISTORY (`vault.balance` for gold display).

### 2026-04-24 · Hero card widget (Tier 1)

- **What shipped:**
  - `src/render/hero_loadout.ts` — `heroToLoadout(hero): Loadout`. Pure TS that converts a `Hero` into the layered `Loadout` Paperdoll consumes. String-id → number-id parsing at this seam.
  - `src/render/__tests__/hero_loadout.test.ts` — 4 unit tests (Knight + shield, Archer no shield, Priest no shield, body field uses `bodySpriteId`).
  - `src/ui/hero_card.ts` — `HeroCard extends Phaser.GameObjects.Container`. Reusable widget with `small` / `large` sizes, `isDead` mode, optional click handler, and a `setHero(hero)` rebuild method.
  - First entry into `src/ui/` — the new home for reusable Phaser widgets.
  - +4 assertions (total 481, was 477).
  - Design spec at `docs/superpowers/specs/2026-04-24-hero-card-design.md`; plan at `docs/superpowers/plans/2026-04-24-hero-card.md`.
- **Why:** Three Tier 1 scenes need to render heroes — Tavern (candidates, task 13), Barracks (roster, task 14), post-boss Camp Screen (task 18). One widget instead of three drifting reimplementations. Builds the pattern for future shared UI components.
- **Decisions:**
  - *Both size variants use a horizontal layout* (paperdoll on the left, text + HP bar on the right). Decided by visual brainstorming with the new browser companion. Three side-by-side mockups (small horizontal+large vertical / both vertical / both horizontal) made the choice obvious in a way text descriptions wouldn't have. Both-horizontal gives consistency across contexts — small (180×56) for list rows, large (280×120) for inspection panels.
  - *`heroToLoadout` lives in `src/render/hero_loadout.ts`* — pure TS, separate from `paperdoll.ts`. The Loadout type stays in `paperdoll_layers.ts`; this new file is the Hero→Loadout transformation. Reusable beyond HeroCard (e.g., dungeon scene's party-walking sprites in task 16).
  - *String-to-number `parseInt` at the `heroToLoadout` seam.* `Hero.bodySpriteId` and `ClassDef.starterLoadout.weapon/shield` are stringified frame indices (per task 2 convention); Paperdoll's Loadout expects numbers. This file is the boundary; consumers don't think about it.
  - *`HeroCard` is a Phaser Container subclass.* Idiomatic Phaser. Children added via `this.add(...)`; whole card moves/scales as a unit.
  - *`setHero(newHero)` rebuilds all children* via `removeAll(true)` + `buildChildren()`. No diffing. Cards aren't update-heavy in Tier 1; correctness over micro-optimization.
  - *`isDead` is an explicit constructor option, not derived from `currentHp ≤ 0`.* Mid-combat, party heroes can be at 0 HP without yet being categorized as fallen by run state. The caller knows the difference; the card renders what it's told.
  - *Dead state visual:* paperdoll alpha 0.5, "(Fallen)" suffix on name, HP bar / stats hidden, border swapped to muted red. Hero stays recognizable but clearly inactive.
  - *HP bar color thresholds at 50% (green→yellow) and 25% (yellow→red).* At-a-glance health read.
  - *Click handler attached to the background rectangle.* `setInteractive({ useHandCursor: true })` on the rect gives a single uniform hit area covering the whole card.
  - *No unit tests for the HeroCard class itself.* ~120 lines of Phaser glue; mocking `Phaser.GameObjects.Container`, `scene.add.text/rectangle`, and `Paperdoll` is high-effort, low-yield. The pure logic (loadout derivation, HP color thresholds) is unit-tested or trivial; the rest is well-tested by Phaser itself.
  - *Smoke testing deferred to task 13 (Tavern UI).* Task 13 is the first real consumer; visual validation lands there in context. Risk is low — Phaser primitives (text, rectangle, container) are battle-tested.
  - *Tier 1 Loadout fields only.* Body, weapon, shield. Legs / feet / outfit / hair / hat are randomized at recruitment in Tier 2's gear/cosmetic system. The `Loadout` type already has them as optional; we leave them undefined.
- **Alternatives considered:**
  - *Small horizontal + large vertical (visual option A).* Rejected — gives small a different orientation than large, leading to layout drift between contexts.
  - *Both vertical (visual option B).* Rejected — vertical small variant felt cramped when seen visually.
  - *Reactive AppState subscription on the card.* Tier 2. Tier 1 caller drives updates via `setHero`.
  - *Diffing in `setHero`* (only update changed children). Rejected — premature optimization. Simpler rebuild is correct and fast enough for Tier 1's update cadence.
  - *HP-derived dead state* (auto-detect `currentHp ≤ 0`). Rejected — loses the caller's intent. A combat hero at 0 HP isn't necessarily "fallen" yet.
  - *Mocking Phaser for unit tests on the HeroCard class.* Rejected — disproportionate effort for marginal coverage gain over what `heroToLoadout` already tests.
  - *Including stats inline in the small variant.* Rejected — small is already 56px tall; cramming ATK/DEF/SPD doesn't fit. Stats live on `large` only.
- **Surprises / lessons:**
  - **First visual companion use validated the workflow.** Three layout mockups in side-by-side HTML made the orientation question (small horizontal? both horizontal? both vertical?) immediate to decide. Text descriptions of the same options would have produced more back-and-forth. Worth using for future layout/composition questions; not worth the overhead for architecture or tradeoff discussions.
  - **`src/ui/` finally exists.** First widget. The `src/README.md` directory map predicted it; the firewall rule held: `src/render/` stays phaser-free, `src/ui/` is where Phaser glue lives.
  - **Two consecutive tasks with zero execution-time plan bugs (tasks 10, 11).** The "interface-extension audit" subsection in the plan self-review keeps catching its target — both tasks added new types but didn't modify existing interfaces, and the audit confirmed it explicitly. Establishing this as part of the brainstorming → plan → execute pipeline for Cluster B was a deliberate carryover from the Cluster A retrospective.
  - **The "string-id at the data layer, number-id at the render layer" convention has its first real consumer.** `heroToLoadout` is the bridge. Future code that needs sprite-frame numbers from Hero / ClassDef data goes through this seam (or a similar one). If it grows past 2-3 callers, factor a generic `parseSpriteId` helper.
  - **Smoke-test-via-real-consumer pattern works for small widgets.** HeroCard's correctness is mostly typecheck + sensible Phaser primitives. The first time it'll render in a real scene is task 13; if anything looks off there, fix is a small focused change. Compared to mocking Phaser to verify the rendering pipeline, this is much lower-effort.
- **Touches:**
  - `src/render/hero_loadout.ts` (new)
  - `src/render/__tests__/hero_loadout.test.ts` (new)
  - `src/ui/hero_card.ts` (new — first file in src/ui/)
  - `docs/superpowers/specs/2026-04-24-hero-card-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-hero-card.md` (new)
- **Source:** `TODO.md` Cluster B · Task 11. Related: task 6 HISTORY (Hero type), task 8 HISTORY (Hero.bodySpriteId), task 10 HISTORY (AppState — what scenes will use to drive HeroCards), task 0 (paperdoll system).

### 2026-04-24 · Boot scene + asset preload + save-aware routing (Tier 1) — Cluster B begins

- **What shipped:**
  - `src/save/boot.ts` — `resolveSaveState(storage, rng): { saveFile, isNew }`. Pure-TS load-or-create-fresh logic.
  - `src/scenes/app_state.ts` — `AppState` singleton class + exported `appState` instance. `init` / `get` / `update(producer)` / `reset`. **Auto-saves on every update.**
  - `src/scenes/boot_scene.ts` — `BootScene` (preload sprite sheet, resolve save, init AppState, transition to camp).
  - `src/scenes/camp_scene.ts` — stub `CampScene`. Renders save-state summary + keyboard shortcuts (`1` → dev paperdoll demo, `2` → sprite explorer). **Replaced in task 12.**
  - `src/main.ts` — registers `BootScene` first; `MainScene` and `ExplorerScene` stay registered as dev-only scenes.
  - 4 new test files. +13 assertions (total 477, was 464).
  - Design spec at `docs/superpowers/specs/2026-04-24-boot-scene-design.md`; plan at `docs/superpowers/plans/2026-04-24-boot-scene.md`.
- **Why:** First Cluster B task. Cluster A's pure-TS modules needed a runtime entry point. The boot scene resolves save state, populates the cross-scene `AppState` singleton, and transitions to camp — every subsequent scene assumes both assets are loaded and AppState is initialized.
- **Decisions:**
  - *Stub `CampScene` now, replaced in task 12.* Throwaway ~30 lines that give the boot scene a real transition target. Keeps scene keys (`'camp'`) stable across tasks 10–12. Renders save-state summary so smoke testing shows actual data.
  - *`AppState` singleton class with auto-save on every update.* Producer pattern (`update(prev => newState)`) matches Cluster A's immutable contract. Auto-save removes a class of "forgot to persist after X" bugs at the cost of one localStorage write per state change — fast enough not to matter.
  - *Pure-TS / Phaser-glue split.* `resolveSaveState` (pure logic) and `AppState` (plain TS class) are unit-tested with a `MemoryStorage` shim. `BootScene` and `CampScene` are smoke-tested via the dev server only. Scene classes are thin enough (~30 lines each) that smoke-testing is sufficient verification.
  - *`resolveSaveState` lives in `src/save/boot.ts` (firewall-pure).* Even though it's the bootstrap-time function, its logic is save-domain — testable without phaser. Naming convention: `boot.ts` next to `save.ts` signals "save-side bootstrap pairs with the BootScene."
  - *`AppState` singleton lives in `src/scenes/app_state.ts`.* Conceptually scene-domain (it's how scenes share state) but the file itself imports nothing phaser-related. Tests work without phaser.
  - *Dev scene access via keyboard shortcuts in stub camp.* `1` → MainScene (paperdoll demo), `2` → ExplorerScene (sprite catalog). Throwaway; goes away when task 12 lands real camp UI.
  - *Mid-run save handling deferred to task 16.* If `saveFile.runState` is present, the boot scene still routes to camp; task 16's dungeon scene will detect a present `runState` in `appState` and offer "resume run" UI when it lands.
  - *`Date.now()` seeds the boot rng.* Only non-deterministic source in the codebase. Affects fresh-save hero rolls only — produces varied starter rosters per fresh launch. Combat/floor RNG uses run-specific seeds traceable from `RunState.seed`.
  - *`window.localStorage` hardcoded in `BootScene.create()`.* The save module's storage abstraction is for testability; the production boot path is the one place real localStorage gets injected. Pragmatic concentration of "production glue" in one location.
  - *`reset()` on AppState is test-only.* Marked in doc comment; production never calls it. Vitest's `beforeEach(appState.reset)` provides test isolation despite the singleton's module-scoped state.
  - *No reactive event emitter on AppState.* Scenes that need fresh state call `appState.get()` at lifecycle hooks. Tier 2 may add subscribe/notify when reactive UI components arrive (Tavern hire button, vault gold display, etc.).
- **Alternatives considered:**
  - *Route to `MainScene` as placeholder (instead of stub camp).* Rejected — leaks a dev scene into the production flow that has to be undone in task 12.
  - *BootScene displays state and stops.* Rejected — leaves the player in a "what now?" dead-end with no path to dev scenes.
  - *Phaser registry direct (`this.registry.set/get`).* Rejected — type-unsafe (every read is a cast), no auto-save mechanism.
  - *Phaser registry with typed helpers.* Rejected — same backing store as direct registry; doesn't add the auto-save and producer pattern that the singleton class provides.
  - *Inline `resolveSaveState` logic in `BootScene.create()`.* Rejected — couples the load-or-create logic to a Phaser scene, making it hard to test without a Phaser game context.
  - *Reactive AppState with subscribe/notify.* Tier 2 scope. Tier 1 scenes pull state on lifecycle hooks; no reactive UI yet.
- **Surprises / lessons:**
  - **Zero plan bugs at execution.** Two prior tasks (8 and 9) hit grep-related self-review gaps. This task had no interface or signature changes — the plan's interface-extension audit subsection confirmed it explicitly. The "no signature changes" status was the easiest audit to verify.
  - **The phaser firewall held perfectly on first runtime task.** `boot.ts` and `app_state.ts` stay phaser-free; only `boot_scene.ts` and `camp_scene.ts` import phaser. The Cluster A invariant ("pure TS in firewalled folders") translates cleanly to "pure-TS layer + Phaser glue layer" in production code.
  - **Singleton-with-auto-save is the right shape for save-mutating scenes.** Every Cluster B scene that changes save state (camp recruitment, post-combat updates, run start/end) will call `appState.update(producer)`. The pattern hides storage entirely — scenes never touch `Storage` directly. Forecast: this becomes the most-used pattern in Cluster B.
  - **Stub-as-bridge unblocks downstream tasks.** Task 10 needed a transition target (camp scene) that doesn't land until task 12. ~30 lines of throwaway stub code with a clear "replaced in task 12" comment got task 10 to a real visual milestone without blocking on the full camp implementation. Useful pattern when a task's natural transition target is several tasks downstream.
  - **Smoke testing scene classes is sufficient.** `BootScene` has 3 lines of meaningful code (resolve, init, transition) that the unit-tested `resolveSaveState` and `AppState` already validate. Forcing scene unit tests would mean mocking Phaser — high effort, low yield. The dev-server smoke test caught nothing the unit tests didn't already cover, but takes 30 seconds and provides confidence that the wiring works end-to-end.
- **Touches:**
  - `src/save/boot.ts` (new)
  - `src/save/__tests__/boot.test.ts` (new)
  - `src/scenes/app_state.ts` (new)
  - `src/scenes/__tests__/app_state.test.ts` (new)
  - `src/scenes/boot_scene.ts` (new)
  - `src/scenes/camp_scene.ts` (new — stub)
  - `src/main.ts` (modified — BootScene registered first)
  - `docs/superpowers/specs/2026-04-24-boot-scene-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-boot-scene.md` (new)
- **Source:** `TODO.md` Cluster B · Task 10. Related: `gdd.md` §1 (core loop's boot flow), task 8 HISTORY (`generateStarterRoster` consumed here), task 9 HISTORY (save module + `createDefaultUnlocks`).

### 2026-04-24 · Save / load via localStorage (Tier 1) — Cluster A complete

- **What shipped:**
  - `src/save/save.ts` — `SaveFile` interface, `STORAGE_KEY`, `save` / `load` / `clearSave` / `createDefaultUnlocks` over a dependency-injected `Storage`. Re-exports `CURRENT_SCHEMA_VERSION`.
  - `src/save/migration.ts` — `CURRENT_SCHEMA_VERSION = 1`, empty `MIGRATIONS` registry, `migrate(raw)` runner.
  - `src/data/types.ts` — `Unlocks { classes, dungeons }`.
  - `src/util/rng.ts` — refactored to share `createRngInternal`. `Rng` interface gains `getState(): number`. New `createRngFromState(state)` for resuming.
  - 4 new test files / extensions; +20 assertions (total 464, was 444).
  - Design spec at `docs/superpowers/specs/2026-04-24-save-load-design.md`; plan at `docs/superpowers/plans/2026-04-24-save-load.md`.
- **Why:** Persistence layer for the player's progress. Without it, refresh = lose everything. Mid-run save means a player can close the browser at any point during a 25-minute run and resume.
- **Decisions:**
  - *Save mid-run state, not just persistent state.* User explicitly chose option B during brainstorming. Costs RNG-state serialization but means refresh during a run doesn't wipe it. The pairing invariant `runState ↔ runRngState` keeps the two fields in lock-step.
  - *Dependency-injected `Storage`.* `save(data, storage)` / `load(storage)`. Production passes `window.localStorage`; tests pass a `MemoryStorage` shim (~10 lines). Avoids the vitest environment switch that direct `window.localStorage` would have required.
  - *Pairing invariant — `save` throws, `load` recovers.* Asymmetric on purpose: caller bugs surface immediately at write; corrupted-file edge cases drop the run gracefully and keep persistent state. Recovery hierarchy: pairing violation → drop run; corrupt JSON / shape mismatch / future version / migration failure → null + warn; missing key → null (not an error).
  - *Crash-free `load`.* `console.warn + return null` on every error path. Boot scene treats null as "create a new game." Never throws.
  - *Migration framework keyed by `fromVersion`.* Each entry produces a save at `version + 1`; chain runs until `CURRENT_SCHEMA_VERSION`. Empty in Tier 1; Tier 2's first schema bump exercises it end-to-end.
  - *`CURRENT_SCHEMA_VERSION` lives in `migration.ts` (re-exported from `save.ts`).* Avoids a runtime circular reference. `save.ts` imports value `migrate` + `CURRENT_SCHEMA_VERSION` from migration; `migration.ts` imports `type SaveFile` (erased at compile time via `verbatimModuleSyntax`). One-way value dependency.
  - *RNG state as a single `number`.* mulberry32's internal state is one 32-bit integer; `getState()` exposes it, `createRngFromState(state)` resumes. Round-trip property tested.
  - *`Unlocks` is `{ classes: ClassId[], dungeons: DungeonId[] }`.* Tier 1 default: knight/archer/priest, crypt. Tier 2+ extensions append via migrations.
  - *Single localStorage key (`pixel-battle-game/save`).* One JSON blob, atomic save/load. No partial keys.
  - *`createDefaultUnlocks` lives in `save.ts`, not `data/`.* "What's in a fresh save" co-located with the SaveFile type that defines it. If the default later needs to be data-driven, move it.
- **Alternatives considered:**
  - *Option A — only persistent state saves; mid-run is ephemeral.* Rejected per user's explicit "B" call.
  - *Direct `window.localStorage` access in save.ts.* Rejected — tests would need a vitest environment switch (jsdom).
  - *Module-scoped `storage` variable with setter.* Rejected — subtle test-isolation issues.
  - *Throw on read corruption.* Rejected — boot scene depends on the crash-free guarantee.
  - *Final-shape validator after migration.* Rejected — overlaps with migration's responsibility.
  - *`CURRENT_SCHEMA_VERSION` in save.ts (with type-only `import type` from save in migration).* Tried first; the value circular reference would have worked via lazy evaluation but is fragile. Migrating it to migration.ts is cleaner.
- **Surprises / lessons:**
  - **Second plan-bug of the same shape: interface extension breaks inline mocks.** I added `getState()` to the `Rng` interface. My self-review's "caller-update audit" claimed no external `Rng` implementations existed because I `grep`'d for `createRng(`. Missed that `encounter.test.ts` (task 5) has **3 inline `Rng = { ... }` mocks** that don't implement `getState`. Strict TS caught it at the typecheck gate; fix was 3 line additions. **Compound lesson with task 8:** when changing public surface, the right grep depends on what's changing.
    - Adding **a method** to an interface → grep `: Rng`, `Rng = {`, `as Rng`, `extends Rng` (for impls).
    - Changing **a function signature** → grep `functionName(` (for callers).
    - Both can break, and a single grep won't catch both cases.
    - **Action item for Cluster B:** add an "interface-extension audit" sub-step to plan self-reviews when a task touches public types or function signatures.
  - **The pairing-invariant idiom is reusable.** "These two fields are both present or both absent" applies to `runState`/`runRngState` here. It's likely useful elsewhere when state spans multiple values that must transition atomically.
  - **`verbatimModuleSyntax: true` made the migration↔save circular reference clean.** Type-only imports are fully erased at compile time, so a value cycle can't form. The compiler enforces it: bare `import { SaveFile }` would have been an error.
  - **Round-trip testing for the RNG state was satisfying.** `createRngFromState(rng.getState())` produces an RNG whose subsequent sequence matches the original. Five lines of test code; load-bearing for save/load correctness.
- **Touches:**
  - `src/data/types.ts` (modified — +Unlocks)
  - `src/util/rng.ts` (refactored — shared internal, +getState, +createRngFromState)
  - `src/util/__tests__/rng.test.ts` (extended — round-trip tests)
  - `src/dungeon/__tests__/encounter.test.ts` (modified — getState added to 3 inline Rng mocks; caught at execution)
  - `src/save/save.ts` (new)
  - `src/save/migration.ts` (new)
  - `src/save/__tests__/save.test.ts` (new)
  - `src/save/__tests__/migration.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-save-load-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-save-load.md` (new)
- **Source:** `TODO.md` Cluster A · Task 9. Related: every prior Cluster A task (this is where their persistence contracts validate).

---

#### Cluster A retrospective

Cluster A's nine tasks landed all of the pure-TypeScript foundation: rng + types, classes, enemies, combat engine, floor generator, run state, roster/vault, recruitment + traits, save/load. **464 tests, zero phaser imports outside of the firewalled directories, full deterministic replay** (same seeds → same outcomes for combat, floor generation, recruitment, all of it).

**Design decisions that proved load-bearing across multiple tasks:**

- **Immutable state with explicit return-the-new-value contract.** Used in run state, pack, vault, roster, save file. Made testing trivial (`JSON.parse(JSON.stringify(state))` snapshot + post-op deep-equal). Cost: a small amount of allocation. Worth it.
- **Stable `combatantId` scheme (`p0..p2`, `e0..e3`).** Bridges the run state's party array with the combat engine's combatant list. Persisted unchanged from task 4 through task 9.
- **`Hero` as cross-domain anchor.** Defined in task 6; consumed by combat (combatant factories), run (party), camp (roster), save (persistence). One type, four domains.
- **`data/types.ts` as central type module.** Every domain imports from it. Centralized literal unions (`ClassId`, `EnemyId`, `DungeonId`, `TraitId`, `StatusId`) made cross-domain references cheap and safe.
- **Throw-on-invariant + paired predicate pattern.** `canAdd` + `addHero`-throws; `addGold`-throws-on-negative; `save`-throws-on-pairing-violation. Two-function pattern at every data-layer boundary.
- **Caster-relative `Side` (`'self' | 'ally' | 'enemy'`) vs absolute `CombatSide` (`'player' | 'enemy'`).** Separate names prevented a class of bugs at consumer call sites where the union types would have allowed nonsensical assignments.

**Recurring plan-bug pattern:** interface or signature changes that break callers/implementations the grep didn't surface.

- Task 8: changed `createHero` signature; missed `roster.test.ts`'s 5 callers in self-review.
- Task 9: added `getState()` to `Rng`; missed `encounter.test.ts`'s 3 inline `Rng` mocks.

Both cases were caught by strict TS at the typecheck gate. The crash-free habit (run typecheck after every task, not just `npm test`) saved both. **Cluster B's brainstorming should add an "interface-extension audit" subroutine** when a task changes public types or function signatures: grep both for the type name AND for factory/constructor calls; enumerate callers/implementations explicitly in the plan.

**Cluster B begins next:** Phaser scenes, UI widgets, the actual playable game shell. Cluster B can import phaser. Every Cluster A type and function gets its first runtime consumer in scenes — design decisions that survived the test suite get their second validation against real gameplay.

### 2026-04-24 · Recruitment & trait system (Tier 1)

- **What shipped:**
  - `src/data/traits.ts` — 6 Tier 1 traits (`stout`, `quick`, `sturdy`, `sharp_eyed`, `cowardly`, `nervous`). Types in `data/types.ts`: `TraitId`, `TraitDef`, `TraitHpEffect`, `TraitStatEffect`, `TraitCondition`.
  - `src/data/names.ts` — 50 ungendered fantasy names. `src/data/body_sprites.ts` — 8 race × gender sprite frame ids.
  - `src/heroes/hero.ts` — `Hero` gains `traitId` and `bodySpriteId`. `createHero` signature extended; HP trait effects bake at creation via `computeMaxHp`.
  - `src/combat/types.ts` — `Combatant` gains optional `traitId?`. `src/combat/statuses.ts` — `getEffectiveStat` now reads trait effects as a third modifier source alongside base stats and statuses, with `TraitCondition` evaluation.
  - `src/run/combat_setup.ts` — `buildCombatState` propagates `hero.traitId` through to the Combatant.
  - `src/camp/buildings/tavern.ts` — `generateCandidate`, `generateCandidates` (3-candidate pool), `generateStarterRoster` (3 heroes, one per class), `HIRE_COST = 50`, `TAVERN_CANDIDATE_COUNT = 3`.
  - 5 new test files, multiple extended. +60 assertions (total 444, was 384).
  - Design spec at `docs/superpowers/specs/2026-04-24-recruitment-design.md`; plan at `docs/superpowers/plans/2026-04-24-recruitment.md`.
- **Why:** Tavern candidate generation for task 13's UI + starter roster for task 10's boot scene. Introduces the trait system as combat's third modifier source, unlocking GDD's conditional traits like "Cowardly — −1 Speed when in slot 1."
- **Decisions:**
  - *Option B trait application: runtime evaluation at `getEffectiveStat`, with HP carve-out baked at Hero creation.* User explicitly picked B ("shouldn't be much more work") over A (bake-everything-simplify-Cowardly). HP is the asymmetric exception because `maxHp` is already stored per the task 4 invariant — baking matches that existing treatment. Non-HP effects evaluate at read time so Cowardly's "slot 1 only" condition actually fires.
  - *Two effect shapes on `TraitDef` (`hpEffect` vs `statEffects`), not a unified union.* HP and non-HP follow different application rules (bake vs evaluate). Unified would have needed runtime guards like "if mode === 'percent' and stat === 'hp'," producing a class of invalid states TS couldn't rule out. Split makes intent explicit at the data site and the consumer.
  - *Trait as third modifier source in `getEffectiveStat`.* `base + trait (if condition met) + statuses`. Order is additive so it doesn't affect results, but the layered reading keeps the three sources legible at call sites.
  - *Candidate = Hero.* No separate `Candidate` type. The Tavern returns `Hero[]`; hiring composes `addHero(roster, hero)` + `spend(vault, HIRE_COST)` at the caller (task 13's UI).
  - *Flat `HIRE_COST = 50`.* Module constant, not a field on Hero. Tier 2 may introduce per-class costs by promoting to `hireCostFor(classId)`.
  - *No reroll in Tier 1.* Per GDD §10 Tier 1 scope: "Tavern (fixed 3-candidate pool, no reroll)."
  - *Cowardly and Nervous symmetric.* Both are slot-1 conditional negatives (speed vs defense). Matches the tonal read of "front-line anxiety" traits and gives the trait roster 4 flat positives + 2 conditional negatives — mostly upbeat rolls with a couple of "interesting" traits that create positioning decisions.
  - *`TraitCondition` is a discriminated union with one kind (`inSlot`) in Tier 1.* Exhaustive switch in `evaluateTraitCondition` will prompt TS errors when Tier 2 adds `hpBelow`, `statusActive`, etc. Non-breaking extension path.
  - *`generateStarterRoster` in this task.* Task 10 (boot scene) will call it when no save file exists. Included here because the generation shape is identical to Tavern candidates.
  - *`Hero.bodySpriteId` added now, not deferred.* Paperdoll rendering (tasks 11–14) will read it. Tier 2 adds outfit/hair/hat; this task anchors the body field.
  - *`Combatant.traitId` is optional.* Enemies leave it undefined in Tier 1. Optional field supports Tier 2 enemy traits (e.g., a "Reanimated" skeleton) without schema change.
  - *Atomic signature change strategy for `createHero`.* Added 2 required params; all callers (5 test files, 20+ call sites) updated in the same task using `'quick'` trait (no HP effect, zero assertion churn) + `'body1'` placeholder. Keeps the full test suite green across the migration.
- **Alternatives considered:**
  - *Option A (bake all effects, simplify Cowardly to flat).* Rejected at user's request — worth the extra work to preserve GDD's conditional trait design.
  - *Option C full hybrid (bake flat at creation + runtime evaluate conditionals).* Rejected — the HP-only bake carve-out gives 95% of the benefit with less code than a full two-path system.
  - *Unified `TraitEffect` shape with `mode` + `stat` + optional `condition`.* Rejected — creates invalid state combinations (percent-mode on speed) that TS can't rule out.
  - *Separate `Candidate` type.* Rejected — `Hero` is the right shape; a candidate is just "a Hero not yet in the roster."
  - *Per-class hire cost.* Tier 2.
  - *With-reroll Tavern in Tier 1.* Tier 2.
  - *Bake trait effects at Hero creation and store as `baseStats` modifications.* Rejected for non-HP stats — loses the "class base" reference value that Barracks UI wants to display.
- **Surprises / lessons:**
  - **Plan gap caught by strict TS at execution time.** My self-review on Task 2 listed three files with `createHero` callers (hero, run_state, combat_setup). Missed `roster.test.ts` from task 7, which has 5+ call sites. Strict TS caught it at the typecheck gate after I'd updated the "known" files. Fixed inline in ~6 edits. **Lesson: when a task says "update all callers of X," run `grep "createHero\\("` before enumerating — the grep is authoritative, my memory isn't.** Worth adding to the plan review checklist for any future signature-change tasks.
  - **`Math.round` half-up verified in tests.** Stout Priest: 15 × 1.10 = 16.5 → `Math.round(16.5) = 17` in JavaScript. Confirmed by a targeted assertion rather than assumed. JS's `Math.round` rounds half toward positive infinity (not banker's rounding), which is what we wanted.
  - **The HP-bake-at-creation pragma is asymmetric but clean.** Non-HP traits evaluate at runtime; HP bakes. Initially felt like a hack, but it matches how the engine already treats HP differently (`maxHp` is stored, other stats are computed). The asymmetry is in the data model, not invented here.
  - **The two-effect-shape split prevented a class of invalid states.** A unified `TraitEffect { stat, delta, mode, condition? }` would have allowed `{ stat: 'speed', mode: 'percent' }` or `{ stat: 'hp', condition: inSlot }` at the type level — both nonsensical. Splitting into `hpEffect` and `statEffects` moves the constraint into the schema.
  - **`TraitCondition`'s single-kind union feels overbuilt for Tier 1 but pays for itself on first extension.** Tier 2's conditional-trait additions (`hpBelow`, `statusActive`) extend without re-shaping callers — the exhaustive switch in `evaluateTraitCondition` produces a compile error that points exactly where new kinds need handlers.
  - **`generateStarterRoster` sharing logic with `generateCandidate` is why I kept them in the same file.** If task 10 needed different starter logic (e.g., fixed name, known trait), the functions would diverge; for now they're mechanically identical except for class selection.
- **Touches:**
  - `src/data/types.ts` (modified — +TraitId, TraitDef, conditions)
  - `src/data/traits.ts` (new)
  - `src/data/names.ts` (new)
  - `src/data/body_sprites.ts` (new)
  - `src/data/__tests__/traits.test.ts` (new)
  - `src/data/__tests__/names.test.ts` (new)
  - `src/heroes/hero.ts` (rewritten — signature + HP bake)
  - `src/heroes/__tests__/hero.test.ts` (rewritten)
  - `src/combat/types.ts` (modified — +Combatant.traitId)
  - `src/combat/statuses.ts` (rewritten — getEffectiveStat reads traits)
  - `src/combat/__tests__/statuses.test.ts` (extended)
  - `src/combat/__tests__/combatant.test.ts` (extended)
  - `src/run/combat_setup.ts` (modified — traitId propagation)
  - `src/run/__tests__/combat_setup.test.ts` (extended)
  - `src/run/__tests__/run_state.test.ts` (mechanical churn)
  - `src/camp/__tests__/roster.test.ts` (mechanical churn — caught at execution time, not in plan)
  - `src/camp/buildings/tavern.ts` (new)
  - `src/camp/buildings/__tests__/tavern.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-recruitment-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-recruitment.md` (new)
- **Source:** `TODO.md` Cluster A · Task 8. Related: `gdd.md` §3 (Recruitment roll), task 4 HISTORY (combat engine + `getEffectiveStat` architecture), task 6 HISTORY (Hero type origin + immutable pattern), task 7 HISTORY (roster integration point).

### 2026-04-24 · Roster & vault (Tier 1)

- **What shipped:**
  - `src/camp/roster.ts` — `Roster` type + `DEFAULT_ROSTER_CAPACITY` constant + 7 immutable ops: `createRoster`, `addHero`, `removeHero`, `updateHero`, `getHero`, `listHeroes`, `canAdd`.
  - `src/camp/vault.ts` — `Vault` type + 4 immutable ops: `createVault`, `credit`, `spend`, `balance`.
  - 2 test files, 24 new assertions (total 384, was 360).
  - Design spec at `docs/superpowers/specs/2026-04-24-roster-vault-design.md`; plan at `docs/superpowers/plans/2026-04-24-roster-vault.md`.
- **Why:** Persistent camp state that survives between runs. Roster holds up to 12 heroes (Barracks L1); vault holds banked gold. Consumed by recruitment (task 8), Barracks UI (task 14), and the Leave transition in the camp-screen scene (task 18) which writes cashout outcomes back.
- **Decisions:**
  - *Capacity lives on the Roster struct, not a global constant.* `{ heroes, capacity }` with `DEFAULT_ROSTER_CAPACITY = 12` for Tier 1. Barracks upgrades in Tier 2 raise capacity via an immutable field update rather than a code change.
  - *Throw on all invariant violations.* `addHero` at cap / with duplicate id; `removeHero` / `updateHero` with missing id; `credit` on negative; `spend` on negative or insufficient funds; `createRoster` with non-positive capacity. Consistent with `pack.addGold`'s throw-on-negative from task 6.
  - *`canAdd` predicate separate from throwing `addHero`.* UI layer (Tavern hire button in task 13) uses `canAdd` for pre-click disable; `addHero` still throws on violation. Two-function pattern avoids teaching callers to use try/catch for control flow.
  - *`updateHero` as a primitive, not composed.* Compose-from-remove+add would re-validate the cap, which is noise when the size doesn't change. `updateHero` also preserves the hero's array index — matters for Barracks list rendering.
  - *Caller composes run-outcome application.* Task 7 exposes primitives; task 18's camp-screen scene composes them for cashout (`credit(vault, goldBanked)` + `updateHero` for returning heroes + `removeHero` for fallen heroes) and wipe (`removeHero` for all lost). Keeps this module ignorant of run state.
  - *Immutability matches RunState + Pack.* All ops return new values. Chainable: `credit → spend → credit` preserves prior values.
  - *Vault vs Pack naming divergence preserved.* Pack: `addGold` / `totalGold` / `emptyPack`. Vault: `credit` / `balance` / (no `emptyVault`). Different verbs because the GDD distinguishes "pack at risk" from "vault safe" — a shared `Wallet` abstraction would lose that signal at call sites.
  - *No `emptyVault` operation.* `spend` is the only way balance decreases. Tier 2 features that drain the vault (catastrophic event, etc.) would add an operation explicitly rather than generalize.
  - *`listHeroes` returns the internal `readonly` array without copying.* TypeScript prevents mutation through the returned reference; consumers that iterate don't pay allocation.
  - *Roster imports only `Hero` from `src/heroes/`. Vault imports nothing.* `src/camp/` is a leaf data module. No phaser, no combat, no run state, no util.
- **Alternatives considered:**
  - *Hardcoded `MAX_ROSTER = 12` constant.* Rejected — Tier 2 Barracks upgrades would need a code change rather than a data change.
  - *Compose `updateHero` from `remove` + `add`.* Rejected — re-validates the cap, noisy, loses array-index stability.
  - *Result<T, Error> return type instead of throw.* Rejected — adds ceremony for callers; exceptions match the rest of the Tier 1 codebase.
  - *Shared `Wallet` type for pack + vault.* Rejected — collapses the GDD's "pack = at risk" vs "vault = safe" distinction.
  - *Roster/vault applying run outcomes directly.* Rejected — binds data modules to run-state types. Caller composition is cleaner.
  - *`listHeroes` defensive copy.* Rejected — TypeScript's `readonly` suffices for the contract; allocation isn't free.
- **Surprises / lessons:**
  - **Smallest task since task 1.** Clean pass-through from spec → plan → implementation with zero plan bugs. Proof that well-scoped small tasks converge fast when the design calls are batched early.
  - **The two-function invariant pattern (`canAdd` + throwing `addHero`) is going to recur.** Vault is a candidate next — a `canAfford(vault, amount)` predicate paired with throwing `spend` would match the Tavern UI flow. Not added preemptively (YAGNI); revisit when task 13 Tavern UI lands and actually needs it.
  - **"Caller composes cashout" is a promise to future-me.** Task 18's camp-screen scene has a bigger integration surface than the other scenes because it orchestrates roster + vault + run state. Worth budgeting for.
  - **Naming parallel-but-different between Pack and Vault is a game-language decision, not an abstraction failure.** The instinct is to factor out a shared `Currency` type. Resisting that preserves a real distinction players will hear ("banked to the vault" vs "carried in the pack"). Data types can legitimately diverge when the domain language does.
- **Touches:**
  - `src/camp/roster.ts` (new)
  - `src/camp/vault.ts` (new)
  - `src/camp/__tests__/roster.test.ts` (new)
  - `src/camp/__tests__/vault.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-roster-vault-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-roster-vault.md` (new)
- **Source:** `TODO.md` Cluster A · Task 7. Related: `gdd.md` §6 (Camp — Barracks upgrades), task 6 HISTORY (Hero type + Pack counterpart).

### 2026-04-24 · Run state & gold-only pack (Tier 1)

- **What shipped:**
  - `src/heroes/hero.ts` with `Hero` type + `createHero`. First-cut type that task 7 (roster) will build on.
  - `src/run/pack.ts` — `Pack` type + immutable ops (`createPack`, `addGold`, `totalGold`, `emptyPack`).
  - `src/combat/combatant.ts` — `createHeroCombatant` / `createEnemyCombatant` factories **extracted from test helpers** and promoted to production. The old helpers file becomes a shim re-exporting under `make*` names so existing tests compile without churn.
  - `src/run/combat_setup.ts` — `buildCombatState(party, encounter): CombatState`. Applies per-floor `ScaleFactors` (HP + Attack only) via overrides; assigns stable `p${i}`/`e${i}` combatantIds.
  - `src/run/run_state.ts` — `RunState`, `RunStatus`, `CashoutOutcome`, `WipeOutcome`, and the five transitions: `startRun`, `currentNode`, `completeCombat`, `pressOn`, `cashout`. All `readonly`; operations return new RunState values.
  - 5 test files + 1 shim-rewrite. +36 assertions (total 360, was 324).
  - Design spec at `docs/superpowers/specs/2026-04-24-run-state-design.md`; plan at `docs/superpowers/plans/2026-04-24-run-state.md`.
- **Why:** This is the glue between the floor generator (task 5) and the combat engine (task 4). Run state models the in-progress expedition — party HP persisting across nodes, the gold-only pack, the current floor/node pointer, and the status that drives the dungeon/combat/camp-screen scene transitions that tasks 16–18 will consume.
- **Decisions:**
  - *Immutable RunState.* Every operation returns a new RunState; callers swap references. Chosen over mutable-in-place despite that being the combat engine's pattern. The "why did combat go mutable?" check made the honest answer clear: combat mutates because of iteration cost (hundreds of per-event mutations per fight) and atomic encapsulation (the caller never sees intermediate state). Run state has neither — operations are discrete, callers absolutely observe intermediate state, and `RunState === saved file` aligns cleanly with immutable serialization. Mutability's "convention match" wasn't a substantive benefit here.
  - *Single `Hero` type defined in task 6.* Minimal Tier 1 shape: `{ id, classId, name, baseStats, currentHp, maxHp }`. Task 7 (roster) builds ops around the existing type rather than defining its own. No separate `PartyMember` indirection — the RunState's party IS an array of Heroes with their mid-run HP.
  - *Per-node gold rewards, floor-scaled.* `15g × floorNumber` for combat nodes, `100g × floorNumber` for boss nodes. Chosen over per-kill gold (faithful to GDD but requires parsing combat events) and per-enemy `goldValue` (speculative — no gear economy to consume the variance yet). Per-node gives predictable balance knobs and preserves "gold from kills" in spirit (you only get paid if the node cleared).
  - *Split factories: production in `src/combat/combatant.ts`, run-side builder in `src/run/combat_setup.ts`.* The test helpers `makeHeroCombatant` / `makeEnemyCombatant` were already doing production-shape factory work; promoting them to real modules deduplicates with anything the run would have written. Scaling is a run-domain concern (floor progression), so it lives in `combat_setup.ts` as override construction rather than inside the combat factories.
  - *Hero ids are `rng.int`-derived strings* (task 8's problem to actually generate, but the shape is set). Crypto UUIDs rejected as overkill and non-deterministic.
  - *Abandon skipped for Tier 1.* Every camp screen in Tier 1 is post-boss (no mid-floor camp nodes until Tier 2), so Abandon is structurally unreachable. Tier 2 adds it alongside camp nodes.
  - *Combat timeout → wipe.* Rare in practice; rewarding timeout as anything other than defeat would invite exploits. Reconsider if playtesting surfaces legitimate timeouts.
  - *Floor cache in `RunState.currentFloorNodes`.* Stored rather than regenerated from seed on demand. The dungeon scene walks the array; no need for the generator at render time.
  - *Pack immutability* matches RunState's contract. `Pack` is tiny, but consistency across the run domain is worth more than the saved allocation.
  - *Wipe `heroesLost` includes previously-fallen heroes.* Self-review caught this — the initial spec said "everyone alive at wipe time + newly fallen," which missed heroes who died in earlier combats (already in `runState.fallen`). The fix: `allLost = [...runState.fallen, ...newFallen, ...updatedPartyLiving]`. The returned RunState's `fallen` is set to `allLost` without double-counting.
  - *`p${i}` / `e${i}` combatantId scheme is now load-bearing.* It's the bridge between run state's party array and the combat engine's combatant list. `completeCombat` reverses by scanning the combat result's combatants for matching ids. Stable within a single combat; re-derived per combat as party composition changes across nodes.
- **Alternatives considered:**
  - *Mutable RunState (option A from Q1).* Rejected — convention over substance; combat engine's mutation pattern doesn't transfer.
  - *Mutable + `snapshot()` helper (option C from Q1).* Rejected — two mechanisms to teach for negligible payoff.
  - *Separate `PartyMember` / `Hero` types.* Rejected — `Hero` is enough; per-run state (HP) is just a mutation of the Hero in the new RunState.
  - *Punt `Hero` to task 7.* Rejected — forces task 6 to invent a placeholder type that task 7 would rewrite.
  - *Per-kill gold (option A from Q3).* Rejected — requires combat-event parsing for a minor fidelity gain.
  - *Per-enemy `goldValue` field (option C from Q3).* Rejected as speculative; Tier 2 may introduce it.
  - *Inline factories in `run_state.ts` (option C from Q4).* Rejected — clutters `run_state.ts` with factory logic that test code also needs.
  - *Factories in `src/run/` (option A from Q4).* Rejected — combat factories are a combat-domain concern even when the run orchestrates their use.
  - *Tier 1 Abandon support.* Rejected — structurally unreachable without mid-floor camp nodes.
  - *Timeout as its own distinct run outcome.* Rejected — treat as wipe.
- **Surprises / lessons:**
  - **"Why did the combat engine choose mutation?"** — best question of the session. It forced me to articulate the actual benefits (iteration cost + atomic encapsulation) and identify when they don't apply. Convention-matching was a weak argument once the real reasons were surfaced.
  - **The shim-as-migration pattern worked cleanly.** `helpers.ts` became `export const makeHeroCombatant = createHeroCombatant;` and all 7 existing test files kept compiling. Lets production extraction happen in one commit without a churn-heavy rename pass. Drop the shim on the next test-rename task.
  - **Spec self-review caught the wipe-heroesLost bug before it hit the plan.** The plan tested for it directly (test: "wipe heroesLost includes heroes who fell in earlier combats"), which passed on first run.
  - **Immutability testing is trivially correct.** `JSON.parse(JSON.stringify(rs))` pre-op + deep-equal post-op is a one-line regression check. Mutation-based designs need much more careful "assert this specific field didn't change" assertions.
  - **Proactive plan review catches plan bugs.** The `CombatantId` unused-import in the shim would have been a strict-tsc error at Task 3 Step 5. Catching it during pre-execution review (and fixing inline) avoided a red-then-edit cycle. Lesson holds: plan review + execution review are complementary filters.
  - **Mock CombatResult construction is clean when factories are shared.** The test's `mockCombatResult` helper uses the same `createHeroCombatant` that production uses, so the mock has the same shape as what `buildCombatState` produces. No drift possible.
  - **The `p${i}` scheme is now a cross-domain invariant.** If Tier 2 adds hero-swap mid-run (swapping bench heroes into the active party), the mapping from party index → combatantId needs rethinking. Worth flagging in task 6's HISTORY for future-me.
- **Touches:**
  - `src/heroes/hero.ts` (new)
  - `src/heroes/__tests__/hero.test.ts` (new)
  - `src/run/pack.ts` (new)
  - `src/run/__tests__/pack.test.ts` (new)
  - `src/combat/combatant.ts` (new — extracted)
  - `src/combat/__tests__/combatant.test.ts` (new)
  - `src/combat/__tests__/helpers.ts` (modified — shim)
  - `src/run/combat_setup.ts` (new)
  - `src/run/__tests__/combat_setup.test.ts` (new)
  - `src/run/run_state.ts` (new)
  - `src/run/__tests__/run_state.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-run-state-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-run-state.md` (new)
- **Source:** `TODO.md` Cluster A · Task 6. Related: `gdd.md` §1 (core loop), §7 (risk/reward economy), §8 (death & loss); task 4 HISTORY (combat engine, `p${i}` scheme origin); task 5 HISTORY (floor generation, `Encounter` + `ScaleFactors`).

### 2026-04-24 · Floor generation — The Crypt (Tier 1)

- **What shipped:**
  - `src/dungeon/` — new directory housing the floor generator: `node.ts` (types), `scaling.ts` (`floorScale`), `encounter.ts` (`composeCombatEncounter`, `composeBossEncounter`), `floor.ts` (`generateFloor`).
  - `src/data/types.ts` extended with `DungeonId` and `DungeonDef`; new `src/data/dungeons.ts` with the Crypt entry.
  - 4 new test files — 28 assertions covering determinism, size bounds, slot assignment, front-liner guarantee (via mocked RNG), scale propagation, boss composition.
  - Design spec at `docs/superpowers/specs/2026-04-24-floor-generation-design.md`; plan at `docs/superpowers/plans/2026-04-24-floor-generation.md`.
- **Why:** Run state (task 6) and the dungeon scene (task 16) both need a floor structure to walk through. This task produces pure data — `Node[]` containing enemy ids, slot placements, and scale factors — leaving Combatant construction to the run state layer.
- **Decisions:**
  - *Linear scaling: `1 + 0.1 × (floorNumber - 1)`, applied to HP and Attack only.* Readable at every depth, leaves room for Tier 2 milestone modifiers to layer additively. Defense and Speed unscaled.
  - *Encounter size distribution: `{ 2: 20%, 3: 60%, 4: 20% }`.* User tweak during brainstorming — initial proposal was 3 or 4 only (70/30), user pushed for min 2. Keeps 3 the typical case; 2- and 4-enemy encounters are equally likely flavor sizes.
  - *Front-liner guarantee for combat encounters only, not boss.* If no initial pick is a front-liner, `picks[0]` is replaced by a random front-pool draw. Prevents the "all back-liner in slot 1" soft-lock (back-liners can't cast from slot 1 → infinite shuffle). Boss encounter guarantees its own front-liner structurally (minion 1 at slot 1 is always a front-liner).
  - *Boss composition: 3 combatants (boss + 2 minions).* Matches the party's 3-size, keeps combat feeling like a proper ranked fight. Boss at slot 3 (highest in a 3-slot encounter, matches Bone Lich's `preferredSlots: [3, 4]`); minion 1 at slot 1 is guaranteed front-liner; minion 2 at slot 2 is uniform from the full pool.
  - *Slot assignment: front-liners ascending from slot 1, back-liners descending from slot N.* Meets in the middle. Produces `[front@1, front@2, back@3]` for 2F+1B and `[front@1, back@2, back@3]` for 1F+2B. Back-liners at slot 2 are mechanically fine — their `canCastFrom` includes slot 2.
  - *`scale` lives on `Encounter`, not on `Node`.* Every encounter on floor N shares the same scale, so it's technically redundant — but placing it on the encounter makes encounters self-describing. The run state layer can build Combatants from an `Encounter` alone without needing floor context.
  - *Node type union narrow for Tier 1: `'combat' | 'boss'` only.* Tier 2 will extend with `'elite' | 'shop' | 'camp' | 'event'` as a non-breaking addition; the exhaustive-switch pattern means consumers get a TS error when new variants land.
  - *Stable, meaningful node IDs: `crypt-f1-n0`, `crypt-f1-boss`.* Zero consumers read them in Tier 1, but cheap insurance for save state and event logging later.
  - *Thin `floor.ts` orchestrator.* Does no combat/slot logic itself — sequences `floorScale`, N calls to `composeCombatEncounter`, one call to `composeBossEncounter`. Keeps the composer testable in isolation and the orchestrator trivial.
  - *Floor generator emits data, not Combatants.* The `src/dungeon/` → `src/combat/` import direction is blocked deliberately. Converting `Encounter` → `Combatant[]` is task 6's job. Keeps floor generation runnable in a headless balance simulator without the combat engine's full weight.
  - *Scaling returns raw multipliers; rounding happens at Combatant-construction time.* `scaledHp = round(baseHp × scale.hp)` is applied by whoever builds the Combatant (task 6), not by the floor generator. Keeps the raw factor inspectable.
  - *RNG consumption order fixed:* size roll → N picks → optional front-liner re-roll (combat); minion1 → minion2 (boss). Deterministic per seed.
- **Alternatives considered:**
  - *Geometric scaling (`1.1 ^ (floorNumber - 1)`).* Rejected — floor 10 = 2.36×, floor 20 = 6.7×. Cartoonish unless hero gear scales to match.
  - *Piecewise/milestone scaling.* Deferred to Tier 2 — the additive layer for "Armored", "Venomous", "Enraged" modifiers. Tier 1 scope explicitly excludes it per GDD §4.
  - *Fixed encounter size of 3.* Rejected per user feedback — loses a design lever that costs nothing to include.
  - *Random 3 or 4 only (50/50 or 70/30).* User's "minimum 2" tweak produced the cleaner 20/60/20 distribution.
  - *Boss alone (3v1).* Rejected — weird overwhelm dynamic.
  - *Boss + 3 minions (3v4).* Rejected — tense but risks frustration when RNG stacks supports.
  - *Constraint "≥1 back-liner per encounter".* Rejected — all-front encounters are mechanically fine, every front-liner can cast from slot 1.
  - *`scale` on `Node` instead of `Encounter`.* Rejected — would force consumers that build Combatants from an encounter to pass the floor context separately.
  - *Tier 2-ready node type union (all 6 types upfront).* Rejected — speculative. Extend when needed.
- **Surprises / lessons:**
  - **Plan bug caught by strict TS, not by tests.** The mocked-RNG test in Task 4 had `weighted: <T>(options) => { ... }` — `T` declared but unused, `options` implicitly `any`. Vitest transform accepted it and tests passed green. Only `npx tsc --noEmit` surfaced it. Lesson: run the typecheck gate after every task, not just `npm test`. Vitest's transform is lenient about test-file types in ways production builds aren't. Fixed by importing `WeightedOption` from `util/rng` and fully typing the mock.
  - **The "find a seed" strategy would have been fragile.** An earlier draft of the front-liner-guarantee test said "use a seed empirically known to roll all-back-liners." In practice, a 1000-seed sample through the Crypt pool never produced an all-back-liner natural draw (the pool is 50/50 front/back, so 3 picks all-back = 12.5% probability; but across many rounds of generation the RNG state never landed there coincidentally). The mocked-RNG test was essential — it exercises the code path reliably, not by coincidence.
  - **User caught a scope gap during design.** My initial encounter-size proposal was "3 or 4 only" which missed that 2-enemy encounters are a legitimate pacing beat. Worth noting: brainstorming's one-question-at-a-time cadence made the gap visible because the user could object to a specific choice instead of a whole design.
  - **The import-direction rule stayed intact.** `src/dungeon/` imports from `data/` and `util/` but not from `combat/`. This will matter when task 6 lands: the run state layer is where floor output (Encounters) meets combat input (Combatants). Task 6 can legally import both.
  - **Mocked Rng in tests is easier than I expected.** Constructing an object satisfying the `Rng` interface with deterministic `pick` / `weighted` is a few lines. Useful pattern for any test that needs to force a specific RNG-driven code path.
- **Touches:**
  - `src/data/types.ts` (modified — `DungeonId`, `DungeonDef`)
  - `src/data/dungeons.ts` (new)
  - `src/dungeon/node.ts` (new)
  - `src/dungeon/scaling.ts` (new)
  - `src/dungeon/encounter.ts` (new)
  - `src/dungeon/floor.ts` (new)
  - `src/data/__tests__/dungeons.test.ts` (new)
  - `src/dungeon/__tests__/{scaling,encounter,floor}.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-floor-generation-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-floor-generation.md` (new)
- **Source:** `TODO.md` Cluster A · Task 5. Related: `gdd.md` §4 (Dungeons — The Crypt), task 3 HISTORY entry (enemy pool + `preferredSlots`), task 4 HISTORY entry (combat engine — consumer of eventual Combatants).

### 2026-04-24 · Combat engine — resolution loop (Tier 1)

- **What shipped:**
  - 8 new source files under `src/combat/`: `types.ts` (rewritten), `statuses.ts`, `positions.ts`, `target_selector.ts`, `turn_order.ts`, `ability_priority.ts`, `effects.ts`, `combat.ts`.
  - 7 new test files plus `__tests__/helpers.ts` (shared `makeHeroCombatant` / `makeEnemyCombatant` / `makeTestState` builders). +60 test assertions (total 296, was 236).
  - `resolveCombat(initialState, rng): CombatResult` — clones input, runs rounds to completion or a 30-round cap, returns final state + the full event log + outcome.
  - 14-kind `CombatEvent` discriminated union, one observable change per event. The combat scene (task 17) consumes this log for playback animations.
  - 9 effect handlers honor the invariants from prior tasks: `power × Attack` damage formula, damage floor 1, Smite radiant × 1.5 vs undead, mark multi-hit, max-HP clamp on buff/debuff, caster-relative `TargetSelector.side`.
  - `StatusId` extended with `'stunned'` as a small retrofit in `src/data/types.ts`.
  - Design spec at `docs/superpowers/specs/2026-04-24-combat-engine-design.md`; plan at `docs/superpowers/plans/2026-04-24-combat-engine.md`.
- **Why:** This is Tier 1's load-bearing core. Every downstream system — the combat scene (17), dungeon scene (16), save/load (9), the eventual balance simulator — consumes what this task produces. Tasks 2 and 3 were preparation; this is where those invariants get paid out in runtime code.
- **Decisions:**
  - *Mutation model: internal mutation with cloned input.* `resolveCombat` clones the caller's `CombatState` via `structuredClone`, mutates the working copy, and returns it. Callers never see the mutation; tests assert against the returned `finalState`. Avoids the ceremony of immutable round-by-round updates and the aliasing risk of in-place mutation.
  - *Stable combatantIds (`p0..p2`, `e0..e3`) over implicit identity.* Slots change constantly (shove, pull, collapse); identifying combatants by `{side, slot}` would have required re-resolving at every event replay. Stable ids make the combat scene's animation loop `for (event of events) animate(event)` with no parsing.
  - *Fine-grained event stream (14 kinds, one observable change per event).* Makes the renderer's event-to-animation dispatch trivial and lets tests assert exact event counts/orderings. The alternative coarse "per turn" event would have forced renderer re-parse and masked subtle ordering bugs.
  - *Turn order variance: `speed + rng.int(0, max(2, floor(speed * 0.1)))`.* Scales with stat inflation. At Tier 1's speed 3–5 the floor of 2 dominates (equivalent to a flat `+0..+2`); at late-game speed 50–100 the 10% term kicks in and keeps variance meaningful. User caught the scaling gap during brainstorming.
  - *Per-target-turn status ticking.* Status durations decrement at the start of the affected combatant's own turn, not at round boundaries. The per-round model made stun semantics weird (was the stun "this round" or "next"?); per-target-turn gives `stun duration: 1` a single predictable meaning.
  - *Stun-check-before-tick ordering.* At turn start: (1) record whether the combatant is currently stunned, (2) tick statuses (stun expires if duration was 1), (3) if stunned-flag was set, skip the turn. This guarantees a freshly-applied `stun duration: 1` always costs exactly one turn — the target's very next turn.
  - *`'stunned'` as a StatusId literal, retroactively added to `data/types.ts`.* The `{ kind: 'stun', duration }` effect lacked a statusId field in task 2's design; the engine needed a consistent storage key. Adding the literal is a tiny change; the alternative (making statusId optional on `stun`) would have weakened the global uniqueness rule.
  - *Effect ordering within an ability: listed order; lethal damage no-ops subsequent effects on the dead target.* Shield Bash's `[damage, stun]` sequence means a killing blow doesn't waste a stun on the corpse. Matches DD convention.
  - *Damage floor of 1.* `max(1, power × attack × tagBonus - defense)`. Prevents tank-vs-tank stalemates at late game; every hit does *something*. Tradeoff accepted for Tier 1; Tier 2 may reconsider if specific tank builds want to fully negate certain damage types.
  - *Smite `radiant` × `undead` = 1.5×, flat.* Only tag-pair bonus in Tier 1. Flat multiplier (not additive) keeps the formula clean. 2× felt too dramatic for Tier 1; scales cleanly at 1.5×.
  - *Mark persists for its full duration; every damage instance gets the bonus.* Simpler data model than single-use-and-consume. Slightly stronger than DD's single-use mark, which shifts Archer's role from "mark-then-burst" to "mark-then-steady-pressure." Rebalance later if needed.
  - *Max-HP buff/debuff clamps `currentHp = min(currentHp, newMax)` on application; does NOT raise currentHp on positive buff; does NOT restore currentHp on expiry.* Asymmetric by design: makes +Max HP feel like "bonus headroom" (useless if not damaged) and -Max HP feel like "chip damage + lasting cap." Task 3 declared this invariant; task 4 implements it.
  - *Deferred collapse.* Died-during-ability combatants keep their slot field until `applyAbility` finishes *all* effects, then `collapseAfterDeath` runs once per affected side. Keeps target-by-id resolution stable across AoE abilities that kill multiple targets. The alternative (collapse immediately on each death) would have produced weird half-collapsed intermediate states during multi-effect abilities.
  - *Shuffle: adjacent-neighbor swap toward `preferredSlots` (or toward slot 1 for heroes, who lack the field).* Crude but adequate for Tier 1. Tier 2 may want smarter shuffling (pathfind-to-nearest-legal-slot) if new kits introduce combatants that can genuinely get stuck.
  - *Round cap 30, mutual wipe = `'player_defeat'`.* Generous cap for legitimate fights; tight enough to catch infinite-loop bugs in dev. Ties losing is the conventional pessimistic reading of "the party didn't survive."
  - *`CombatSide` ('player'|'enemy') distinct from `Side` ('self'|'ally'|'enemy').* Runtime absolute vs caster-relative. The two live under different names in `combat/types.ts` vs `data/types.ts` to prevent conflation at consumer call sites. TypeScript enforces — `combatant.side === 'ally'` would be a type error.
- **Alternatives considered:**
  - *Pure-function per round (`resolveRound(state, rng) => { newState, events }`).* Rejected — immutable round updates would have meant `const newState = { ...state, combatants: [...] }` scattered throughout the engine. Too much ceremony for a system that can safely mutate an internal working copy.
  - *Mutate caller's state in place without cloning.* Rejected — aliasing risk for any caller that wanted to keep a snapshot.
  - *Identify combatants by implicit `{side, slot}`.* Rejected — fragile across shoves/pulls/deaths. Every event would need to reference "the combatant who was in slot 2 at the time."
  - *Coarse per-turn event grain.* Rejected — forces renderer to re-parse nested data per animation; hides ordering bugs.
  - *Medium per-ability-plus-per-target grain.* Rejected — middle ground that wins neither clarity nor compactness.
  - *Per-round status ticking.* Rejected — stun semantics get weird depending on applier-vs-target turn ordering.
  - *Flat `+0..+2` variance without 10% scaling.* Rejected per user feedback — doesn't remain meaningful at speed 50+.
  - *No variance.* Rejected — conflicts with GDD's "Speed ± small variance" language.
  - *Immediate collapse per-death.* Rejected — messes up AoE semantics with multiple deaths.
  - *Single-use mark (consumed on first hit).* Rejected for Tier 1 — simpler data model and slightly stronger. Revisit if balance demands.
  - *Damage zero-floor.* Not taken. Tier 1 tank values are low enough that zero-floor wouldn't trigger; floor-of-1 prevents the stalemate case from ever happening.
- **Surprises / lessons:**
  - **Zero plan bugs at execution time.** All 9 tasks green on first run — no RED-phase false starts, no test-expectation mismatches. Attribute to: (a) spec self-review caught the collapse-timing contradiction *before* it got into the plan; (b) types locked in at spec time stayed consistent across every file; (c) test-helpers file meant every test had identical setup semantics. The earlier lesson from task 3 — "if a plan step looks redundant, cut it in the plan, not during execution" — was honored here.
  - **The `CombatSide` vs `Side` terminology split paid off.** Runtime absolute vs caster-relative is a subtle distinction; giving them different names makes consumer code self-documenting. A shared `Side` name would have masked bugs like `combatant.side === 'ally'` or `targetSelector.side === 'player'` — both nonsensical but type-allowable under a single union.
  - **`structuredClone` is the first ES2022 dependency in the engine.** Available in TS 6, Node 20+, all modern browsers. No polyfill needed for the repo's Vite/Vitest setup. Would have been a footgun in an older codebase.
  - **The `tickStatuses` in-place mutation during `Object.keys` iteration is safe because the keys are snapshotted first.** `Object.keys(obj)` returns an array; deletions during the loop don't affect iteration. Worth noting for future status-related code.
  - **The mutation model choice (`A`) reduced test burden.** Tests just inspect `result.finalState` and `result.events`. No "compare intermediate state at round N" pattern needed. If we'd gone with pure-function-per-round, integration tests would have been more awkward.
  - **The stable combatantId scheme revealed its value in the determinism property test.** Comparing two runs' events with `toEqual` is only meaningful because combatant references are stable across the runs. With `{side, slot}` identity, the test would have needed a structural comparator that re-resolved slot changes.
- **Touches:**
  - `src/data/types.ts` (modified — `StatusId` +`'stunned'`)
  - `src/combat/types.ts` (rewritten)
  - `src/combat/statuses.ts` (new)
  - `src/combat/positions.ts` (new)
  - `src/combat/target_selector.ts` (new)
  - `src/combat/turn_order.ts` (new)
  - `src/combat/ability_priority.ts` (new)
  - `src/combat/effects.ts` (new)
  - `src/combat/combat.ts` (new)
  - `src/combat/__tests__/helpers.ts` (new)
  - `src/combat/__tests__/{statuses,positions,target_selector,turn_order,ability_priority,effects,combat}.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-combat-engine-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-combat-engine.md` (new)
- **Source:** `TODO.md` Cluster A · Task 4. Related: `gdd.md` §2 (Combat), task 2 HISTORY entry (class data types + invariants), task 3 HISTORY entry (enemy data + caster-relative sides + max-HP clamp).

### 2026-04-24 · Enemy data — Crypt pool + boss (Tier 1)

- **What shipped:**
  - `src/data/types.ts` extended with `EnemyId` (5 literals), `EnemyRole` (`'minion' | 'boss'`), `EnemyDef`. `AbilityId` grew by 8 enemy-only ids; `StatusId` grew by `'rotting'` and `'frailty'`.
  - `src/data/abilities.ts` extended with 8 new enemy-only records: `bone_slash`, `bone_arrow`, `rotting_bite`, `dark_bolt`, `dark_pact`, `necrotic_wave`, `lich_strike`, `curse_of_frailty`.
  - `src/data/enemies.ts` — `ENEMIES` registry (4 minions + Bone Lich boss), `CRYPT_POOL` (uniform list of 4 minion ids), `CRYPT_BOSS = 'bone_lich'`.
  - `src/data/__tests__/enemies.test.ts` — 45 assertions covering registration, base-stats sanity, tags, ability references, aiPriority ⊆ abilities, preferredSlots range, spriteId format, role/pool coherence, and the caster-slot-reach invariant (every priority ability's `canCastFrom` intersects the enemy's `preferredSlots`).
  - Existing test files adjusted: `abilities.test.ts` loosened its `canCastFrom` range to `[1..4]`; `classes.test.ts` gained a per-class check that referenced abilities stay `⊆ [1..3]`, reclaiming player-side enforcement at the right layer.
  - Design spec at `docs/superpowers/specs/2026-04-24-crypt-enemies-design.md`; plan at `docs/superpowers/plans/2026-04-24-crypt-enemies.md`.
- **Why:** Combat has nothing to fight without enemies. First dungeon needs a content pool, and the floor generator (task 5) and combat engine (task 4) both consume this data.
- **Decisions:**
  - *`EnemyDef` is its own type, not a reused `ClassDef`.* Enemies don't equip gear, don't have paperdolls, don't have a preferred weapon — stretching `ClassDef` would have forced ignored fields and awkward semantics. A small structural duplication between the two types is cheaper than muddying each one's meaning.
  - *One unified `ENEMIES` registry with a `role: 'minion' | 'boss'` discriminator.* Lookup-by-id stays trivial; the combat scene in task 17 just grabs `ENEMIES[id]` regardless of fight kind. The pool/boss split is expressed at the composition layer (`CRYPT_POOL` + `CRYPT_BOSS`), not at the enemy-definition layer.
  - *Logical `spriteId` strings* (`'skeleton_warrior'`, `'bone_lich'`) instead of frame numbers. Task 19 will resolve them when real enemy art lands; until then, the combat scene can map logical ids to any placeholder NPC frame. Data stays stable across art changes.
  - *Uniform `CRYPT_POOL`, no weighting.* No balance data yet to justify weights. Moving to `WeightedOption<EnemyId>[]` later is a one-line swap (the RNG's `weighted()` helper already exists). Weighting before playtesting is guesswork.
  - *8 enemy-only abilities instead of reusing class abilities.* Each ability record is ~6 lines; the payoff is that test output and combat logs read cleanly ("Bone Lich casts curse_of_frailty") rather than a ghoul casting `knight_slash`. Enemies are not classes.
  - *Caster-relative `TargetSelector.side`* declared as an engine invariant this spec adds. Previous task (classes) never needed it — no class heals enemies. The Cultist's `dark_pact` (heals a wounded ally) is the first move where "ally" must mean "caster's side," not "player side." Task 4's combat engine must honor this.
  - *Cultist tagged `'humanoid'`, not `'undead'`.* Cultists are corrupt living humans, not reanimated. Mechanically this means Smite's `radiant` × `undead` bonus does not apply — a deliberate tactical signal ("Smite wrecks skeletons and the Lich, but Cultists need normal handling").
  - *Minions have no basic-attack fallback.* Each minion has exactly one ability castable from its preferred slot set; if repositioning pushes them out of range they shuffle to reposition. Adding a "flailing melee" default would bloat minion definitions without meaningful payoff.
  - *Max-HP debuff clamp semantics pinned at `current = min(current, newMax)`.* On expiry, max returns but current HP stays where it was left. This makes max-HP debuffs chip damage for full-HP targets and a lasting pressure cap for already-wounded ones — a single rule that covers both cases.
  - *`bone_arrow` and `dark_bolt` are intentionally near-identical.* Skeleton archers and cultists differ through the cultist's `dark_pact` healer behaviour, not through a contrived difference in their ranged attack.
  - *`necrotic_wave` tuned low (power 0.4).* With Bone Lich Attack 5 and 3 player combatants, a wave deals ~6 party-wide damage. Boss feels signature without steamrolling.
  - *Split canCastFrom validation across two test files.* abilities.test.ts checks `⊆ [1..4]` (enemy-side legal range); classes.test.ts checks `⊆ [1..3]` (player-side constraint). Enforcement lives at the layer that owns it.
- **Alternatives considered:**
  - *Reuse `ClassDef` for enemies.* Rejected — grew fields, muddied semantics.
  - *Shared `CombatantDef` base interface.* Rejected — modest gain (4 common fields) against the cost of a premature abstraction for two consumers.
  - *Separate `BOSSES` registry.* Rejected — spreads enemies across two lookups for no structural gain.
  - *`EnemyDef = MinionDef | BossDef` union.* Rejected — speculative; Tier 1 boss needs nothing minions don't.
  - *Weighted `CRYPT_POOL`.* Rejected for Tier 1 — no balance data; uniform is the honest baseline.
  - *Reuse class abilities on enemies.* Rejected — test/log readability wins.
  - *Cultist as `'undead'`.* Rejected — Smite would bonus-damage them, flattening a design axis.
  - *Minion basic-attack fallback.* Rejected — shuffle is the intended fallback at Tier 1.
- **Surprises / lessons:**
  - **Plan bug caught at runtime:** I wrote a redundant-but-"harmless" second regex check into the plan as `KEBAB_CASE.source.replace(/-/g, '_')`. This ran `replace` over the entire source string, corrupting the character-class ranges (`[a-z]` → `[a_z]`). I'd *self-flagged the redundancy as imperfect-but-acceptable* during plan self-review and executed as written; it failed on all 5 enemies at the RED→GREEN transition. Lesson: if a plan step looks redundant, cut it in the plan, not during execution. Acceptance of "imperfect but probably fine" is a smell, not a decision.
  - **Caster-relative sides become load-bearing here.** Task 2 never tested the interpretation because no class ability's `side: 'ally'` had non-party semantics. The Cultist's `dark_pact` is the first place it does. Worth flagging in task 4's plan when it lands — if the engine quietly implements absolute sides, `dark_pact` silently heals the player party.
  - **No undead sprites in the catalog.** Confirmed by grepping `sprite_names.generated.ts` for "skeleton/zombie/ghoul/undead" — zero matches. This could have blocked the task; logical `spriteId` strings sidestepped the dependency on task 19 entirely.
  - **Stub-then-populate TDD pattern held up.** Same shape as task 2: write the test file against a stubbed export (`{} as Record<EnemyId, EnemyDef>`), confirm RED, fill in data, GREEN. The pattern generalizes cleanly across data-layer tasks and the RED phase is genuinely useful — it caught the plan bug above within seconds.
- **Touches:**
  - `src/data/types.ts` (modified)
  - `src/data/abilities.ts` (modified)
  - `src/data/enemies.ts` (new)
  - `src/data/__tests__/abilities.test.ts` (modified)
  - `src/data/__tests__/classes.test.ts` (modified)
  - `src/data/__tests__/enemies.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-crypt-enemies-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-crypt-enemies.md` (new)
- **Source:** `TODO.md` Cluster A · Task 3. Related: `gdd.md` §4 (The Crypt), task 2's HISTORY entry (shared type vocabulary).

### 2026-04-24 · Class data — Knight, Archer, Priest (Tier 1)

- **What shipped:**
  - `src/data/types.ts` — shared shapes for the `data/` layer: `ClassId`, `AbilityId`, `StatusId`, `AbilityTag`, `CombatantTag`, `WeaponType`, `SlotIndex`, `Side`, `BuffableStat`, `TargetSelector`, `TargetFilter`, `AbilityEffect` (9-kind discriminated union), `Ability`, `StarterLoadout`, `ClassDef`.
  - `src/data/abilities.ts` — 12 Tier 1 ability records (Knight / Archer / Priest each get 3 signature moves + a class-specific basic attack).
  - `src/data/classes.ts` — Knight, Archer, Priest with base stats, preferred weapon, ability list, AI priority, and sprite-frame starter loadout.
  - `src/data/__tests__/abilities.test.ts` (74 assertions) and `classes.test.ts` (18 assertions) covering registration completeness, slot ranges, effect presence, statusId round-trip, ability/aiPriority cross-references, and the Knight-gets-shield invariant.
  - Design spec at `docs/superpowers/specs/2026-04-24-class-data-design.md`; plan at `docs/superpowers/plans/2026-04-24-class-data.md`.
- **Why:** the combat engine (task 4) can't resolve anything without class and ability data. This task establishes the type vocabulary the rest of Tier 1 will build on.
- **Decisions:**
  - *Effects are a 9-kind discriminated union* (`damage, heal, stun, shove, pull, buff, debuff, mark, taunt`) — each kind carries only its own fields. Bulwark, Taunt, Flare Arrow, and Bless don't fit the TODO's listed five primitives; extending the union is cheap and keeps TS enforcement per kind.
  - *Flat AI priority with smart target selectors.* Target selectors already have to answer "is there a legal target?" — extending the filter grammar (`hurt`, `lacksStatus`, `hasStatus`, `hasTag`) to reject trivial targets lets the engine stay a one-liner: pick the first ability with a non-empty target set. No parallel condition evaluator.
  - *Composable selectors* (`{ side, slots?, filter?, pick? }`) rather than preset-menu or function-based. Keeps `data/` free of logic (per `src/README.md`) and won't hit a ceiling as Tier 2 classes add variants.
  - *Per-class basic attacks* (`knight_slash`, `archer_shoot`, `priest_strike`) instead of one universal `basic_attack` — class flavor from turn 1. Costs 3 extra ability records; worth it.
  - *Collapse-on-death engine invariant declared here.* Dead combatants do not hold slots; the line shifts forward. This makes `slots: [1]` always equal "nearest living enemy" — so `'nearest'` was dropped from the selector grammar as redundant. Task 4 inherits this rule; Tier 2+ can reintroduce corpses explicitly if wanted.
  - *`BuffableStat` includes `'hp'`* (max HP). Max-HP buffs/debuffs are a real mechanic (e.g., a hypothetical "Black Smoke" enemy ability). Engine behavior: current HP follows max when max changes.
  - *Flat deltas only for Tier 1.* Percent-mode buffs/debuffs are a non-breaking extension (add `mode: 'flat' | 'percent'`) when Tier 2 content actually needs them.
  - *`AbilityTag` vs `CombatantTag` kept distinct* — damage flavor (`'radiant'`) vs creature type (`'undead'`). Smite (`tags: ['radiant']`) and an undead enemy pair up via set intersection in the engine.
  - *`pick` and `slots` are independent axes.* `pick` absent = AoE over the candidate set; `pick` present = narrow to one. `slots` defines the candidate set regardless. Self-review fixed an earlier contradictory version of the rule.
  - *`power × Attack` damage/heal formula.* Lets gear/traits scale Attack upstream without touching ability data.
  - *Priest cosmetic weapon is `mace_tier1`* — no "holy symbol" sprite in the catalog yet. Logical `preferredWeapon` stays `'holy_symbol'` per the GDD; only the sprite id updates when bespoke art arrives.
  - *Firewall check for `src/data/classes.ts` importing `src/render/sprite_names.generated.ts`.* The generated module is pure typed constants with no Phaser dependency; import is clean.
- **Alternatives considered:**
  - *One generalized `status` primitive* (buff/debuff/mark/taunt collapsed into `{ stat, delta, duration, tag? }`). Rejected — the engine would still have to branch on tag strings, losing TS enforcement that `mark` has a `damageBonus` and `taunt` doesn't.
  - *Multiple explicit primitives (`buff, debuff, mark, taunt` as separate kinds).* Chosen — see above.
  - *Simplifying the Tier 1 kits to fit the TODO's five primitives only.* Rejected — would flatten Knight's Bulwark/Taunt, Archer's Flare Arrow, Priest's Bless into unrecognizable substitutes.
  - *Conditional AI priority (`{ ability, when: Condition }` entries).* Rejected — target-selector legality already gates "right situation"; a parallel system duplicates work.
  - *Preset named selectors* (`frontEnemy`, `mostHurtAlly`, etc.). Rejected — freezes the vocabulary; Tier 2 classes would hit the ceiling.
  - *Function-based selectors.* Rejected — violates the "no logic in `data/`" convention.
  - *One universal `basic_attack` ability.* Rejected per user preference for per-class flavor.
  - *DD-style corpse mechanic.* Rejected for Tier 1 — complexity without Tier 1 payoff.
  - *Changing `WeaponType` to `'mace'`* to match Priest's starter sprite. Rejected — sprite is cosmetic; the GDD's logical category (`'holy_symbol'`) is what the Tier 2 gear rule will read.
- **Surprises / lessons:**
  - The TODO's acceptance listed effect descriptors as "damage / heal / shove / pull / stun" — incomplete for the kits as written in the GDD. When acceptance criteria conflict with the source design, the design wins; the TODO got under-specified.
  - Self-review caught two bugs that the section-by-section review didn't: (a) selector semantics contradicted themselves (`slots: 'all'` was said to ignore `pick`, but `archer_shoot` relied on exactly that combination); (b) `piercing_shot` without `pick` would have been AoE under the corrected rule, not single-target. Both fixed inline before writing the plan.
  - User flagged two redundancies / omissions I'd missed: `'nearest'` was equivalent to `[1]` under collapse-on-death, and `BuffableStat` was missing `'hp'`. Worth flagging: brainstorming catches design issues that section-walking alone misses.
  - The `Priest` basic attack (`priest_strike`) requires slots 1–2; Priest naturally sits at slot 3 per GDD. Low-risk because Mend/Bless/Smite cover slots 2–3 and will almost always fire before basic attack is reached, but flagged for task 4's playtesting in case shuffle-fallbacks get weird.
  - The `Record<ClassId, ClassDef> = {} as Record<ClassId, ClassDef>` stub pattern gives the TDD test file something to import during the RED phase without TS complaining about unimplemented key coverage. Worth reusing for the next data-layer task.
- **Touches:**
  - `src/data/types.ts` (new)
  - `src/data/abilities.ts` (new)
  - `src/data/classes.ts` (new)
  - `src/data/__tests__/abilities.test.ts` (new)
  - `src/data/__tests__/classes.test.ts` (new)
  - `docs/superpowers/specs/2026-04-24-class-data-design.md` (new)
  - `docs/superpowers/plans/2026-04-24-class-data.md` (new)
- **Source:** `TODO.md` Cluster A · Task 2. Related: `gdd.md` §3 (Classes, Abilities), `gdd.md` §2 (Combat positions, stats).

### 2026-04-23 · Core types & seeded RNG

- **What shipped:**
  - `src/util/rng.ts` — a deterministic seeded PRNG (`createRng(seed)`) with `next / int / pick / shuffle / weighted` helpers.
  - `src/util/__tests__/rng.test.ts` — 22 tests covering determinism, range, uniformity, bounds, permutation, non-mutation, weight proportion, and edge cases.
  - `src/combat/types.ts` — the `Stats` interface (`hp`, `attack`, `defense`, `speed`).
- **Why:** every downstream core module needs shared types and deterministic randomness. Tests that exercise RNG-driven logic can't assert anything without a reproducible sequence.
- **Decisions:**
  - *Scoped this task to RNG + `Stats` only.* Other types named in the TODO entry (Hero, Class, Ability, Enemy, Pack, RunState, Roster, SaveFile) were **deferred** to their owning tasks. Empty stubs now would be speculative — the real shape comes from the first code that uses them, and would have needed rewriting.
  - *Chose mulberry32* for the PRNG: small, fast, well-known, adequate statistical quality for a game (not a cryptographic context). No dependency added.
  - *Factory function (`createRng(seed)`) over a class.* Closure-over-state keeps the API small; no `new`, no `this`.
  - *`Stats` lives in `src/combat/types.ts`, not `src/heroes/types.ts`.* Both heroes and enemies have stats, and combat is the primary consumer — placing stats under heroes would leave enemies orphaned.
  - *`weighted()` takes `{ value, weight }` objects* rather than parallel arrays — self-documenting at call sites.
  - *Explicit throws on empty input* (`rng.pick([])`, `rng.weighted([])`, zero total weight). Silent `undefined` returns would cause mysterious downstream failures.
- **Alternatives considered:**
  - *Creating all 8 type stubs up front.* Rejected — speculative abstraction; types would be reshaped by their first real consumer.
  - *Class-based RNG (`new Rng(seed)`).* Rejected in favor of the factory for simpler API surface.
  - *xoshiro / splitmix64.* Rejected — mulberry32 is easier to audit in a few lines and is well within the quality needed for dice-roll use.
- **Surprises / lessons:**
  - Some tests passed on their first green run because their assertions were inherent properties of a correct mulberry32 (values in `[0, 1)`, uniformity). They stay as regression guards — the *determinism* test is the one that actually drove the implementation.
  - Two `toThrow()` tests (`pick([])`, `weighted([])`) passed initially for the **wrong** reason: the methods didn't exist yet, so calls threw accidentally. After implementing the methods with explicit empty-input guards, the tests kept passing for the right reason.
  - TypeScript strict mode caught a type-indexing issue in the `weighted` proportion test (a `counts` object indexed by the string return value of `rng.weighted(...)`). Fixed by typing `counts` as `Record<string, number>`.
  - The `Stats` shape is deliberately **Tier 1 only** (four stats). `Mind`, `Crit`, `Dodge` arrive in Tier 2 and will extend the interface then.
- **Touches:**
  - `src/util/rng.ts` (new)
  - `src/util/__tests__/rng.test.ts` (new)
  - `src/combat/types.ts` (new)
- **Source:** `TODO.md` Cluster A · Task 1. Related: `gdd.md` §2 (combat stats), `gdd.md` §10 (Tier 1 scope).
