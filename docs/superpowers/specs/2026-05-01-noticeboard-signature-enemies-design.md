# Noticeboard signature-enemy preview — Design

- **TODO entry:** Cluster B · 18 (Noticeboard signature-enemy preview).
- **Tier:** 2.
- **Date:** 2026-05-01.

## 1 · Scope

Add a row of `EnemySprite` instances to the Noticeboard's dungeon-list card, showing each enemy in `DUNGEONS[id].enemyPool` plus the boss. All sprites render at scale 2× and bottom-align on a shared ground line, so the boss (32×32 frame) naturally reads as larger than the minions (16×16 frame). No new data fields, no name labels, no tooltips, no tier label.

**Out of scope:**

- **Tier label.** With only one dungeon shipped, "Tier 1" is informationally redundant. The "no data-shape pressure" argument that justified doing this task now (per the TODO entry) cuts both ways: adding a `tier` field that displays as "Tier 1" with no comparison reads as visual noise. The 2nd dungeon will need to update `DungeonDef` anyway (probably with more than just `tier` — likely scaling factor overrides, floor count overrides, etc.), so adding `tier` now doesn't avoid future migration.
- **Loot preview** (TODO acknowledges as deferred; no dungeon-specific loot pools exist today).
- **Hover/tap tooltip** with enemy name + role. Combat scene has no hover infrastructure either; same pattern as Cluster B · 13 / 15. Defer until hover infra arrives for another reason.
- **Per-sprite name labels.** Minions at 32px wide can't fit "Skeleton Warrior" without truncation; mixed labeling (boss only) creates asymmetry. The visual size signal — minions small, boss big — carries enough info.
- **Boss-explicit label or crown icon.** Native-scale sprite + bottom-alignment makes the boss visibly larger than minions; an extra icon or "BOSS" label is overkill once the silhouette tells the story. We also don't have a crown frame in the existing sprite catalog.
- **Pool changes propagating live.** `enemyPool` is hard-coded in `data/enemies.ts`; the preview is built once per `setStage('dungeon_list')` and never needs to refresh.

## 2 · Layout

Card is centered at `(PANEL_CX, PANEL_CY) = (480, 270)`, size `460×220`, so y-range is **160–380**.

Existing vertical layout (unchanged by this task):

| Element | y | Notes |
|---|---|---|
| Title `"The Crypt"` | 195 | 22px |
| Theme `"Undead ruins"` | 225 | 13px |
| `"3 floors"` | 250 | 13px (bottom ~265) |
| **Sprite row ground line** | **337** | new — see §3 |
| CTA `"▸ Click to plan…"` | 350 | 12px (top ~344) |

Sprite row vertical extents at scale 2×:

- Minions (16-px frames): rendered 32×32. Bottom at y=337, top at y=305. Clear of "3 floors" bottom (~265) by 40px.
- Boss (32-px frame): rendered 64×64. Bottom at y=337, top at y=273. Clear of "3 floors" bottom (~265) by 8px.
- Ground line (y=337) clear of CTA top (~344) by 7px.

Horizontal layout: row centered on `PANEL_CX = 480`. For the current `CRYPT_POOL` (5 minions + boss):

```
total_width = 5 × (16 × 2) + (32 × 2) + 5 × 12 = 160 + 64 + 60 = 284
left_edge   = 480 − 142 = 338
right_edge  = 480 + 142 = 622
```

Card half-width is 230, so margin from card edge to row edge is `230 − 142 = 88px` per side. Plenty.

## 3 · Constants

Added near the existing dungeon-card constants in `noticeboard_panel_scene.ts`:

```ts
const PREVIEW_SCALE = 2;
const PREVIEW_GROUND_Y = 337;
const PREVIEW_GAP = 12;
const ENEMY_FRAME_W = 16;  // ENEMY_SHEET.frameWidth
const BOSS_FRAME_W = 32;   // BOSS_SHEET.frameWidth
```

`ENEMY_FRAME_W` and `BOSS_FRAME_W` mirror the canonical sheet metadata in `render/frames.ts`. Importing the sheet objects just for `.frameWidth` reads worse than two named constants, and combat actor sizing already follows the same pattern (`ENEMY_FRAME_SIZE = ENEMY_SHEET.frameWidth` is a local constant in `combat_actor.ts`).

## 4 · Render block (in `buildDungeonListStage`)

Insert after the existing `"▸ Click to plan an expedition"` text block (currently lines 201–209), **before** `cardBg.setInteractive(...)`:

```ts
const ids: readonly EnemyId[] = [...def.enemyPool, def.bossId];
const totalWidth =
  def.enemyPool.length * ENEMY_FRAME_W * PREVIEW_SCALE
  + BOSS_FRAME_W * PREVIEW_SCALE
  + def.enemyPool.length * PREVIEW_GAP;
let cursor = PANEL_CX - totalWidth / 2;

for (const enemyId of ids) {
  const isBoss = enemyId === def.bossId;
  const frameW = isBoss ? BOSS_FRAME_W : ENEMY_FRAME_W;
  const fullSize = frameW * PREVIEW_SCALE;
  const centerX = cursor + fullSize / 2;
  const centerY = PREVIEW_GROUND_Y - fullSize / 2;
  const sprite = new EnemySprite(this, centerX, centerY, enemyId);
  sprite.setScale(PREVIEW_SCALE);
  this.stageContainer.add(sprite);
  cursor += fullSize + PREVIEW_GAP;
}
```

`def` is the existing `const def = DUNGEONS.crypt;` declared earlier in `buildDungeonListStage` (line 173). Reuse it; no new lookup.

### Container origin caveat (load-bearing)

`EnemySprite extends Phaser.GameObjects.Container`. Phaser containers do NOT respect `setOrigin` for their children — the call has no effect. To bottom-align on the ground line, the implementation MUST compute `centerY = PREVIEW_GROUND_Y - fullSize / 2` and position the container by its center, NOT call `setOrigin(0.5, 1)`. The render block above does this correctly.

If a future implementer reaches for `setOrigin(0.5, 1)` on the sprite, all enemies will float at the same vertical center (boss 32px above the row, minions 16px above the row), defeating the visual intent. Verify by checking that the boss's bottom edge visually aligns with the minions' bottom edges in playtest.

### Container parenting

Sprites are added to `stageContainer` (the per-stage container), so the existing `setStage('party_picker')` call's `this.stageContainer.removeAll(true)` (line 134) destroys them on stage transition. No leak. Returning to `dungeon_list` rebuilds them.

## 5 · Imports

Add to the top of `src/scenes/noticeboard_panel_scene.ts`:

```ts
import type { EnemyId } from '../data/types';
import { EnemySprite } from '../render/enemy_sprite';
```

`EnemyId` for the typed `ids` array. `EnemySprite` for the constructor.

## 6 · Files touched

| File | Change |
|---|---|
| `src/scenes/noticeboard_panel_scene.ts` | Add `PREVIEW_SCALE` / `PREVIEW_GROUND_Y` / `PREVIEW_GAP` / `ENEMY_FRAME_W` / `BOSS_FRAME_W` constants. Add the sprite-row render block in `buildDungeonListStage` after the CTA text. Add `EnemyId` and `EnemySprite` imports. |

No other files touched. No data-layer change. No save schema change. No test infrastructure change. `DungeonDef` keeps its current shape.

## 7 · Test plan

No unit tests (Phaser scene/UI convention; matches the floor-modifier visibility, wound-badge-in-combat, retire-from-barracks, equip-from-stash, tavern-reroll, hospital, camp-node-UI tasks). The render is a sprite-row layout calculation — no behavior worth isolating.

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm run build` succeeds.
- `npm test` stays green.

**Manual play verification:**

- Open Noticeboard. Dungeon-list card shows the existing title / theme / floors / CTA layout, plus a horizontal row of 6 sprites between "3 floors" and the CTA.
- Sprite row reads as 5 minion-sized silhouettes followed by 1 boss-sized silhouette (the Bone Lich), bottom-aligned on a shared ground line. The boss is visibly ~2× taller than the minions.
- Click the card → transition to party-picker stage. Sprite row disappears (destroyed by `stageContainer.removeAll(true)`).
- Click Back → return to dungeon-list. Sprite row rebuilds correctly.
- Reopen Noticeboard from camp. Sprite row renders fresh. No leftover sprites from prior session.

## 8 · Risk

Low. Single-file additive change in `noticeboard_panel_scene.ts`. No combat-resolution, data-layer, or save-schema touches. The only subtle bit is the container-origin caveat (§4), called out explicitly so future maintenance doesn't regress to `setOrigin(0.5, 1)` and break the bottom alignment.

## 9 · Open questions

None at design time.
