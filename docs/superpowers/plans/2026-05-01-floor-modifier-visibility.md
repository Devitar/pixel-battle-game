# Floor-Modifier Visibility in Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each enemy's active floor modifiers (`armored`, `venomous`, `enraged`) as a single comma-joined orange line directly below the enemy's name in the combat scene, so players can see which enemies carry modifier effects.

**Architecture:** Single task spanning two files. `EnemyActorInit` gains an optional `modifierIds` field; `CombatActor` renders a static text line below the existing name when the field is present and non-empty. `CombatScene.buildActors` is updated to thread the encounter through and pair each enemy combatant `e${i}` with `encounter.enemies[i].modifierIds`. No combat-core type changes; modifier IDs stay display-only.

**Tech Stack:** TypeScript, Phaser 3. UI/scene-only; no unit tests (Phaser convention; matches the wound-display, hospital, camp-node-UI, lost-hero-rendering tasks).

**Spec:** `docs/superpowers/specs/2026-05-01-floor-modifier-visibility-design.md`. Read before starting.

---

## Task 1: Render modifier label below enemy name

Touches both `combat_actor.ts` (the new render block + field on `EnemyActorInit`) and `combat_scene.ts` (forwards the modifier list from the encounter into the actor init). The two changes are tightly coupled — adding the `EnemyActorInit` field without a caller leaves a dead field, and updating the scene without the field is a type error — so they ship together in one commit.

**Files:**
- Modify: `src/render/combat_actor.ts`
- Modify: `src/scenes/combat_scene.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass. Note the test count for the post-change comparison.

- [ ] **Step 1.2: Add the `MODIFIERS` import and constants in `combat_actor.ts`**

Open `src/render/combat_actor.ts`. Add the import alongside the other `../data/...` imports near the top of the file:

```ts
import { MODIFIERS, type ModifierId } from '../data/modifiers';
```

Find the existing layout constant block (around line 49, the `FLOOR_Y = 24` neighbourhood). Add three new constants directly below `NAME_BELOW_FEET = 24`:

```ts
const MODIFIER_BELOW_NAME = 10;
const MODIFIER_FONT = '8px';
const MODIFIER_COLOR = '#ffaa44';
```

The block should now read:

```ts
const FLOOR_Y = 24;
const HPBAR_BELOW_FEET = 6;
const HPTEXT_BELOW_FEET = 14;
const NAME_BELOW_FEET = 24;
const MODIFIER_BELOW_NAME = 10;
const MODIFIER_FONT = '8px';
const MODIFIER_COLOR = '#ffaa44';
const STATUS_ABOVE_HEAD = 10;
```

- [ ] **Step 1.3: Add `modifierIds` field to `EnemyActorInit`**

In the same file, find the `EnemyActorInit` interface (around line 70). Add the optional field at the end of the interface body, after `bodyScale?: number;`:

```ts
export interface EnemyActorInit {
  kind: 'enemy';
  combatantId: CombatantId;
  displayName: string;
  enemyId: EnemyId;
  currentHp: number;
  maxHp: number;
  bodyScale?: number;
  modifierIds?: readonly ModifierId[];
}
```

- [ ] **Step 1.4: Render the modifier label in the `CombatActor` constructor**

In the same file, find the `CombatActor` constructor block where `this.nameText` is added to the container (around line 141, the `this.add(this.nameText);` line). Insert the new render block **immediately after** that line, before the `this.hpBarBg = ...` line:

```ts
    this.add(this.nameText);

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

    this.hpBarBg = scene.add.rectangle(0, hpBarY, HP_BAR_W, HP_BAR_H, 0x333333);
```

The local `nameY` is already defined a few lines above; the new block references it directly. The text is added to `this` (the `CombatActor` container) so it follows lunge / move / collapse animations. No new field on the class — the label is a static one-shot.

- [ ] **Step 1.5: Add the `Encounter` import to `combat_scene.ts`**

Open `src/scenes/combat_scene.ts`. Add the type import alongside the other `../dungeon/...` / `../run/...` imports near the top of the file:

```ts
import type { Encounter } from '../dungeon/node';
```

- [ ] **Step 1.6: Update `buildActors` to accept and forward the encounter**

Find `buildActors` (around line 176). Change its signature to accept the encounter and rewrite the loop body to thread `placement.modifierIds` into the enemy actor init. Replace the entire `buildActors` method with:

```ts
  private buildActors(
    combatState: CombatState,
    run: RunState,
    displayNames: Map<CombatantId, string>,
    encounter: Encounter,
  ): void {
    let enemyIdx = 0;
    for (const c of combatState.combatants) {
      const x = c.side === 'player' ? PARTY_X[c.slot] : ENEMY_X[c.slot];
      const displayName = displayNames.get(c.id) ?? c.id;
      let actor: CombatActor;
      if (c.side === 'player') {
        const heroIdx = parseInt(c.id.slice(1), 10);
        const hero: Hero = run.party[heroIdx];
        actor = new CombatActor(this, x, ROW_Y, {
          kind: 'hero',
          combatantId: c.id,
          displayName,
          hero,
          currentHp: c.currentHp,
          maxHp: c.maxHp,
        });
      } else {
        const enemyId = c.enemyId!;
        const isBoss = ENEMIES[enemyId].role === 'boss';
        const visual = ENEMY_VISUALS[enemyId];
        const bodyScale = visual.bodyScale ?? (isBoss ? BOSS_BODY_SCALE : 3);
        const placement = encounter.enemies[enemyIdx++];
        actor = new CombatActor(this, x, ROW_Y, {
          kind: 'enemy',
          combatantId: c.id,
          displayName,
          enemyId,
          currentHp: c.currentHp,
          maxHp: c.maxHp,
          bodyScale,
          ...(placement.modifierIds !== undefined ? { modifierIds: placement.modifierIds } : {}),
        });
      }
      this.actors.set(c.id, actor);
    }
  }
```

The pairing is safe: `buildCombatState` constructs enemy combatants in the same order as `encounter.enemies`, assigning `e${i}` IDs by the same index. The party heroes precede them in `combatState.combatants`, so `enemyIdx` only increments inside the enemy branch.

- [ ] **Step 1.7: Update the call site in `create()` to pass `node.encounter`**

In the same file, find the call to `buildActors` inside `create()` (around line 74). It currently reads:

```ts
    this.buildActors(combatState, run, displayNames);
```

After the existing `if (node.type === 'shop' || node.type === 'camp' || node.type === 'event') { ... return; }` guard, `node.type` narrows to `'combat' | 'elite' | 'boss'` — all three carry `encounter` per `dungeon/node.ts`. Change the call to:

```ts
    this.buildActors(combatState, run, displayNames, node.encounter);
```

- [ ] **Step 1.8: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green / build succeeds. Test count unchanged from the baseline captured in Step 1.1.

- [ ] **Step 1.9: Commit**

```bash
git add src/render/combat_actor.ts src/scenes/combat_scene.ts
git commit -m "feat(combat): show floor modifiers below enemy nameplate"
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Single task landed in 1 commit** with green tests + tsc + build.
- [ ] **No `phaser` imports outside `src/scenes/`, `src/ui/`, `src/render/`, `src/main.ts`** (unchanged from baseline — `combat_actor.ts` already imports Phaser; `data/modifiers.ts` does not and stays that way).
- [ ] **`combat/types.ts` untouched** — modifier IDs stay display-only; the resolver still reads only the unpacked passive fields (`venomousDamage`, `enragedThreshold`, etc.).
- [ ] **Manual play verification:**
  - Floor-1 combat (no modifiers rolled): no orange line appears below any enemy name. Layout matches current state.
  - Floor-2 / floor-3 combat with modifiers rolled: each affected enemy shows the orange label `Armored`, `Venomous`, `Enraged`, or comma-joined combinations.
  - Multi-modifier enemy: label reads e.g. `Armored, Venomous` in the order the IDs appear in the placement.
  - Boss combat: no orange line on the boss (boss placements never carry modifiers per Cluster A · 12).
  - Lunge / move / collapse animations: the orange label rides with the actor (added to the actor container, not the scene root).
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 13 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +0 (UI/scene convention).
