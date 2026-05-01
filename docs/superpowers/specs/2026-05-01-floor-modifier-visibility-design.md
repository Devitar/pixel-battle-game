# Floor-modifier visibility in combat — Design

- **TODO entry:** Cluster B · 13 (Floor-modifier visibility in combat).
- **Tier:** 2.
- **Date:** 2026-05-01.

## 1 · Scope

Render each enemy's active floor modifiers (`armored`, `venomous`, `enraged`) as a single comma-joined orange line directly below the enemy's name in the combat scene. Names come from `MODIFIERS[id].name` so future-added modifiers don't require scene edits. Bosses never roll modifiers (per Cluster A · 12) and naturally render no line.

**Out of scope:**

- "Modifiers in effect: …" status banner at fight start (rejected as duplicative of the per-enemy line).
- Hover/tap tooltip describing each modifier's effect (no tooltip system on combat actors today; defer until one exists).
- Hero-side render (heroes don't carry modifiers).
- Adding `modifierIds` to `Combatant` in `combat/types.ts` (kept off the core type — modifier IDs are display data here; resolver only reads the unpacked passive fields).

## 2 · Data flow

`CombatScene.create()` already calls `currentNode(run)` and narrows the result to a combat/elite/boss node (it returns early on shop/camp/event). The encounter is in scope at the call to `buildActors()`.

Update `buildActors`:

- Accept the encounter as a parameter: `buildActors(combatState, run, displayNames, encounter)`.
- For each enemy combatant `e${i}` (where `i` is its index in `combatState.combatants` after the party), pair with `encounter.enemies[i]` and forward `placement.modifierIds` into the new `EnemyActorInit.modifierIds` field.

The pairing is safe: `buildCombatState` constructs enemy combatants in order from `encounter.enemies`, assigning `e${i}` IDs by the same index. The party heroes precede them in `combatState.combatants`, so the enemy slice starts at `combatState.combatants[run.party.length]`. The implementation iterates only enemy combatants and tracks `enemyIdx` separately (or splits the party/enemy loops); see §4 sample.

## 3 · Render (in `CombatActor`)

`src/render/combat_actor.ts`. Add an optional `modifierIds?: readonly ModifierId[]` field to `EnemyActorInit`. If present and non-empty, build a `Phaser.GameObjects.Text` rendering the joined names below the existing name text.

**Constants** (added near the existing `NAME_BELOW_FEET = 24`):

```ts
const MODIFIER_BELOW_NAME = 10;
const MODIFIER_FONT = '8px';
const MODIFIER_COLOR = '#ffaa44';
```

**Render block** (added in the constructor, after `this.nameText` is added to the container, only when `init.kind === 'enemy'`):

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
```

**Imports needed at the top of the file:**

```ts
import { MODIFIERS, type ModifierId } from '../data/modifiers';
```

**Color choice:** `#ffaa44` (amber-orange). Distinct from white name text, the green/yellow/red HP bar, the `#ffcc66` round-banner amber-yellow, and the existing status-glyph colors (`#ff9944` stunned is the closest neighbour, but glyphs render *above* the head so they don't share visual space).

**Position:** `y = nameY + MODIFIER_BELOW_NAME = (FLOOR_Y + NAME_BELOW_FEET) + 10 = 58`. `setOrigin(0.5)` for center alignment, matching the name.

**Container parenting:** added to `this` (the `CombatActor` container) so the text follows lunge/move/collapse animations. No new field on the class — this is a static label set once at construction; nothing reads or mutates it later.

## 4 · `CombatScene.buildActors` change

Sample of the new loop body (only the enemy branch changes):

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
      // unchanged
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

The caller is updated to thread `node.encounter` through (already in scope after the type-narrow on `node.type`).

**Imports needed at the top of `combat_scene.ts`:**

```ts
import type { Encounter } from '../dungeon/node';
```

## 5 · Files touched

| File | Change |
|---|---|
| `src/render/combat_actor.ts` | Add `modifierIds?: readonly ModifierId[]` to `EnemyActorInit`; render joined-names label below the name text when present and non-empty. New constants `MODIFIER_BELOW_NAME`, `MODIFIER_FONT`, `MODIFIER_COLOR`. New import from `data/modifiers`. |
| `src/scenes/combat_scene.ts` | `buildActors` accepts and reads `encounter.enemies[i].modifierIds`, forwards to the actor init. New import of `Encounter` type. |

No other files touched. No save schema change. No test infrastructure change.

## 6 · Test plan

No unit tests (Phaser scene/UI convention; matches Wound display, Hospital, Camp node UI, Lost-hero rendering tasks). The render logic is a single `MODIFIERS[id].name` lookup + `.join(', ')` — no behavior worth isolating.

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm run build` succeeds.
- `npm test` stays green.

**Manual play verification:**

- Floor-1 combat (no modifiers rolled): no orange line appears below any enemy name. Layout matches current exactly.
- Floor-2 / floor-3 combat with modifiers rolled: each affected enemy shows the orange label; multi-modifier enemies show comma-joined names.
- Boss combat: no orange line on the boss (modifier list is empty/undefined for bosses).
- Lunge / move / collapse animations: the orange label rides with the actor (added to the container).

## 7 · Risk

Low. Pure additive change in two files; no combat-resolution logic touched. Visual regression bounded to the area immediately below the enemy nameplate. The pairing of `e${i}` ↔ `encounter.enemies[i]` reuses the existing implicit contract from `buildCombatState`.

## 8 · Open questions

None at design time.
