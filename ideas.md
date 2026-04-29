# Ideas

Rough design ideas that haven't been fleshed out yet. Capture them here, talk through them, then either promote to [`TODO.md`](TODO.md) or leave parked. Non-trivial ideas should go through the `brainstorming` skill before becoming a TODO.

## Format

One section per idea. A sentence is fine for seeds; a paragraph or two for more developed thoughts.

```markdown
### Short idea title

- **Pitch:** one-line description of the idea
- **Why:** what it'd solve, enable, or make more fun
- **Open questions:** what we'd need to decide before committing
- **Status:** seed / discussed / ready-to-promote / parked
```

---

<!-- Add ideas below this line. Newest at the top. -->

### Archer same-family weapon flexibility

- **Pitch:** Archer's preferred is bow (only ranged weapon). With the gear-modifies-abilities rule landing as 3 families (melee/ranged/magic), Archer has no same-family alternative — they only ever hit "preferred" or "wholly wrong" bands. Other classes get a secondary playstyle via swap; Archer doesn't.
- **Why:** Closes the asymmetry. Either by adding a second ranged weapon type (crossbow, sling, throwing-knives) or by treating Archer as a special hybrid (bow + any-melee = own swap mapping). Without this, Archer feels narrower than other classes once the swap rule ships.
- **Open questions:**
  - **Direction A — second ranged weapon.** Adds a `WeaponType` ('crossbow' or 'sling'), a base item, sprite, drop entry. Pure additive content. Archer + crossbow → same-family swap. Probably the cleanest path; sets up future Hunter class (post-launch) too.
  - **Direction B — Archer-as-hybrid special case.** Archer + any melee = "ranged-melee hybrid" with its own swap mapping. Asymmetric class rule that doesn't generalize.
  - Either way: what's the swap ability? Probably something like "Quick Shot" (single-target lighter version) replacing Piercing Shot.
- **Status:** seed. Surfaced during gear-modifies-abilities brainstorm (2026-04-27). Deferred to post-launch / Tier 3 dungeon content pass.

### Heroes shuffle toward preferred slots

- **Pitch:** Add `preferredSlots` to hero classes (Knight `[1, 2]`, Archer `[2, 3]`, Priest `[2, 3]`, etc.) and have the engine prefer shuffling toward them when a hero is at a non-preferred slot, even if a low-priority self-buff is available.
- **Why:** Currently a Knight dragged into slot 3 just casts Bulwark/Taunt forever — `shield_bash` and `knight_slash` require slot 1–2, so they're skipped, and the engine falls back to self-buffs. Visually the tank never moves to the front, which contradicts the "tank up front" mental model the picker labels imply ("SLOT 1 — FRONT"). Same kind of dead-locked-out-of-role pattern affects Archer at slot 1 (only `archer_shoot` is castable; flare/piercing/volley all want 2–3) and Priest at slot 1 (only `priest_strike`; mend/bless/smite want 2–3).
- **Open questions:**
  - Engine rule shape: a "preferred-slot bias" in `pickAbility` (skip low-priority abilities at non-preferred slots), or just a stricter `canCastFrom` on Knight's self-buffs (force the engine into the existing shuffle path), or a new explicit "shuffle-to-preferred" priority?
  - Per-class data: do all Tier 1 classes get `preferredSlots`, or only ones that should shuffle?
  - Tier 2 interaction: this rule probably wants to interact with `taunting` (taunt should override slot preference for the targeted enemy).
- **Status:** seed. Surfaced during task 17 smoke testing — combat scene was correctly animating engine output; engine just didn't produce shuffle events for heroes in non-preferred slots.

### Adjust the dungeon scene, make travel between rooms more impactful

- The travel between rooms should not be instant, instead it should take some time, and the heroes should bob back and forth in a primitive "walking animation". There should be some sort of mechanical thing to traveling between rooms. Maybe there could be a random % chance every 1/4 step between rooms that a surprise encounter happens whether it's combat, a merchant, a ? room, etc can pop up, similarly to how in pokemon you get random encounters while in tall grass. This chance should be low but it does mean that the dungeon isn't immediately predictable. Heroes should also passively heal (or even take damage, if they're wounded or sick or have some ailment) during the trek between rooms. The goal is to make it so that the entire dungeon isn't just essentially the combat screen. This is also where some charm and personality could be added in the future polish passes where your heroes chatter amongst themselves during this section.

### Rename Noticeboard to Expeditions