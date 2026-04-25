# Camp Scene Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace task 10's stub `CampScene` with the village hub: HUD, three building click targets, dev shortcuts. Stub `TavernPanelScene` / `BarracksPanelScene` / `NoticeboardPanelScene` for tasks 13/14/15.

**Architecture:** All Phaser glue. No unit tests; smoke-tested in dev server. Stubs land first so the camp rewrite can wire to real scene keys.

**Tech Stack:** TypeScript 6.0, Phaser 4.0.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* No commit steps.

**Source spec:** [`docs/superpowers/specs/2026-04-24-camp-scene-shell-design.md`](../specs/2026-04-24-camp-scene-shell-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/scenes/tavern_panel_scene.ts` | Create (stub) | Filled in by task 13. |
| `src/scenes/barracks_panel_scene.ts` | Create (stub) | Filled in by task 14. |
| `src/scenes/noticeboard_panel_scene.ts` | Create (stub) | Filled in by task 15. |
| `src/scenes/camp_scene.ts` | Rewrite | Village hub: HUD + 3 building click targets + dev shortcuts. |
| `src/main.ts` | Modify | Register the 3 new panel scenes. |

---

## Task 1: Three panel stub scenes

**Files:**
- Create: `src/scenes/tavern_panel_scene.ts`
- Create: `src/scenes/barracks_panel_scene.ts`
- Create: `src/scenes/noticeboard_panel_scene.ts`

Three near-identical stubs. Each has a close button (×), ESC key handler, semi-transparent overlay, centered panel rect, title text, and a `close()` helper that does `scene.stop()` + `scene.resume('camp')`.

- [ ] **Step 1: Create `src/scenes/tavern_panel_scene.ts`**

```ts
import * as Phaser from 'phaser';

export class TavernPanelScene extends Phaser.Scene {
  constructor() {
    super('tavern_panel');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);

    const panelW = 600;
    const panelH = 400;
    this.add
      .rectangle(cx, cy, panelW, panelH, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.add
      .text(cx, cy - panelH / 2 + 24, 'Tavern (stub)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + panelH / 2 - 32, 'Press ESC or click × to close', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#888888',
      })
      .setOrigin(0.5);

    const closeX = cx + panelW / 2 - 18;
    const closeY = cy - panelH / 2 + 18;
    const closeBg = this.add
      .rectangle(closeX, closeY, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(closeX, closeY, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

(Note: `×` is the multiplication sign — used as the close-button glyph. Phaser's text rendering handles the unicode literal directly; the escape avoids any source-encoding confusion.)

- [ ] **Step 2: Create `src/scenes/barracks_panel_scene.ts`**

Identical to Tavern except class name, scene key, and title:

```ts
import * as Phaser from 'phaser';

export class BarracksPanelScene extends Phaser.Scene {
  constructor() {
    super('barracks_panel');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);

    const panelW = 600;
    const panelH = 400;
    this.add
      .rectangle(cx, cy, panelW, panelH, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.add
      .text(cx, cy - panelH / 2 + 24, 'Barracks (stub)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + panelH / 2 - 32, 'Press ESC or click × to close', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#888888',
      })
      .setOrigin(0.5);

    const closeX = cx + panelW / 2 - 18;
    const closeY = cy - panelH / 2 + 18;
    const closeBg = this.add
      .rectangle(closeX, closeY, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(closeX, closeY, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

- [ ] **Step 3: Create `src/scenes/noticeboard_panel_scene.ts`**

```ts
import * as Phaser from 'phaser';

export class NoticeboardPanelScene extends Phaser.Scene {
  constructor() {
    super('noticeboard_panel');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);

    const panelW = 600;
    const panelH = 400;
    this.add
      .rectangle(cx, cy, panelW, panelH, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.add
      .text(cx, cy - panelH / 2 + 24, 'Noticeboard (stub)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + panelH / 2 - 32, 'Press ESC or click × to close', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#888888',
      })
      .setOrigin(0.5);

    const closeX = cx + panelW / 2 - 18;
    const closeY = cy - panelH / 2 + 18;
    const closeBg = this.add
      .rectangle(closeX, closeY, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(closeX, closeY, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Build will fail at this point because main.ts hasn't registered the scenes — but typecheck only checks compilation per file.)

---

## Task 2: Rewrite CampScene + register scenes in main.ts

**Files:**
- Modify (rewrite): `src/scenes/camp_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/scenes/camp_scene.ts` entirely**

```ts
import * as Phaser from 'phaser';
import { balance } from '../camp/vault';
import { appState } from './app_state';

export class CampScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super('camp');
  }

  create(): void {
    this.buildHud();
    this.buildGround();
    this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
    this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
    this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
    this.buildDevHints();

    this.events.on(Phaser.Scenes.Events.RESUME, () => this.refreshHud());

    this.input.keyboard?.on('keydown-NINE', () => this.scene.start('main'));
    this.input.keyboard?.on('keydown-ZERO', () => this.scene.start('explorer'));
  }

  private buildHud(): void {
    this.goldText = this.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffcc66',
    });
    this.refreshHud();
  }

  private refreshHud(): void {
    const gold = balance(appState.get().vault);
    this.goldText.setText(`Gold: ${gold}`);
  }

  private buildGround(): void {
    this.add.rectangle(0, 480, 960, 1, 0x555555).setOrigin(0, 0);
  }

  private buildBuilding(
    label: string,
    centerX: number,
    color: number,
    w: number,
    h: number,
    panelKey: string,
  ): void {
    const top = 480 - h;
    const rect = this.add
      .rectangle(centerX, top, w, h, color)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0x888888);
    this.add
      .text(centerX, top + h / 2, label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerdown', () => {
      this.scene.launch(panelKey);
      this.scene.pause();
    });
  }

  private buildDevHints(): void {
    this.add
      .text(944, 524, '9: paperdoll · 0: sprite explorer', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#666666',
      })
      .setOrigin(1, 1);
  }
}
```

- [ ] **Step 2: Replace `src/main.ts` entirely**

```ts
import * as Phaser from 'phaser';
import './style.css';
import { BarracksPanelScene } from './scenes/barracks_panel_scene';
import { BootScene } from './scenes/boot_scene';
import { CampScene } from './scenes/camp_scene';
import { ExplorerScene } from './scenes/dev/explorer_scene';
import { MainScene } from './scenes/dev/main_scene';
import { NoticeboardPanelScene } from './scenes/noticeboard_panel_scene';
import { TavernPanelScene } from './scenes/tavern_panel_scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    NoticeboardPanelScene,
    MainScene,
    ExplorerScene,
  ],
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds. Pre-existing phaser chunk-size warning unrelated.

---

## Task 3: Verify + smoke-test handoff

**Files:** none changed.

- [ ] **Step 1: Run full Vitest suite**

Run: `npm test`
Expected: all 481 existing tests pass; no new tests in this task.

- [ ] **Step 2: Hand off smoke test to user**

The user runs `npm run dev` and verifies:

1. Page renders camp scene: HUD top-left shows `Gold: N`, three labeled rectangles on a ground line near the bottom, dev hint bottom-right.
2. Click Tavern → dimmed overlay + "Tavern (stub)" panel + close hint.
3. Press ESC → returns to camp; HUD intact.
4. Click Tavern → click the × button → returns to camp.
5. Click Barracks → "Barracks (stub)" panel. Close. Returns.
6. Click Noticeboard → "Noticeboard (stub)" panel. Close. Returns.
7. Press 9 → MainScene (paperdoll demo). Refresh, return.
8. Press 0 → ExplorerScene.
9. DevTools → Application → Local Storage: `pixel-battle-game/save` unchanged (read-only on AppState).

- [ ] **Step 3: Wait for user confirmation, then summarize**

Once smoke test passes:
- Files created: 3 new panel scenes.
- Files modified: `camp_scene.ts` (rewritten), `main.ts` (scene registrations).
- Test count unchanged (no new tests).
- Offer to migrate TODO.md task 12 → HISTORY.md.

---

## Self-review

**Spec coverage:**

- HUD top-left with vault gold → CampScene `buildHud` + `refreshHud` (Task 2 Step 1).
- Ground line at y=480 → `buildGround` (Task 2 Step 1).
- Three buildings on the ground line at x=180/440/720 with specified sizes/colors → `buildBuilding` calls (Task 2 Step 1).
- Building click → `scene.launch` + `scene.pause` → covered in `buildBuilding`.
- HUD refresh on RESUME → `events.on(Phaser.Scenes.Events.RESUME, ...)` (Task 2 Step 1).
- Dev shortcuts on `9` / `0` → keyboard handlers (Task 2 Step 1).
- Three stub panel scenes with close button + ESC key → Task 1 Steps 1–3.
- Stable scene keys (camp, tavern_panel, barracks_panel, noticeboard_panel) → consistent across all files.
- main.ts registers panel scenes after BootScene + CampScene → Task 2 Step 2.
- No unit tests; smoke test deferred to user → Task 3.

Gap: none.

**Placeholder scan:** no TBDs, no "similar to Task N." Each panel stub is fully written out (deliberately verbose to avoid the "similar to Task N" anti-pattern — engineer can read each file independently).

**Type consistency:** `Phaser.Scenes.Events.RESUME` is the correct event name in Phaser 4. Scene keys match between launch calls and `super('key')` calls. Class names imported in main.ts match the export names.

**Interface-extension audit (lesson from tasks 8–9):** This task creates new Scene classes and adds them to a scene array. Does **not** modify any existing interfaces or function signatures. `appState`, `balance`, `Vault` consumed unchanged. No callers/implementations to update.
