# Bugs

Unscoped bug reports captured during testing. When an item is ready, scope it into an actionable [`TODO.md`](TODO.md) entry and remove it from here.

## Format

One section per bug. Keep it terse — this is a triage bin, not a formal tracker.

```markdown
### Short bug title

- **What:** one-line description of the wrong behavior
- **Repro:** minimum steps to see it
- **Expected:** what should happen
- **Seen:** date, commit SHA, browser/resolution if it matters
- **Notes:** screenshots, console output, suspicions (optional)
```

---

<!-- Add bugs below this line. Newest at the top. -->

### Healing abilities have no cooldown — enemy healers stall fights into wipes

- **What:** Cultist's `dark_pact` (heal, `power: 1.0`) is the first entry in its AI priority and has no cooldown, so once any cultist ally is hurt the cultist heals every turn forever. With low player damage output, the fight stalls. The new exhaustion mechanic (`combat.ts`) ramps damage taken on the *player* side only, so eventually the player wipes against an unkillable enemy team. Player's `mend` (Priest) has the same shape and would chain the same way if the player party were configured for it.
- **Repro:** Run a Crypt fight where any encounter contains a Cultist (`skeleton_warrior` + `cultist`, etc.). Watch the cultist heal whichever ally took damage; if you can't out-DPS the heal you stall forever, take exhaustion damage, lose.
- **Expected:** Healing should be a periodic option, not a per-turn default. Most ARPG/auto-battler designs put heals on a 2–4 turn cooldown so combat has windows of pressure.
- **Seen:** 2026-04-25, branch `development`, during task 18 (camp_screen) smoke testing.
- **Notes:** Currently mitigated only for the smoke test by flipping `cultist.aiPriority` to `['dark_bolt', 'dark_pact']` so the cultist only heals when bolt has no target (i.e. fight is already over). The proper fix is a cooldown field on `Ability` + per-combatant per-ability cooldown tracking on `CombatState` + an AI-priority loop that skips abilities on cooldown. Touches `data/types.ts`, `data/abilities.ts`, `combat/types.ts`, `combat/ability_priority.ts`, `combat/combat.ts`, plus tests. Worth a dedicated brainstorm since it also has to apply symmetrically to player heals (Mend) and probably to other "spam-once" effects (Bless, Taunt, Dark Pact).

### Archer never casts Volley

- **What:** Player archer almost never fires `volley` (the AoE ability). The archer's AI priority is `['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot']`, but `flare_arrow` always finds a non-marked target (cycling through the enemy formation as marks expire), and `piercing_shot` always finds a back-rank enemy when the formation has slot 3-4 occupants — so `volley` is reachable only as the third-priority fallback that almost never triggers. If the archer is placed in slot 1, the situation is worse: only `archer_shoot` is castable from slot 1 (`canCastFrom: [1, 2, 3]`), so the player sees an "archer that only ever shoots the front enemy."
- **Repro:** Run a Crypt fight with the archer at slot 2 or 3 against a 4-enemy formation. Watch — flare_arrow + piercing_shot dominate; volley is rare-to-never. Or place the archer at slot 1 and watch them only fire archer_shoot.
- **Expected:** Volley should be a meaningful part of the archer's kit. Probably AI should prefer Volley when 2+ enemies are alive and at decent HP; it should not be a fallback after every single-target option.
- **Seen:** 2026-04-25, branch `development`, during task 18 (camp_screen) smoke testing.
- **Notes:** Could be addressed via an "AI hint" on each ability (`preferWhen: { kind: 'enemiesAlive', min: 2 }`-style predicate) or by reordering priority. The slot-1 case is partially WAI (archer at slot 1 is bad positioning) but reads as "the kit is broken" — Tier 2 may want a "minimum slot" affordance on the formation picker, or class-tagged slot warnings. Related but separate from the cooldown bug above.
