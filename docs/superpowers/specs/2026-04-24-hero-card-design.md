# Hero Card Widget (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster B, task 11

## Purpose

A reusable Phaser Container that renders a hero — paperdoll + name + class + core stats + HP bar — with two size variants and a dead-state mode. Consumed by Tavern (task 13), Barracks (task 14), and the post-boss Camp Screen (task 18). Sharing one widget prevents three drifting reimplementations across those scenes.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `Hero` (task 6, extended task 8). Has `id`, `classId`, `name`, `baseStats`, `currentHp`, `maxHp`, `traitId`, `bodySpriteId`.
- `Loadout` (task 0, render/paperdoll.ts). Visual layers: body / legs / feet / outfit / hair / hat / weapon / shield.
- `Paperdoll` Phaser Container (task 0, render/paperdoll.ts).
- `CLASSES` and `TRAITS` registries (data layer).

**New invariants this spec declares:**
- **`heroToLoadout` is the canonical Hero → Loadout transformation.** Pure TS, no phaser. Reusable beyond `HeroCard` (e.g., dungeon scene's party-walking sprites in task 16).
- **String-id → numeric-id conversion happens at the `heroToLoadout` seam.** Tier 1's sprite ids are stored as strings on Hero / ClassDef (per task 2 design); Paperdoll's `Loadout` expects numbers. This file is the boundary.
- **`HeroCard.setHero(hero)` rebuilds all children.** No diffing — `removeAll(true)` + `buildChildren()`. Cards aren't update-heavy in Tier 1; correctness over micro-optimization.
- **`isDead` is an explicit constructor option, not derived from `currentHp ≤ 0`.** Mid-combat, party heroes can be at 0 HP without yet being categorized as fallen by run state. Caller knows the difference; HeroCard renders what it's told.
- **Both size variants use a horizontal layout** (paperdoll on the left, text + HP bar on the right). User-validated visually.
- **Click handler is attached to the background rectangle** spanning the whole card area. Phaser's `setInteractive` requires a hit area; the rectangle is a single uniform target.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/render/hero_loadout.ts` | Create | `heroToLoadout(hero): Loadout`. Pure TS. |
| `src/render/__tests__/hero_loadout.test.ts` | Create | Unit tests for derivation. |
| `src/ui/hero_card.ts` | Create | `HeroCard` Phaser Container class. |

**Import boundary:**

- `src/render/hero_loadout.ts` — imports `src/data/classes.ts`, `src/render/paperdoll.ts` (for the `Loadout` type), `src/heroes/hero.ts`. **No phaser.**
- `src/ui/hero_card.ts` — imports phaser, `src/render/paperdoll.ts`, `src/render/hero_loadout.ts`, `src/data/classes.ts`, `src/data/traits.ts`, `src/heroes/hero.ts`. Phaser-permitted per the firewall rule for `src/ui/`.

**`src/ui/` is a new directory.** First UI widget. Per `src/README.md`, the directory may import phaser. Future widgets (formation_editor, pack_panel, ability_icon) will land here.

## `heroToLoadout` (`src/render/hero_loadout.ts`)

```ts
import { CLASSES } from '../data/classes';
import type { Hero } from '../heroes/hero';
import type { Loadout } from './paperdoll';

export function heroToLoadout(hero: Hero): Loadout {
  const classDef = CLASSES[hero.classId];
  const starter = classDef.starterLoadout;
  return {
    body: parseInt(hero.bodySpriteId, 10),
    weapon: parseInt(starter.weapon, 10),
    shield: starter.shield !== undefined ? parseInt(starter.shield, 10) : undefined,
  };
}
```

**Three precision notes:**

- **String-to-number conversion** at this seam. Sprite ids are strings on `Hero` and `StarterLoadout` (task 2 convention); Paperdoll wants numbers. `parseInt(_, 10)` converts.
- **Tier 1 fields only** — body / weapon / shield. Legs / feet / outfit / hair / hat are randomized in Tier 2's gear/cosmetic system. The `Loadout` type already has them as optional; we leave them undefined.
- **Pure function, no I/O.** Fully testable.

## `HeroCard` class (`src/ui/hero_card.ts`)

### Public API

```ts
export type HeroCardSize = 'small' | 'large';

export interface HeroCardOptions {
  size: HeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
}

export class HeroCard extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    hero: Hero,
    opts: HeroCardOptions,
  );

  setHero(hero: Hero): void;
}
```

### Layout (both sizes horizontal)

- **Small (180×56):** paperdoll (16×24 native, scale ×2 = 32×48) on the left; name (14px), `class · current/max` line (11px), HP bar (100×6) on the right.
- **Large (280×120):** paperdoll (scale ×4 = 64×96) on the left; name (18px), class (13px), HP bar (140×6), stats line (`HP X/Y   ATK A   DEF D   SPD S`), trait line on the right.

Background: dark gray rectangle (`#222`) with a 2px border (`#444`). Dead-state border swaps to muted red (`#553`).

### HP bar

- Background: 6px tall dark gray rect with 1px border.
- Fill: ratio-width rect; color ramps:
  - `> 50%` → green (`0x44aa44`)
  - `> 25%` → yellow (`0xaaaa44`)
  - else → red (`0xaa4444`)

### Dead state (`isDead: true`)

- Paperdoll alpha set to **0.5**.
- Name text suffixed with " (Fallen)".
- HP bar hidden.
- Stats / trait lines hidden.
- Border color muted red.

The card still renders the paperdoll for visual recognition.

### Click handler

`opts.onClick` (optional) is attached to the background rectangle via `setInteractive({ useHandCursor: true })`. Click fires the callback. Single uniform hit area covers the whole card.

### Update mechanism

`setHero(newHero)` calls `removeAll(true)` (destroys all children including phaser objects) and re-runs `buildChildren()`. Caller invokes this after AppState changes the hero. No diffing.

### Full implementation sketch

```ts
import * as Phaser from 'phaser';
import { Paperdoll } from '../render/paperdoll';
import { heroToLoadout } from '../render/hero_loadout';
import type { Hero } from '../heroes/hero';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';

export class HeroCard extends Phaser.GameObjects.Container {
  private hero: Hero;
  private opts: HeroCardOptions;

  constructor(scene, x, y, hero, opts) {
    super(scene, x, y);
    this.hero = hero;
    this.opts = opts;
    this.buildChildren();
    scene.add.existing(this);
  }

  setHero(hero: Hero): void {
    this.hero = hero;
    this.removeAll(true);
    this.buildChildren();
  }

  private buildChildren(): void {
    // background, paperdoll, name, class, hp bar, stats (large only), trait (large only).
    // Dead state alterations applied at the end.
    // Click handler attached to background if opts.onClick provided.
  }

  private hpColor(ratio: number): number {
    if (ratio > 0.5) return 0x44aa44;
    if (ratio > 0.25) return 0xaaaa44;
    return 0xaa4444;
  }
}
```

(Full body shown in implementation plan; design captures the contract.)

## Tests

### `src/render/__tests__/hero_loadout.test.ts`

- Knight gets sword + shield from `CLASSES.knight.starterLoadout`.
- Archer gets bow; shield is `undefined`.
- Priest gets holy symbol (mace tier1 in Tier 1's sprite catalog); shield is `undefined`.
- `body` field reflects `hero.bodySpriteId` parsed as a number.
- All four tests use `createHero(...)` with explicit `bodySpriteId` strings.

### `HeroCard` class: no unit tests

Phaser glue. Mocking Phaser would require stubbing `Container`, `scene.add.text`, `scene.add.rectangle`, `Paperdoll` — high effort, low yield. The meaningful logic (loadout derivation, HP color thresholds) is either pure-TS-tested or trivial.

### Smoke testing

**Deferred to task 13 (Tavern UI).** Task 13 is the first real consumer; visual validation lands there in context. Risk is low — Phaser primitives (text, rectangle, container) are well-tested by Phaser itself.

If validation is wanted before task 13, a 5-line addition to `camp_scene.ts` (the stub) renders a HeroCard with sample data. Easy retrofit.

### Build verification

- `npx tsc --noEmit` clean.
- `npm test` — all existing tests + 4 new `heroToLoadout` tests.
- `npm run build` succeeds.

## Risks and follow-ups

- **No reactive AppState integration.** Caller must invoke `setHero(newHero)` explicitly when state changes. When AppState gains an event emitter (Tier 2), HeroCard could subscribe. For Tier 1, scenes call `setHero` at lifecycle hooks where they know state changed.
- **`setHero` rebuild is wasteful for HP-only changes.** Combat playback (task 17) will animate HP bar ticks; using `setHero` per tick destroys/rebuilds the whole card. Task 17 may need a focused `setHp(currentHp, maxHp)` method or a different update path. Out of Tier 1 task 11 scope.
- **No animation on state changes.** Tween polish (e.g., HP bar smooth transitions, fade-in on first display) is Tier 2.
- **String-to-number `parseInt` at `heroToLoadout`.** If a future bodySpriteId is non-numeric (e.g., a logical id like `'orc_warrior'`), this seam needs a real lookup. For Tier 1, all sprite ids are stringified frame indices so `parseInt` works. Task 19's enemy art may introduce non-numeric ids — that's the trigger for revisiting.
- **No keyboard navigation.** Click only. Future accessibility work would add focus + Enter handling.
- **Card size constants are baked into the file.** Tweaking widths/heights requires editing source. If multiple sizes are needed beyond `small`/`large` (e.g., `medium` for 4-up grids), promote to a config object. YAGNI for Tier 1.
- **Dead state is binary** (alive vs fallen). Tier 2 may add a "wounded" intermediate state with a different visual treatment.
- **Paperdoll scale numbers (`2` for small, `4` for large) are magic constants.** Documented but not configurable. Adjust if visuals look off; smoke test in task 13 will surface that.
