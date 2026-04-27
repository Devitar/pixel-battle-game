# Bone Lich Bespoke Sprite — Design

## Why

The bone lich is the Crypt boss but currently renders identically to a generic skeleton minion: a 16×16 skeleton body with tier-5 leather armor and a tier-5 green staff overlaid via the paperdoll system. It does not feel like a boss. Tier-1 calls for the Crypt to feel complete, and the boss encounter is the climactic beat — its visual identity should reflect that.

This work generates a single bespoke 48×48 sprite via PixelLab and adds the minimum render plumbing to display it. It is purely a visual change; combat behaviour, stats, and abilities are untouched.

## Decisions

- **Boss-scale sprite** (48×48) rather than matching the existing 16×16 minion frames. Gives the lich a clearly distinct silhouette — at the chosen scale the on-screen lich is exactly 2× the size of a scaled minion.
- **Per-boss asset file** (`bone_lich.png`) rather than a shared `boss_sprites.png` sheet. The shipped naming reflects an effective shift to "one PNG per boss" — future bosses get their own file with their own sheet config. The texture key `BOSS_SHEET` remains in code as the single-boss-asset abstraction; if a second boss is added, it gets its own sheet config alongside (e.g., `RAT_KING_SHEET`).
- **Visual concept landed: hand-edited skeletal lich with staff.** PixelLab's standard-mode humanoid template kept giving the figure legs and a robe regardless of prompt; a regen with `ai_freedom=900` produced a more skeletal silhouette but still with legs. The user took the AI-generated sprite, hand-edited it down to 48×48, and produced the final clean skeletal lich. Two PixelLab candidates remain on disk for reference.
- **Signature colour: deep purple / violet.** Glowing staff orb and accents share a violet tone. Distinct from the cultist's green staff and from the warm browns of the Crypt tileset; reads as high-tier arcane.
- **New dedicated boss sheet** (`boss_sprites.png`) rather than mixing into the existing `enemy_sprites.png`. Phaser spritesheet config assumes a uniform frame size; mixing 16×16 and 68×68 in one sheet fights the config. A separate sheet is one-time plumbing that pays off the next time we add a boss.
- **Single front-facing static frame.** Combat is auto-resolved with static sprites; there is no animation pipeline for enemies, and no need for multiple directions. PixelLab's other three direction outputs (north/east/west) are discarded.
- **Per-visual `bodyScale` override.** `combat_scene.ts` previously applied a hardcoded `BOSS_BODY_SCALE = 4.5` to all bosses, which is correct for 16×16 paperdoll-based bosses but would scale our 68×68 bespoke sprite to 306px on screen. Adding `bodyScale?: number` to `EnemyVisual` and reading it in the scene lets each enemy declare its own scale; the lich uses `2` (visible character ~80px). Future bosses can decide between paperdoll-based (omit scale, get 4.5) and bespoke (set their own scale).

## Architecture

### PixelLab generation

`mcp__pixellab__create_character` with:

- `size`: 48 (produces 68×68 canvas, character ~40×30 within it)
- `n_directions`: 4 (only the south-facing rotation is used; the other three are discarded)
- `mode`: `standard` (template-based, 1 generation)
- `view`: `low top-down`
- `outline`: `single color black outline`
- `shading`: `basic shading`
- `proportions`: `chibi` preset

Two jobs were run, both kept in `public/assets/sprites/`:

- `boss_sprites_candidate_a.png` — character ID `0128d474-4853-463e-8ebc-e363eb948642`, name `Bone Lich`, `ai_freedom` default. Produced a robed/hooded skeletal figure with a glowing-orb staff. **This is the shipped asset** (copied to `boss_sprites.png`).
- `boss_sprites_candidate_c.png` — character ID `a2f7d7ac-41f6-4392-8f3b-8e394f3e4c93`, name `Bone Lich Phantom`, `ai_freedom=900`, with prompt rewritten to lean hard on "no legs, no robe, exposed ribcage." Produced a more skeletal silhouette but still with legs. Kept on disk for reference / future regen experiments.

### Asset placement

`public/assets/sprites/bone_lich.png` is the live 48×48 sprite — hand-edited from the PixelLab candidates by the user. The two PixelLab candidates (`boss_sprites_candidate_a.png` 68×68, `boss_sprites_candidate_c.png` 68×68) and the original ship copy (`boss_sprites.png` 68×68, now unused) remain in the directory as reference.

### Render plumbing

Five files change (note that `EnemyVisual` is the interface in `enemy_sprites.ts`; `EnemySprite` is the Phaser class in `enemy_sprite.ts` — different files):

**`src/render/frames.ts`** — add a new sheet config alongside `SHEET` and `ENEMY_SHEET`:

```ts
export const BOSS_SHEET = {
  key: 'boss',
  url: 'assets/sprites/bone_lich.png',
  columns: 1,
  rows: 1,
  frameWidth: 48,
  frameHeight: 48,
  spacing: 0,
  margin: 0,
} as const;
```

**`src/scenes/boot_scene.ts`** — add a `this.load.spritesheet(BOSS_SHEET.key, BOSS_SHEET.url, {...})` call alongside the existing `SHEET` and `ENEMY_SHEET` loads, importing `BOSS_SHEET` from `../render/frames`.

**`src/render/enemy_sprites.ts`** — make `bodyFrame` optional on the `EnemyVisual` interface, add `bossSprite?: number`, and add `bodyScale?: number` (per-enemy scale override). Replace the `bone_lich` data entry — currently `{ bodyFrame, outfit, weapon }` — with `{ bossSprite: 0, bodyScale: 2 }`.

**`src/render/enemy_sprite.ts`** — in the `EnemySprite` constructor, branch on whether `visual.bossSprite` is defined: if so, render a single `scene.add.image(0, 0, BOSS_SHEET.key, visual.bossSprite)` and skip the body-frame + paperdoll-overlay loop. Otherwise, current behaviour unchanged. The character is centered within the 48×48 canvas, so no y-offset is needed.

**`src/scenes/combat_scene.ts`** — read `ENEMY_VISUALS[enemyId].bodyScale` and prefer it over the global `BOSS_BODY_SCALE`/3 fallback when constructing the `CombatActor`. The bone lich uses `bodyScale: 2`, putting it at 96px on screen — exactly 2× a scaled minion (48px). The existing `BOSS_BODY_SCALE = 4.5` behaviour stays intact for any future paperdoll-based bosses that don't override.

### Verification

- **Type/test:** add `src/render/__tests__/enemy_sprites.test.ts` (file does not currently exist) asserting `ENEMY_VISUALS.bone_lich.bossSprite === 0` and `bodyFrame === undefined`. This locks in the boss-sprite shape and catches accidental regressions if someone tries to re-add paperdoll fields to the lich.
- **Manual visual:** load the combat scene with a Crypt floor-3 boss fight, confirm the lich renders at 48×48 in its lane with feet aligned to the minion baseline. Skip the Claude-in-Chrome browser smoke unless the asset looks off — per repo conventions, browser smoke is only for debugging.

No combat-logic tests change — stats, abilities, and AI priorities for `bone_lich` are untouched.

## Out of scope

- Animations for the lich (no enemy animation pipeline exists yet).
- Multi-direction sprites (combat is static and front-facing).
- Bespoke sprites for other enemies, including future bosses — `boss_sprites.png` is provisioned as a multi-frame sheet (just empty after frame 0 for now), so the next boss is a one-line addition, but generating it is its own task.
- Changes to combat-lane positioning logic for boss-sized enemies beyond the y-offset above. If 48×48 turns out to clip neighbouring lanes, that is a follow-up.

## Source

- Concept and approach decided in conversation 2026-04-26.
- GDD §10 Tier-1 calls for Crypt completeness; the Crypt boss being visually distinct supports that.
- Existing enemy render pipeline: `src/render/enemy_sprite.ts`, `src/render/enemy_sprites.ts`, `src/render/frames.ts`.
- Existing asset loaders: `src/scenes/boot_scene.ts`.
