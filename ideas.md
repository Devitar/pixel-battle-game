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

### Heroes shuffle toward preferred slots

- **Pitch:** Add `preferredSlots` to hero classes (Knight `[1, 2]`, Archer `[2, 3]`, Priest `[2, 3]`, etc.) and have the engine prefer shuffling toward them when a hero is at a non-preferred slot, even if a low-priority self-buff is available.
- **Why:** Currently a Knight dragged into slot 3 just casts Bulwark/Taunt forever — `shield_bash` and `knight_slash` require slot 1–2, so they're skipped, and the engine falls back to self-buffs. Visually the tank never moves to the front, which contradicts the "tank up front" mental model the picker labels imply ("SLOT 1 — FRONT"). Same kind of dead-locked-out-of-role pattern affects Archer at slot 1 (only `archer_shoot` is castable; flare/piercing/volley all want 2–3) and Priest at slot 1 (only `priest_strike`; mend/bless/smite want 2–3).
- **Open questions:**
  - Engine rule shape: a "preferred-slot bias" in `pickAbility` (skip low-priority abilities at non-preferred slots), or just a stricter `canCastFrom` on Knight's self-buffs (force the engine into the existing shuffle path), or a new explicit "shuffle-to-preferred" priority?
  - Per-class data: do all Tier 1 classes get `preferredSlots`, or only ones that should shuffle?
  - Tier 2 interaction: this rule probably wants to interact with `taunting` (taunt should override slot preference for the targeted enemy).
- **Status:** seed. Surfaced during task 17 smoke testing — combat scene was correctly animating engine output; engine just didn't produce shuffle events for heroes in non-preferred slots.

