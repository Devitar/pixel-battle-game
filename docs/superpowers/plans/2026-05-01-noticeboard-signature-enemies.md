# Noticeboard Signature-Enemy Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a row of `EnemySprite` instances on the Noticeboard's dungeon-list card, showing each enemy in `DUNGEONS[id].enemyPool` plus the boss. All sprites bottom-align on a shared ground line at scale 2× — boss naturally distinguishes itself by sprite-frame size (32×32 vs minions' 16×16).

**Architecture:** Single-file additive change in `src/scenes/noticeboard_panel_scene.ts`. Add five layout constants, one render block in `buildDungeonListStage`, two new imports. Sprites are added to the existing `stageContainer`, so `setStage('party_picker')`'s existing `removeAll(true)` cleans them up between stages — no leak handling required.

**Tech Stack:** TypeScript, Phaser 3. UI/scene-only; no unit tests (Phaser convention; matches the floor-modifier visibility, wound-badge-in-combat, retire-from-barracks, equip-from-stash, tavern-reroll, hospital, camp-node-UI tasks).

**Spec:** `docs/superpowers/specs/2026-05-01-noticeboard-signature-enemies-design.md`. Read before starting — note especially §4's container-origin caveat (Phaser containers don't respect `setOrigin`; the plan computes `centerY` from the desired bottom edge instead).

---

## Task 1: Sprite-row preview on dungeon-list card

Single task spanning constants, imports, and one render block. Splitting across multiple commits would create dead-constants intermediate states.

**Files:**
- Modify: `src/scenes/noticeboard_panel_scene.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass (1321 as of the prior task). Note the count for the post-change comparison.

- [ ] **Step 1.2: Add the two new imports**

Open `src/scenes/noticeboard_panel_scene.ts`. Add the type import alongside the existing `data/...` and `render/...` imports near the top of the file.

Current imports:

```ts
import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { DUNGEONS } from '../data/dungeons';
import type { Hero } from '../heroes/hero';
import { startRun } from '../run/run_state';
import { HeroCard } from '../ui/hero_card';
import { createRng } from '../util/rng';
import { appState } from './app_state';
```

Update to:

```ts
import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { DUNGEONS } from '../data/dungeons';
import type { EnemyId } from '../data/types';
import type { Hero } from '../heroes/hero';
import { EnemySprite } from '../render/enemy_sprite';
import { startRun } from '../run/run_state';
import { HeroCard } from '../ui/hero_card';
import { createRng } from '../util/rng';
import { appState } from './app_state';
```

`EnemyId` for the typed `ids` array; `EnemySprite` for the constructor.

- [ ] **Step 1.3: Add the five layout constants**

Find the dungeon-card constants block (around line 28 — currently `DUNGEON_CARD_W` and `DUNGEON_CARD_H`). Add the five preview constants directly below:

```ts
// Stage 1
const DUNGEON_CARD_W = 460;
const DUNGEON_CARD_H = 220;
const PREVIEW_SCALE = 2;
const PREVIEW_GROUND_Y = 337;
const PREVIEW_GAP = 12;
const ENEMY_FRAME_W = 16;  // ENEMY_SHEET.frameWidth
const BOSS_FRAME_W = 32;   // BOSS_SHEET.frameWidth
```

The frame-width constants mirror the canonical metadata in `render/frames.ts`. `combat_actor.ts` follows the same "duplicate as a local layout constant" pattern (`ENEMY_FRAME_SIZE = ENEMY_SHEET.frameWidth`).

- [ ] **Step 1.4: Add the sprite-row render block to `buildDungeonListStage`**

Find `buildDungeonListStage` (around line 156). The existing CTA-text block ends with the `"▸ Click to plan an expedition"` text added to `stageContainer`, immediately before `cardBg.setInteractive(...)`. Currently:

```ts
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, 350, '▸ Click to plan an expedition', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffcc66',
        })
        .setOrigin(0.5, 0),
    );

    cardBg.setInteractive({ useHandCursor: true });
```

Insert the sprite-row block **between** the CTA text block and `cardBg.setInteractive`:

```ts
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, 350, '▸ Click to plan an expedition', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffcc66',
        })
        .setOrigin(0.5, 0),
    );

    // Signature-enemy preview row — minions then boss, bottom-aligned on
    // PREVIEW_GROUND_Y. Boss is naturally larger via its 32-px frame.
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
      // Phaser containers ignore setOrigin — bottom-align by computing center
      // from the desired bottom edge.
      const centerY = PREVIEW_GROUND_Y - fullSize / 2;
      const sprite = new EnemySprite(this, centerX, centerY, enemyId);
      sprite.setScale(PREVIEW_SCALE);
      this.stageContainer.add(sprite);
      cursor += fullSize + PREVIEW_GAP;
    }

    cardBg.setInteractive({ useHandCursor: true });
```

`def` reuses the existing `const def = DUNGEONS.crypt;` declared earlier in the same method (line 173). Don't redeclare.

The container-parenting via `this.stageContainer.add(sprite)` ensures `setStage('party_picker')`'s existing `removeAll(true)` (line 134) destroys these sprites on stage transition. No leak handling needed.

- [ ] **Step 1.5: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green / build succeeds. Test count unchanged from the baseline captured in Step 1.1.

- [ ] **Step 1.6: Commit**

```bash
git add src/scenes/noticeboard_panel_scene.ts
git commit -m "feat(noticeboard): preview signature enemies on dungeon card"
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Single task landed in 1 commit** with green tests + tsc + build.
- [ ] **No `phaser` imports outside `src/scenes/`, `src/ui/`, `src/render/`, `src/main.ts`** (unchanged from baseline — `noticeboard_panel_scene.ts` already imports Phaser; `EnemySprite` lives in `render/`).
- [ ] **`DungeonDef` untouched** — no `tier` field added; `data/dungeons.ts` and `data/types.ts` unchanged.
- [ ] **No save schema change** (no data layer touched).
- [ ] **Manual play verification:**
  - Open Noticeboard from camp. Dungeon-list card shows the existing title / theme / floors / CTA layout, plus a horizontal row of 6 sprites between "3 floors" and the CTA.
  - Sprite row reads as 5 minion-sized silhouettes followed by 1 boss-sized silhouette (the Bone Lich), bottom-aligned on a shared ground line. Boss is visibly ~2× taller than the minions.
  - Visually verify the boss bottom edge sits flush with the minion bottom edges. If the boss appears centered higher (its center matches the minions' center), the container-origin caveat regressed — re-check that `centerY = PREVIEW_GROUND_Y - fullSize / 2` and that `setOrigin(0.5, 1)` was NOT used on the sprite.
  - Click the dungeon card → transitions to party-picker stage. Sprite row disappears (destroyed by `stageContainer.removeAll(true)`).
  - Click Back → returns to dungeon-list. Sprite row rebuilds correctly with the same 6 sprites.
  - Close Noticeboard (× or ESC) and reopen. Sprite row renders fresh; no leftover sprites from prior session.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 18 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +0 (UI/scene convention).
