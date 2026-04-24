# Pixel Battle — Game Design

A browser-based pixel-art roguelike auto-battler. You run a camp of heroes, form a three-hero party, and send them into tiered dungeons. Combat is ranked, position-based, and auto-resolved; the player's hand is in **setup and decision-making**, not execution. Runs end when the player cashes out with their loot or wipes. The dungeon scales forever, and death is permanent.

Tonal reference: *Darkest Dungeon*, side-scrolling.

---

## 1 · Core loop

A run is one expedition from camp into a dungeon and back.

1. **At camp.** Pick 3 heroes from your roster, arrange their formation (slots 1 / 2 / 3), pick a dungeon from the noticeboard.
2. **Descend.** The party walks right through a floor, passing combat / elite / shop / event / camp nodes. Occasional forks let you choose the next node.
3. **Boss.** Every floor ends in a boss.
4. **Camp screen.** Post-boss, you see the pack (unbanked loot), the party's condition, and two buttons: **Leave** or **Press On**.
5. **Repeat** until cashout or wipe.
6. **Back at camp.** Spend banked gold on upgrades, replace dead heroes, gear up survivors, pick the next run.

**Emotional beat shape.** Small decisions every ~5 min (fork choices), medium decisions every ~10–15 min (camp screen: leave or press on?), big decisions every run (roster, dungeon, formation).

**Session target.** 25–45 min at early tiers; 60–90 min at late tiers. Every cash-out is a natural quit point.

---

## 2 · Combat

Darkest Dungeon–style ranked combat. 3 heroes vs. 3–4 enemies.

### Positions

- Party occupies slots 1 / 2 / 3 (front → back).
- Enemies occupy slots 1 / 2 / 3 / 4 (their front → their back).
- Slot matters mechanically. Abilities care about *where their caster is* and *which slots they target*.

### Turn order

Each combatant acts once per round. Order is determined by a **Speed** stat (Speed ± small variance, sort descending). Ties: player side wins.

### Actions

Combat is auto-resolved. On a hero's turn the game picks one of their abilities using a class-specific priority list. Each ability declares:

- **Can cast from slots** — e.g., an Archer's Piercing Shot only fires from slots 2–3.
- **Targets slots** — e.g., enemies 1–2, "furthest enemy," "all."
- **Effect** — damage, heal, shove, pull, swap, buff, debuff, stun.

Abilities can **shove** (push target back a slot), **pull** (yank forward a slot), or **swap** positions. A hero whose abilities can't cast from their current slot takes a default "shuffle" action to reposition. Lineup disruption is a real threat, not just HP damage.

### Player role during combat

None directly — you watch. Combat resolves in 15–45 s per fight at a readable pace, with a fast-forward toggle. The fight is a *readout* of the choices made at setup.

### Stats

Seven stats, readable at a glance:

| Stat | What it does |
|---|---|
| **HP** | Health. Persists between fights (heals only at camp nodes or via items). |
| **Speed** | Turn order; higher acts first. |
| **Attack** | Scales weapon/physical abilities. |
| **Mind** | Scales magical abilities — healing amount, spell damage, buff/debuff strength. |
| **Defense** | Reduces all incoming damage. |
| **Crit** | Chance to double damage on an attack. |
| **Dodge** | Flat chance to miss an incoming attack entirely. |

Elemental resistances are out of scope for v1; if we want magical resistance flavor later it lives on specific gear, not as a second defensive stat.

---

## 3 · Heroes

### Classes

A hand-crafted roster, each with a clear role, position preference, and signature moves. **MVP ships 6; 2 more are unlocked.**

| # | Class | Role | Preferred slot | Weapon | Primary stat | Signature moves |
|---|---|---|---|---|---|---|
| 1 | **Knight** | Tank | 1 | Sword + Shield | Attack / Defense | Shield Bash (stun enemy 1), Taunt, Bulwark (+Defense) |
| 2 | **Barbarian** | Bruiser | 1–2 | Axe / Greatsword | Attack | Cleave (enemies 1–2), Rampage (scaling damage, drops Defense), Bloodthirst (heal on kill) |
| 3 | **Rogue** | Striker | 2 | Daggers | Attack / Crit | Backstab (teleport + hit enemy rear, high crit), Vanish (move to slot 3, +Dodge), Poison Strike (DoT) |
| 4 | **Priest** | Healer | 2–3 | Holy symbol | Mind | Mend (heal ally), Smite (radiant; bonus vs undead), Bless (ally +Attack next turn) |
| 5 | **Archer** | Ranged DPS | 3 | Bow | Attack / Speed | Piercing Shot (enemy 3–4), Volley (all enemies, low dmg), Flare Arrow (marks a target for bonus damage) |
| 6 | **Mage** | Caster | 3 | Staff / Wand | Mind | Firebolt (single target, enemy 3–4), Frost Nova (AoE + slow), Arc Shock (chance-stun) |
| 7 | **Paladin** *(unlock)* | Hybrid frontline | 1–2 | Sword + Holy symbol | Attack / Mind | Smite, Lay on Hands (heal), Consecrate (party HoT). Unlocks: first Crypt clear. |
| 8 | **Hunter** *(unlock)* | Ranged + beast | 3 | Bow / Spear | Attack | Bonds with a pet that occupies slot 4 and acts on its own priority. Unlocks: first Warren clear. |

Each class has 3–4 abilities total plus a universal basic Attack that works with any weapon.

### Gear modifies abilities

Each class has a preferred weapon type. Gear interacts with the kit in three bands:

1. **Preferred weapon equipped** — the full kit is available.
2. **Off-preferred weapon in the same family** — kit is available but one ability is swapped (e.g., Knight + Greataxe: Shield Bash becomes Cleaving Swing; no shield means no shield-based abilities).
3. **Wholly wrong weapon** — only the universal basic Attack is available. A fallback that feels clearly sub-optimal.

This means a single class supports 3–4 playstyles via equipment without the cost of authoring 3–4 classes.

### Paperdoll & cosmetics

Heroes are rendered via the existing paperdoll system (body + legs + feet + outfit + hair + hat + shield + weapon, layered in that order). Equipment drives both **look** and **stats**. Recruitment rolls a random race/gender body sprite from the catalog (4 races × 2 genders for players).

### Recruitment roll

At the Tavern, candidates show:

- **Class** — random from the unlocked pool.
- **Body sprite** — random race/gender.
- **Starter weapon** — class-appropriate, basic tier.
- **Starter outfit** — random color so heroes look distinct.
- **Random name** from a name list (flavor only).
- **One Trait** — a small modifier: *Stout (+10% HP)*, *Quick (+1 Speed)*, *Cowardly (−1 Speed when in slot 1)*, etc. ~12 traits in MVP. Traits give heroes individual identity without a full procgen system.

Knights ship with a starter shield; others don't.

### Leveling

Heroes gain XP from surviving combat. Levels grant small stat bumps (+HP, +primary stat). At **level 5** and **level 10** a hero unlocks a choice of two minor perks ("Precise: +5% Crit" / "Hardy: +10% HP"). Simple, readable, gives rookies a visible trajectory.

### Roster size

Camp starts at **12 slots**. Barracks upgrades bring it to 16 / 20. Small enough that losses matter; large enough that a wipe doesn't end the save.

---

## 4 · Dungeons & floors

### Dungeons (tiered zones)

Each dungeon is a themed tier. Beating the last boss of dungeon N unlocks dungeon N+1.

| # | Dungeon | Tier | Theme | Floor length | Enemy pool |
|---|---|---|---|---|---|
| 1 | **The Crypt** | 1 | Undead ruins | 3 nodes + boss | Skeletons, ghouls, cultists |
| 2 | **The Sunken Keep** | 2 | Flooded castle | 4 nodes + boss | Drowned knights, sea-beasts |
| 3 | **The Warren** | 3 | Beastmen caves | 5 nodes + boss | Orcs, gnolls, trolls |
| 4 | **The Abyss** | 4 | Chaos / void | 6 nodes + boss | Eldritch, demons |

Higher tier = more nodes per floor, steeper scaling, richer loot pool. MVP ships with **The Crypt**; others come in Tier 3 scope.

### Node types

Icons appear as landmarks ahead; the player chooses at forks.

- **⚔️ Combat** — standard fight from the dungeon's pool.
- **💀 Elite** — tougher fight, guaranteed rare drop.
- **🛒 Shop** — spend pack gold on gear, potions, occasional services.
- **🏕️ Camp node** — mid-floor rest. Heal some HP, treat one Wound, sharpen weapons for a small temp buff. **Not** the same as the post-boss Camp Screen — this one cannot cash out.
- **❓ Event** — narrative card with a 2-option choice.
- **👑 Boss** — always at the end of a floor.

### Forks

Every floor has 1–2 forks. At a fork the player sees *the next node type* on each branch but not what follows. So: "Shop now or Elite now?" with a blind path after.

### Scaling within a dungeon

Floor 1 and floor 20 of The Crypt draw the same content pool but scaled: flat % HP/damage bumps per floor, plus **enemy modifiers** introduced at milestone floors (5, 10, 15 …) — "Armored," "Venomous," "Enraged," etc. This makes the "infinite dungeon" meaningful without authoring 50 floors of unique content.

### Run end

Three ways a run ends:

1. **Cash out** at a post-boss camp screen. Pack banks to vault. Survivors come home.
2. **Wipe.** Entire party dies in a fight. Pack is lost. All dead heroes are permadead.
3. **Abandon** at a post-boss camp screen without having beaten a boss this run. No cashout reward — a pure "give up" button that should feel bad.

---

## 5 · Pre-run gameplay (difficulty selection)

Before descending, the player picks their dungeon from the Noticeboard. Each dungeon shows its **tier**, expected floor length, and a preview of the signature enemies and loot. Tier directly sets:

- Nodes per floor (short → long).
- Scaling rate (gentle → steep).
- Loot quality (common-weighted → legendary-weighted).
- Gold multiplier across all payouts.

This lets new players ease in on tier 1 and gives veterans a visible ladder to climb. Tier choice is the player's primary difficulty dial; the "infinite scaling dungeon" then handles the fine-grained stretch *within* a chosen tier.

---

## 6 · Camp (the hub)

Camp is presented as a side-scrolling village at the same pixel scale as combat. Buildings are clickable.

### Buildings

| Building | Purpose | Upgrade path |
|---|---|---|
| **Tavern** | Recruitment. Shows 3 rolling candidates with class / race / trait visible. Reroll costs gold. Hiring costs gold. | L1: 3 candidates / L2: 4 / L3: 5 + better trait odds |
| **Barracks** | Roster management. Inspect stats, equip gear from stash, set formation defaults, retire heroes (frees a slot, no refund). | L1: 12 slots / L2: 16 / L3: 20 |
| **Blacksmith** | Upgrade gear tiers (common → uncommon → rare). Costs gold + materials (drop from elites / bosses). | L1: common→uncommon / L2: +uncommon→rare / L3: +rare→epic |
| **Hospital** | Heal Wounds. Gold per wound, or time-based (wounds clear after N runs for free). | L1: 1 wound/run cheap / L2: 2 / L3: 3 + faster time-heal |
| **Noticeboard** | Pick the next dungeon. Not upgraded directly — unlocks appear here as bosses are beaten. | n/a |
| **Chapel** *(unlock)* | Remove a Trait from a hero. Expensive. Unlocks after first Sunken Keep clear. | L1 only |
| **Training Grounds** *(unlock)* | Benched heroes passively gain XP from every completed run (active or not). XP gain is pro-rated against what an active hero of the same level would have earned on that run, so deep runs train better. Gained on both cashout and wipe; wipes pay less. | L1: 2 trainee slots, 25% pro-rated XP / L2: 3 slots, 40% / L3: 4 slots, 55%. Unlocks: first Sunken Keep clear. |

### Typical camp visit

1. Land at camp with banked gold, an unequipped-gear stash, and survivors (some wounded).
2. Hospital & Barracks usually need attention first.
3. Spend at Blacksmith on gear you care about. Re-slot equipment off of dead heroes.
4. Stop at the Tavern if short-handed or fishing for a good trait.
5. Noticeboard → dungeon → 3-hero pick → formation → go.

---

## 7 · Risk / reward economy

### Two gold pools

- **Vault** (at camp). Safe. Spent on Tavern, Barracks, Blacksmith, Hospital, upgrades.
- **Pack** (during a run). At risk. Earned from kills, chests, events, and selling excess gear. Banks to Vault on cashout. Lost on wipe.

### Gear flow

- Gear picked up during a run enters the **pack**.
- **Equipped** gear is safe as long as the hero holding it survives (see §8 for the exception).
- **Unequipped** gear in the pack acts like gold — lost on wipe, banked to the Stash on cashout.
- This creates a real mid-floor decision: *equip this rare sword on my Knight now so it can't be lost, or keep it in the pack so I don't overwrite his current one?* Both answers are valid.

### Gear rarity tiers

Common → Uncommon → Rare → Epic → Legendary. Each tier is a meaningful stat bump; rare and up often add a property (*Rare Sword of Burning: +5 Attack, burns for 2 turns*). Higher tiers are gated by dungeon depth and Blacksmith level.

### Shops (inside runs)

Prices should feel pricey. Common potion ≈ 70g; rare weapon ≈ 200–400g. The tension: *empty the pack to buy this rare staff for my Priest, or hold the gold in case we need to press on?*

### Tier-scaled payouts

Dungeon tier is a multiplier on everything — gold drops, rarity weights, shop stock quality. Difficulty-to-reward is visible at run selection.

### Events (❓ nodes)

Pure flavor gambles, drawn from a shared deck with dungeon-specific cards sprinkled in. A typical card offers a 2-option choice with asymmetric upside / downside. Examples:

- *A hooded stranger offers to swap your party's HP for gold.* `[Lose 20% HP across party, gain 150g]` / `[Decline]`
- *A sinkhole opens under the party. One hero falls in and is Lost.* `[Pick which]`
- *A cursed mirror shows one hero their doom.* `[Gaze — that hero is Lost, gain rare item]` / `[Pull them away, party takes 40% HP damage]`

### Wound economy

Every run produces 0–3 Wounds across survivors. Wounds are flat stat debuffs that heal either at the Hospital (gold) or passively over N runs. They're a drip cost — a push to rest or to upgrade Hospital, not a hard wall.

---

## 8 · Death & loss

Two distinct categories of losing a hero:

### Fallen — killed in combat

- If **the rest of the party survives the fight**: the fallen hero's equipped gear transfers into the pack (allies strip the body). The pack is still at risk to a later wipe but the gear is recoverable on cashout.
- If **the party wipes the same fight**: everything on them is lost with everything else in the pack.

### Lost — removed by narrative event or hazard

Non-combat removal — pit trap, kidnapped, cursed into stone, sealed behind a door. The hero is **gone with all their equipped gear**, regardless of whether the party survives.

"Lost" is genuinely worse than "Fallen" and becomes a design lever for event cards and specific hazards. It also makes surviving a hard fight feel earned — *we lost Brenna, but we got her shield back.*

In both cases the hero is removed from the roster permanently.

---

## 9 · Meta-progression

Across runs, progress compounds through four channels:

1. **Roster.** Surviving heroes carry XP, levels, perks, traits, and equipped gear into the next run. The "watch rookies become legends" arc lives here.
2. **Banked Vault gold.** Spent on camp building upgrades.
3. **Gear Stash.** Unequipped gear banked from successful runs, available to re-slot onto any hero.
4. **Milestone unlocks.** Permanent global unlocks triggered by specific firsts:
   - *First Crypt clear* → Paladin class available in the Tavern pool.
   - *First Sunken Keep clear* → Hunter class + Chapel & Training Grounds buildings + Sunken Keep gear tier.
   - *First Warren clear* → Warren gear tier + Tavern reroll cost halved.
   - *First Abyss clear* → Infinity / New Game+ modifier.
   - *First hero reaches Level 10* → Legendary rarity begins appearing.
   - *25 crits* → +5% base Crit across roster.

Milestones are cheap to design and give long-term pull without a skill tree.

---

## 10 · Scope & build order

The design is ambitious. The plan is to prove the loop before building content for it.

### Tier 0 — Already in the repo

Paperdoll rendering, sprite sheet, sprite-name catalog, codegen for layers, explorer scene. Lean on this; do not rebuild it.

### Tier 1 — Vertical slice (proves the core loop)

Minimum viable game that *feels* like the design.

- **Combat scene.** 3v3 ranked combat. 4 stats (HP, Attack, Defense, Speed). Auto-resolved turns with position-aware ability priorities. No Crit / Dodge yet.
- **3 classes.** Knight, Archer, Priest. Covers melee / ranged / support.
- **1 dungeon.** The Crypt: 3 floors, 4 enemy types, 1 boss. Linear (no forks, shops, or events yet).
- **Camp.** Tavern (fixed 3-candidate pool, no reroll), Barracks (12 slots, equip & formation), Noticeboard (Crypt only).
- **Pack system.** Gold-in-pack + post-boss Camp Screen with Leave / Press On.
- **Permadeath.** Fallen category only (gear to pack if survivors).
- **Save / load.**

If this loop isn't fun, nothing built on top of it will save the game. That's the purpose of Tier 1.

### Tier 2 — Feature-complete v1

The texture that makes the game *good* rather than *working*.

- Classes 4–6 (Barbarian, Rogue, Mage).
- Mind, Crit, Dodge — full 7-stat model.
- Wounds + Hospital.
- Blacksmith (gear tier upgrades, common → rare).
- Forks, shops, elite nodes, mid-floor camp nodes.
- Event system + initial deck (~20 cards).
- Gear rarity tiers 1–3, gear-modifies-abilities rule fully in.
- Traits at recruitment.
- Hero leveling + level-5 perks.
- "Lost" hero category + supporting events.
- Scaling milestones within a dungeon (floor 5, 10, 15 modifiers).

### Tier 3 — Post-launch / depth

- Dungeons 2–4 (Sunken Keep, Warren, Abyss).
- Unlockable classes (Paladin, Hunter).
- Training Grounds, Chapel.
- Legendary tier gear, boss-specific drops.
- Milestone-unlock achievements.
- Level-10 perks, trait removal.
- Infinity mode / New Game+ modifier.

---

## 11 · Risk flags

Things that are bigger than they look and should be sized honestly.

- **Auto-battler AI priorities.** Each class needs a small state machine that picks "the right" ability from its kit given current positions and ally/enemy state. This is the single thing that makes combat feel intentional vs. random. Budget real time.
- **UI density.** Camp alone has 5+ sub-panels (Barracks, Tavern, Blacksmith, Hospital, Noticeboard). The post-boss Camp Screen is its own UI. Combat overlays, equipment screen, map screen, event cards — UI is the largest single-scope risk.
- **Balance surface.** 6 classes × 3–4 abilities × gear modifiers × 4 dungeons × scaling curves is a lot of math. Tier 1 is deliberately small (3 classes, 1 dungeon, 4 enemies) so it's tuneable by a small team.
- **Save-state.** Persistent roster + banked vault + camp upgrades + unlock progress + gear stash is real save logic. Don't put it off.

---

## 12 · Glossary

- **Fallen** — hero killed in combat. Gear recoverable if party survives the fight.
- **Lost** — hero removed by event or hazard. Gear always lost with them.
- **Pack** — at-risk gold and unequipped gear carried during a run.
- **Vault** — safe banked gold at camp.
- **Stash** — safe banked unequipped gear at camp.
- **Camp screen** — the post-boss decision screen with Leave / Press On. Not to be confused with the **camp node** (mid-floor rest) or **camp** (the hub village between runs).
- **Wound** — a lasting stat debuff from a hard combat hit, healed at the Hospital or passively over time.
- **Trait** — a small per-hero modifier rolled at recruitment.
