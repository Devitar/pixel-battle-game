# Level-up Perk Picker UI

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster B · 8 — gdd §3 + §10 Tier 2.

## Purpose

Heroes who hit level 5 are flagged `pendingPerk: true` (via the leveling foundation that just shipped — Cluster A · 7), but there's currently no way to pick a perk. The flag accumulates indefinitely; combat doesn't apply any perk effect because `perkId` stays undefined. This task builds the picker overlay that closes the loop: when the player returns to camp with any pending hero, they're shown the perk-choice modal, pick one of two class-specific perks (`CLASS_PERK_PAIRS[hero.classId]`), and the hero receives the chosen `perkId` permanently. HP-effect perks (Resolute, Steadfast — both `+10% HP`) recompute `maxHp` and rescale `currentHp` proportionally; stat-effect perks just write the field and let `getEffectiveStat` apply the effect in combat.

## Dependencies and invariants

**Vocabulary already in place:**
- `Hero.pendingPerk: boolean` and `Hero.perkId?: PerkId` (`src/heroes/hero.ts:23-24`).
- `PERKS: Record<PerkId, PerkDef>` and `CLASS_PERK_PAIRS: Record<ClassId, [PerkId, PerkId]>` (`src/data/perks.ts`).
- `PerkDef` shape (`src/data/types.ts`): `id`, `name`, `description`, `classId`, `statEffects?`, `hpEffect?`. Reuses `TraitStatEffect` / `TraitHpEffect`.
- `computeMaxHp(classBaseHp, trait, equipment)` (`src/heroes/hero.ts:54-75`) bakes class + trait HP into `maxHp` at hero creation.
- `getEffectiveStat` reads `combatant.perkId` and adds `PERKS[id].statEffects` after the trait pass (`src/combat/statuses.ts:28-37`).
- `appState.update(producer)` mutates the SaveFile and persists in one call (`src/scenes/app_state.ts`).
- `CampScene` uses `this.scene.launch(panelKey); this.scene.pause()` to open panels, and listens for `Phaser.Scenes.Events.RESUME` to refresh HUD (`src/scenes/camp_scene.ts:20`).

**Invariants this spec declares:**
- **Auto-overlay on camp focus.** The picker launches automatically whenever camp is created/resumed and any hero has `pendingPerk: true`. The player cannot reach Tavern/Barracks/Noticeboard until the queue is drained.
- **Sequential queue, one hero at a time.** If multiple heroes have `pendingPerk` simultaneously, each gets its own overlay launch — pick → close → camp resumes → next pending hero triggers a fresh launch. No batch view, no carousel.
- **No skip / cancel / close affordance.** The overlay forces the choice. ESC is not handled; no close button rendered. The pendingPerk flag is sticky until the player picks.
- **`perkId` is permanent once set.** No re-pick path in this task. Tier 3 may add a Chapel removal — out of scope.
- **HP-effect perks rescale `currentHp` proportionally.** A Knight at 50% HP picking Resolute keeps the same HP percentage post-pick. Floor at 1 to handle the unlikely `currentHp: 0` edge case (defensive — living heroes should always have ≥1).

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/heroes/hero.ts` | **Modify** | Extend `computeMaxHp` with optional `perk?: PerkDef` parameter; extract `applyHpEffect(value, effect)` helper; add `applyPerk(hero, perkId)` function. |
| `src/heroes/__tests__/hero.test.ts` | **Modify** | Add `describe('applyPerk', ...)` block with 5 cases; extend HP-baking block with one perk-stacking case. |
| `src/scenes/perk_overlay_scene.ts` | **Create** | New `Phaser.Scene` subclass — renders the picker, applies on click, dismisses. ~120 lines. |
| `src/scenes/camp_scene.ts` | **Modify** | Add `maybeLaunchPerkPicker()` called from `create()` and the existing `RESUME` handler. ~10 lines. |
| `src/main.ts` | **Modify** | Register `PerkOverlayScene` in the scene list. |

No changes to `data/perks.ts` (data unchanged), combat code, run state, or save schema.

## Schema changes

None. `Hero.pendingPerk` and `Hero.perkId` already exist; `PerkDef` already declares both effect kinds.

## Behavior

### Trigger flow (`CampScene`)

```ts
// camp_scene.ts (sketched)
create(): void {
  this.buildHud();
  this.buildGround();
  this.buildBuilding('Tavern',      180, 0x664433, 100, 110, 'tavern_panel');
  this.buildBuilding('Barracks',    440, 0x555555, 100, 130, 'barracks_panel');
  this.buildBuilding('Noticeboard', 720, 0x998866,  80,  60, 'noticeboard_panel');
  this.buildDevHints();

  this.events.on(Phaser.Scenes.Events.RESUME, () => {
    this.refreshHud();
    this.maybeLaunchPerkPicker();
  });

  this.input.keyboard?.on('keydown-NINE', () => this.scene.start('main'));
  this.input.keyboard?.on('keydown-ZERO', () => this.scene.start('explorer'));

  this.maybeLaunchPerkPicker();
}

private maybeLaunchPerkPicker(): void {
  const pending = listHeroes(appState.get().roster).find((h) => h.pendingPerk);
  if (!pending) return;
  this.scene.launch('perk_overlay', { heroId: pending.id });
  this.scene.pause();
}
```

The check runs both on initial `create` (covers entering camp from boot or from a finished run) and on every `RESUME` (covers returning from any panel — picker, Tavern, Barracks, Noticeboard, etc.). The queue advances naturally because each picker close emits `RESUME`, which re-runs the check.

### `PerkOverlayScene` lifecycle

```ts
export class PerkOverlayScene extends Phaser.Scene {
  private heroId!: string;

  constructor() { super('perk_overlay'); }

  init(data: { heroId: string }): void {
    this.heroId = data.heroId;
  }

  create(): void {
    const hero = listHeroes(appState.get().roster).find((h) => h.id === this.heroId);
    if (!hero || !hero.pendingPerk) {
      // Defensive — shouldn't happen given camp's gate, but guard against
      // scene-restart edge cases (e.g., perk applied externally between
      // launch and create).
      this.close();
      return;
    }
    this.buildOverlay(hero);
  }

  private buildOverlay(hero: Hero): void {
    // dim, panel, paperdoll, name, class, "Level 5!" text
    // two perk cards from CLASS_PERK_PAIRS[hero.classId]
    // each card is interactive with a click handler that calls onPick
  }

  private onPick(perkId: PerkId): void {
    appState.update((s) => ({
      ...s,
      roster: {
        ...s.roster,
        heroes: s.roster.heroes.map((h) =>
          h.id === this.heroId ? applyPerk(h, perkId) : h,
        ),
      },
    }));
    this.close();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

### Layout

960×540 canvas. Centered modal panel `680×360` (centered at `480, 270`).

- Background: full-canvas dim rectangle `0x000000` at `alpha: 0.6`, click-blocking.
- Panel: `680×360` at `(480, 270)`, fill `0x222222`, stroke `0x666666` 2px.
- Paperdoll: scale 4, positioned at `(280, 200)` (left side of panel).
- Header text right of paperdoll, anchored at `x = 380`:
  - Hero name — 18px, `#ffffff`, at `y = 130`.
  - `${className} · Level 5` — 13px, `#aaaaaa`, at `y = 158`.
  - `Reached Level 5!` — 14px, `#ffcc66`, at `y = 184`.
  - `Choose a perk:` — 13px, `#aaaaaa`, at `y = 230`.
- Two perk cards arranged horizontally, each `260×140`:
  - Card A at `(330, 380)`, card B at `(630, 380)`.
  - Card chrome: fill `0x1a1a1a`, stroke `0x444444` 1px.
  - Hover (`pointerover`): stroke becomes `0xffcc66` (gold accent — matches existing camp UI), cursor `useHandCursor`.
  - Inside each card:
    - Perk name — 16px, `#ffffff`, top of card.
    - Perk description — 12px, `#dddddd`, below name.
- No close button, no ESC handler.

### `applyPerk` (`src/heroes/hero.ts`)

```ts
export function applyPerk(hero: Hero, perkId: PerkId): Hero {
  const perk = PERKS[perkId];
  const updated: Hero = { ...hero, perkId, pendingPerk: false };
  if (perk.hpEffect) {
    const newMaxHp = applyHpEffect(hero.maxHp, perk.hpEffect);
    const ratio = hero.maxHp > 0 ? newMaxHp / hero.maxHp : 1;
    updated.maxHp = newMaxHp;
    updated.currentHp = Math.max(1, Math.round(hero.currentHp * ratio));
  }
  return updated;
}

function applyHpEffect(value: number, effect: TraitHpEffect): number {
  const { delta, mode } = effect;
  return mode === 'percent' ? Math.round(value * (1 + delta / 100)) : value + delta;
}
```

For HP-effect perks, the percent applies multiplicatively to the *current* `maxHp` (which already includes class base + trait + level-up bumps + equipment). `currentHp` scales by the same ratio so HP-percentage is preserved. The `Math.max(1, ...)` guards against rounding a tiny `currentHp` to 0 — defensive, since living heroes always have ≥1.

### `computeMaxHp` extension

Adds an optional `perk?: PerkDef` parameter:

```ts
export function computeMaxHp(
  classBaseHp: number,
  trait: TraitDef,
  equipment: HeroEquipment,
  perk?: PerkDef,
): number {
  let base = classBaseHp;
  if (trait.hpEffect) base = applyHpEffect(base, trait.hpEffect);
  if (perk?.hpEffect) base = applyHpEffect(base, perk.hpEffect);
  return base + gearTotal(equipment);
}
```

Where `gearTotal(equipment)` is the existing inline gear-HP loop, extracted for clarity.

`computeMaxHp` is **only used at hero creation** today. The `applyPerk` path uses the simpler "scale current maxHp" model rather than recomputing from class base, because per-level HP bumps (`+2 HP per level` from `applyLevelUps`) are baked into `hero.maxHp` and not tracked separately. Recomputing from base would lose those bumps.

The `perk?` parameter on `computeMaxHp` exists for symmetry / future-proofing (e.g., if a future task always re-derives `maxHp` from the hero's full stat block) but isn't called by the picker.

### Tradeoff: equipment HP also gets multiplied

A Knight with `outfit_cloth +5 HP` picking Resolute has the perk's +10% applied to the entire `maxHp` (class base + trait + level bumps + cloth). The "percent applies to class base only" model that traits use isn't preserved here. For Tier 2 with two HP-effect perks both at +10%, the modeling difference is small and reads as "Resolute = your hero is 10% beefier overall," which is the intended feel.

### Scene registration (`src/main.ts`)

Add `PerkOverlayScene` to the scene array:

```ts
import { PerkOverlayScene } from './scenes/perk_overlay_scene';

new Phaser.Game({
  // …
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    NoticeboardPanelScene,
    DungeonScene,
    CombatScene,
    CampScreenScene,
    EquipPanelScene,
    PerkOverlayScene,  // ← new
    MainScene,
    ExplorerScene,
  ],
});
```

## Tests

The picker scene itself is Phaser-coupled and untested per repo convention. The testable surface is `applyPerk` and the extended `computeMaxHp`. Add to `src/heroes/__tests__/hero.test.ts`:

### `describe('applyPerk', ...)` (new)

1. **Stat-effect perk preserves HP, sets fields.**
   ```ts
   const h = createHero('knight', 'K', 'h0', 'quick', 'body1');
   const result = applyPerk(h, 'iron_will');
   expect(result.perkId).toBe('iron_will');
   expect(result.pendingPerk).toBe(false);
   expect(result.maxHp).toBe(h.maxHp);
   expect(result.currentHp).toBe(h.currentHp);
   ```

2. **HP-effect perk at full HP.**
   ```ts
   const h = createHero('knight', 'K', 'h0', 'quick', 'body1');
   // Knight base 20 with Quick (no HP effect): maxHp = 20.
   const result = applyPerk(h, 'resolute');
   expect(result.maxHp).toBe(22); // 20 * 1.1
   expect(result.currentHp).toBe(22); // proportional from full
   ```

3. **HP-effect perk at partial HP.**
   ```ts
   const h = { ...createHero('knight', 'K', 'h0', 'quick', 'body1'), currentHp: 10 };
   // maxHp = 20, currentHp = 10 (50%).
   const result = applyPerk(h, 'resolute');
   expect(result.maxHp).toBe(22); // 20 * 1.1
   expect(result.currentHp).toBe(11); // round(10 * 22/20) = round(11)
   ```

4. **`currentHp` floors at 1.**
   ```ts
   const h = { ...createHero('knight', 'K', 'h0', 'quick', 'body1'), currentHp: 0 };
   const result = applyPerk(h, 'resolute');
   expect(result.currentHp).toBeGreaterThanOrEqual(1);
   ```

5. **`pendingPerk` clears regardless of effect kind.**
   ```ts
   const h = { ...createHero('knight', 'K', 'h0', 'quick', 'body1'), pendingPerk: true };
   expect(applyPerk(h, 'iron_will').pendingPerk).toBe(false);
   expect(applyPerk(h, 'resolute').pendingPerk).toBe(false);
   ```

### Extension to existing HP-baking block

6. **`computeMaxHp` with both trait and perk stacks correctly.**
   ```ts
   // Use the equipment that createHero produces, so the gear-HP path
   // matches real hero state without re-implementing the starter-loadout helpers.
   const knight = createHero('knight', 'K', 'h0', 'stout', 'body1');
   const result = computeMaxHp(
     CLASSES.knight.baseStats.hp,  // 20
     TRAITS.stout,                  // +10% HP
     knight.equipment,
     PERKS.resolute,                // +10% HP
   );
   // 20 → round(20 * 1.1) = 22 → round(22 * 1.1) = 24, plus 0 gear HP from the
   // knight starter (sword + shield, neither has hp baseStats).
   expect(result).toBe(24);
   ```

No new test files. No combat / run integration tests — the perkId pipe-through to combat is already covered by the `combat_setup` and `getEffectiveStat` tests from Cluster A · 7.

## Out of scope

- **Re-picking a perk.** Tier 3 Chapel feature.
- **Multiple-perk slots per hero.** Level-10 perk is Tier 3; this task wires only the level-5 slot.
- **Perk previews on the hero card.** Selected `perkId` is currently invisible in the Barracks list / detail pane. Could surface alongside `traitId` in a future polish pass; not blocking gameplay.
- **Animations / sound for the level-up moment.** Polish. The static overlay is sufficient for the foundation.
- **Confirm step before applying.** One-click is faster and matches existing camp UI patterns.

## Surprises / call-outs

- **`applyPerk` lives on `hero.ts`, not `data/perks.ts`.** Initially considered placing it alongside the data, but it imports `Hero` and mutates one — fits better next to `createHero` / `computeMaxHp` which already do hero-shape work. `data/perks.ts` stays a pure data module.
- **HP-effect perk multiplies equipment HP too.** Differs from trait HP effect, which only multiplies class base. Documented above as a Tier-2 trade-off; the alternative (un-baking level-up bumps to recompute from class base) was rejected as overkill for two +10% perks.
- **`currentHp ≥ 1` guard.** Living heroes don't reach 0 HP — but if a save is hand-edited or a future feature introduces a "rested at 0 HP" state, the guard prevents instantly killing the hero on perk pick. Defensive, ~1 line of code.
- **Auto-overlay at `RESUME` runs unconditionally.** Cheap (one array `find` over ≤12 heroes). If perf becomes a concern when roster sizes grow in Tier 3, gate behind a session-level "any pending?" cache.
- **No combat/run code touched.** This task is purely camp-UI and one helper function. Test count delta should be small (~7 cases).
