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

### 2026-04-28 · Shop nodes (Cluster A · 9)

- **Why:** Adds the gdd's "spend gold for gear vs fight for XP/gold" decision. Without shops, all fork branches were combat-vs-combat and the Crypt had no real economy beyond "save gold for the camp Vault." This task ships the data + traversal foundation: every Crypt floor's fork now has a shop on one branch (deterministic from RNG), 4 gear items at floor-scaled prices. Cluster B · 3 replaces the auto-leave stub with a real shop overlay later.
- **Decisions:**
  - **Gear-only Tier 2 ship.** Potions deferred — no consumable system exists yet, so building potions alongside shops would balloon scope. Shop is gear-only; potions land with their own design pass.
  - **One shop per floor on a random fork branch.** Predictable cadence (you always see one shop per floor) + variable placement (RNG decides which branch) keeps the choice meaningful without making shops avoidable. Replaces the combat-vs-combat fork with combat-vs-shop, which is the asymmetric trade-off the gdd called for.
  - **Prices: `BASE × floor × (1 ± 0.15)`** with bases 30/80/200 for common/uncommon/rare. ±15% RNG variance per item adds "hunt for deals" flavor. Linear floor scaling matches gold income (15g/floor combat, 100g/floor boss).
  - **Inventory slot order is fixed: weapon, shield, outfit, hat.** One item per slot guarantees coverage; rarity / weapon-family / affixes carry the variety. RNG variance lives in the rolls, not the slot composition.
  - **`rollShopItem` extracted from `rollLoot`** — *but* `rollLoot` keeps its inline body, not delegating, because boss loot uses asymmetric floor scaling (next-floor rarity weights, same-floor affix values). Two functions over shared private helpers; cleaner than parameterizing the asymmetry.
- **Surprises:**
  - The plan-warned ripple from `advanceToBossNode` after Task 2 didn't materialize — `completeCombat` reads `node.type` and `nextNodeIds` but never `node.encounter`, so existing tests that walk the diamond progressed correctly even when the chosen branch was a shop. The helper update in Task 3 still landed (skips shops via `leaveShop`) but it was prophylactic, not corrective.
  - Type-narrowing fixes surfaced two latent issues: combat_scene's `node.encounter` access and floor.test.ts's "scale per encounter" loop. Both got defensive-narrowing treatment in Task 1 to keep tsc clean throughout.
- **Source:** TODO.md Cluster A · 9 → spec at `docs/superpowers/specs/2026-04-28-shop-nodes-design.md` → plan at `docs/superpowers/plans/2026-04-28-shop-nodes.md`. Test count delta: 1113 → 1135 (+22).

### 2026-04-28 · Fork picker UI (Cluster B · 6)

- **Why:** Closes the loop on Cluster A · 8 (forks). Without a picker, the auto-pick stub silently chose branch A every time — the player had no agency at forks. This task ships the in-scene picker, extracts the icon-row's path-walking helper into a tested `playerPath(rs)` function so the icon row reflects the player's actual choice, and fixes a latent save-reload bug where reloading during `awaitingFork: true` would re-fight the cleared fork source.
- **Decisions:**
  - **In-scene picker over modal overlay.** Forks are spatial in the gdd's framing — putting the picker at NODE_X[2] preserves that. Smallest blast radius too: no new scene file, just a state addition + render method.
  - **`playerPath` is now data-aware.** Instead of always picking branch A, walks the graph from start, picking the branch whose forward-reachable set contains `currentNodeId`. Defaults to branch index 0 when ambiguous (start, fork source pre-pick, post-convergence at boss). Pure helper in `run_state.ts` — testable, reusable.
  - **Save-reload guards added to `walking_in` and `walking_to_next` `onComplete` callbacks.** A latent bug pre-task: a save during `awaitingFork: true` would reload, walk-in, then re-fight the cleared fork source. The auto-pick stub masked this by firing in `onResultDismiss` and never letting `awaitingFork: true` reach a save. With a real picker, both walking transitions now check `awaitingFork` and route to `awaiting_fork_pick` instead of starting combat.
- **Surprises:**
  - The picker render is ~70 lines (with the per-option helper); the `playerPath` extraction is ~50 lines including helpers. Most of the task code is the picker layout — concise relative to the gameplay impact.
  - Crypt forks are combat-vs-combat — both icons show ⚔ — so the differentiation comes from the "branch A" / "branch B" subtitles. The labels become redundant once shop/elite/event content lands and the glyphs differ; could be dropped at that time.
  - The save-reload guard had to live in two places (`walking_in` and `walking_to_next` onComplete) — DRY'ing wasn't worth it for two near-identical 4-line callbacks. Flagged in the plan; left as-is.
- **Source:** TODO.md Cluster B · 6 → spec at `docs/superpowers/specs/2026-04-28-fork-picker-design.md` → plan at `docs/superpowers/plans/2026-04-28-fork-picker.md`. Test count delta: 1107 → 1113 (+6).

### 2026-04-28 · Floor generation: forks (Cluster A · 8)

- **Why:** Foundation for the gdd's "Descend" loop — until forks exist, dungeon floors are linear walks with no player agency between fights. This task converts the Crypt floor from a 4-node list to a 5-node diamond DAG, with one fork after the first preamble combat. The decision quality is low in Tier 2 (both branches are combat with different RNG-rolled enemy comp), but the data model and traversal API now slot cleanly into shop / elite / camp / event nodes (A · 9, 10, 11, 13/14) without further structural change.
- **Decisions:**
  - **Implicit forks via `nextNodeIds[]` on every node, not an explicit `fork` node type.** Graph shape lives entirely on edges; combat/boss variants gain one new field. No new node type with no encounter to filter out of combat paths.
  - **`currentNodeId: string` replaces `currentNodeIndex: number`.** The `awaitingFork: boolean` flag distinguishes "in combat at this node" from "completed combat at this node, awaiting fork pick." Cleaner than overloading `RunStatus` with a new value that breaks save normalizer + scene transitions.
  - **Atomic graph migration in one task.** Splitting into smaller tasks would have left the test suite or tsc broken across multiple commits — the data shape change forces all consumers to update together. Bundling into one commit keeps each end-state coherent.
  - **Tier 2 dungeon scene gets a stub auto-pick.** When `awaitingFork: true`, the scene calls `chooseNextNode(rs, nextNodeIds[0])` automatically. Cluster B · 6 (Fork picker UI) drops in via the same `chooseNextNode` API.
  - **Saves predating the migration are discarded.** Pre-launch policy; loader's shape-mismatch check rejects old `currentNodeIndex` saves. Acceptable given current state.
- **Surprises:**
  - The dungeon scene had 8 separate `currentNodeIndex` reads spread across `processCombatReturn`, `buildResultPanel`, `refreshHud`, and `refreshNodeColors`. All replaced with a derived `pathPositionFor(run)` BFS helper plus a `defaultPlayerPath(run)` that always picks branch A. Mid-floor save restore now correctly highlights the player's position because pathPositionFor BFSes from the unique source node.
  - `dungeon.floorLength` (= 3 in `DungeonDef`) is now obsolete; the new generator hard-codes the diamond shape. Kept the field as documentation; A · 9-11 will introduce variable shapes per floor.
  - `buildResultPanel` had an off-by-one calculation (`currentNodeIndex - 1` for the just-completed node) that would have been broken by the fork-source case. Replaced with explicit branching: boss → unique terminal; awaitingFork → currentNode itself; linear → "the node whose nextNodeIds contains the new currentNodeId."
- **Source:** TODO.md Cluster A · 8 → spec at `docs/superpowers/specs/2026-04-28-floor-forks-design.md` → plan at `docs/superpowers/plans/2026-04-28-floor-forks.md`. Test count delta: 1095 → 1107 (+12).

### 2026-04-28 · Level-up perk picker UI (Cluster B · 8)

- **Why:** Closes the loop on the leveling foundation (Cluster A · 7). Heroes were earning XP, levelling up, and getting flagged `pendingPerk: true` — but had no way to actually pick a perk. The flag accumulated indefinitely; combat saw `perkId: undefined` and applied no effect. This task ships the picker overlay, the `applyPerk` helper, and the camp-scene auto-launch that surfaces the choice as soon as the player returns to camp.
- **Decisions:**
  - **Auto-overlay on camp focus over Barracks-badge or block-Noticeboard.** Forces the level-up moment as a beat — matches the "rookies become legends" arc framing. Smallest blast radius too: one method on `CampScene` plus the new scene file. Alternatives (Barracks badge or Descend gate) would touch 2+ scenes and add a "remind me later" code path.
  - **Sequential queue, one hero at a time.** A surviving party of 3 can hit level 5 simultaneously; rather than batch view or carousel, just keep launching the overlay until no hero has `pendingPerk`. The `RESUME` handler fires the next launch automatically — fire-and-forget, no per-fight queue state to maintain.
  - **HP-effect perks scale current `maxHp` rather than recomputing from class base.** Per-level HP bumps from `applyLevelUps` are baked into `maxHp` and not tracked separately; recomputing from base would lose them. Trade-off: equipment HP also gets multiplied. For Tier 2 with two `+10% HP` perks this is small and reads as "Resolute = your hero is 10% beefier" overall.
  - **No skip / cancel / ESC.** Matches the auto-overlay model — the player is forced to engage with the level-up moment.
- **Surprises:**
  - Extracted `applyHpEffect(value, effect)` and `gearTotal(equipment)` helpers from the inline `computeMaxHp` math. DRY-up was forced by the perk extension but improves readability of `computeMaxHp` itself too.
  - `currentHp ≥ 1` guard handles the unlikely `currentHp: 0` edge case (living heroes always have ≥1, but a hand-edited save or future "rested at 0" feature could violate). One line, defensive.
  - Test count delta: +6 cases (5 `applyPerk` + 1 `computeMaxHp` stacking) — small, but covers all five behaviorally-distinct paths through `applyPerk` plus the key trait+perk HP-stacking math.
- **Source:** TODO.md Cluster B · 8 → spec at `docs/superpowers/specs/2026-04-28-perk-picker-design.md` → plan at `docs/superpowers/plans/2026-04-28-perk-picker.md`.

### 2026-04-28 · Hero leveling + level-5 perks (Cluster A · 7)

- **Why:** With traits and gear in place, heroes had no second axis of progression — every Knight played identically across runs. Adds the gdd's "rookies become legends" arc: surviving heroes earn XP per fight, level up with deterministic stat bumps, and at level 5 unlock a class-specific choice of two minor perks. Foundation only — picker UI is Cluster B · 8.
- **Decisions:**
  - **Class-specific perk pairs over universal pairs.** 12 hand-tuned perks (2 per class) reinforce class identity at the level-5 milestone — Mage gets Arcane Power vs Quick Cast, Rogue gets Lethal vs Evasive. Avoids the "Mage offered Heavy Plate" mismatch problem of pooled rolling. Authoring scope (12 entries) matches the trait pool.
  - **Level cap 5 in Tier 2.** Gdd defines level-5 + level-10 perks; level 10 ships with Tier 3 alongside the Sunken Keep difficulty curve. Cap is a single constant; trivial to extend.
  - **XP applied per-fight, mid-run.** Simpler data flow than per-run accumulation; level-up moments land as in-fight beats; no `runXp` shadow counter to keep in sync. `pendingPerk` flag persists across save-during-run; cleared by Cluster B · 8.
  - **Crit-primary classes get +2 per level**, others +1. A level-5 Rogue with the +1 rule would gain +4 Crit (≈ negligible at integer-percent); +2 keeps progression visible for a class whose identity is built on crit.
  - **Slow XP curve, tuned for ~15 deep clears to level 5.** First proposal (combat=10×floor, boss=50×floor) hit level 4 in a single deep run — broke the slow-burn arc. Halved per-fight XP and stretched thresholds to 200/800/2000/4000.
  - **Perks reuse `TraitStatEffect` / `TraitHpEffect` shapes verbatim.** No new effect kinds; `getEffectiveStat` extends with one analogous loop. Future conditional perks pick up `inSlot` / `belowHpRatio` for free.
- **Surprises:**
  - Intentional `tsc` gap between Task 2 (`leveling.ts` references `Hero.level`/`pendingPerk`) and Task 4 (adds those fields) — vitest stays green throughout because vitest transpiles per-file rather than type-checking. Plan documented this so the executing path didn't panic at the expected red errors.
  - The save normalizer was the riskiest piece — heroes from saves predating leveling needed `xp/level/pendingPerk` defaulted at load. A `normalizeHero` helper alongside the existing stash backfill kept the change additive; pre-launch policy meant no schema bump.
  - `completeCombat` in `run_state.ts` already does ~5 things (HP/wound update, fallen separation, gold reward, loot, fallen-gear transfer); adding XP makes 6. If a 7th lands, splitting becomes worthwhile — flagged but not addressed here.
- **Source:** TODO.md Cluster A · 7 → spec at `docs/superpowers/specs/2026-04-28-hero-leveling-design.md` → plan at `docs/superpowers/plans/2026-04-28-hero-leveling.md`. Test count delta: 999 → 1095 (+96).

### 2026-04-28 · Trait display on hero cards (Cluster B · 7)

- **Why:** With the trait pool at 12 entries (Cluster A · 6), players needed the trait readable wherever a roster is shown. Pre-task the trait *name* rendered only on the large card and the *description* only on the Barracks detail pane — so Tavern players had to memorize what each trait does, and the Barracks list pane (where you spend most of your roster-management time) showed nothing about traits at all.
- **Decisions:**
  - **Always-visible inline description over hover tooltip.** The codebase has no tooltip widget and tooltips behave poorly on touch (mobile-landscape is supported). Inline text is one widget change versus net-new infrastructure plus a touch-fallback question. The TODO entry's "tooltip" wording is interpreted as "description must be reachable," not as a specific UI affordance.
  - **Required `shortDescription` field over wrapping or width-growth.** Hand-tuned short forms (≤16 chars) keep the small-card layout uniform, the Barracks 2-column grid intact, and the Noticeboard slot height unchanged. Adds 12 strings; trivial maintenance. Field is required (not optional) — there's no sensible fallback at the call site, since degrading to `description` would re-introduce the overflow problem the field exists to solve.
  - **No color treatment by trait sign.** Bloodthirsty is "positive but conditional," which muddies any sign-based scheme. Defer until it earns the complexity.
- **Surprises:**
  - The small card's slot allocation was already 60 px (4 px slack over the 56 px card). Growing `SMALL_HEIGHT` 56→60 to fill the slot, plus mild internal compression (name 14→12 px, HP bar 6→5 px, top padding 8→6 px), fit the new trait line without touching `BarracksPanelScene`, `NoticeboardPanelScene`, or any panel-chrome constants.
  - Bloodthirsty short form (`Bloodthirsty · +2 Atk <50%HP`, ~28 chars at 10 px) overflows the small-card text-row width budget by ~36 px. Acceptable: trait line is the last visual element, no right-side neighbor collides (190 px to next slot center, 248 px to its left edge). Cleaner long-term alternative would be growing the small card to 240 wide and re-tuning two scenes — out of scope here.
  - Free bonus: the Noticeboard party picker uses the same small card via `HeroCard`, so it picked up trait display automatically with zero scene changes.
- **Source:** TODO.md Cluster B · 7 → spec at `docs/superpowers/specs/2026-04-28-trait-display-design.md` → plan at `docs/superpowers/plans/2026-04-28-trait-display.md`. Test count delta: +24 (12 traits × 2 new shape checks); 969 → 993 passing.

### 2026-04-28 · Traits at recruitment — pool to 12 (Cluster A · 6)

- **Why:** Pre-task pool was 6 entries — small enough that two Tavern visits could roll visually identical rosters. Doubled to 12 to make rolls produce distinct heroes (some with real flaws), and to land the foundation for future conditional traits without expanding the engine again. Trait scaffolding (data, types, application points) was already in place from earlier recruitment / combat work — this task was mostly content plus two narrow type widenings.
- **Decisions:**
  - **Mix C** (mixed positive / negative + one new condition kind) over all-upside or "no new conditions." *Why:* matches the gdd's "individual identity, not just bonuses" framing; the new `belowHpRatio` is parameterized (`ratio: number`) so future berserker-style traits ("+X when below 25% HP") drop in without engine changes.
  - **Bloodthirsty tuned to +2, not +1.** Conditional gating costs roughly half the uptime, so +2 ≈ unconditional +1 in expected value but with much higher variance and "comeback" feel. Easy to drop to +1 in `data/traits.ts` if playtesting shows it's swingy in a bad way — no other code changes needed.
  - **Frail uses `hpEffect`, not `statEffects`.** Mirrors Stout exactly via the existing `computeMaxHp` arithmetic; no engine change required for negative-HP traits. The only test that broke was the Stout-vs-others tavern maxHp assertion — refactored to a 3-branch stout-up / frail-down / others-equal check.
  - **`TraitStatEffect.stat` widened to all non-HP buffable stats.** `mind` / `crit` / `dodge` weren't allowed before; widening is zero-risk because nothing in the codebase narrows or branches on the union, and `getEffectiveStat` already loops over all `statEffects` regardless of stat.
  - **Strict `<` semantics on `belowHpRatio`.** At exactly the boundary the condition is false. Documented with an explicit `currentHp: 10, maxHp: 20` boundary test rather than a class's natural HP, which would land off-boundary on odd values.
- **Surprises:**
  - The trait scaffolding was further along than the TODO entry implied — Tavern roll, save persistence, combat-build pass-through, and the `getEffectiveStat` evaluation loop all already worked. The only structural changes were two tiny type widenings and one switch case. Most of the diff is data + tests.
  - Test count: 933 → 969 (+36, mostly parameterized `describe.each` shape checks across the 6 new IDs plus 4 behavior tests).
- **Source:** `TODO.md` Cluster A · 6 → spec `docs/superpowers/specs/2026-04-28-traits-at-recruitment-design.md` → plan `docs/superpowers/plans/2026-04-28-traits-at-recruitment.md`. Follow-up: Cluster B · 7 (trait display in Tavern + hero card) is now unblocked — Frail / Bloodthirsty etc. roll on candidates but aren't visible in UI.

### 2026-04-27 · Barracks panel — resolved kit display

- **Why:** Post-shipping fix for the gear-modifies-abilities task. The Barracks panel was reading `CLASSES[classId].abilities` directly — accurate for default-loadout heroes but misleading for any hero with a non-preferred weapon (would *display* Shield Bash while *fighting* with Cleaving Swing). With the equip-swap UI live, players can now produce that mismatch in normal play. This task makes the Barracks always show what actually fights, plus a one-line kit status indicator explaining *why* the kit is what it is.
- **Decisions:**
  - **Dedicated `WEAPON_DISPLAY_NAME` table** in `src/data/items.ts` over reusing `BASE_ITEMS[baseId].name`. *Why:* semantic separation. `BASE_ITEMS.name` is the *item-instance* label ("Mace"); `WEAPON_DISPLAY_NAME` is the *weapon-type category* label ("Holy Symbol"). The status line describes the type, not the instance. Tiny table (6 entries), trivially extended when new weapon types arrive.
  - **`describeKitStatus(hero)` lives in `src/items/kit.ts`** alongside `resolveCombatAbilities`. *Why:* both functions consume the same hero-state inputs and mirror the same band logic. Co-locating them avoids parallel maintenance when the rule evolves. The function deliberately does NOT call `resolveCombatAbilities` — it derives the band independently from the same inputs, keeping it returnable from a single read with no caching question.
  - **Always render the status line**, even for the default-case `Sword + Shield · Full kit`. *Why:* consistency over noise-reduction. Player learns the shape; off-spec heroes stand out by saying something different. Hiding-when-default would create a "where did the indicator go?" moment when equipment changes.
  - **`+ Shield` / `No shield` suffix is class-conditional** (only renders when class has a shield-required ability), not just shield-presence-conditional. Mage with no shield doesn't show "no shield" because Mage has no shield-required ability — nothing to be missing.
  - **No color-coding by band** (green/amber/red). Considered, rejected. Text alone is sufficient; colored bands would add visual noise to a panel already using gold for accent.
  - **Status placement: 80px right of the ABILITIES header**, same y, in muted `#aaaaaa` — no layout shift. Magic-number-ish but flagged in spec §6 with a comment in the scene.
- **Surprises / lessons:**
  - **Cleanest plan execution this session.** 3 tasks, zero in-flight deviations, exact predicted test count (911 → **923**, +12). Patterns that paid off: small plan (3 tasks vs 6/11/17 prior), tight spec (single behavior change), TDD-style each task (failing test → impl → green). Worth holding the "smaller-plan-better" correlation as a working hypothesis.
  - **`describeKitStatus` is parallel to `resolveCombatAbilities`, not built on it.** Tempting to derive status from "did resolved kit equal class default?" but that gives less precise messages (can't distinguish "axe → off-preferred" from "no shield → filter dropped"). Two functions over the same inputs, each reasoning about its own concern, ended up cleaner.
- **Source:** HISTORY 2026-04-27 (gear-modifies-abilities) follow-up — explicitly called out as the most-important next item there. Not a numbered TODO. Spec at `docs/superpowers/specs/2026-04-27-barracks-resolved-kit-design.md`. Plan at `docs/superpowers/plans/2026-04-27-barracks-resolved-kit.md`. Tests: 911 → **923 passing**. Follow-ups: equip-panel ability-swap preview (also called out in the gear-modifies-abilities HISTORY).

### 2026-04-27 · Gear modifies abilities (weapon-family rule + 8 swap abilities)

- **Why:** Closes the gameplay payoff for the items system. Pre-task, equipping a different weapon was just a stat swap — Knight + axe still played as a Shield Bash tank. Per GDD §3, equipped weapon should gate each class's signature kit: preferred → full kit; same-family → one ability swapped per weapon; wholly wrong → basic only. Plus the shield sub-rule: no shield → no shield-based abilities. With this in place, the rare Sword of Burning that drops feels mechanically different from a rare Axe of Burning on the same Knight.
- **Decisions:**
  - **3 weapon families** (melee/ranged/magic) over 2 (physical/magic) or 4 (bladed/blunt/ranged/magic). The GDD example "Knight + Greataxe = same family as Sword" rules out the 4-family option; the 2-family option makes Knight + bow same-family which felt mechanically wrong. *Why:* matches the GDD example exactly, keeps Archer's "no same-family alternative" issue isolatable. Archer's gap is captured in `ideas.md` for post-launch.
  - **Per-weapon swap (b1)** over per-class single-swap (a) or per-weapon-different-target (b2). The user's framing was "shield grants Shield Bash; lose the shield, lose the ability — other classes follow the same logic for their weapon-identified ability." Each class swaps the same target ability regardless of which alternate same-family weapon, but the *replacement* differs by weapon. Knight + axe → Cleaving Swing; Knight + daggers → Quick Slash. *Why:* preserves "your weapon-themed ability is the variable thing" mental model; doubles authoring vs (a) but keeps it manageable (8 new abilities, not 16).
  - **Class basic preserved in wholly-wrong band** (b) over universal basic_attack (a). Mage + daggers keeps `mage_zap` (mind-scaled). *Why:* class identity is primarily stat-driven; stripping mind scaling from a mage feels punitive beyond "sub-optimal." Easy to flip to (a) post-playtest if too soft.
  - **Shield sub-rule via `requiresShield: true` on Ability** rather than per-class declaration. Currently only `shield_bash` flagged. *Why:* one boolean is sufficient; per-class `shieldRequiredAbilities` lists are over-engineered for a problem with one Knight ability today.
  - **Resolver lives in `src/items/kit.ts`** as a pure function consumed by `buildCombatState`. Combat resolver is unchanged — it sees `Combatant.abilities` already resolved. *Why:* keeps combat resolver agnostic of equipment; matches the wounds + items-foundation pattern of "compose hero state into combat state at the boundary."
  - **No combat-engine changes.** The 8 new swap abilities use existing effect kinds (`damage`, `bonusCrit`, `radiant` tag, `cooldown`). No new statuses, no new effect machinery.
  - **`basicAbility` is explicit per class**, not derived from `abilities[0]`. *Why:* the array-index assumption is brittle; explicit field is cheap and safer for future ability-list reorderings.
- **Surprises / lessons:**
  - **Plan executed cleanly with zero in-flight deviations** — first plan-execution this session where I didn't have to backfill placeholders or fix mis-narrowed types mid-stream. Likely because the plan was small (6 tasks vs 11/17 for prior plans) and the algorithm had clear phases (band detection → swap → shield filter). Smaller-plan-better correlation worth holding.
  - **Test count jumped 804 → 911 (+107)** but the *behavior surface* added is much smaller. Most of the boost is parameterized loops: `kit.test.ts` runs each test across 6 classes × 4 weapon types, and `classes.test.ts` adds `describe.each` over the 5 swap-classes. Useful coverage but the raw count overstates the change.
  - **`describe.each` test fixtures need `ABILITIES` import added.** `classes.test.ts` already imported it (existing test); just noting that adding swap-mapping integrity tests required the same import flow. Consistent with prior conventions, no friction.
  - **Existing combat tests didn't need changes.** `buildCombatState` always passes the resolved kit through, but for default starter loadouts every hero has their preferred weapon + (Knight) shield, so the resolved kit equals `def.abilities` exactly. Tests using starter heroes saw zero behavior change.
- **Source:** TODO Cluster A · task 5 (gdd §3 + §10 Tier 2). Spec at `docs/superpowers/specs/2026-04-27-gear-modifies-abilities-design.md`. Plan at `docs/superpowers/plans/2026-04-27-gear-modifies-abilities.md`. Tests: 804 → **911 passing**. **Most important follow-up: Barracks panel resolved-kit display** (currently shows `CLASSES[classId].abilities` directly; will become misleading once players equip non-preferred weapons). Other follow-ups: equip panel ability-swap preview, two-handed-weapon-blocks-shield rule, Archer same-family flexibility (`ideas.md`), balance tuning of the 8 new swap abilities.

### 2026-04-27 · Equip-swap UI (post-boss camp screen)

- **Why:** Items system shipped substrate-only — drops landed in `pack.items` and banked to `stash` on cashout, but the player had no UI to act on any of it. Smoke-testing surfaced the visibility gap explicitly. This task fills it for the during-run loop only: the equip panel opens from the post-boss `camp_screen_scene` and (later, via TODO #11) from rest-area overlays. **No camp-hub Barracks equip UI** — equipping is part of the run, not the meta layer; stash stays untouched by this UI for future Blacksmith work.
- **Decisions:**
  - **Pack ↔ equipment only, no stash.** User's tightening: equip happens during the run, not between runs. Stash is meta-layer, untouched by this UI. Implication: stash items currently sit unused until a future hub-equip / Blacksmith task — accepted.
  - **Item determines slot, not the other way around.** First draft of the interaction model had the player tap a slot to filter the pack list; user pointed out the slot is unambiguous from the item itself. Simplified to: tap any pack item → preview → tap Equip. Pack list shows all items intermixed with `[w]/[s]/[o]/[h]` slot tags inline. Slot squares are display + a separate path for unequipping (tap occupied non-weapon slot → preview removal → tap again to commit).
  - **Tap-to-select with explicit Equip button** (not hover-preview). Hover doesn't exist on touch; one behavior across desktop and mobile. Selection persists until cleared, preview stays visible the whole time. Explicit Equip/Unequip button in the bottom-right with contextual label (`Equip <name>` or `Unequip <name>`).
  - **Equipment-only stat preview.** `previewStats` excludes traits and wounds because they're invariant across the swap; including them would shift both columns identically and obscure the delta. Matches the existing Barracks display convention.
  - **`equipFromPack` / `unequipToPack` are atomic transactions in `src/run/equip_run.ts`.** Validate-then-construct; no partial mutations on throw. Both clamp `currentHp` to recomputed `newMaxHp` after the equip change — vigor outfit raises max but doesn't auto-heal (rest areas will, per TODO #11).
  - **Extracted `applyEquipmentStats` + `rarePropertyFields` to `src/items/stats.ts`** so both `combat_setup.ts` and the new `selectors.ts` can share them. Targeted refactor; no functional change. `previewStats` reuses `applyEquipmentStats` for the "with simulated equipment" math.
  - **Pack pill shows item count** in both `dungeon_scene` HUD and `camp_screen_scene` (`Pack: 50g · 3 items`). Fixes the "I'm not seeing items" feedback from playtest.
  - **`scene.restart()` on RESUME for `camp_screen_scene`** instead of manual teardown. The scene's `create()` is small and idempotent; rebuild against mutated state is one line.
- **Surprises / lessons:**
  - **`noUnusedLocals` forced sequential consumption of scene-local fields.** Tasks 7-10 each added a piece of `EquipPanelScene`. After Task 7 (scaffold), `selectedHeroIndex` / `selection` / `packPageStart` were declared but unused — `tsc` errored. Tasks 8-10 consumed them, but the build was red between them. For future Phaser-scene plans where state-fields are introduced before consumers, either (a) introduce + consume in the same task or (b) add a tiny no-op reference. Same lesson as task 16's "no orphan fields" entry.
  - **Discriminated unions don't narrow inside arrow callbacks.** `this.selection.kind === 'pack-item'` narrowed the type at the if-statement level, but the inner `.find((i) => i.id === this.selection.itemId)` callback re-widens because `this.selection` could change between the check and the call. Fix: capture `const sel = this.selection` at the top of the function. Same fix would apply to any future "narrow `this.x` then use it inside a closure" pattern.
  - **`RARE_PROPERTIES.of_burning.turns` doesn't typecheck against the union.** `RarePropertyDef` is a discriminated union by `kind`; even when accessed by a known-burn key, TS sees the full union and refuses `.turns`. Workaround: re-narrow with a `kind === 'burn'` check inside the formatter. If this pattern grows, refactor `RARE_PROPERTIES` typing to map each id to its specific variant.
  - **Plan deviation: combined Task 6 (HUD pack pill) + Task 9 commit logic.** The plan separated commit-on-second-tap-of-slot-square (Task 8 placeholder) from the actual commit wiring (Task 9). I had to backfill Task 8's placeholder branch in Task 9 — flagging because a fresh subagent following the plan literally would have left the slot-tap commit broken until Task 9 reached back. Better split next time: don't ship a "no-op for now" branch; build the commit handler first then wire callers.
- **Source:** Follow-up to Cluster A · task 4 (items foundation) HISTORY entry — equip-swap UI was called out as untracked deferred work there. Spec at `docs/superpowers/specs/2026-04-27-equip-swap-ui-design.md`. Plan at `docs/superpowers/plans/2026-04-27-equip-swap-ui.md`. Tests: 768 → **804 passing**. Follow-ups: TODO #11 (rest-area overlays launch the same `equip_panel`), Cluster C · 2 (bespoke outfit/hat sprites — currently `'0'` placeholder shows frame 0 in slot squares), and a future hub-Barracks / Blacksmith task that surfaces stash items.

### 2026-04-27 · Gear rarity tiers + items foundation

- **Why:** Foundation for Blacksmith upgrades, shop stock quality, and the GDD §7 gear-flow loop. The TODO entry framed this as "add rarity to gear", but no items system existed — task implicitly required introducing the substrate (Item type, hero equipment, pack-carries-items, stash, drops, gear→combat plumbing). Brainstormed up to "full foundation, no UI" so follow-up Cluster B tasks can layer equip-swap / shop / blacksmith UIs without re-shaping data.
- **Decisions:**
  - **Diablo-style affix system over a flat ladder.** Rarity = affix count: Common 0 / Uncommon 1 / Rare 2 (3 for hats — they trade their lack of a rare property for an extra affix). Affix value scales with floor via the existing `floorScale.hp` curve; values are baked at roll time and never re-scale. *Why:* affix variety > tier-named items at low authoring cost; baked values make save round-trip trivial and treat items as instances-of-luck rather than living objects.
  - **Universal affix pool** (any of 7 affixes on any slot). *Why:* smallest authoring footprint; the rare "+Attack outfit" is acceptable noise. Future slot-whitelist on `AffixDef` is purely additive.
  - **`of_vigor` HP affix carries a `hpMultiplier?: 3` sentinel** — affix value gets ×3 after floor scaling. *Why:* hero HP base is 12-22; +1 affix is meaningless without the multiplier. Outfit base HP carries the multiplier baked in at the catalog level for the same reason.
  - **Hats are pure-affix slots** (no base stat) and rare hats trade their property for a 3rd affix. *Why:* nothing in the GDD gave hats a natural rare-hook; this preserves their identity as the secondary-stats slot rather than inventing a forced property.
  - **Rare properties are 4 slot-locked entries:** burn + lifesteal (weapon), thorns (shield), regen (outfit). Burn reuses the existing `poison`-shaped status machinery — `tickStatuses` checks `effect.kind === 'poison'` regardless of `statusId`, so binding a `'burning'` `StatusId` to a poison-shaped effect needs zero new tick code. Lifesteal/thorns/regen each got a single optional numeric field on `Combatant`.
  - **Combatant field stamping over a passives bag** (4 new optional fields: `lifestealPercent`, `thornsDamage`, `regenPerRound`, `burningWeaponDamage`). Code comment flags consolidation as a refactor when 3 more land. *Why:* matches the wounds pattern (`damageTakenMultiplier`); premature abstraction now would inflate diff scope without buying anything.
  - **Drop pacing:** 50% chance per combat node, guaranteed on boss with `effectiveFloor = floorNumber + 1` (rarity-only bonus, not affix-value bonus). Rarity weight table is 6 anchor rows (floors 1/3/5/8/10/15) with linear interpolation between. Floor-1 hard-bans rare so first-rare feels earned.
  - **Loot RNG threads through `completeCombat(rng)`.** `dungeon_scene` now reconstructs an RNG from `rngStateAfter`, passes it in, and persists `rng.getState()` after — matching the existing pressOn pattern.
  - **Save shape: SaveFile gains `stash: Stash`.** Schema stays pinned at v1 per pre-launch policy. Older v1 saves missing the field are normalized through a new `normalizeSaveFile(file)` helper inside `load()` — single defaulting site, no scattered `?? createStash()` reads.
  - **Substrate-only, no UI** (per Q8 brainstorm). Heroes start with `starterLoadout`-derived items already equipped; no equip-swap UI yet. `equip()`/`unequip()` ship as pure functions in `src/items/equip.ts` so the future UI just calls them. `unequip` throws on the weapon slot (always-required invariant).
  - **Fallen-gear-to-pack on victory** lands now even though the pack-vs-equip player decision UI is future work — GDD §8 invariant, cheap to wire in `completeCombat`, and means the wipe-loses-pack-including-fallen-gear path already exercises correctly.
- **Surprises / lessons:**
  - **Plan missed `STATUS_LABEL.burning` in `ability_describe.ts`.** `Record<StatusId, string>` requires the new key; `tsc` caught it on first run. Pattern restated from the wounds entry: any `StatusId` extension needs both `STATUS_GLYPHS` (visual, render layer) AND `STATUS_LABEL` (text, data layer) — they're in different files and easy to miss.
  - **`burningWeaponDamage` got folded into Task 9 instead of Task 11** to avoid editing `Combatant` twice for sibling fields. Plan order was correct but the interface edit is monolithic; split steps would have meant re-touching the same struct. Cheap deviation, mentioned for honesty.
  - **Tasks 16 (cashout itemsBanked) and 17 (SaveFile.stash) are tightly coupled** — camp scene's banking line needs `s.stash` to exist on AppState, which only happens once `SaveFile` has the field. Did them together as one merged sweep. Future: when a Cluster A task adds a SaveFile field consumed by a sibling Cluster B wiring task, plan them as a pair from the start.
  - **Existing test fixtures had `{ gold: N }` literals scattered across 3 test files** — every Pack-shape assertion broke on the items-field addition. The compiler doesn't help with deep-equality fixtures; a project-wide grep for `{ gold:` is the cheap detection. ~6 fixture updates.
  - **One existing combat_setup test asserted `attack === base − wound`** (Knight + winded). Adding sword_basic's +1 base attack made it `base − wound + 1`. Adjusted the test inline with a comment explaining the math; future sword-base changes will surface here.
  - **Lifesteal placement matters.** Block sits *before* burning in `applyDamage` so it fires for both lethal and non-lethal hits (per spec edge case "vampirism fires on lethal hits too"); burning sits *after* with a `!lethal` gate. First draft put both in the wrong order — the burn block was checking `!target.isDead` but `target.isDead` isn't set until later in the function. Lesson: in `applyDamage`, `!lethal` is the correct gate for "did this hit kill them?", not `!target.isDead`.
- **Source:** TODO Cluster A · task 4 (gdd §3 + §7 + §10 Tier 2). Spec at `docs/superpowers/specs/2026-04-27-gear-rarity-tiers-design.md`. Plan at `docs/superpowers/plans/2026-04-27-gear-rarity-tiers.md`. Tests: 622 → **768 passing**. Follow-ups: gear-modifies-abilities (#5), trait-recruitment (#6), shops (#9 + B3), blacksmith UI (B2), equip-swap UI (untracked), bespoke outfit/hat sprites (replaces `'0'` placeholder spriteIds in `BASE_ITEMS`).

### 2026-04-26 · Wounds system + schema reset to v1

- **Why:** Tier 2 drip cost per gdd §7 — wounds nudge the player toward Hospital trips and create cumulative-damage tension across runs without a hard wall. First persistent-across-runs hero state outside of equipment/level.
- **Decisions:**
  - Trigger fires inside `applyDamage` (not end-of-combat) on (heavy hit ≥30% maxHp) OR crit, gated by 30% chance, hero-only, non-lethal-only. *Why:* user wanted immediate feedback during combat AND wanted crits to wound regardless of damage size; gating on non-lethal avoids "the dead can't be wounded" weirdness.
  - Wounds emit as `wound_inflicted` events; the post-combat handler in `completeCombat` walks events and appends to `Hero.wounds`. *Why:* keeps the combat resolver pure-events; mutation lives at the run-state boundary.
  - Two wound shapes: `statDelta` (most wounds) and `damageTakenMult` (Bruised — multiplier on incoming damage). *Why:* Bruised semantically isn't a stat reduction; modeling it as a defense debuff would scale wrong against big hits. Added `Combatant.damageTakenMultiplier?: number`, applied in `applyDamage` after exhaustion.
  - End-of-run wound tick fires on BOTH cashout AND wipe (in scene handlers). *Why:* benched heroes shouldn't death-spiral when the active party keeps wiping; passive heal is a minor mercy.
  - Wounds stack additively (2 × Bruised = 1.40× damage taken). *Why:* simpler than capping; player's choice to leave them untreated. Hospital pressure is the brake.
  - **Schema reset to `CURRENT_SCHEMA_VERSION = 1`** (was 5); migrations cleared. *Why:* per the user, version inflation pre-launch was meaningless. New policy: keep schema pinned at 1 until launch; the loader's "newer-than-supported" check naturally discards stale browser saves. Memory updated.
- **Surprises / lessons:**
  - **Wound trigger has to skip the lethal branch.** First test failed because the heavy hit (20 dmg vs 20 maxHp) was lethal — `if (lethal)` returns before the wound roll, so the dead hero never got wounded. Fixed in tests by ensuring damage is heavy-but-not-lethal. The non-lethal gate in code is correct; the test fixture was wrong. Future "trigger-on-X" mechanics should check this same edge case explicitly.
  - **`describeEffect` exhaustiveness needed updating** for the new effect kinds (`moveToSlot`, `poison`, etc. — caught earlier; this task didn't add new effect kinds but the pattern is now well-known: any AbilityEffect kind addition surfaces as a `tsc` error in the describe switch. Run `npm run build` not just `npm test`).
  - **Stat-display ambiguity discovered late.** With wounds applied at combat-build, `Combatant.baseStats` shows wounded stats. The original `Hero.baseStats` is preserved untouched. Hospital UI (Cluster B) will need to read both — Hero.baseStats for "true" stats, Hero.wounds for the active modifications, then derive effective. Worth surfacing now so the UI task doesn't re-discover.
  - The post-combat handler is in `run_state.ts:completeCombat` — same place that updates HP and splits survivors/fallen. Co-located with related Hero-state-after-combat logic. Pattern for future "combat events that mutate hero state": pipe through completeCombat.
- **Source:** TODO Cluster A task 3 (gdd §7 + §10 Tier 2). Spec at `docs/superpowers/specs/2026-04-26-wounds-system-design.md`. Hospital UI is Cluster B task 1; wound display in hero card is Cluster B task 9.

### 2026-04-26 · Class: Mage + generic chance-on-effect

- **What shipped:**
  - `src/data/types.ts` — `ClassId` (+`'mage'`); `WeaponType` (+`'staff'`); `StatusId` (+`'slowed'`); `AbilityId` (+4: `'mage_zap'`, `'firebolt'`, `'frost_nova'`, `'arc_shock'`); `chance?: number` added to ALL eleven `AbilityEffect` variants.
  - `src/data/abilities.ts` — 4 new entries. Firebolt is single-target back row (`slots: [3, 4], pick: 'first'`), mind-scaled, cooldown 2. Frost Nova is AoE damage + slow (`debuff stat: 'speed' delta: -2 duration: 2 statusId: 'slowed'`), mind-scaled, cooldown 2, `aiCondition: minTargets 2`. Arc Shock is mind-scaled damage + 40% chance stun. Mage Zap is the universal mind-scaled basic.
  - `src/data/classes.ts` — Mage entry: `hp 12, attack 2, defense 1, speed 4, mind 8, crit 5, dodge 5`. Lowest HP/Attack, highest Mind. Starter weapon `staff_blue_tier1` (frame 96), distinct from Cultist's green staff.
  - `src/data/ability_describe.ts` — `STATUS_LABEL` extended with `slowed: 'slowed'`.
  - `src/combat/effects.ts` — `applyEffect` gates on `effect.chance` at the top of the function (right after the `target.isDead` check, before the kind switch). One uniform check applies to both per-target effects AND self-target effects (called from `applyAbility`'s pre-loop pass). Failed chance silently skips the effect — no event emitted.
  - `src/render/combat_actor.ts` — `STATUS_GLYPHS` adds `slowed: { letter: 's', color: '#88ccff' }`. Lowercase 's' to differentiate from the existing 'S' (stunned).
  - `src/save/migration.ts` — `CURRENT_SCHEMA_VERSION` bumped 4 → 5 (no migration; old saves discarded per pre-launch policy).
  - `src/save/save.ts` — `createDefaultUnlocks` adds `'mage'`. All 6 launch classes now in the Tavern roll pool from a fresh save.
  - `src/combat/__tests__/effects.test.ts` — 3 chance tests (chance: 0 always skips, chance: 100 always fires, dodge short-circuits chance).
  - `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`, `src/save/__tests__/save.test.ts` — `EXPECTED_IDS` / `createDefaultUnlocks` assertions extended.
  - Tests: 624 → **657 passing**, build clean.
  - Design spec at `docs/superpowers/specs/2026-04-26-class-mage-design.md` (no separate plan; implementation followed the spec directly per the established pattern).
- **Why:** Third and final Tier 2 class. Closes the launch lineup (Knight, Archer, Priest, Barbarian, Rogue, Mage = 6, matching gdd §3's "MVP ships 6"). Glass-cannon caster fills the high-burst-damage role with positional and CC tools that Priest doesn't have. Frost Nova's slow + Arc Shock's chance-stun give the player meaningful tempo control, distinct from Knight's tanking and Rogue's positional play.
- **Decisions:**
  - *Generic `chance?: number` on every effect kind (brainstorm Q1 option C, user-chosen).* Single optional field added uniformly across all 11 `AbilityEffect` variants. Resolver gates with one `if (effect.chance !== undefined && !rng.percent(effect.chance)) return;` line at the top of `applyEffect`. Beat the narrower "extend stun only" (A) and "new chanceStun kind" (B) options — the user wanted future-proofing for chance-on-anything (chance-debuff, chance-shove, chance-mark, etc.) without requiring per-variant additions later. The implementation cost was identical to option A — adding the field everywhere is one optional column on each line of the union; the resolver check is one line.
  - *Failed chance roll is silent (no event).* The alternative — emitting an `effect_resisted` event — would let playback show "Stun resisted!" floaters, but adds an event variant and combat-playback handler for what is currently zero use cases. YAGNI; can add later as Tier 2 polish if the silence feels confusing.
  - *Mage's stat block: glass-cannon caster.* HP 12 (lowest, narrowly under Rogue's 13), Attack 2 (lowest), Defense 1 (ties Rogue), Speed 4 (caster pace), Mind 8 (highest, beats Priest's 5), Crit/Dodge 5. Mind 8 makes Firebolt a `8 raw` nuke and Frost Nova a `4 raw` AoE — comparable to Archer's piercing_shot raw output but the AoE is the differentiator.
  - *Frost Nova's `aiCondition: minTargets 2` (not 3).* Standard Crypt encounters are 3 enemies; gating at 3 would mean Frost Nova fires turn 1 then never again as enemies die. At 2, it stays in rotation through most of the fight. Falls through cleanly to Firebolt/Arc Shock when only one enemy remains.
  - *AI ordering: Frost Nova > Firebolt > Arc Shock > Zap.* Frost Nova is the high-value AoE control; Firebolt kills back-line casters/boss before they cast; Arc Shock disables front-line attackers (with stun chance). Each signature is on cooldown 2, so Zap fills the gap on T4 of every rotation cycle.
  - *`'staff'` as a new `WeaponType`, separate from Priest's `'holy_symbol'`.* Conceptually a staff IS a magical weapon and a holy symbol is also magical, but the gdd treats them as distinct families (Priest's signature is healing/divine; Mage's is elemental/control). Setting up the distinction now avoids retrofitting later when Cluster A task 5 (Gear-modifies-abilities) adds same-family weapon swaps.
  - *Schema bump 4 → 5 + discard old saves (per durable preference, confirmed).* Same pattern as the prior three classes.
  - *Skipped writing a separate implementation plan file* (deviation from the prior pattern). Per emerging user pattern, when the spec is tight and the work follows established class-add patterns, the writing-plans step adds little signal. Implemented directly from the spec, task-structured the same way as Barbarian/Rogue. Worth noting: this was a one-off shortcut — for novel work with new mechanics, the plan still earns its keep.
  - *Skipped browser smoke test* (per the new durable preference saved this session). Vitest covers the chance/slow/stun mechanics deterministically; visual verification is the user's domain.
- **Alternatives considered:**
  - *Hardcode chance into `stun` only (brainstorm Q1 option A).* Rejected — user preferred the generic approach for future flexibility.
  - *New `chanceStun` effect kind (option B).* Rejected as duplicating structure.
  - *Chance scaling with caster Mind* (chance = 40 + mind × 5). Rejected — flat 40% is the design; Mind already scales the damage component of Arc Shock. Adding it to chance too would conflate.
  - *Multi-stack slow.* Rejected — `storeStatus` overwrites; consistent with poison's behavior. Multi-stack is post-launch tuning.
- **Surprises / lessons:**
  - **The `applyEffect` chance gate placement matters.** Putting the gate at the top of `applyEffect` (rather than inside each case) means it fires uniformly for both per-target effects and self-target effects (which call `applyEffect` from the pre-loop pass). One source of truth for the gate. If the gate had been inside the per-target loop in `applyAbility`, self-target effects would have skipped the chance roll — a subtle bug. The "single dispatch function" design pays off again.
  - **Slow's interaction with turn order is automatic.** `computeInitiative` (`src/combat/turn_order.ts:8`) already reads `getEffectiveStat(c, 'speed')`, which sums base + buffs + debuffs. Frost Nova's debuff just shows up. No special-casing. Verified at spec-writing time, not implementation time — caught in the spec self-review pass.
  - **Skipping the writing-plans skill saved a real chunk of tokens with no quality loss for this task.** The Mage spec was tight enough (every value spelled out, every code change blocked out) that the plan would have been ~80% restating the spec in checklist form. The pattern of class-additions is now well-established (Barbarian, Rogue, Mage all followed the same shape). For genuinely novel work, plans still pay; for "another class with kit X", the spec is sufficient.
  - **The browser smoke test we ran (and shouldn't have, per the new preference) revealed a self-test bug, not a real bug.** I passed `pickAbility(...).targetIds` from a frost_nova selection into a `firebolt` cast — confused the abilities. Real implementation was correct; my JS smoke-test payload was sloppy. Lesson reinforces the new "skip browser by default" preference: the browser-driven check was costing tokens AND occasionally producing misleading "false" results from test-code typos that would never appear in vitest (which doesn't cobble payloads together at runtime).
  - **Discriminated-union additions cascade into `describeEffect`.** Each new effect kind needs a case in `ability_describe.ts:describeEffect` or `tsc --noEmit` complains. Mage didn't add new effect kinds (just `chance` field on existing kinds, which doesn't reach the switch), so describeEffect was untouched this round — but the lesson from Rogue still holds for future kinds.
- **Touches:**
  - `src/data/types.ts`, `src/data/abilities.ts`, `src/data/classes.ts`, `src/data/ability_describe.ts`
  - `src/combat/effects.ts`
  - `src/render/combat_actor.ts`
  - `src/save/migration.ts`, `src/save/save.ts`
  - `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`, `src/save/__tests__/save.test.ts`, `src/combat/__tests__/effects.test.ts`
  - `docs/superpowers/specs/2026-04-26-class-mage-design.md` (new). No plan file (skipped per emerging pattern).
- **Source:** TODO Cluster A task 2 (Mage, gdd §3 + §10 Tier 2).

### 2026-04-26 · Class: Rogue + three more reusable engine extensions

- **What shipped:**
  - `src/data/types.ts` — `ClassId` (+`'rogue'`); `WeaponType` (+`'daggers'`); `StatusId` (+`'poisoned'`, `'vanished'`); `AbilityId` (+4: `'rogue_strike'`, `'backstab'`, `'vanish'`, `'poison_strike'`); `AbilityEffect` damage variant (+`bonusCrit?: number`); two new variants (`moveToSlot`, `poison`).
  - `src/data/abilities.ts` — 4 new entries. Backstab is `power 1.2 / bonusCrit 25` damage on the back-most enemy (`slots: 'furthest'`), cooldown 2. Vanish is `[moveToSlot 3, buff dodge +15 selfTarget]` cooldown 2 + `aiCondition: casterHpBelow 0.5`. Poison Strike is `[damage 0.8, poison 2/turn × 3 turns]` with target filter `lacksStatus 'poisoned'`. Rogue Strike is the universal basic.
  - `src/data/classes.ts` — Rogue entry: `hp 13, attack 5, defense 1, speed 6, mind 0, crit 20, dodge 15`. Lowest HP/Defense, highest Speed/Crit/Dodge. Starter weapon `dagger_tier1` (frame 420).
  - `src/data/ability_describe.ts` — `STATUS_LABEL` extended with `poisoned`/`vanished`; `describeEffect` extended with `moveToSlot` and `poison` cases (caught by `tsc --noEmit` after the new effect kinds landed).
  - `src/combat/positions.ts` — new exported `moveTo(combatant, slot, events)` helper wraps the private `setSlot` for the empty-destination case of `moveToSlot`. Emits `position_changed` with `reason: 'swap'` (no new event vocabulary).
  - `src/combat/effects.ts` — `applyDamage` honors `bonusCrit` (effective crit = `crit + bonusCrit`, fed into `rng.percent` which already clamps to [0, 100]). `applyEffect` handles `moveToSlot` (swap with same-side ally in destination slot, else `moveTo` if empty) and `poison` (stores status, tick handled in statuses.ts). `applyAbility`'s pre-loop self-effect pass extended to also include `moveToSlot` (it's inherently self-targeted; no `selfTarget` flag needed since the slot is part of the effect data).
  - `src/combat/statuses.ts` — `tickStatuses` now ticks poison BEFORE the decrement so it fires on every turn including the expiry turn. New `applyPoisonDamage` helper bypasses defense / crit / dodge / exhaustion (true damage), emits `damage_applied` (with `wasCrit: false`) and `death` if lethal.
  - `src/combat/combat.ts` — turn loop checks `combatant.isDead` after `tickStatuses`; if poison killed them on their own turn, calls `collapseAfterDeath` and `continue`s. Without this, a corpse would still proceed through `tickCooldowns` / `pickAbility` / `applyAbility` and emit a phantom `ability_cast`.
  - `src/render/combat_actor.ts` — `STATUS_GLYPHS` adds `vanished: V (light blue)` and `poisoned: P (sickly green)`.
  - `src/save/migration.ts` — `CURRENT_SCHEMA_VERSION` bumped 3 → 4 (no migration; old saves discarded per pre-launch policy).
  - `src/save/save.ts` — `createDefaultUnlocks` adds `'rogue'` so fresh saves see Rogue in the Tavern roll pool.
  - `src/combat/__tests__/effects.test.ts` — 2 bonusCrit tests, 3 moveToSlot tests, 1 poison-application test.
  - `src/combat/__tests__/statuses.test.ts` — 4 poison-tick tests (decrement, defense bypass, expiry, lethal).
  - `src/combat/__tests__/combat.test.ts` — 1 turn-loop test for poison-kills-mid-turn.
  - `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`, `src/save/__tests__/save.test.ts` — `EXPECTED_IDS` / `createDefaultUnlocks` assertions extended.
  - Tests: 583 → **624 passing**, build clean.
  - Design spec at `docs/superpowers/specs/2026-04-26-class-rogue-design.md`; implementation plan at `docs/superpowers/plans/2026-04-26-class-rogue.md`.
- **Why:** Second of three Tier 2 classes. Striker archetype broadens party composition. The kit forced three small engine extensions (`bonusCrit`, `moveToSlot`, `poison`) that the third Tier 2 class (Mage, in progress) and beyond will reuse — `bonusCrit` for any "high crit" ability, `moveToSlot` for any positional ability (Mage's Frost Nova doesn't need it, but Tier 3 Hunter's pet-summoning might), `poison` as the canonical DoT pattern (Mage's Firebolt could optionally apply burn the same way).
- **Decisions:**
  - *Backstab "high crit" via `bonusCrit?: number` field on damage effect (brainstorm Q1 option A).* Single optional field, mirrors `healOnKill` pattern from Barbarian. The crit roll uses `caster.crit + bonusCrit` fed into the existing `rng.percent` (which clamps), so values >100 always crit and crit-stat-scaling still applies (gear/perks that raise the Rogue's base Crit also benefit Backstab). Beat guaranteed-crit (B — strips crit-stat scaling) and high-power-only (C — wrong flavor).
  - *Vanish "move to slot 3" via new `moveToSlot` effect kind (brainstorm Q2 option A).* Absolute slot semantic; the resolver swaps caster with the same-side ally currently in the destination slot, or just moves caster directly if the slot is empty. Beat reusing `shove` with relative slot count (B — final slot would depend on starting slot, drifting from gdd's "slot 3" intent) and a generic computed-effect mechanism (C — overkill for one ability).
  - *Poison via new `poison` effect kind with tick-based DoT (brainstorm Q3 option A).* Effect creates a status whose `tickStatuses` branch emits a `damage_applied` event each turn the status is alive (including the expiry turn). DoT bypasses defense/crit/dodge — true-damage convention. Beat extending `debuff` with a `dotPerTurn` field (B — conflates two unrelated mechanics) and a generic `tickEffect` hook (C — YAGNI).
  - *DoT damage bypasses defense, crit, dodge, exhaustion.* Standard auto-battler convention. Keeps DoT relevant against tank targets (the whole point) and keeps the math obvious. Crit/dodge of poison would also require attribution of "the original poisoner" to roll their stats, which is awkward when the original caster might be dead by the time the tick fires.
  - *Tick poison BEFORE decrement.* Poison fires every turn including the turn it expires. So `duration: 3` = 3 ticks of damage. Alternative (decrement first) would make `duration: 3` = 2 ticks (the third tick removes the status before it can fire). Pre-decrement matches player intuition: "3 turns of poison" = 3 hits.
  - *Death-mid-turn handling in `combat.ts`.* When poison kills a combatant on their own turn, the combat loop has already emitted `turn_start` and would otherwise proceed to `tickCooldowns` → `pickAbility` → `applyAbility` on a corpse. Added explicit `if (combatant.isDead) { collapseAfterDeath(...); continue; }` after `tickStatuses`. This was a latent bug: pre-Rogue, no status could kill on tick, so the loop assumed combatants stay alive through their own turn. With poison the assumption breaks.
  - *AI ordering: Vanish > Backstab > Poison Strike > Strike.* Vanish gates on low HP and falls through at full HP. Backstab takes second since it's the signature kill move. Poison Strike third since it falls through naturally once all enemies are poisoned (`lacksStatus` filter). Strike is the universal fallback.
  - *Stat block: HP 13, Attack 5, Defense 1, Speed 6, Crit 20, Dodge 15.* Lowest HP/Defense, highest Speed/Crit/Dodge — establishes Rogue as a glass-cannon striker that dodges instead of tanking. Backstab's effective crit lands at 45% (20 + 25 bonus). Vanish's +15 dodge stacks to 30 effective for 2 turns of safety.
  - *Schema bump 3 → 4 + discard old saves (per durable preference, confirmed).* Same pattern as Barbarian and 7-stat-model.
  - *`generateStarterRoster` deliberately not modified.* Same rationale as Barbarian: the starter roster is "the traditional Tier 1 trio" not "every available class." Rogues are recruited via Tavern, not pre-seeded.
- **Alternatives considered:**
  - *Backstab as a literal teleport* (Rogue moves to enemy slot 4 momentarily). Rejected — combat is a readout, not an animation; the abstraction "this attack reaches the back row" via `slots: 'furthest'` is sufficient and avoids cross-side position handling.
  - *Poison stacking* (apply poison twice on same target stacks DoT). Rejected — `lacksStatus` filter on Poison Strike prevents player-caused stacking; if two casters poison the same target, the second poison overwrites the first via `storeStatus`'s direct-assign behavior. Acceptable for Tier 2; multi-stack is post-launch tuning.
  - *Crit-on-poison.* Rejected — DoT is uncrittable per the bypass-everything decision.
  - *Active-buff Vanish duration tied to "until next attack lands"* (instead of fixed 2-turn duration). Rejected — adds a new status-trigger mechanism; fixed duration is simpler.
- **Surprises / lessons:**
  - **`tsc --noEmit` caught the `describeEffect` exhaustiveness gap** I would have shipped without it. The function's switch over `AbilityEffect` had no `default` branch, so adding `moveToSlot` and `poison` triggered a "Function lacks ending return statement" error. Vitest didn't catch it (no test exercises `describeEffect` with the new kinds). Lesson: any time we extend a discriminated union, run `npm run build` not just `npm test` — the build pipeline includes `tsc` and surfaces these gaps. The 7-stat-model task hit this too, same fix pattern.
  - **Browser smoke test verified Backstab's 45% effective crit empirically: 52/100 over 100 fixed seeds** (within expected variance). Light-touch quantitative validation that the bonusCrit field actually flows through to the dice roll. This kind of integration test is exactly where Claude-in-Chrome shines — a vitest test would seed-fix to a single outcome; a real-world check averages across many seeds and proves "the math works in practice."
  - **`applyAbility` is now distinctly multi-pass.** The function does: (1) `ability_cast` event, (2) self-effect pre-loop pass (selfTarget buffs/debuffs + moveToSlot), (3) per-target loop with dodge gate + non-self effects, (4) post-loop collapse for dead-this-cast. That's 4 phases in one function. Still tractable but on the boundary of "split candidate." If the next class (Mage) adds another pass (e.g., chance-stun gating), it should split.
  - **Vanish's two effects use two different "self-target" mechanisms.** `moveToSlot` is inherently self-targeted (no flag needed; the effect data carries the slot, the resolver always operates on caster). The `buff dodge` uses `selfTarget: true` because buff is normally target-side. The pre-loop pass in `applyAbility` checks both conditions in one expression. Slightly confusing API surface — two ways to express "this effect goes on the caster." Could unify in the future by making moveToSlot's resolver target-aware too, but YAGNI for Tier 2.
  - **`statuses.test.ts`'s `status()` test helper handled the new `poison` effect kind without modification.** The helper extracts `statusId` from the effect via `'statusId' in effect ? effect.statusId : 'stunned'`. Since `poison` carries `statusId`, no helper change was needed. Score one for the discriminated-union pattern.
- **Touches:**
  - `src/data/types.ts`, `src/data/abilities.ts`, `src/data/classes.ts`, `src/data/ability_describe.ts`
  - `src/combat/effects.ts`, `src/combat/positions.ts`, `src/combat/statuses.ts`, `src/combat/combat.ts`
  - `src/render/combat_actor.ts`
  - `src/save/migration.ts`, `src/save/save.ts`
  - `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`, `src/save/__tests__/save.test.ts`, `src/combat/__tests__/effects.test.ts`, `src/combat/__tests__/statuses.test.ts`, `src/combat/__tests__/combat.test.ts`
  - `docs/superpowers/specs/2026-04-26-class-rogue-design.md`, `docs/superpowers/plans/2026-04-26-class-rogue.md` (new)
- **Source:** TODO Cluster A task 1 (Rogue, gdd §3 + §10 Tier 2).

### 2026-04-26 · Class: Barbarian + three reusable engine extensions

- **What shipped:**
  - `src/data/types.ts` — `ClassId` (+`'barbarian'`); `WeaponType` (+`'axe'`); `StatusId` (+`'enraged'`); `AbilityId` (+4: `'barbarian_swing'`, `'cleave'`, `'rampage'`, `'bloodthirst'`); `AbilityEffect` damage variant (+`healOnKill?: number`); buff/debuff variants (+`selfTarget?: boolean`); new `AiCondition` type (`minTargets`/`casterHpBelow` predicates); `Ability.aiCondition?` field.
  - `src/data/abilities.ts` — 4 new entries. Bloodthirst is a damage attack with `healOnKill: 0.5` rider. Cleave hits enemies in slots 1–2 at `power 0.7` with `aiCondition: { kind: 'minTargets', n: 2 }`. Rampage is `power 1.5` damage + a `selfTarget: true` debuff on `defense` for 2 turns (`enraged` status), `cooldown: 2`, `aiCondition: { kind: 'casterHpBelow', ratio: 0.5 }`. Barbarian Swing is the universal basic attack.
  - `src/data/classes.ts` — Barbarian entry: `hp 22, attack 6, defense 3, speed 3, mind 0, crit 10, dodge 5`. Highest HP and Attack in the roster, one defense lower than Knight, mid Crit between Knight (5) and Archer (15). Starter weapon `battleaxe_tier1` (frame 105).
  - `src/data/ability_describe.ts` — `STATUS_LABEL` extended with `enraged: 'enraged'`.
  - `src/combat/effects.ts` — `applyDamage` honors `healOnKill` after lethal damage (`heal_amount = round(healOnKill × scalingStat)`, capped by caster's missing HP, emits a regular `heal_applied` event so playback renders it without new code). `applyAbility` restructured to apply `selfTarget` effects ONCE before the per-target loop (regardless of dodge); the per-target loop skips `selfTarget` effects to avoid double-apply on AoE.
  - `src/combat/ability_priority.ts` — `pickAbility` checks `ability.aiCondition` after target-list filter; new `checkAiCondition` helper handles the two predicates.
  - `src/render/combat_actor.ts` — `STATUS_GLYPHS` adds `enraged: { letter: 'E', color: '#ff4444' }`.
  - `src/save/migration.ts` — `CURRENT_SCHEMA_VERSION` bumped 2 → 3 (no migration; old saves discarded per pre-launch policy).
  - `src/save/save.ts` — `createDefaultUnlocks` adds `'barbarian'` so fresh saves see Barbarian in the Tavern roll pool. `generateStarterRoster` deliberately NOT changed; the starter roster stays Knight/Archer/Priest, players recruit Barbarians via Tavern.
  - `src/combat/__tests__/effects.test.ts` — 3 healOnKill tests, 3 selfTarget tests.
  - `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`, `src/save/__tests__/save.test.ts` — `EXPECTED_IDS` / `createDefaultUnlocks` assertions extended.
  - Tests: 553 → **583 passing**, build clean.
  - Design spec at `docs/superpowers/specs/2026-04-26-class-barbarian-design.md`; implementation plan at `docs/superpowers/plans/2026-04-26-class-barbarian.md`.
- **Why:** First Tier 2 class; bruiser archetype broadens party composition beyond Knight/Archer/Priest. The kit forced three small engine extensions (`healOnKill`, `selfTarget`, `aiCondition`) that the next two Tier 2 classes (Rogue, Mage) will reuse — so the structural cost is amortized across three tasks.
- **Decisions:**
  - *Bloodthirst is per-cast lifesteal, not active self-buff (brainstorm Q1 option A).* A new optional `healOnKill?: number` field on the damage effect lets the rider live as data with no new trigger machinery. Beat the active-buff variant (B) which would have required a new "status that observes kill events" system that nothing else in Tier 2 needs (YAGNI). Trade-off accepted: Bloodthirst feels more transactional than a "go berserk" buff, but the math is simpler and the implementation is one optional field.
  - *Rampage is a single cast with fixed cost (brainstorm Q2 option A).* Damage + self-debuff in one ability. Beat stack-based "Raging" (B) which would have required new stack-decay machinery. The single-cast model fits the existing effect resolver and keeps balance predictable.
  - *AI conditions as a discriminated union on the Ability type (brainstorm Q3 option A).* `aiCondition?: { kind: 'minTargets'; n } | { kind: 'casterHpBelow'; ratio }` reads naturally in data, is exhaustively type-checked in the resolver switch, and extensible (Mage's "Frost Nova on 3+ enemies" reuses `minTargets`; Rogue's "Vanish when low HP" reuses `casterHpBelow`). Beat hardcoding per-class branches in `pickAbility` (B — would accumulate ~6 special-cases across Tier 2) and beat function-valued predicates (C — fights the rest of the data layer's plain-typed-records pattern).
  - *`selfTarget` as a flag on buff/debuff effects (brainstorm Q2 implementation note).* Smallest extension that supports mixed-target abilities (Rampage damages enemy + debuffs self). The alternative — splitting Rampage into two abilities chained together — would need a chaining mechanism the engine doesn't have. The flag also reuses for Rogue's Vanish (selfTarget +Dodge buff alongside slot-move) in Cluster A task 1.
  - *selfTarget effects fire ONCE per cast, regardless of dodge or AoE target count.* On a fully-dodged Rampage, the caster STILL takes the defense debuff — flavor: "you over-extended even though the swing whiffed." On AoE volley with selfTarget +Crit, the buff applies once not N times. Implementation is pre-loop self-effect pass; per-target loop skips `selfTarget: true` effects.
  - *AI ordering: Rampage > Cleave > Bloodthirst > Swing.* Rampage gates on low HP and would rarely fire at full HP; Cleave needs 2+ front targets so it skips when only one front-liner; Bloodthirst is opportunistic kill-finisher; Swing is the universal fallback. No ability competes with a more specific gate.
  - *Stat block: HP 22 (highest), Attack 6 (highest), Defense 3 (one below Knight), Crit 10 (mid).* Bruiser fantasy + headroom for Rampage's defense-drop turns. Crit 10 makes Bloodthirst's heal-on-kill trigger meaningfully (not too rare).
  - *Schema bump 2 → 3 + discard old saves (per durable preference).* The class definition itself doesn't reshape persisted data, but `createDefaultUnlocks()` returns a different `classes` list now. Existing saves carry the old list and would never see Barbarian without intervention. Per the pre-launch policy, bump + discard; user re-asked.
  - *`battleaxe_tier1` over `axe_tier1` for the starter sprite.* Reads as two-handed and contrasts visibly with Knight's sword + shield. The catalog has no actual greatsword frame; `WeaponType: 'axe'` covers axe / battleaxe / hatchet variants.
  - *Tests for AI conditions deferred from Task 3 to Task 5 integration.* The plan's test pattern of injecting fake abilities into ABILITIES at runtime would have been janky and required `as unknown as` casts. Instead, Task 5 wired the real Cleave and Rampage abilities with their `aiCondition` fields, and the integration smoke test (described in Surprises below) verified all three AI gates fire correctly.
- **Alternatives considered:**
  - *Active-buff Bloodthirst with status-driven heal-on-kill.* Rejected — see Decisions §1; required new triggers system.
  - *Stack-based Rampage.* Rejected — see Decisions §2.
  - *Hardcode aiCondition per class in `pickAbility`.* Rejected — Tier 2 would accumulate special-cases; the data-driven design is the right shape.
  - *Add a `passives` field to ClassDef and treat Bloodthirst as a class trait.* Rejected — gdd lists Bloodthirst as a *signature ability slot* (one of 4); making it a passive would leave a kit slot empty and require 4 active abilities elsewhere.
  - *Backfill old v2 saves with `'barbarian'` in unlocks instead of bumping schema.* Rejected per pre-launch policy.
- **Surprises / lessons:**
  - **Browser-driven smoke testing was extremely effective for verifying AI behavior.** Drove the dev server via Claude in Chrome: confirmed schema=3, unlocks include barbarian, `generateCandidate` rolls Barbarian at 28% (50 samples, expected 25%), and ran 10-seed `applyAbility` sweeps that confirmed Rampage damage = 7 raw / 16 on crit (proving "crit doubles before defense" once again), and seed 7 dodged the swing while STILL applying the enraged status to caster (proving the selfTarget-fires-on-dodge spec). End-to-end confidence in the AI without driving any UI clicks. About 10× faster than manual smoke and produced quantitative evidence the user can read.
  - **Loop-restructure pattern emerging.** This is the second time `applyAbility` has been restructured (first: Cluster A task 1's target-major restructure for dodge; now: pre-loop self-effect pass for selfTarget). Both times the change was small and additive, but the function is starting to do a lot. If it grows further (e.g., Mage's Arc Shock chance-stun probably wants its own gate), worth considering whether it's a candidate for splitting — `applyAbilityEffects` (the for-target/for-effect kernel) versus `applyAbility` (the orchestrator). Not done here.
  - **Vitest test-shared `rng` state remains a footgun.** Same lesson as the 7-stat model: tests that assert specific damage values need explicit `crit: 0, dodge: 0` overrides to be robust against future RNG-consuming additions. The new healOnKill/selfTarget tests all use explicit zero-stat overrides — paying the cost upfront so they don't break the next time something else consumes RNG in `applyAbility`.
  - **`generateStarterRoster` divergence from `generateCandidate` is intentional.** Initial confusion: I assumed adding to `createDefaultUnlocks` would automatically include Barbarian in the starter roster. It doesn't — `generateStarterRoster` hardcodes `['knight', 'archer', 'priest']` and `generateCandidate` is the one that pulls from unlocks. This is by design (the starter roster is "the traditional Tier 1 trio" not "every available class") but worth noting for future class-add tasks.
- **Touches:**
  - `src/data/types.ts`, `src/data/abilities.ts`, `src/data/classes.ts`, `src/data/ability_describe.ts`
  - `src/combat/effects.ts`, `src/combat/ability_priority.ts`
  - `src/render/combat_actor.ts`
  - `src/save/migration.ts`, `src/save/save.ts`
  - `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`, `src/save/__tests__/save.test.ts`, `src/combat/__tests__/effects.test.ts`
  - `docs/superpowers/specs/2026-04-26-class-barbarian-design.md`, `docs/superpowers/plans/2026-04-26-class-barbarian.md` (new)
- **Source:** TODO Cluster A task 1 (Barbarian, gdd §3 + §10 Tier 2).

### 2026-04-26 · Full 7-stat model: Mind, Crit, Dodge

- **What shipped:**
  - `src/combat/types.ts` — `Stats` extended from 4 fields (hp/attack/defense/speed) to 7 (added `mind`, `crit`, `dodge`). `damage_applied` event variant gained a required `wasCrit: boolean`. New `attack_dodged` variant added to `CombatEvent`.
  - `src/data/types.ts` — `BuffableStat` extended to include `mind | crit | dodge` so future buffs/debuffs/perks can target the new stats. Damage and heal `AbilityEffect` variants gained an optional `scalingStat?: 'attack' | 'mind'`.
  - `src/util/rng.ts` — new `percent(p: number): boolean` method on the `Rng` interface. Clamps p to [0, 100], short-circuits at 0 and 100 (no `next()` consumed) so combatants with no crit/dodge cost zero RNG.
  - `src/data/classes.ts` — backfilled all three classes per spec §8: Knight `mind 0 / crit 5 / dodge 5`, Archer `0 / 15 / 10`, Priest `5 / 5 / 5`.
  - `src/data/enemies.ts` — backfilled all six enemies per spec §8 (cultist gets `mind 3` so its kit math is unchanged; bone_lich gets `mind 4 / crit 10 / dodge 5`).
  - `src/data/abilities.ts` — `mend`, `smite`, `dark_pact`, `dark_bolt`, `necrotic_wave` now carry `scalingStat: 'mind'`. Intentionally NOT tagged: `chilling_touch` (kept attack-scaling — see Decisions).
  - `src/combat/effects.ts` — `applyDamage` and `applyHeal` honor `scalingStat`; `applyDamage` rolls crit and emits `wasCrit`; `applyAbility` runs a per-target dodge gate that skips ALL effects on the dodged target (not just damage). Loop order changed from effect-major to target-major to support per-target dodge cleanly. `applyDamage` and `applyEffect` signatures gained `rng` parameter.
  - `src/run/combat_setup.ts` — `scaleEnemyStats` propagates the new fields (defense/speed/mind/crit/dodge are unscaled; only hp/attack scale per existing `ScaleFactors`).
  - `src/save/migration.ts` — `CURRENT_SCHEMA_VERSION` bumped 1 → 2. No migration registered; old v1 saves return `null` from the loader and the boot scene generates a fresh save (per project's pre-launch policy).
  - `src/scenes/combat_playback.ts` — new `onAttackDodged` handler spawns a light-blue "Miss!" floater + appends `<defender> dodged` to the action log. `onDamage` now spawns a gold "CRIT!" floater + suffixes the log with `(crit)` when `wasCrit: true`. AoE damage rolls show `*` after individual crit values in the joined log line.
  - `src/render/combat_actor.ts` — flash logic unified across hero/enemy paths (now walks `bodyView.list` regardless of paperdoll vs enemy sprite, consequence of cleanup discovered while wiring crit floaters); unused `bodyType` field removed.
  - `src/util/__tests__/rng.test.ts` — 5 new tests for `percent` (boundaries, clamping, distribution at p=50, determinism).
  - `src/combat/__tests__/effects.test.ts` — 3 new tests for `scalingStat` (defaults to attack, uses mind, heal uses mind), 3 new tests for crit (skipped at 0, fires at 100, doubles before defense). Updated `mend`/`smite`-radiant/`smite`-humanoid expected values to reflect the priest's new mind=5 scaling.
  - `src/combat/__tests__/dodge.test.ts` — new test file, 5 tests (no roll at dodge=0, full skip at dodge=100, skips riders like `shield_bash`'s stun, no roll for utility abilities, per-target on AoE).
  - All test fixtures that build `Stats` literals or mock RNGs were extended with the new fields (combat.test.ts, combatant.test.ts, turn_order.test.ts, encounter.test.ts mock rng, combat_setup.ts, effects.test.ts).
  - Tests: 531 → **547 passing**, build clean.
  - Design spec at `docs/superpowers/specs/2026-04-26-full-7-stat-model-design.md`; implementation plan at `docs/superpowers/plans/2026-04-26-full-7-stat-model.md`.
  - This work also completes Cluster B task 1 (Combat HUD: crit + dodge readouts) — playback rendering shipped together with the engine math.
- **Why:** Foundation for the full Tier 2 design. Mage (Cluster A task 3, formerly task 4) is purely Mind-scaled and would be unbuildable without it; Crit appears in trait/perk/gear designs across the rest of Tier 2; Dodge is similarly load-bearing for Rogue's Vanish ability. Without this, every Tier 2 class and gear task would have to repeatedly carry the stat extension as a sub-task.
- **Decisions:**
  - *Per-effect `scalingStat: 'attack' | 'mind'` field over a coarser `magical` ability tag (brainstorm Q1, option A vs option B).* The user explicitly preferred the per-effect approach for extensibility — opens the door to future scaling sources (`'currentHp'` for execute-style abilities, etc.) that an ability-level boolean tag can't express. The data churn is one extra field on a handful of effect literals; the cost is small relative to the flexibility.
  - *Crit doubles raw before defense (brainstorm Q2).* Defense still mitigates a crit; a crit on a tanky target is meaningfully better than on a soft target. Matches Darkest Dungeon convention. Beat doubling-after-defense (which makes crits trivially huge against soft targets and meaningless against tanks) and doubling-replacing-mark (which would clobber the existing mark composition rule).
  - *Per-target dodge that skips ALL effects on a dodged target (brainstorm Q3).* A missed swing didn't connect, so its riders (e.g., `shield_bash`'s stun) shouldn't land either. Dodge gated on the ability having a damage effect — pure-utility abilities (`bulwark`, `taunt`, `bless`, `flare_arrow`) can never be dodged. AoE rolls dodge per-target so one enemy can dodge volley while others get hit.
  - *Integer percent (0-100) for crit/dodge units (brainstorm Q4a).* Reads naturally in data and tooltip text ("+5% Crit" matches gdd phrasing); the `/100` lives in one place (`rng.percent`).
  - *No save migration — bump version + discard old saves (brainstorm Q5, option C).* Pre-launch with only the user testing internally; the simpler path is to drop saves on schema change. The user explicitly asked to be re-asked at every save-schema change; this preference is now captured in user-memory and will surface again at every future schema change.
  - *`chilling_touch` (ghost) intentionally kept attack-scaling, not tagged mind.* The ghost has `mind: 0` per its strawman defaults; tagging chilling_touch as mind-scaling would near-zero its damage. Caught at spec-self-review time before code; documented in spec §10. Could revisit if we ever give the ghost a non-zero Mind value.
  - *Gating crit/dodge rolls on `> 0` to preserve RNG determinism.* Combatants with crit=0 or dodge=0 consume zero `next()` calls — the existing 5-seed determinism test stays green without modification because all default-stat fixtures used by older tests have either zero or low values that coincidentally don't fire at the tested seed states. Subtle but important: this is what makes the change non-breaking for the existing combat behavior contract.
  - *Loop restructure in `applyAbility` from effect-major to target-major.* Required to roll a single dodge per target and short-circuit ALL of that target's effects on success. Side effect: event order changed from "all damage events then all stun events" to "per-target events grouped together". No existing tests asserted the old order, so this didn't break anything — but worth knowing if a future feature needs the old grouping.
  - *Loader is silent when discarding old-version saves.* Currently `migrate` returns null when no migration is registered, and `load` returns null without a `console.warn` for that path (only the JSON-parse failure and shape-mismatch paths warn). Worth a small DX improvement to log "discarding save with unsupported version N" so the discard is visible during real player support — flagged for `bugs.md` but not done here.
  - *Priest re-balanced (intentional, surfaced in spec §10 before implementation).* `mend` heals 4 → 6 (50% buff); `smite` raw damage 3 → 6 (100% buff). Cultist's `dark_pact`/`dark_bolt` math is unchanged because cultist mind=3 was deliberately set to match cultist attack=3. The Priest buff matches gdd's framing of Priest as Mind-primary; before this work the Priest was strictly attack-bound and underpowered.
- **Alternatives considered:**
  - *Coarser `magical` tag at the ability level instead of per-effect `scalingStat`.* Rejected — see Decisions §1; user wanted extensibility for future non-attack/non-mind scaling sources.
  - *Crit on healing.* Out of scope; healing is deterministic. Could add later if Priest/Cultist heal feels too predictable.
  - *Mind-scaling for buff/debuff *amounts* (e.g., `bless`'s +2 attack scales with priest mind).* Out of scope; Tier 2 polish per gdd. Current numbers are static.
  - *Build a real schema-1-to-2 migration that backfills mind/crit/dodge from class defaults.* Rejected per the user's pre-launch policy; would have been ~10 lines but adds a maintenance contract we don't want yet. Class-default backfill is the canonical pattern when this becomes load-bearing post-launch.
  - *Add a "no-op rng" helper for tests instead of zeroing crit/dodge in test fixtures.* Considered while debugging post-Task-5 test failures; rejected because the explicit zero-stat fixture is more discoverable (you can see *why* the test is deterministic right at the call site) and matches the pattern the spec already prescribes.
- **Surprises / lessons:**
  - **The dodge restructure (target-major loop) shifted RNG consumption per turn, breaking 2 existing damage-asserting tests.** Two tests in `effects.test.ts` had been passing with default class stats (knight crit=5, skeleton dodge=5) because the shared module-level `rng` happened to be at a state where neither rolled true. After Task 5 added the dodge gate, the per-test RNG state drifted and one test crit-doubled when it shouldn't have. The fix was to zero crit/dodge on those test fixtures explicitly — the spec §11 pattern. **Lesson:** RNG-dependent tests with default stats are time bombs. Any test asserting a specific damage value needs explicit `crit: 0, dodge: 0` overrides to be robust against future changes that consume more RNG. We should consider applying this proactively to *all* damage/heal-asserting tests in `effects.test.ts`, not just the two that broke.
  - **Vitest still doesn't typecheck by default — a recurring lesson.** Same as the previous combat-speed task: TS errors only surface via `npx tsc --noEmit` or the `npm run build` pipeline, not via `npm test` alone. Consider adding `--typecheck` to vitest config to catch type drift in tests sooner.
  - **Browser-driven smoke test now possible via Claude in Chrome.** Verified post-implementation by driving Chrome from this session: confirmed schema bump (v2), all three classes' stats match spec §8, planted-v1-save → reload → fresh-v2-save discard path, console clean. Visual rendering (CRIT!/Miss! floaters, mend healing 6) was still verified manually by the user — driving the canvas through enough combat turns to trigger 5%/15% probabilistic events would be possible but token-heavy.
- **Touches:**
  - `src/combat/types.ts`, `src/combat/effects.ts`, `src/combat/__tests__/effects.test.ts`, `src/combat/__tests__/dodge.test.ts` (new), `src/combat/__tests__/combat.test.ts`, `src/combat/__tests__/combatant.test.ts`, `src/combat/__tests__/turn_order.test.ts`
  - `src/data/types.ts`, `src/data/classes.ts`, `src/data/enemies.ts`, `src/data/abilities.ts`
  - `src/util/rng.ts`, `src/util/__tests__/rng.test.ts`
  - `src/run/combat_setup.ts`
  - `src/save/migration.ts`
  - `src/scenes/combat_playback.ts`, `src/render/combat_actor.ts`
  - `src/dungeon/__tests__/encounter.test.ts` (mock rng got `percent` stub)
  - `docs/superpowers/specs/2026-04-26-full-7-stat-model-design.md`, `docs/superpowers/plans/2026-04-26-full-7-stat-model.md` (new)
- **Source:** TODO Cluster A task 1 (gdd §2 + §10 Tier 2). Also closes Cluster B task 1 (combat HUD crit/dodge readouts).

### 2026-04-26 · Combat speed toggle persists across combats and reloads

- **What shipped:**
  - `src/save/save.ts` — new optional `preferences?: Preferences` field on `SaveFile`, with a sibling `Preferences` interface holding `combatSpeed: 1 | 3`. No version bump, no migration: the field is optional, the loader's plausibility check only requires `version`, and `migrate` already passes extra fields through.
  - `src/scenes/combat_scene.ts` — `create()` now reads `appState.get().preferences?.combatSpeed ?? 1` instead of hardcoding `this.speed = 1`. The FF HUD's initial label and stroke colour both derive from `this.speed` (was hardcoded `'1×'` / `0x666666`). After `CombatPlayback` is constructed, `playback.setSpeed(this.speed)` is called once so the engine's `tweens.timeScale` / `time.timeScale` are restored to the persisted value before playback runs (the SHUTDOWN handler still resets them to `1` between scenes — the new `create()` re-applies the preference). `toggleSpeed()` now also writes back via `appState.update`, spreading existing preferences so future fields aren't clobbered.
  - `src/save/__tests__/save.test.ts` — two new tests: round-trip of `preferences.combatSpeed: 3`, and an old-save-without-preferences regression guard (loads cleanly, `preferences === undefined`).
  - Tests: 521 → **523 passing**, no regressions, build clean.
  - Design spec at `docs/superpowers/specs/2026-04-26-combat-speed-persistence-design.md`; plan at `docs/superpowers/plans/2026-04-26-combat-speed-persistence.md`.
- **Why:** Carried over from TODO #20. The FF (1× / 3×) toggle resetting every fight cost 4+ clicks per floor for any player who preferred 3× playback. Surfaced during task 18 (camp_screen) smoke testing — the same session that produced the cooldown work below.
- **Decisions:**
  - *Cross-session persistence (save file) over in-session (module variable).* Both options were viable; cross-session was picked because `appState.update()` already does the persistence work, the marginal cost was one optional field, and it survives page reloads (the standard ARPG / auto-battler convention). It also opens a `preferences` slot for the next setting (audio mute, autosave, etc.) without re-litigating the storage choice.
  - *Optional field, no version bump, no migration.* Old saves load with `preferences === undefined`; the read site defaults to `1`. The save schema already tolerates extra fields by construction (`migrate` returns `cur as unknown as SaveFile` and `isPlausibleRawSave` only checks `version`).
  - *`Preferences` is its own interface, not inlined on `SaveFile`.* Future preferences land on `Preferences` without touching `SaveFile` again. Same shape decision the cooldown work applied to combatant state.
  - *Kept the `tweens.timeScale = 1` / `time.timeScale = 1` reset in the SHUTDOWN handler.* `timeScale` is a Phaser engine property that persists across scene transitions on the same game instance — without the reset, switching to camp/dungeon at 3× would speed up those scenes too. The persisted-speed restoration happens on the *next* combat's `create()` via `playback.setSpeed`, which is the right pairing.
- **Alternatives considered:**
  - *In-session only (module-level `let lastSpeed`).* Rejected — friction worsens on reload; the cost delta to cross-session was tiny.
  - *Drop the SHUTDOWN reset entirely.* Rejected — would leak `timeScale = 3` into camp / dungeon / boss-screen scenes.
  - *Top-level `combatSpeed` field on `SaveFile` (no `preferences` namespace).* Rejected as a YAGNI inversion — the namespace costs nothing now and avoids the inevitable migration when the second preference lands.
- **Surprises / lessons:**
  - **Vitest doesn't typecheck by default.** The new round-trip test passed at runtime *before* the `Preferences` type existed, because esbuild strips types and JSON round-trips arbitrary fields. The TS error only surfaced via `npx tsc --noEmit`. Worth remembering: when adding a new field as a TDD-style "test first then add type," confirm the failure with `tsc`, not vitest. `npm run build` does the typecheck as part of the build pipeline (it runs `tsc` before vite).
  - **Spreading `undefined` in object spread is a no-op.** `{ ...s.preferences, combatSpeed: 3 }` works whether `s.preferences` is `undefined` or `{ otherField: ... }`. No defensive `s.preferences ?? {}` needed at the write site.
- **Touches:**
  - `src/save/save.ts` (modified — added `Preferences` interface, optional field on `SaveFile`)
  - `src/save/__tests__/save.test.ts` (modified — 2 new tests)
  - `src/scenes/combat_scene.ts` (modified — read in `create()`, derive HUD initial state, apply via `playback.setSpeed`, write in `toggleSpeed`)
  - `TODO.md` (entry removed); `HISTORY.md` (this entry added)
  - `docs/superpowers/specs/2026-04-26-combat-speed-persistence-design.md`, `docs/superpowers/plans/2026-04-26-combat-speed-persistence.md` (new)
- **Source:** TODO #20.

### 2026-04-26 · Ability cooldowns (heal stalemate + archer Volley fix)

- **What shipped:**
  - `src/data/types.ts` — added optional `cooldown?: number` to `Ability`.
  - `src/combat/types.ts` — added required `cooldowns: Partial<Record<AbilityId, number>>` to `Combatant`. (Strict-mode forced `Partial<...>` over `Record<...>` because `AbilityId` is a finite string-literal union; a plain `Record` requires every key.)
  - `src/combat/combatant.ts` — both factory functions (`createHeroCombatant`, `createEnemyCombatant`) default `cooldowns: {}`.
  - `src/combat/cooldowns.ts` (new, ~20 lines) — two helpers: `tickCooldowns(combatant)` decrements all cooldowns and deletes entries that hit ≤0; `setCooldown(combatant, abilityId, turns)` is a direct `cooldowns[id] = turns` (no off-by-one — that lives at the consumer site, see Decisions).
  - `src/combat/ability_priority.ts` — one new line in `pickAbility`'s loop: `if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;`. Skips on-cooldown abilities before the slot check or target resolution.
  - `src/combat/combat.ts` — two new lines in the per-turn body: `tickCooldowns(combatant);` after `tickStatuses` (ticks before stun check, so cooldowns advance on stunned turns too), and after a successful cast `if (ability.cooldown !== undefined) setCooldown(combatant, ability.id, ability.cooldown + 1);`. The `+ 1` is the only off-by-one in the whole system; commented inline with the why.
  - `src/data/abilities.ts` — `cooldown: 2` added to `mend`, `dark_pact`, `flare_arrow`, `piercing_shot`. Heals (player + enemy) cycle on a 3-caster-turn rhythm; archer specials cycle so Volley naturally fills T3, T6, T9 in the Flare→Piercing→Volley rotation.
  - `src/data/enemies.ts` — Cultist `aiPriority` reverted to `['dark_pact', 'dark_bolt']` (was test-fixture `['dark_bolt', 'dark_pact']` from the camp_screen smoke test). Comment block describing the test fixture removed.
  - `src/combat/__tests__/cooldowns.test.ts` (new, ~110 lines) — 5 helper unit tests (`tickCooldowns` × 3, `setCooldown` × 2), 3 `pickAbility` integration tests under "skips on-cooldown abilities" describe block, and 1 `resolveCombat` integration test asserting that Mend doesn't fire every turn on a permanently-injured ally (the test that initially failed, surfacing the +1 lifecycle bug — see Surprises).
  - `src/combat/__tests__/ability_priority.test.ts` — 1 new test exercising the skip rule via direct `pickAbility` call with seeded `cooldowns: { mend: 2 }`.
  - `bugs.md` — both captured entries (heal-cooldown stalemate, archer-volley AI) removed; resolved here.
  - `TODO.md` — new entry added (#20 · Combat speed toggle persists between combats), surfaced separately during the same smoke test session.
  - Tests: 511 → **521 passing**, no regressions, no numeric tweaks needed in `combat.test.ts`. Build clean.
  - Design spec at `docs/superpowers/specs/2026-04-26-ability-cooldowns-design.md`; plan at `docs/superpowers/plans/2026-04-26-ability-cooldowns.md`.
- **Why:** Two combat AI bugs surfaced during task 18 (camp_screen) smoke testing — a Cultist healer that healed every turn forever, stalling fights into player-side exhaustion wipes; and a player Archer whose Volley AoE almost never fired because flare_arrow and piercing_shot always had valid targets ahead of it in priority. Both were "spam-on-priority" symptoms of the same missing primitive: **abilities had no cost or cooldown gate**, so any high-priority ability with valid targets fired every turn it could. Cooldowns are the standard auto-battler/JRPG primitive for this; building the generic mechanism once and applying via data was cheaper than two narrower mechanisms.
- **Decisions:**
  - *Generic cooldown system, not narrower per-bug fixes (brainstorm Q1 option A).* Both bugs share a root cause; one mechanism solves both. Beat "heal-only cooldown + archer AI hint" (option B — more vocabulary, less reusable) and "AI hint vocabulary for everything" (option C — too much surface). Future Tier 2 cooldowns on Volley / Necrotic Wave / Shield Bash / Smite are now data-only.
  - *Cast-then-tick on caster turns (brainstorm Q2 option A).* Decrement at start of caster's next turn before the skip check. Mirrors `tickStatuses`'s rhythm exactly. Beat round-based ticks (would treat slow vs fast combatants differently) and "include current turn" (more confusing semantics).
  - *Targeted scope: 4 abilities at value 2 (brainstorm Q3 + Q4).* Heals (mend, dark_pact) and archer specials (flare_arrow, piercing_shot). Volley / necrotic_wave / shield_bash / smite intentionally untouched — those are balance tuning that should follow real playtest data, not preempt it. Single value 2 is the cleanest starting point; obvious tuning passes are one-character changes.
  - *Required `cooldowns` on `Combatant`, not optional.* Empty `{}` at battle start; consumers don't have to defensively check `cooldowns ?? {}`. Same shape as the adjacent `statuses` Record.
  - *`Partial<Record<AbilityId, number>>` not `Record<AbilityId, number>`.* Strict mode treats `Record<UnionLiteral, T>` as requiring every key. `Partial<...>` is the standard idiom for sparse maps over finite key unions. Caught immediately by the compiler — would have been a 30-second mystery without the strict check.
  - *Direct `setCooldown` API (test-friendly), `+ 1` lives in the consumer (`combat.ts`).* Tests seed cooldowns by their stored values via `makeHeroCombatant(..., { cooldowns: { mend: 2 } })` — predictable, no surprise transformation. The cast-time `+ 1` is documented inline at the only call site that performs it. Beat naming a "cast-cooldown helper" with the `+ 1` baked in (more API surface), and beat changing tick semantics to delete on `< 0` with `>= 0` skip checks (more conditions to keep straight).
  - *Cooldowns are battle-local; never serialized.* They live only on `CombatState`'s combatants; battle-end discards them. No save schema bump. Combat is rebuilt fresh from `RunState` per fight via `buildCombatState`.
  - *No events emitted (no `cooldown_set` / `cooldown_ticked`).* Cooldowns are AI bookkeeping in this task; the combat-scene playback layer doesn't surface them visually. Tier 2 polish if wanted later — adding events is one line per dispatch site.
  - *Cooldowns tick on stunned turns.* Stun is detected before `tickCooldowns` runs, but the tick still happens. Equivalent to "stunned time still passes for cooldowns." Symmetric with how a stunned hero who can't act still has the round advance.
  - *Skipped abilities cast → shuffle if exhausted.* If every priority entry is on cooldown / wrong-slot / no-targets, the combatant shuffles for one turn. Shuffle does not put anything on cooldown — cooldown is set only on a successful cast.
- **Alternatives considered:**
  - *Per-target cooldowns, "tried-recently" suppression heuristics, MMO-style global cooldowns.* Rejected — the simpler turns-based per-combatant per-ability model is sufficient for both bugs and matches the auto-battler convention.
  - *Track cooldowns globally on `CombatState` as `Map<CombatantId, Map<AbilityId, number>>`.* Rejected — breaks "everything that's about a combatant lives on the combatant"; complicates ownership semantics for no gain.
  - *Decrement at end of turn instead of start.* Rejected — doesn't change the math; just shifts where the off-by-one needs to be applied. Start-of-turn-tick aligns with `tickStatuses`.
  - *`Map<AbilityId, number>` instead of `Record`.* Rejected — `structuredClone` (used at `resolveCombat` entry) preserves Records cleanly; Maps round-trip technically but the codebase treats combatants as plain serializable structs throughout.
  - *Cooldown 1 for heals, 2 for archer specials.* Rejected — heal-every-other-turn is still 50% heal uptime; cd 2 across the board is the simpler floor that matches both bug fixes.
  - *Tier 1 cooldown pass on volley / necrotic_wave / shield_bash / smite.* Rejected as scope creep on top of bug fixing. Better as a separate balance pass once playtest data is in.
  - *Set cooldown to declared value (no `+ 1`) and change tick semantics.* Two viable variants: (a) tick deletes on `< 0` (not `<= 0`) + `pickAbility` checks `>= 0` with `?? -1` default; (b) tick after `pickAbility` instead of before. Rejected — both spread the off-by-one across multiple sites; the `+ 1` at the cast-time consumer is more localized and easier to review. Tradeoff documented in spec §"Stored value = N+1".
- **Surprises / lessons:**
  - **The off-by-one only surfaced via the `resolveCombat` integration test.** The 8 unit tests for `tickCooldowns` / `setCooldown` / `pickAbility.skip` all passed with the naive `setCooldown(combatant, ability.id, ability.cooldown)` because they each exercised cooldowns in isolation — none of them ran a multi-turn flow where the lifecycle compounds. Only the end-to-end test "priest with mend (cooldown 2) does not heal every turn" caught it: priest fired 5 mends over 9 turns instead of the expected ≤3, exposing that "cooldown 2 stored" gives "skip 1 turn" not "skip 2." The fix was a single `+ 1` at the consumer site; the diagnosis took ~10 minutes of tracing the tick lifecycle. Lesson: unit tests of a stateful helper are necessary but not sufficient — at least one integration test that runs the full lifecycle is what catches semantic mismatches. Also: the spec's lifecycle prose was internally inconsistent before the +1 was applied (claimed "deleted on T+2 → available on T+3") — the math didn't add up, but it took implementing it to notice. Lesson for spec self-review: trace each lifecycle step on paper with concrete values and verify the claimed end state actually holds. Counting is the part where my earlier eye missed an off-by-one that the code couldn't ignore.
  - **Strict mode caught `Record<AbilityId, number>` immediately.** TypeScript treats `Record<finite-union, T>` as requiring every key. Switching to `Partial<Record<AbilityId, number>>` was a one-line fix once the error landed; without strict mode, the bug would have been "cooldowns appear to work but the type lies about what's in there." The plan didn't anticipate this, but the compiler did.
  - **The CLAUDE.md rule "don't add error handling for impossible scenarios" pointed clearly at the `?? 0` choice.** `cooldowns[id]` is `undefined` for missing entries; `undefined > 0` is a comparison error in strict mode but silently `false` at runtime. The cleanest readable form was `(cooldowns[id] ?? 0) > 0`, not `cooldowns[id] !== undefined && cooldowns[id] > 0`. Same pattern works for the spec's `?? -1` rejected alternative.
  - **The 5-seed determinism test (existing in `combat.test.ts`) stayed green without modification.** All cooldown operations are deterministic — no rng, no side effects beyond the combatant. The risk-list flagged this as "should still pass; if it fails the bug is in cloning/shared state." Confirmed clean.
  - **The TODO #20 (combat speed toggle persistence) came out of the *same* smoke test session as the bug fixes.** Different domain (UI state vs combat AI), different scope (Tier 2 polish vs Tier 1 bug), but worth noting that one playtest surfaced three issues — heal stalemate (fixed here), archer volley (fixed here), and FF-toggle reset (captured for later). Smoke testing pays for itself.
- **Touches:**
  - `src/data/types.ts`, `src/data/abilities.ts`, `src/data/enemies.ts` (modified)
  - `src/combat/types.ts`, `src/combat/combatant.ts`, `src/combat/ability_priority.ts`, `src/combat/combat.ts` (modified)
  - `src/combat/cooldowns.ts` (new)
  - `src/combat/__tests__/cooldowns.test.ts` (new)
  - `src/combat/__tests__/ability_priority.test.ts` (modified — 1 new test)
  - `bugs.md` (entries removed)
  - `TODO.md` (entry #20 added — separate concern, captured during the same smoke test)
  - `docs/superpowers/specs/2026-04-26-ability-cooldowns-design.md` (new)
  - `docs/superpowers/plans/2026-04-26-ability-cooldowns.md` (new)
- **Source:** Direct from `bugs.md`, not via `TODO.md`. Captured during task 18 (camp_screen) smoke testing; resolved here in the same session-cluster. Related: task 4 HISTORY (`pickAbility`, `applyAbility`, the AI loop this extends), task 6 HISTORY (`Combatant` and `CombatState` shapes), 2026-04-25 combat-exhaustion entry (the exhaustion mechanic that turned heal-spam stalemates into player wipes — its existence made these bugs blocking rather than slow-moving).

### 2026-04-26 · Camp Screen — post-boss decision (Tier 1)

- **What shipped:**
  - `src/scenes/camp_screen_scene.ts` — full rewrite of task 16's stub. Header (`Floor Cleared!` + `The Crypt · Floor N`), tan-bordered Pack pill (`Pack: Ng`, prominent), three large `HeroCard`s in a horizontal row at x=180/480/780, optional Fallen line (only rendered when `run.fallen.length > 0`), and two outcome-on-button buttons: `Leave (+Ng to vault)` (green, x=300) and `Press On → Floor N+1` (warm-orange, x=660). Background `#1a1020` (matches dungeon scene).
  - **Press On handler.** Reads `runRngState`, `createRngFromState` → `pressOn(run, rng)` → atomic `appState.update` writes paired `{ runState: nextRun, runRngState: rng.getState() }` → `scene.start('dungeon')`. Single rng round-trip same as Noticeboard's Descend and dungeon-scene's combat-return.
  - **Leave handler.** Body verbatim from task 16's `returnToCamp`: `cashout(run)` → atomic `appState.update` writes `vault` (credited), `roster` (HP-updated for survivors, fallen pruned), `runState`/`runRngState` (cleared as a pair) → `scene.start('camp')`. Renamed only.
  - `src/scenes/boot_scene.ts` — three-way routing replaces the two-way: `runState?.status === 'camp_screen'` → `'camp_screen'`, else `runState` set → `'dungeon'`, else `'camp'`. Closes the page-reload-mid-decision gap that had previously bounced `camp_screen`-status saves to camp via the dungeon scene's guard.
  - No new tests (matches task 16 precedent — pure-logic deps `pressOn`, `cashout`, `credit`, `updateHero`, `removeHero`, `createRngFromState`, save invariant all covered by tasks 4 / 6 / 7 / 9). Tests stayed at 511 green, tsc clean, vite build clean.
  - Design spec at `docs/superpowers/specs/2026-04-25-camp-screen-design.md`; plan at `docs/superpowers/plans/2026-04-25-camp-screen.md`.
- **Why:** The post-boss decision screen is the emotional centerpiece of the Tier 1 gambling loop (per GDD §1) — the only place the player is *expected* to pause and think about cash-out vs press-on. Task 16's stub did real cashout work but had only a `Return to Camp` button; this rewrite adds the Press On path that makes the loop close. The boot-routing fix matters more here than for any other Tier 1 scene because camp_screen is the most-saved state once it's actually a decision (the player walks away from their machine to think).
- **Decisions:**
  - *Three large `HeroCard`s in a horizontal row (option A of three).* The post-boss decision is *about the party* — same level of detail used for Tavern recruits and Barracks selection applies here. 280×120 × 3 + 20px gaps fits cleanly in 960×540 with 40px margins; centers at x=180/480/780.
  - *Outcome-on-button labels (option B of three).* `Leave (+Ng to vault)` and `Press On → Floor N+1` put the decision math on the buttons themselves. Beat minimal labels (player has to look elsewhere to compute the trade-off) and "minimal label + caption" (redundant with the Pack panel that's already on screen).
  - *Boot routing fix bundled with the rewrite.* The cost is ~3 lines and closes a gap that would have otherwise hit on the most-saved Tier 1 state. Symmetric with task 16's "page-reload-mid-run gap" closure for the dungeon scene; doing both fixes in matched tasks keeps the routing logic legible.
  - *No private scene fields.* Every visual object lives only in Phaser's display list; no `private foo!: Phaser.GameObjects.X` slots. Eliminates the orphan-field strict-mode failure class that bit task 16 during execution. The scene is fully render-from-state — `run` is read once in `create()` and passed into the builders.
  - *No confirmation modals.* The cash-out vs press-on decision is the moment Tier 1 hangs on commitment; second-guessing dialogs would dilute the design intent. Tier 2 polish if playtest reveals "I keep misclicking Press On."
  - *Cards pack leftward, original formation indices not preserved.* `completeCombat` filters dead heroes out of `run.party`, so a slot-2 death collapses the array — the surviving slot-3 hero renders at `PARTY_X[1] = 480`, not at 780. Fallen line by name is the only record of who was where. Matches dungeon scene's existing rendering convention.
  - *Press On uses `scene.start('dungeon')` not `'camp_screen'`.* After `pressOn`, status flips back to `'in_dungeon'`, so a re-entry to camp_screen would hit its own guard and bounce to camp.
  - *Leave handler kept verbatim from the stub.* The TODO entry called this out explicitly — it's the same body, renamed. No risk of regressing the cashout work that task 16 already smoke-tested end-to-end.
- **Alternatives considered:**
  - *Three small (180×56) `HeroCard`s.* Rejected during clarifying Q1 — the post-boss screen is a decision *about the party*, large cards give the right level of detail.
  - *Darkest-Dungeon-style party-left, decisions-right split.* Rejected during clarifying Q1 — horizontal full-width row reads better at 960×540.
  - *Boot routing fix as a separate follow-up task.* Rejected during clarifying Q2 — the cost is ~3 lines and the gap matters most precisely on this scene; doing both at once keeps the routing logic legible.
  - *Animated gold-counting on screen open.* Tier 2 polish; static value reads instantly.
  - *Upcoming-floor preview on Press On.* Noticeboard doesn't preview node types either; preserves Tier 1's "you don't know what's ahead" tension.
  - *`Abandon` button.* Per GDD §4, Abandon only exists on mid-floor camp nodes (Tier 2). On the post-boss screen, Leave already pays out — "abandon" is meaningless.
  - *Confirmation modal on either button.* Tier 1 commitment is the design intent.
- **Surprises / lessons:**
  - **Spec self-review caught a layout-claim that survived all the design discussion.** I'd written "1- or 2-survivor parties leave the trailing slot positions empty; cards always occupy their original-formation indices." But `completeCombat` filters dead heroes out of `run.party` — the array collapses, so cards pack leftward. Fixed inline before plan-writing. The lesson: trace each visual claim back through the data shape it depends on, especially for "what does the screen look like in degenerate cases."
  - **Smoke testing surfaced two combat bugs that had nothing to do with task 18 but blocked its verification.** Cultist's `dark_pact` (heal, no cooldown) is its first AI priority, so any encounter with a Cultist stalls forever — and the new exhaustion mechanic ramps damage taken on the *player* side only, so the player wipes against an unkillable enemy team. Couldn't reach the camp_screen at all in some runs. Captured both bugs in `bugs.md` (heal cooldowns, archer-volley AI). Applied a 1-line *test fixture* to `src/data/enemies.ts` — flipped Cultist priority to `['dark_bolt', 'dark_pact']` so heal only fires when bolt has no target. Comment in the file points at `bugs.md` so the temporary nature is documented and revertable when the proper cooldown system lands.
  - **The render-from-state-with-no-private-fields pattern paid off immediately.** No strict-mode `noUnusedLocals` issues during execution — task 16's HISTORY explicitly called out three orphan fields the spec had wanted that turned out unused. Avoiding scene-local state entirely (passing `run` into each builder method) made every field's existence justified by use.
  - **The pressOn rng round-trip is the same shape as Descend + combat-return, third instance now.** `createRngFromState(state.runRngState!)` → call the run-state transition with the rng → `appState.update` with `rng.getState()` paired. Three call sites now use this exact pattern (Noticeboard, dungeon-scene, camp-screen). Worth a small helper if a fourth shows up; not yet.
- **Touches:**
  - `src/scenes/camp_screen_scene.ts` (rewritten)
  - `src/scenes/boot_scene.ts` (modified — three-way routing)
  - `docs/superpowers/specs/2026-04-25-camp-screen-design.md` (new)
  - `docs/superpowers/plans/2026-04-25-camp-screen.md` (new)
  - `bugs.md` (modified — heal-cooldown and archer-volley entries)
  - `src/data/enemies.ts` (modified — Cultist priority flipped as test fixture; revert when heal cooldowns ship)
- **Source:** `TODO.md` Cluster B · Task 18. Related: `gdd.md` §1 (camp screen as the gambling-loop hinge) and §4 (run-end paths), task 6 HISTORY (`pressOn`, `cashout`, `CashoutOutcome`), task 7 HISTORY (`credit`, `updateHero`, `removeHero`), task 9 HISTORY (save invariant — `runState`/`runRngState` pairing), task 11 HISTORY (`HeroCard` reuse), task 16 HISTORY (camp_screen stub + boot-routing precedent for dungeon — symmetric fix here for camp_screen; the orphan-field strict-mode lesson explicitly avoided this time).

### 2026-04-25 · Combat exhaustion soft cap (replaces 30-round timeout)

- **What shipped:**
  - `src/combat/types.ts` — added `exhaustionLevel: number` to `CombatState`; added `{ kind: 'exhaustion_applied'; level: number }` to the `CombatEvent` union; removed `'timeout'` from `CombatOutcome` (now just `'player_victory' | 'player_defeat'`).
  - `src/combat/combat.ts` — `ROUND_CAP` raised from 30 to 1000 (safety only). At the top of round 100 the loop sets `state.exhaustionLevel = 1` and emits `exhaustion_applied`. Every 5 rounds after (105, 110, 115, …) the level increments by 1 and a fresh event is emitted. `hitCap` flag and `'timeout'` outcome branch removed; `computeOutcome` is now strictly "who's still alive."
  - `src/combat/effects.ts` — `applyDamage` now takes `state` (forwarded by `applyEffect`'s damage branch). After defense subtraction and the existing damage-floor of 1, if `target.side === 'player' && state.exhaustionLevel > 0` the final damage is multiplied by `1 + 0.10 × exhaustionLevel`, rounded, and floored at 1. Heals and enemy-side damage are untouched.
  - `src/run/run_state.ts` — `completeCombat`'s wipe branch dropped its `|| result.outcome === 'timeout'` clause (unreachable).
  - `src/run/combat_setup.ts`, `src/combat/__tests__/helpers.ts`, `src/run/__tests__/run_state.test.ts` — every `CombatState` constructor now sets `exhaustionLevel: 0`.
  - `src/scenes/combat_playback.ts` — silent handler `onExhaustionApplied(): return 1`. Required only because the dispatch switch is exhaustive on `CombatEvent.kind`. Per spec, player-facing UI surfacing of exhaustion is out of scope and deferred.
  - Tests: 3 new in `src/combat/__tests__/effects.test.ts` (player-side amplification at level 3, no enemy-side amplification, 1-damage floor preserved); 4 new in `src/combat/__tests__/combat.test.ts` (event at round 100 = level 1, ramp by 1 every 5 rounds, no events when fight ends pre-100, deterministic resolution under 500 rounds across 5 seeds); 1 rewrite of "no-damage matchup times out at 30 rounds" → "extreme stalemate resolves via exhaustion"; 1 deletion of `'timeout triggers wipe'` in `run_state.test.ts`. Final count 493 → 499 passing.
  - Design spec at `docs/superpowers/specs/2026-04-25-combat-exhaustion-design.md`; plan at `docs/superpowers/plans/2026-04-25-combat-exhaustion.md`.
- **Why:** The 30-round cap was firing on legitimate fights and ending them in an arbitrary wipe. The user wanted a soft cap that *guarantees* a real outcome — the fight always resolves to victory or defeat — by ramping a damage amplifier on the player party until something breaks. Replaces an arbitrary cutoff with a tension-building one.
- **Decisions:**
  - *Track exhaustion as global state on `CombatState`, not as a per-combatant status.* Exhaustion is a property of the battle, not of individuals — same level for everyone, no expiration, no source. Putting it on state avoids: a new `AbilityEffect` kind for "damage taken multiplier," bookkeeping when heroes die or revive (would invalidate per-target status entries), and a fake `StatusId` that doesn't have real status semantics. The damage formula already reads target-side state via the `mark` status; one more global field is a tiny addition.
  - *Player-only, not both sides.* User confirmed during brainstorming: exhaustion is a stalemate-breaker that costs the player. If it amplified both sides, fights with high-defense players + low-HP enemies would flip to player wins, which inverts the intent — exhausted parties should be punished for taking too long, not rewarded.
  - *No "timeout" safety outcome.* The 1000-round safety cap exists, but if reached the outcome is `'player_defeat'` (not a separate variant). With exhaustion at level 181 = +1810% damage, the cap is unreachable in practice; treating the unreachable corner as `player_defeat` is simpler than carrying a third outcome through every caller. Verified via the 5-seed test: stalemates resolve well below round 500.
  - *Heals are not amplified.* One-sided in stat *and* in direction (extra damage taken, not reduced healing). Symmetric treatment would have made priests strictly worse over time, which is a different (and probably bad) design.
  - *Skipped the defensive `state.exhaustionLevel ?? 0` after `structuredClone`.* The plan included it as belt-and-suspenders, but the project's system prompt is explicit: "Don't add error handling, fallbacks, or validation for scenarios that can't happen." Every `CombatState` constructor sets the field; `structuredClone` preserves it. The `?? 0` would be dead code.
  - *Exhaustion tests in `effects.test.ts` use `applyAbility` directly, while round-trigger tests in `combat.test.ts` use `resolveCombat`.* The spec/plan offered `resolveCombat`-based tests for both. Switched to `applyAbility` for the damage-formula tests — that's the file's existing pattern, and it isolates the formula change without depending on initiative/seed. Round-trigger tests stayed on `resolveCombat` because they exercise loop behavior that `applyAbility` can't.
- **Alternatives considered:**
  - *Per-combatant `exhausted` status with a new `damage_taken` effect kind.* More general, could in theory single out one combatant later. Rejected: exhaustion is global; the new effect kind would only be used here; bookkeeping on death/revive adds churn for no semantic gain.
  - *Both-sides exhaustion.* User explicitly chose player-only during brainstorming.
  - *Removing `ROUND_CAP` entirely.* Tempting once exhaustion guarantees resolution, but a 1000-round failsafe costs nothing and prevents an infinite-loop bug from ever locking up Vitest or the browser tab. Cheap insurance.
- **Surprises / lessons:**
  - **`combat_playback.ts`'s dispatch switch is exhaustive on `CombatEvent.kind` and broke typecheck the moment the new variant was added.** TypeScript flagged the missing case immediately ("Function lacks ending return statement"). Adding a no-op `onExhaustionApplied` handler took ~30 seconds. The lesson: exhaustive switches over discriminated unions are the right pattern — they make adding a variant a forced compile-time review of every consumer, instead of silently swallowing the new kind. The plan didn't anticipate this scene-side touchpoint, but the type system did.
  - **The first round-trigger test failed because the stalemate ended too early.** With `hp 100, attack 1, defense 1000`, both sides take 1 damage per round (hits floored at 1 because `raw - defense` goes negative). After ~99 rounds both are near death; the test asserted ≥3 exhaustion events but fight ended before round 110. Boosting HP to 10000 (so attrition can't end the fight in the trigger window) was a one-character fix, but the failure mode is worth remembering when designing engine tests: floor-at-1 means even "no real damage" setups eventually grind out a kill.
  - **Picking exhaustion-on-player-only created an asymmetry the plan's `'player_defeat'`-asserting rewrite of the "no-damage" test didn't survive.** With the 1-damage floor, exhaustion's 10% amplification rounds back to 1 damage at low base values, so `1 × 1.10 → 1`. Whichever side wins initiative wins on the final exchange; with player-side initiative tiebreak the player can win these. Rewrote the test to assert outcome ∈ {victory, defeat} + exhaustion fired, rather than asserting defeat specifically. The spec's stronger claim ("the player will lose any prolonged stalemate") is true at higher base damage but not at the rounding floor.
  - **`effects.test.ts` and `combat.test.ts` use different testing paradigms (direct `applyAbility` vs full `resolveCombat`), and the choice matters.** `applyAbility` is direct, deterministic, and fast — perfect for damage-formula tests. `resolveCombat` exercises the full loop including initiative and AI — necessary for round-trigger tests. Mixing the patterns within one feature was uncomfortable but right. The plan's "use `resolveCombat` for everything" would have made the formula tests harder to read for no benefit.
- **Touches:**
  - `src/combat/types.ts`, `src/combat/combat.ts`, `src/combat/effects.ts` (modified)
  - `src/combat/__tests__/helpers.ts`, `src/combat/__tests__/combat.test.ts`, `src/combat/__tests__/effects.test.ts` (modified)
  - `src/run/run_state.ts`, `src/run/combat_setup.ts`, `src/run/__tests__/run_state.test.ts` (modified)
  - `src/scenes/combat_playback.ts` (modified — silent handler for new event)
  - `docs/superpowers/specs/2026-04-25-combat-exhaustion-design.md` (new)
  - `docs/superpowers/plans/2026-04-25-combat-exhaustion.md` (new)
- **Source:** Direct user request, not from `TODO.md`. Related: task 4 HISTORY (combat-engine `ROUND_CAP = 30`, `'timeout'` outcome — both replaced here), task 6 HISTORY (`completeCombat`'s wipe branch — `'timeout'` clause removed), task 17 HISTORY (`combat_playback.ts` dispatch — extended with the new variant handler).

### 2026-04-25 · Combat scene (Tier 1)

- **What shipped:**
  - `src/scenes/combat_scene.ts` (new, ~170 lines) — Phaser scene (key `'combat'`) that reads `runState`/`runRngState` from `appState`, builds `CombatState` via `buildCombatState`, restores rng via `createRngFromState`, calls `resolveCombat`, builds the layout (background, HUD chrome, `CombatActor`s for each combatant), and kicks off `CombatPlayback`. On playback complete, sets the handoff slot and transitions to `'dungeon'`. SHUTDOWN handler aborts playback and resets `tweens.timeScale` / `time.timeScale`.
  - `src/scenes/combat_playback.ts` (new, ~310 lines) — `class CombatPlayback`. Async `for-await` event loop over `result.events` with per-event handlers using a cursor (`this.i`). FF toggle: `setSpeed(s)` sets `scene.tweens.timeScale = s` and `scene.time.timeScale = s` (verified: works mid-tween, accelerates in-flight). Look-ahead batching for AoE damage (consume `ability_cast` + N contiguous `damage_applied` from same caster) and post-death collapse (consume `death` + N contiguous `position_changed{reason:'collapse'}`); each batched handler returns its consumed count. Owns the `running: Map<CombatantId, RunningEntry>` state mirror — engine events carry deltas (`amount`), mirror tracks current HP/slot/statuses/isDead. Caster animation heuristic: AoE → caster pulse + concurrent target flashes; melee (canCastFrom includes 1 + has damage effect) → caster lunges ±20px; otherwise → caster pulses in place. Per-event durations (200–500ms) sum to ~12–18s at 1× for a typical fight, ~4–6s at 3×. Final 800ms tableau linger before transition.
  - `src/scenes/combat_handoff.ts` (new, ~14 lines) — module-level ephemeral slot. `setCombatResult(result, rngStateAfter)` / `consumeCombatResult()`. Memory-only, never serialized to save. Single-use — `consume` returns and clears.
  - `src/render/combat_actor.ts` (new, ~310 lines) — `class CombatActor extends Phaser.GameObjects.Container`. Wraps `Paperdoll` (heroes) or `EnemyPlaceholder` (enemies) under a private `bodyView` field (renamed from `body` because `Phaser.GameObjects.Container.body` is the physics-body slot). Owns name text, HP bar (bg + fill + text, 56×4, color by ratio), status strip (letter glyphs spaced 10px), actor outline (60×80 yellow stroke, alpha-toggled). Animation API: `lunge('left'|'right')` (±20px tween + return), `pulse()` (scale 1→1.1→1), `flashHit()` / `flashHeal()`, `setHpBar()` (tween fill width), `setOutline(active)`, `addStatusGlyph(statusId)` / `removeStatusGlyph()` / `clearStatusGlyphs()`, `spawnNumber(text, color)` (floats up + fades), `collapse()` (alpha 1→0 + drop 8px), `moveToSlotX(x)`, `jiggle()`. Letter-glyph mapping for the 7 Tier 1 statuses inlined here.
  - `src/render/enemy_placeholder.ts` (new, ~30 lines) — 16×24 colored rect tinted by role (`ENEMIES[id].role === 'boss'` → `0x882222`, else `0x664444`). Exposes `flash(color)` / `unflash()`. Boss `bone_lich` is rendered at `bodyScale = 4.5` (1.5× the minion 3× scale) by `CombatActor`. **Task 19 seam:** when real enemy sprites land, only this file gains a `spriteId` lookup branch; the rest of the combat scene is unchanged.
  - `src/scenes/dungeon_scene.ts` (modified) — `startCombatAtCurrentNode` reduced to one line (`this.scene.start('combat')`). New `processCombatReturn(result, rngStateAfter)` method runs in `create()` when `consumeCombatResult()` returns a value: snapshots `preCombatHp` from pre-`completeCombat` `runState.party`, runs `completeCombat`, atomic `appState.update({ runState, runRngState })`, positions party at `partyXForNode(run.currentNodeIndex)`, transitions to `showing_result` or `showing_wipe`. The `rng` field and `Rng` / `createRngFromState` / `resolveCombat` / `buildCombatState` / `currentNode` imports were removed — combat scene owns the engine call now. The `walking_in` cold-entry path is preserved. Result panel / wipe panel / dismiss handlers / camp_screen transition all unchanged.
  - `src/scenes/noticeboard_panel_scene.ts` (modified, 1 line) — flipped `SLOT_X` from `[170, 480, 790]` to `[790, 480, 170]`. Slot 1 (front) now renders on the right of the picker, matching the combat scene's party-on-left/slot-1-closest-to-enemies layout. Drop-zone indices, slot labels, and formation array semantics unchanged. Surfaced during smoke testing — without this fix, dragging a hero to the rightmost picker slot put them at the leftmost (back) of the combat formation, which read as a visual flip.
  - `src/main.ts` (modified) — registered `CombatScene` between `DungeonScene` and `CampScreenScene`.
  - No new tests. Pure-logic deps (`resolveCombat`, `completeCombat`, `buildCombatState`, `currentNode`, `createRngFromState`) covered by tasks 4 / 6 / 9. Scene-level code follows tasks 13–16 precedent: smoke-tested only.
  - Design spec at `docs/superpowers/specs/2026-04-25-combat-scene-design.md`; plan at `docs/superpowers/plans/2026-04-25-combat-scene.md`.
- **Why:** First scene where the game's setup decisions become visible — formation, class kit, slot pressure, status interactions, AI priority. The combat engine has produced event logs since task 4; this task makes them legible. Also closes the architectural debt task 16 explicitly bequeathed: the inline `resolveCombat` call in the dungeon scene was always a placeholder for the real combat-scene path.
- **Decisions:**
  - *Async/await playback driver (clarifying option 1).* Top-to-bottom `for (const ev of events) { await dispatch(ev); }` reads the same shape as the engine's event production. Each handler returns a `Promise<number>` (consumed count) and tweens via promise-wrapped `scene.tweens.add` / `scene.time.delayedCall`. Beat both step-queue + `time.delayedCall` chains (more bookkeeping for the same shape) and giant `scene.tweens.chain` (events that don't naturally tween — round banner, action log, status glyph — get awkward).
  - *Module-level handoff slot, not `appState`.* `combat_handoff.ts` is memory-only; `appState.update` always serializes to localStorage. Putting `lastCombatResult` on `appState` would either (a) bloat the save with ephemeral data or (b) require a session/non-saved branch on `AppState` (invasive shape change). The module-level slot is ~14 lines and zero impact on save.
  - *Combat scene owns the engine call.* Combat scene reads `runState`/`runRngState`, builds combat state, calls `resolveCombat`, animates, returns `{ result, rngStateAfter }` via handoff. Dungeon scene calls `completeCombat` + `appState.update` on return. The atomic `{ runState, runRngState }` write happens once, in dungeon scene's `processCombatReturn`. Save invariant from task 9 holds.
  - *No `appState.update` during playback.* Save on disk has stale rngState during animation. On reload mid-playback, boot routes to dungeon (cold entry — handoff slot is gone since it's in-memory), dungeon walks in, combat scene replays deterministically (same seed, same engine output). Player sees the fight again. Acceptable cost; spec already analyzed this.
  - *Single `CombatActor` wrapper for both heroes and enemies.* Composes `Paperdoll` for heroes and `EnemyPlaceholder` for enemies under a unified animation API (`lunge`, `pulse`, `flashHit`, etc.). The polymorphism happens once in the constructor (`init.kind === 'hero' | 'enemy'`); every animation callsite is identical. Lets the playback driver write `actor.flashHit()` without branching on side.
  - *`EnemyPlaceholder` as an explicit task 19 seam.* Tier 1 ships placeholder rects tinted by role (boss vs minion); task 19 will swap real sprites by changing only this file. The boss gets a 1.5× body scale (4.5× vs 3× minion), keeping slot positioning the same. `setFlipX(true)` for left-facing enemies is deferred until task 19 ships directional frames; placeholder rect is symmetric.
  - *FF toggle via `tweens.timeScale` + `time.timeScale`.* Single setter affects everything globally. Mid-tween acceleration works (verified during smoke test). Both reset to 1.0 in scene shutdown handler so dungeon scene starts at normal speed. Beat per-tween-id bookkeeping and "applies on next event boundary" approaches.
  - *Look-ahead batching for AoE damage and post-death collapse.* Without it, AoE volley plays as a slow conga line of single hits (3 × 200ms) and a 4-enemy wipe takes 1.2s of sequential collapses. Batched: caster pulse + concurrent target flashes for AoE (single 350ms beat), all collapse moves run via `Promise.all` (single 300ms). Cursor `this.i` is explicit so each batched handler returns `1 + N` consumed.
  - *Caster animation heuristic from `canCastFrom` + damage effect.* `targetIds.length > 1` → AoE, no lunge. Else if `ability.canCastFrom.includes(1)` and ability has a damage effect → melee, lunge toward target side. Else → ranged or non-damage cast, pulse in place. Correctly classifies every Tier 1 ability without per-ability data: melee (Slash, Shield Bash, Strike, Smite, Bone Slash, Rotting Bite, Lich Strike), ranged (Shoot, Piercing Shot, Flare Arrow, Bone Arrow, Dark Bolt), AoE (Volley, Necrotic Wave), non-damage (Bulwark, Taunt, Mend, Bless, Dark Pact, Curse of Frailty).
  - *Letter-glyph status icons (option B medium density).* `S/B/T/M/+/r/−` for the 7 Tier 1 statuses. Beat colored dots (would need tooltip system, doesn't exist) and "no status icons" (statuses are mechanically central to the readout). `?` fallback for unmapped statuses (Tier 2 additions extend the map).
  - *Single-toggle FF (1× ↔ 3×).* No skip-to-result, no pause. Tier 1 is the period when watching the fight is the point — players are learning what their party does. Skip is Tier 2 polish.
  - *Per-event base durations (1× values), scaled via timeScale.* `combat_start: 0`, `round_start: 400ms` (in/hold/out), `turn_start: 100ms`, `ability_cast: 250–350ms`, `damage/heal: 200ms`, `status_applied/expired: 100–150ms`, `position_changed: 300ms`, `death: 500ms`, `round_end: 100ms`, final linger 800ms. Sum to ~15s at 1× for a typical 3v3 fight (close to GDD §2's 15–45s budget for 1× combat).
  - *Action log as transient single line, no scrollback.* `Knight casts Slash on Skeleton Warrior — 4 dmg`. Each event updates the line; brief alpha pulse (0.4 → 1.0 over 80ms) gives the "something updated" cue. Beat scrollback (players don't scroll mid-fight) and turn-order ribbon (redundant with caster outline).
  - *Picker flip (`SLOT_X` reverse) over combat-scene flip.* Surfaced during smoke test. Two options were on the table: flip the picker so slot 1 is on the right (matches combat scene + DD genre convention) or flip the combat scene so party is on the right and enemies on the left (matches existing picker but breaks DD convention). Picker flip is one line and one comment; combat flip would have been ~10 lines across two files plus the lunge-direction logic. The picker's previous "slot 1 on left" was speculative — task 14 HISTORY noted "reads like the formation reads in combat" but combat hadn't been built yet, so the speculation got it backwards.
- **Alternatives considered:**
  - *Step queue + `delayedCall` chain* (clarifying option 2) — same shape as async/await but with manual continuations and worse readability. Rejected.
  - *Phaser tween-chain* (clarifying option 3) — `scene.tweens.chain` for everything. Status glyph pops, action log updates, and round banner don't naturally fit the tween shape. Rejected.
  - *Engine extension to carry post-state (`targetHpAfter`, etc.)* — would simplify the playback driver but couples the firewalled engine to one consumer. Rejected; the scene-side `running` mirror is ~30 lines and lives where it belongs.
  - *Skip-to-result button.* (clarifying Q7) Rejected for Tier 1 — players should watch their setup choices play out. Tier 2 polish if late-game grinding becomes painful.
  - *Pause button.* (clarifying Q7) Rejected — Tier 2 polish.
  - *Action log scrollback / turn-order ribbon.* (clarifying Q5) Rejected — single-line transient log + caster outline cover the same readout need without scroll UI.
  - *Per-ability visual flavor* (specific colors / particles per `Ability.tags`) — Tier 2 polish; per-archetype distinction (melee/ranged/AoE) at Tier 1 is enough.
  - *Real backdrop art.* Tier 2; solid `#1a1020` rect matches dungeon-scene tone for visual continuity.
  - *Combat-scene flip (party right, enemies left)* — rejected during smoke-test fix; picker flip was simpler and matched genre convention.
  - *Inline animation in the dungeon scene without scene swap* — rejected at brainstorm. Task 16 already chose inline `resolveCombat` for tier 1 with explicit "task 17 will refactor"; that's exactly this work.
- **Surprises / lessons:**
  - **`scene.sys.isActive()` returns false during `create()`.** Initially the playback loop had `if (this.aborted || !this.scene.sys.isActive()) return;` at the top of every iteration. Smoke test: combat scene loaded, combatants stood there, no errors. The `void this.playback.run()` ran synchronously inside `create()`, hit the `isActive()` check on the first iteration, and returned before processing any events. The scene transitions to `RUNNING` only after `create()` completes. Fix: dropped the `isActive()` check; `aborted` flag (set in SHUTDOWN handler) is sufficient for cleanup. Lesson: don't mix scene-state predicates and synchronous-into-create() async kickoff. The `aborted` flag pattern is the right one.
  - **`Phaser.GameObjects.Container.body` is reserved** (physics body slot). Naming a private field `body: Phaser.GameObjects.Rectangle` triggered `TS2416 Property 'body' is not assignable to base type` and an unrelated cascading error on `scene.add.existing(this)`. Renamed to `rect` in `EnemyPlaceholder` and `bodyView` in `CombatActor`. Lesson: when extending Phaser GameObjects, avoid field names that shadow framework slots (`body`, `parent`, `scene`, `input`).
  - **Phaser 4 changed tinting API.** `setTintFill(color)` was the Phaser 3 signature; in Phaser 4 it's `setTintFill(): void` (no-arg toggle, deprecated). New idiom: `obj.setTint(color).setTintMode(Phaser.TintModes.FILL)`. Type errors caught it (`Expected 0 arguments, but got 1`); the runtime would have silently set wrong-signature data. Worth knowing for any future tint work.
  - **Tuple indexing strictness on `SlotIndex`.** `const PARTY_X = [0, 400, 320, 240] as const;` typed as a length-4 tuple; indexing with `c.slot: 1|2|3|4` includes index 4 → `undefined`. Even though the runtime is "party never has slot 4," TypeScript can't see that. Fix: extend `PARTY_X` to length 5 with a dummy 4th value (`160`). Lesson: tuple-typed lookup tables need defensive sizing when keyed by a wider numeric union.
  - **Strict-mode `noUnusedLocals` caught the orphan `rng` field in dungeon scene** — third time this lesson recurs (after Tavern, Barracks, dungeon-scene-rewrite). The dungeon scene used to thread an `Rng` instance for its inline `resolveCombat` calls; after the refactor moved combat to the combat scene, the field stayed untouched. Strict mode rejected it. The plan's pseudocode had also kept the field; spec self-review caught the orphan field issue *generally* but didn't trace through this specific consequence of the combat-call relocation.
  - **Picker/combat slot orientation mismatch surfaced during smoke test.** Picker had slot 1 on the left (per task 14 HISTORY's "reads like the formation reads in combat" — but combat hadn't existed yet, so the prediction was wrong). Combat scene had slot 1 on the right (DD convention: front-most = closest to enemies on the right). The flip became visible once a hero crossed the picker→combat boundary. One-line picker fix (`SLOT_X` reversal). Lesson: visual-convention claims in early HISTORY entries are predictions; downstream tasks can falsify them, and the cheap fix is to update the speculator.
  - **Hero shuffle behavior surfaced as expected-vs-actual mismatch.** Smoke test: Knight in slot 3 never moved to the front. Engine works as designed — `pickAbility` picks the highest-priority ability whose `canCastFrom` includes the current slot; only returns null (triggering shuffle) when nothing's castable. Knight at slot 3 always has `bulwark` or `taunt` available, so he just self-buffs forever. Same lockup pattern affects Archer-at-slot-1 (only `archer_shoot` valid; flare/piercing/volley want 2–3) and Priest-at-slot-1 (only `priest_strike` valid; mend/bless/smite want 2–3). Captured in `ideas.md` as "Heroes shuffle toward preferred slots" with three engine-rule shapes to consider. Out of scope for task 17 — the combat scene was correctly *animating* what the engine produced; the engine just produced no shuffle events.
  - **The async-loop leak on shutdown is theoretical but unmitigated.** When the scene shuts down mid-tween, Phaser destroys the tween; the promise wrapping its `onComplete` never resolves; the async function hangs waiting forever. The `aborted` flag check at the top of the next iteration would exit cleanly *if* we got there. We don't, because we're stuck on the `await`. In practice the orphan promise just gets GC'd when the scene is torn down. If this becomes a real issue (e.g., warnings in dev tools about unhandled promises), wrap awaits in `Promise.race([..., abortedPromise])`. Tier 2.
- **Touches:**
  - `src/scenes/combat_scene.ts` (new)
  - `src/scenes/combat_playback.ts` (new)
  - `src/scenes/combat_handoff.ts` (new)
  - `src/render/combat_actor.ts` (new)
  - `src/render/enemy_placeholder.ts` (new)
  - `src/scenes/dungeon_scene.ts` (modified — refactored to launch combat scene)
  - `src/scenes/noticeboard_panel_scene.ts` (modified — `SLOT_X` flipped to match combat layout)
  - `src/main.ts` (modified — `CombatScene` registration)
  - `ideas.md` (modified — added "Heroes shuffle toward preferred slots" idea)
  - `docs/superpowers/specs/2026-04-25-combat-scene-design.md` (new)
  - `docs/superpowers/plans/2026-04-25-combat-scene.md` (new)
- **Source:** `TODO.md` Cluster B · Task 17. Related: `gdd.md` §2 (Combat — ranks, turn order, shuffle, fast-forward) and §10 (Tier 1 build plan), task 4 HISTORY (`resolveCombat` event log shape), task 6 HISTORY (`completeCombat`, `WipeOutcome`), task 9 HISTORY (save invariant — `runState` / `runRngState` pairing), task 11 HISTORY (`Paperdoll` scale conventions), task 14 HISTORY (Noticeboard picker — slot 1 visual position originally on left, now corrected here), task 16 HISTORY (dungeon scene's inline `resolveCombat` placeholder + the explicit "task 17 will refactor" bequest).

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
