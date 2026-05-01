# Wound-effect display in combat HUD — Design

- **TODO entry:** Cluster B · 15 (Wound-effect display in combat HUD).
- **Tier:** 2.
- **Date:** 2026-05-01.

## 1 · Scope

Render a `🩸 N` badge directly below the hero's nameplate in combat for every hero with `hero.wounds.length > 0`. Color `#ff6666` for parity with the HeroCard wound badge. No data plumbing — the hero object already arrives in `HeroActorInit.hero`.

**Out of scope:**

- Hover/tap tooltip listing each wound's stat-effect summary. The combat scene has no hover infrastructure today (`CombatActor` only handles `pointerdown`); adding it for this one badge would mean new tap-target/show-hide/z-order machinery for marginal benefit. Cluster B · 13 shipped without an analogous tooltip on enemy modifiers; same call here. Revisit if playtesting flags confusion or if hover infra arrives for another reason.
- Enemy-side wound badges. Enemies don't carry wounds — only heroes do (the wound system is a hero meta-progression mechanic per gdd §6).
- Suppression for `isDead` in combat. The HeroCard `isDead` check exists for cashout/wipe death-list rendering — a different surface. In combat, every hero entering is alive at construction; mid-fight death is handled by `CombatActor.collapse()` which fades the whole container.
- Adding wound data to `combat/types.ts`. Heroes carry wounds via `HeroActorInit.hero`; the combat resolver already consumes wounds via `applyWoundsToStats` in `buildCombatState`. No core type change needed.

## 2 · Render (in `CombatActor`)

`src/render/combat_actor.ts`. Insert a hero render block at the same point in the constructor as the modifier render (immediately after `this.add(this.nameText)`, before `this.hpBarBg = …`):

```ts
if (init.kind === 'hero' && init.hero.wounds.length > 0) {
  const woundY = nameY + WOUND_BELOW_NAME;
  const woundText = scene.add
    .text(0, woundY, `🩸 ${init.hero.wounds.length}`, {
      fontFamily: 'monospace',
      fontSize: WOUND_FONT,
      color: WOUND_COLOR,
    })
    .setOrigin(0.5);
  this.add(woundText);
}
```

The local `nameY` is already in scope. Text is added to `this` (the `CombatActor` container) so the badge follows lunge / move / collapse animations.

## 3 · Constants

Three new constants, parallel to the modifier constants shipped in Cluster B · 13. Same row, same font, different color. Added to the existing layout-constant block alongside `MODIFIER_BELOW_NAME`:

```ts
const WOUND_BELOW_NAME = 10;
const WOUND_FONT = '8px';
const WOUND_COLOR = '#ff6666';
```

`MODIFIER_*` and `WOUND_*` share values today (`10`, `'8px'`) but communicate distinct concepts, so they stay parallel rather than collapsing into a shared `EXTRA_LINE_*` constant. The file's existing constants follow a "what is it" naming pattern (`HPBAR_BELOW_FEET`, `NAME_BELOW_FEET`); adding `WOUND_BELOW_NAME` matches. If a third "below the name" element ever lands, promote to a shared constant then.

## 4 · Position symmetry

Heroes never carry modifiers; enemies never carry wounds. The `nameY + 10` row on each side is "owned" by whichever signal that side has — clean visual grammar with zero collision risk between the two systems.

## 5 · Non-changes

- `src/combat/types.ts`: untouched.
- `src/data/wounds.ts`: read-only.
- `src/scenes/combat_scene.ts`: untouched. `HeroActorInit.hero` is already populated by `buildActors`; no new field, no new plumbing.
- `src/scenes/combat_playback.ts`: untouched. Wound count is static for the fight as displayed by the badge. Mid-fight `wound_inflicted` events do fire (signaled via floating `"WoundName!"` text + log line in `combat_playback.ts:onWoundInflicted`), but the wound isn't realized onto the `Hero` object until post-combat (`run_state.ts:429`) and doesn't bite stats mid-fight (`combat/effects.ts:138` only pushes the event). The badge therefore accurately represents "wounds whose stat effects are biting this fight" — new wounds inflicted mid-fight will appear on the badge in the *next* fight, which is correct.
- Enemy actor render path: untouched.

## 6 · Sample

For `Greta` with 2 wounds:

```
       [paperdoll]
      ▓▓▓▓▓▓▓▓▓▓        ← hp bar
        14 / 18           ← hp text
         Greta            ← name (white)
          🩸 2            ← new wound badge (#ff6666)
```

## 7 · Files touched

| File | Change |
|---|---|
| `src/render/combat_actor.ts` | Add `WOUND_BELOW_NAME` / `WOUND_FONT` / `WOUND_COLOR` constants; render `🩸 N` badge below the nameplate when `init.kind === 'hero'` and `init.hero.wounds.length > 0`. |

No other files touched. No save schema change. No test infrastructure change.

## 8 · Test plan

No unit tests (Phaser scene/UI convention; matches Cluster B · 13 floor-modifier visibility, wound display on HeroCard/Barracks, hospital, camp-node-UI). The render logic is a `wounds.length` lookup + emoji formatting — no behavior worth isolating.

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm run build` succeeds.
- `npm test` stays green.

**Manual play verification:**

- Combat with no wounded heroes: no `🩸` badges visible. Layout matches current state.
- Combat with one wounded hero (1 wound): `🩸 1` badge in red below that hero's name; other heroes have no badge.
- Combat with multi-wound hero (e.g. 2–3 wounds from a previous run): `🩸 N` matches `wounds.length`.
- Lunge / move / collapse animations: the badge rides with the actor (added to the container).
- Mid-fight hero death: actor collapses; the badge fades with the container as part of `collapse()`.

## 9 · Risk

Low. Pure additive single-file change. No combat-resolution logic touched. No data plumbing. No new infrastructure (no hover/tooltip, no event handling). Visual regression bounded to the area immediately below the hero nameplate.

## 10 · Open questions

None at design time.
