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

### 1 · Full 7-stat model (Mind, Crit, Dodge)

- **What:** Add Mind, Crit, and Dodge to the combat stat block. Mind scales magical abilities (heals, spell damage, buff/debuff strength); Crit is per-attack chance to double damage; Dodge is per-incoming-attack chance to convert a hit to a miss.
- **Why:** Tier 1 ships with 4 stats (HP, Speed, Attack, Defense). Mage in particular leans hard on Mind; gear properties and several Tier 2 abilities depend on the full 7-stat model.
- **Tier:** 2
- **Acceptance:**
  - `Hero` and combat resolution math handle `mind`, `crit`, `dodge`. Mind scales heals and ability effects of `kind: 'spell' | 'heal'`. Crit doubles a damage instance; Dodge converts a hit to a miss (event emitted so playback can render it).
  - Existing Tier 1 abilities behave unchanged when crit/dodge are 0 — `combat.test.ts` 5-seed determinism stays green.
  - New unit tests cover crit roll, dodge roll, and mind-scaled heals/damage.
- **Touches:** `src/data/types.ts`, `src/heroes/hero.ts`, `src/combat/types.ts`, `src/combat/combat.ts`, ability effect resolver, `src/save/save.ts` (schema bump if hero stat shape changes).
- **Source:** gdd §2 + §10 Tier 2.

### 2 · Class: Barbarian

- **What:** Implement the Barbarian. Kit: Cleave (enemies 1–2), Rampage (scaling damage that drops own Defense), Bloodthirst (heal-on-kill). Preferred slot 1–2, axe / greatsword.
- **Why:** First of three Tier 2 classes; bruiser archetype broadens party composition beyond Knight/Archer/Priest.
- **Tier:** 2
- **Acceptance:**
  - `data/classes.ts` adds `barbarian`; `data/abilities.ts` adds the three signature abilities + AI priority list.
  - AI priority reflects the kit (Rampage when low HP, Cleave when 2+ targets in slots 1–2, Attack otherwise).
  - Sprite mapping for axe / greatsword via `spritenames.txt` (placeholder reuse acceptable; bespoke art is Cluster C).
  - Tavern roll pool includes Barbarian once unlocked (default unlocked at start of Tier 2).
- **Touches:** `src/data/classes.ts`, `src/data/abilities.ts`, `src/combat/ability_priority.ts`, `spritenames.txt`, tests.
- **Source:** gdd §3 + §10 Tier 2.

### 3 · Class: Rogue

- **What:** Implement the Rogue. Kit: Backstab (teleport behind + hit enemy rear, high crit), Vanish (move self to slot 3, +Dodge), Poison Strike (DoT). Preferred slot 2, daggers.
- **Why:** Striker archetype with positional disruption — first class that mutates its own slot mid-combat. Forces the formation system to handle non-shuffle moves cleanly.
- **Tier:** 2
- **Acceptance:**
  - `data/classes.ts` adds `rogue`; abilities added.
  - Backstab moves the caster to enemy slot 4 (or temporarily resolves the hit there) cleanly within the existing slot model.
  - Poison Strike applies a DoT status ticking N turns. Extends `src/combat/statuses.ts` if needed.
  - Vanish swaps caster to slot 3 and applies a +Dodge status.
- **Touches:** `src/data/classes.ts`, `src/data/abilities.ts`, `src/combat/statuses.ts`, `src/combat/ability_priority.ts`, tests.
- **Source:** gdd §3 + §10 Tier 2.

### 4 · Class: Mage

- **What:** Implement the Mage. Kit: Firebolt (single-target enemy 3–4), Frost Nova (AoE + slow), Arc Shock (chance-stun). Preferred slot 3, staff / wand. Scales primarily off Mind.
- **Why:** First fully Mind-scaling caster; introduces the "slow" status (Speed reduction) and the chance-stun pattern.
- **Tier:** 2
- **Acceptance:**
  - `data/classes.ts` adds `mage`; abilities added with Mind scaling on damage.
  - Slow status reduces Speed for N turns; Arc Shock stuns with a configurable RNG-rolled chance.
  - AI priority reflects the kit (Frost Nova on 3+ enemies, Firebolt otherwise).
- **Touches:** `src/data/classes.ts`, `src/data/abilities.ts`, `src/combat/statuses.ts`, `src/combat/ability_priority.ts`, tests.
- **Source:** gdd §3 + §10 Tier 2.

### 5 · Wounds system

- **What:** Wounds — flat stat debuffs applied on heavy combat hits (or specific events). Each wound has a category (e.g., "Bruised: −2 Speed", "Hobbled: −2 Attack") and persists between fights and runs until healed at the Hospital or passively over N runs.
- **Why:** Tier 2 drip cost. Pushes the player toward Hospital visits and creates risk-of-cumulative-damage between cashouts.
- **Tier:** 2
- **Acceptance:**
  - `Hero` carries `wounds: Wound[]`; effective stats subtract wound deltas at combat-build time.
  - Wound roll fires on big-damage hits (threshold defined in data); wound types live in `data/wounds.ts`.
  - Wounds persist via the save schema (version bump + migration).
- **Touches:** `src/data/wounds.ts` (new), `src/heroes/hero.ts`, `src/combat/combatant.ts`, `src/save/save.ts` + migration, tests.
- **Source:** gdd §7 + §10 Tier 2.

### 6 · Gear rarity tiers (common → rare)

- **What:** Add rarity to gear: Common, Uncommon, Rare. Each tier is a meaningful stat bump; Rare can carry an extra property (e.g., burn-on-hit). Drop weights skew toward higher rarity at deeper floors / higher dungeon tiers.
- **Why:** Foundation for Blacksmith upgrades, shop stock quality, and elite/boss drops. Without this, all gear is flat.
- **Tier:** 2
- **Acceptance:**
  - `Item` carries `rarity: 'common' | 'uncommon' | 'rare'`; loot tables roll rarity from floor / dungeon-tier weights.
  - Rare items roll an extra property (e.g., `{ kind: 'burn', turns: 2 }`); the property surfaces in tooltip / display.
- **Touches:** `src/data/items.ts`, `src/items/`, `src/dungeon/loot.ts`, tests.
- **Source:** gdd §7 + §10 Tier 2.

### 7 · Gear-modifies-abilities rule

- **What:** A class's signature kit is gated by equipped weapon family. Preferred weapon → full kit; off-preferred-but-same-family → kit with one ability swapped (e.g., Knight + Greataxe: Shield Bash → Cleaving Swing); wholly-wrong-weapon → only universal basic Attack.
- **Why:** Lets a single class support 3–4 playstyles via gear. Without it, weapon choice is purely cosmetic + stat.
- **Tier:** 2
- **Acceptance:**
  - Each class declares preferred + same-family + swapped-ability mappings in `data/classes.ts`.
  - `buildCombatState` resolves the active kit based on equipped weapon. Wholly-wrong-weapon resolves to the basic-attack-only fallback.
- **Touches:** `src/data/classes.ts`, `src/run/combat_setup.ts`, tests.
- **Source:** gdd §3 + §10 Tier 2.

### 8 · Traits at recruitment

- **What:** ~12 small per-hero modifiers (Stout +10% HP, Quick +1 Speed, Cowardly −1 Speed when in slot 1, Lucky +5% Crit, etc.). One trait rolled per Tavern candidate; visible at roll time.
- **Why:** Gives heroes individual flavor at low design cost. Foundation for Chapel (trait removal) in Tier 3.
- **Tier:** 2
- **Acceptance:**
  - `data/traits.ts` (new) defines all ~12 traits as either flat stat-delta or conditional (slot-dependent, low-HP, etc.).
  - Tavern roll picks one per candidate; trait field on `Hero`; combat-build applies trait effects to effective stats.
  - Tests cover at least one stat-delta trait and one conditional trait.
- **Touches:** `src/data/traits.ts`, `src/heroes/hero.ts`, `src/camp/tavern.ts`, `src/save/save.ts` + migration, tests.
- **Source:** gdd §3 + §10 Tier 2.

### 9 · Hero leveling + level-5 perks

- **What:** Heroes gain XP from surviving combat. Levels grant small stat bumps (+HP, +primary stat). At level 5, the player picks 1 of 2 minor perks for that hero (e.g., "Precise: +5% Crit" / "Hardy: +10% HP").
- **Why:** Visible per-hero progression. Pairs with Training Grounds (Tier 3 — benched XP).
- **Tier:** 2
- **Acceptance:**
  - XP awarded per surviving combat; level curve in `data/leveling.ts`; level-up applies stat bumps deterministically.
  - At level 5, hero is flagged as `pendingPerk`; the camp scene surfaces the choice (UI in Cluster B task 9).
  - Save schema persists XP, level, and chosen perks.
- **Touches:** `src/data/leveling.ts` (new), `src/heroes/hero.ts`, `src/run/run_state.ts` (XP-award hook), save schema + migration, tests.
- **Source:** gdd §3 + §10 Tier 2.

### 10 · Floor generation: forks

- **What:** Each floor has 1–2 fork nodes. At a fork the player picks one of two next-node types; they see the immediate next node on each branch but not what follows.
- **Why:** Player agency between fights. Without forks, dungeons are linear walks.
- **Tier:** 2
- **Acceptance:**
  - Floor generator produces a graph (not a flat list); each fork shows its two-branch immediate-next node types.
  - `RunState` representation handles a graph traversal cleanly via `currentNode` / progression.
- **Touches:** `src/dungeon/floor_generator.ts`, `src/run/run_state.ts`, tests.
- **Source:** gdd §4 + §10 Tier 2.

### 11 · Shop nodes

- **What:** Shop encounter generator: rolls 3–4 gear items + 2 potions at floor-/tier-scaled prices. Player spends pack gold; purchased gear enters the pack.
- **Why:** Adds a real "spend now or save?" decision mid-floor. Depends on gear rarity tiers.
- **Tier:** 2
- **Acceptance:**
  - Shop generator rolls fresh inventory at floor entry (deterministic from run RNG); stock weights live in data.
  - Purchase resolves against `RunState.pack.gold` and adds to `pack.unequipped`.
- **Touches:** `src/dungeon/shop.ts` (new), `src/run/run_state.ts`, tests. UI is Cluster B task 4.
- **Source:** gdd §4 + §7 + §10 Tier 2.

### 12 · Elite nodes

- **What:** Elite encounter generator: tougher enemy lineup (more enemies, modifiers like Armored / Enraged), guaranteed Rare drop on victory.
- **Why:** Real reward asymmetry at forks ("Elite or Shop?"). Without elites, all combats are interchangeable.
- **Tier:** 2
- **Acceptance:**
  - Elite generator boosts HP/damage and stamps a modifier; victory loot roll forces ≥ 1 Rare-rarity drop.
- **Touches:** `src/dungeon/elite.ts` (new), `src/dungeon/loot.ts`, tests. Visual marker is Cluster B task 11.
- **Source:** gdd §4 + §10 Tier 2.

### 13 · Mid-floor camp nodes

- **What:** Mid-floor rest nodes. Player picks one of: heal some HP, treat one Wound, sharpen weapons (small temp Attack buff next combat). Cannot cash out.
- **Why:** Drip recovery between fights without fully healing the party. Pairs with Wounds.
- **Tier:** 2
- **Acceptance:**
  - Camp-node effect resolution applied to `RunState`; one effect per visit.
  - Distinguished from the post-boss Camp Screen (cannot cash out).
- **Touches:** `src/dungeon/camp_node.ts` (new), `src/run/run_state.ts`, tests. UI is Cluster B task 5.
- **Source:** gdd §4 + §10 Tier 2.

### 14 · Floor-milestone enemy modifiers

- **What:** Modifiers introduced at milestone floors (5, 10, 15…): Armored (+Defense), Venomous (applies poison on hit), Enraged (+Attack scaling with damage taken). Floor generator stamps modifiers based on floor number.
- **Why:** Makes deeper floors mechanically distinct, not just numerically scaled — last bullet of the Tier 2 dungeon-depth set.
- **Tier:** 2
- **Acceptance:**
  - `data/modifiers.ts` (new) defines the modifier set; floor generator applies modifiers to enemy combatants based on floor number.
  - Tests cover at least 3 modifiers (Armored, Venomous, Enraged) and confirm their effects on combat resolution.
- **Touches:** `src/data/modifiers.ts`, `src/dungeon/floor_generator.ts`, `src/combat/combatant.ts`, tests.
- **Source:** gdd §4 + §10 Tier 2.

### 15 · Event system core

- **What:** Event card data structure (id, body text, 2 choice options, payload effects per option), deck shuffle, choice resolution. Effects can mutate `RunState` (HP changes, gold changes, hero "Lost", gear gain).
- **Why:** Foundation for the event deck (next task) and "Lost"-category events.
- **Tier:** 2
- **Acceptance:**
  - `data/events.ts` defines the card type and payload kinds.
  - `applyEventChoice(runState, card, choice, rng)` mutates run state for all payload kinds in scope.
  - Tests cover each payload kind (HP delta, gold, hero "Lost", gear add).
- **Touches:** `src/data/events.ts` (new), `src/run/event_resolver.ts` (new), tests. UI is Cluster B task 6.
- **Source:** gdd §7 + §10 Tier 2.

### 16 · Initial event deck (~20 cards)

- **What:** Author ~20 event cards. Mix of pure flavor gambles (HP-for-gold trades), party-cost cards (one hero Lost), reward cards (gear find).
- **Why:** Without content, the event system is a feature with nothing to show.
- **Tier:** 2
- **Acceptance:**
  - 20 cards in `data/events.ts`, split between a shared deck and Crypt-specific cards.
  - Each card uses payload kinds defined in task 15 — no new mechanics introduced here.
- **Touches:** `src/data/events.ts`.
- **Source:** gdd §7 + §10 Tier 2.

### 17 · "Lost" hero category

- **What:** Non-combat hero removal. The hero is gone permanently with all equipped gear, regardless of party survival. Triggered by event cards or hazard nodes.
- **Why:** Gdd-defined design lever ("Lost" worse than "Fallen") that gives event cards real teeth.
- **Tier:** 2
- **Acceptance:**
  - `RunState` exposes a `loseHero(heroIndex)` operation that strips the hero from the party and discards their equipped gear (does NOT transfer to pack — that's the Fallen path).
  - Save schema records "Lost" outcomes distinctly from "Fallen" (per gdd §8).
  - At least one event card in the deck triggers a Lost outcome.
- **Touches:** `src/run/run_state.ts`, `src/data/events.ts` (one card), save schema + migration, tests.
- **Source:** gdd §8 + §10 Tier 2.

---

## Cluster B — Scenes & UI (Phaser)

Everything in this cluster may import `phaser`. Core logic lives in Cluster A modules; scenes only orchestrate and render.

### 1 · Combat HUD: crit + dodge readouts

- **What:** Surface crit hits and dodges in the combat playback layer — floating "CRIT!" text with a distinct colour over a crit-damage event, "Miss!" floating text on a dodge event, action-log mention. Pairs with Cluster A task 1.
- **Why:** Without visible feedback, crit and dodge feel invisible. The player needs to see when their stats matter.
- **Tier:** 2
- **Acceptance:**
  - On a crit-damage event the actor renders a "CRIT!" floater in a distinct colour and the action-log entry is suffixed with "(crit)".
  - On a dodge event a "Miss!" floater appears over the defender; action-log notes the dodge.
- **Touches:** `src/scenes/combat_playback.ts`, `src/render/combat_actor.ts`.
- **Source:** gdd §10 Tier 2 + Cluster A task 1.

### 2 · Hospital building

- **What:** Hospital scene/screen on the camp hub. Lists wounded heroes; player spends gold per wound to clear it. Pairs with Cluster A task 5.
- **Why:** Without UI, the wound system is unusable from the player's side.
- **Tier:** 2
- **Acceptance:**
  - Hospital tile on camp scene opens the Hospital UI; UI lists each wounded hero, their wounds, per-wound treatment cost.
  - "Treat" deducts vault gold and clears the wound.
- **Touches:** `src/scenes/hospital_scene.ts` (new), camp scene wiring.
- **Source:** gdd §6 + §10 Tier 2.

### 3 · Blacksmith building

- **What:** Blacksmith scene/screen. Lists upgradeable stash items; player spends gold + materials to upgrade an item one rarity tier (capped per Blacksmith level: L1 → uncommon, L2 → rare, L3 → epic).
- **Why:** Pairs with gear rarity tiers — gives the player a long-term sink for vault gold and a path from common gear to rare.
- **Tier:** 2
- **Acceptance:**
  - Blacksmith tile opens the UI; UI lists stash items with current rarity, upgrade cost (gold + materials), and a disabled state when the cap is reached.
  - "Upgrade" deducts costs and bumps the item's rarity.
- **Touches:** `src/scenes/blacksmith_scene.ts` (new), camp scene wiring.
- **Source:** gdd §6 + §10 Tier 2.

### 4 · Shop UI

- **What:** Shop overlay in the dungeon scene. Shows rolled inventory + prices, "Buy" buttons that draw from `pack.gold`. Pairs with Cluster A task 11.
- **Why:** Pairs with the shop-node data; without UI, shops can't be visited.
- **Tier:** 2
- **Acceptance:**
  - Shop-node entry overlays the Shop UI with current stock.
  - Purchases mutate `RunState.pack` via `appState.update`; sold-out items disable.
- **Touches:** `src/scenes/dungeon_scene.ts`, `src/scenes/shop_overlay.ts` (new).
- **Source:** gdd §7 + §10 Tier 2.

### 5 · Camp node UI (mid-floor)

- **What:** UI for mid-floor camp nodes — three buttons: Rest (heal HP), Treat Wound (with a hero picker), Sharpen (temp Attack buff next combat). Pairs with Cluster A task 13.
- **Why:** Pairs with camp-node data; needed for the player to interact.
- **Tier:** 2
- **Acceptance:**
  - Camp-node entry overlays a 3-option picker; selecting an option resolves the effect and advances.
- **Touches:** `src/scenes/dungeon_scene.ts`, `src/scenes/camp_node_overlay.ts` (new).
- **Source:** gdd §4 + §10 Tier 2.

### 6 · Event card UI

- **What:** Event card overlay. Shows card body text and two choice buttons; on choice, payload effects apply via the core event resolver and an outcome panel summarises the result before dismissal. Pairs with Cluster A task 15.
- **Why:** Without UI, events are invisible to the player.
- **Tier:** 2
- **Acceptance:**
  - Event-node entry overlays the card; choice buttons call into `applyEventChoice`.
  - Outcome panel describes what changed (HP, gold, gear, hero loss) before the player advances.
- **Touches:** `src/scenes/event_overlay.ts` (new), dungeon scene wiring.
- **Source:** gdd §7 + §10 Tier 2.

### 7 · Fork picker UI

- **What:** When the dungeon scene reaches a fork, replace "advance" with a 2-button picker — each button labeled with the immediate next-node icon. Pairs with Cluster A task 10.
- **Why:** Pairs with floor-generator forks; needed for player choice.
- **Tier:** 2
- **Acceptance:**
  - At a fork, the dungeon scene shows a 2-button picker; clicking sets the chosen branch as the active path and resumes normal advance.
- **Touches:** `src/scenes/dungeon_scene.ts`.
- **Source:** gdd §4 + §10 Tier 2.

### 8 · Trait display (Tavern + hero card)

- **What:** Show a hero's trait in the Tavern candidate row and on the Barracks hero card. Pairs with Cluster A task 8.
- **Why:** A trait the player can't see is a trait they can't roster around.
- **Tier:** 2
- **Acceptance:**
  - Tavern candidate row includes a trait label + tooltip (description from `data/traits.ts`).
  - Barracks hero card surfaces the trait with the same prominence as level/class.
- **Touches:** `src/scenes/tavern_scene.ts`, `src/ui/hero_card.ts`.
- **Source:** gdd §3 + §10 Tier 2.

### 9 · Level-up perk picker UI

- **What:** When a hero hits level 5, the camp scene shows a perk-pick overlay before the next run can start. Pairs with Cluster A task 9.
- **Why:** Without UI, the perk choice can't be made — the hero gets stuck at "pending."
- **Tier:** 2
- **Acceptance:**
  - On camp entry, any heroes with `pendingPerk` show a perk-pick overlay; selection persists via `appState.update`.
  - Camp blocks dungeon entry while a perk is pending (or surfaces it via a Barracks badge — design call at implementation).
- **Touches:** `src/scenes/camp_scene.ts`, `src/scenes/perk_overlay.ts` (new).
- **Source:** gdd §3 + §10 Tier 2.

### 10 · Wound display (hero card + Barracks)

- **What:** Show wounds on hero cards (icon + count) and a full breakdown in the Barracks detail view. Pairs with Cluster A task 5.
- **Why:** Wounds need to be visible everywhere a hero is shown so the player can plan around them.
- **Tier:** 2
- **Acceptance:**
  - Hero-card icon shows wound count when > 0.
  - Barracks hero detail lists each active wound with its stat deltas.
- **Touches:** `src/ui/hero_card.ts`, `src/scenes/barracks_scene.ts`.
- **Source:** gdd §7 + §10 Tier 2.

### 11 · Elite node visual marker

- **What:** Distinguish elite nodes from regular combat nodes in the dungeon scene's icon row (e.g., 💀 vs ⚔️ + glow / outline). Pairs with Cluster A task 12.
- **Why:** Player needs to see "harder fight, better loot" before committing — especially at forks.
- **Tier:** 2
- **Acceptance:**
  - Elite nodes render with a distinct icon and colour from regular combat nodes.
- **Touches:** `src/scenes/dungeon_scene.ts`.
- **Source:** gdd §4 + §10 Tier 2.

### 12 · "Lost" hero handling in scenes

- **What:** When a hero is "Lost" mid-run (per Cluster A task 17), surface it visibly: tombstone in the party UI for the remainder of the run; cashout / wipe summary lists Fallen and Lost separately ("X was Lost" vs "X Fell").
- **Why:** Without visible feedback, the design distinction between Fallen and Lost is invisible.
- **Tier:** 2
- **Acceptance:**
  - Party UI shows a tombstone slot for Lost heroes.
  - Cashout / wipe summary differentiates Fallen and Lost in the death list.
- **Touches:** `src/scenes/dungeon_scene.ts`, `src/scenes/camp_screen_scene.ts`, summary widget.
- **Source:** gdd §8 + §10 Tier 2.

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
