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
