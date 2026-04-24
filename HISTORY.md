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
