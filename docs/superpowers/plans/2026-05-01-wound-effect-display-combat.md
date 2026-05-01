# Wound-Effect Display in Combat HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a `🩸 N` badge directly below the hero's nameplate in combat for every hero with `hero.wounds.length > 0`, color `#ff6666`, matching the HeroCard convention.

**Architecture:** Single-file additive change in `src/render/combat_actor.ts`. Three new layout constants (`WOUND_BELOW_NAME`, `WOUND_FONT`, `WOUND_COLOR`) parallel to the modifier constants shipped in Cluster B · 13. A new render block in the constructor — guarded on `init.kind === 'hero' && init.hero.wounds.length > 0` — inserted at the same point as the enemy modifier render. No data plumbing: `HeroActorInit.hero` already carries the wound list; no scene-side, combat-state, or playback changes.

**Tech Stack:** TypeScript, Phaser 3. UI/render-only; no unit tests (Phaser convention; matches the floor-modifier visibility, wound-display, hospital, camp-node-UI tasks).

**Spec:** `docs/superpowers/specs/2026-05-01-wound-effect-display-combat-design.md`. Read before starting.

---

## Task 1: Render `🩸 N` badge below hero nameplate

Single task, single file. The render block sits at the same insertion point in the `CombatActor` constructor as the enemy modifier block (immediately after `this.add(this.nameText)`, before `this.hpBarBg = …`), gated on the hero branch with a wounds-non-empty check.

**Files:**
- Modify: `src/render/combat_actor.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass (1321 as of the prior task). Note the count for the post-change comparison.

- [ ] **Step 1.2: Add the three new constants in `combat_actor.ts`**

Open `src/render/combat_actor.ts`. Find the existing constant block where `MODIFIER_BELOW_NAME = 10` lives (just below `NAME_BELOW_FEET = 24`). Add the three wound constants directly after the `MODIFIER_*` group:

```ts
const WOUND_BELOW_NAME = 10;
const WOUND_FONT = '8px';
const WOUND_COLOR = '#ff6666';
```

The full layout block should now read:

```ts
const FLOOR_Y = 24;
const HPBAR_BELOW_FEET = 6;
const HPTEXT_BELOW_FEET = 14;
const NAME_BELOW_FEET = 24;
const MODIFIER_BELOW_NAME = 10;
const MODIFIER_FONT = '8px';
const MODIFIER_COLOR = '#ffaa44';
const WOUND_BELOW_NAME = 10;
const WOUND_FONT = '8px';
const WOUND_COLOR = '#ff6666';
const STATUS_ABOVE_HEAD = 10;
```

No new import is needed — `Hero` is already imported (and `init.hero.wounds` is a `readonly Wound[]` already accessible through the existing typing).

- [ ] **Step 1.3: Insert the wound badge render block in the constructor**

Find the existing modifier render block in the `CombatActor` constructor (the `if (init.kind === 'enemy' && init.modifierIds && …)` block, just after `this.add(this.nameText);` and just before `this.hpBarBg = scene.add.rectangle(...)`). Add the hero wound block **immediately after** the modifier block, before `this.hpBarBg = …`:

```ts
    if (init.kind === 'enemy' && init.modifierIds && init.modifierIds.length > 0) {
      const modifierY = nameY + MODIFIER_BELOW_NAME;
      const label = init.modifierIds.map(id => MODIFIERS[id].name).join(', ');
      const modifierText = scene.add
        .text(0, modifierY, label, {
          fontFamily: 'monospace',
          fontSize: MODIFIER_FONT,
          color: MODIFIER_COLOR,
        })
        .setOrigin(0.5);
      this.add(modifierText);
    }

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

    this.hpBarBg = scene.add.rectangle(0, hpBarY, HP_BAR_W, HP_BAR_H, 0x333333);
```

The local `nameY` is already defined a few lines above (shared with the modifier block). The text is added to `this` (the `CombatActor` container) so the badge follows lunge / move / collapse animations.

- [ ] **Step 1.4: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green / build succeeds. Test count unchanged from the baseline captured in Step 1.1.

- [ ] **Step 1.5: Commit**

```bash
git add src/render/combat_actor.ts
git commit -m "feat(combat): show wound count below hero nameplate"
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Single task landed in 1 commit** with green tests + tsc + build.
- [ ] **No `phaser` imports outside `src/scenes/`, `src/ui/`, `src/render/`, `src/main.ts`** (unchanged from baseline — `combat_actor.ts` already imports Phaser; no new firewall crossings).
- [ ] **`combat/types.ts` untouched** — wound count is read from `init.hero.wounds` directly; resolver and combat state are not involved.
- [ ] **`src/scenes/combat_scene.ts` untouched** — `HeroActorInit.hero` was already populated by `buildActors`; no plumbing change.
- [ ] **Manual play verification:**
  - Combat with no wounded heroes: no `🩸` badge visible. Layout matches current state.
  - Combat with one wounded hero (1 wound): `🩸 1` badge in red below that hero's name; other heroes have no badge.
  - Combat with multi-wound hero (e.g. 2–3 wounds carried in from a previous run): `🩸 N` matches `wounds.length`.
  - Lunge / move / collapse animations: the badge rides with the actor.
  - Mid-fight hero death: actor collapses; the badge fades with the container.
  - Mid-fight `wound_inflicted` event (heavy hit / crit on a hero, ~25% chance per `WOUND_CHANCE_PERCENT`): the existing `"WoundName!"` floating text + log line still fire; the badge count does NOT increment (intentional — the wound only realizes onto the Hero post-fight via `run_state.ts:429`, and doesn't bite stats this fight).
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 15 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +0 (UI/render convention).
