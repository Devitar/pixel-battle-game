# Camp Scene Shell (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster B, task 12

## Purpose

Replace task 10's stub `CampScene` with the village hub: HUD showing vault gold, three clickable buildings (Tavern / Barracks / Noticeboard) that open panel scenes as modal overlays, dev shortcuts to existing dev scenes. Stub panel scenes for tasks 13/14/15 to fill in.

This is the player's home base. Boot routes here on launch; every run cashout/wipe returns here. After this task, the game has a navigable shell — stubs at the panel level, real flow at the scene level.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `AppState` singleton (task 10). `appState.get()` returns the current `SaveFile`.
- `Vault`, `balance` (task 7). HUD reads `balance(saveFile.vault)`.
- `BootScene` (task 10). Auto-started; transitions to `'camp'`.
- `MainScene`, `ExplorerScene` (existing dev scenes). Reachable via dev shortcuts.

**New invariants this spec declares:**
- **Panels run as overlay scenes**, not full transitions. `scene.launch(panelKey)` + `scene.pause('camp')`. Close: `scene.stop(panelKey)` + `scene.resume('camp')`.
- **Camp HUD refreshes on the `RESUME` event** so changes made in panels (Tavern hire, Barracks retire, etc.) reflect when the player returns.
- **Three panel scenes are registered now** — `TavernPanelScene`, `BarracksPanelScene`, `NoticeboardPanelScene`. Stubbed shells with close mechanism. Tasks 13/14/15 replace `create()` bodies with real UI.
- **Scene keys are stable** across Cluster B: `'camp'`, `'tavern_panel'`, `'barracks_panel'`, `'noticeboard_panel'`.
- **Dev shortcut keys: `9` and `0`** for `MainScene` / `ExplorerScene`. Not `1`/`2`/`3` so future per-building hotkeys don't conflict.
- **Stubs are deliberately shallow** (~40 lines each). The bodies will diverge significantly when filled in (Tavern shows candidate cards, Barracks shows roster list, Noticeboard shows dungeon list). A common base class would have to be torn apart for each — keep them independent.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/scenes/camp_scene.ts` | **Rewrite** | Replace task 10's stub. Renders HUD + 3 building click targets + dev shortcuts. |
| `src/scenes/tavern_panel_scene.ts` | Create (stub) | Panel shell with ESC/close. Filled in by task 13. |
| `src/scenes/barracks_panel_scene.ts` | Create (stub) | Panel shell. Filled in by task 14. |
| `src/scenes/noticeboard_panel_scene.ts` | Create (stub) | Panel shell. Filled in by task 15. |
| `src/main.ts` | Modify | Register the 3 new panel scenes. |

**Import boundary:** All scenes import phaser. `CampScene` imports `appState` (task 10) and `balance` from `src/camp/vault.ts`. Panel stubs import phaser only.

## Layout (side-scrolling village)

Game viewport is 960×540. Layout option C from visual brainstorming.

| Element | Position | Size | Style |
|---|---|---|---|
| HUD (`Gold: N`) | (16, 16) top-left | text, 20px | mono, color `#ffcc66` |
| Ground line | y=480, x spans full width | 960×1 | rectangle, color `#555555` |
| Tavern building | center x=180, bottom on ground line | 100w × 110h (top y=370) | rectangle fill `#664433`, stroke `#888888` |
| Barracks building | center x=440, bottom on ground line | 100w × 130h (top y=350) | rectangle fill `#555555`, stroke `#888888` |
| Noticeboard | center x=720, bottom on ground line | 80w × 60h (top y=420) | rectangle fill `#998866`, stroke `#888888` |
| Building label | centered inside building rect | 14px text | mono, color `#ffffff` |
| Dev shortcut hint | (944, 524) bottom-right | text, 11px | mono, color `#666666` |

Tier 1 placeholder visuals — labeled rectangles. Tier 2+ adds sprite art for the buildings.

## `CampScene`

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

**Five notes:**

- **HUD refresh on `RESUME`.** Phaser fires `Scenes.Events.RESUME` when `scene.resume('camp')` is called from a panel close. The handler re-reads AppState (which reflects any panel-driven changes via auto-save) and updates the text.
- **`scene.pause()` (no arg) pauses the calling scene** (this).
- **Building label centered inside the rect.** Tier 1 placeholder.
- **Dev shortcuts on `9` / `0`** so 1/2/3 stay open for per-building hotkeys later.
- **No tests for CampScene.** Phaser glue, smoke-tested.

## Panel stub scenes

All three follow an identical template. `TavernPanelScene` shown:

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

`BarracksPanelScene` and `NoticeboardPanelScene` are identical except for class name, super-key (`'barracks_panel'` / `'noticeboard_panel'`), and title text (`'Barracks (stub)'` / `'Noticeboard (stub)'`).

**Three notes:**

- **Semi-transparent overlay (0.6 alpha black)** dims the camp underneath.
- **Both close paths call the same `close()` helper** — one place to maintain the `stop + resume('camp')` sequence.
- **No common base class.** YAGNI — bodies will diverge in 13/14/15.

## `main.ts` registration

Add the three panel scenes to the scene array. Order doesn't matter except `BootScene` stays first (auto-start).

```ts
scene: [
  BootScene,
  CampScene,
  TavernPanelScene,
  BarracksPanelScene,
  NoticeboardPanelScene,
  MainScene,
  ExplorerScene,
],
```

## Tests

### Unit tests: none

Every file is Phaser glue. The pure logic (HUD value reading via `balance(appState.get().vault)`) is already covered by `vault.test.ts` and `app_state.test.ts`.

### Smoke test (manual, dev server)

`npm run dev` → http://localhost:5173:

1. **Boot loads camp.** HUD top-left shows `Gold: N` (current save's gold). Three labeled rectangles on a ground line. Dev hint bottom-right.
2. **Click Tavern** → dimmed overlay + "Tavern (stub)" panel + ESC/× hints.
3. **Press ESC** → returns to camp. HUD still shows correct gold.
4. **Click Tavern again, click ×** → returns to camp.
5. **Click Barracks** → "Barracks (stub)" panel. Close. Returns.
6. **Click Noticeboard** → "Noticeboard (stub)" panel. Close. Returns.
7. **Press 9** → MainScene (paperdoll demo). Refresh, return.
8. **Press 0** → ExplorerScene (sprite catalog).
9. **DevTools → Application → Local Storage:** confirm `pixel-battle-game/save` unchanged (this task is read-only on AppState).

### Automated checks

- `npx tsc --noEmit` clean.
- `npm test` — all existing tests pass; no new tests.
- `npm run build` — succeeds.

## Risks and follow-ups

- **No building art.** Labeled rectangles work for Tier 1 but won't sell the village fantasy. Tier 2+ adds bespoke sprites. Hooks: each `buildBuilding(...)` call could swap to `buildBuildingSprite(...)` without changing the click handlers.
- **HUD refresh on RESUME isn't reactive.** If a panel mutates AppState multiple times (e.g., Tavern hires + spends gold mid-session), the HUD only reflects post-close. For Tier 1, panels close after each meaningful action so this is fine. Tier 2's reactive AppState (subscribe/notify) would let the HUD update live.
- **Panel scene isolation.** Each panel scene has access to AppState (via the singleton import) but no direct way to communicate back to camp. If a panel needs to trigger a specific HUD response (e.g., a "hired!" toast), it can use `scene.get('camp').events.emit(...)` — out of scope for the stubs.
- **Dev shortcut keys (`9`, `0`)** will need rethinking when the game ships. Tier 2 prep: gate them behind `import.meta.env.DEV` or a similar flag.
- **Building click areas are the rectangle bounds.** Easy targets. If buildings get sprite art with irregular silhouettes (Tier 2), might switch to bounding-box hitareas with a `.setInteractive(new Phaser.Geom.Rectangle(...))` override.
- **Panel scenes are registered globally.** Even if not currently running, they take up scene-manager slots. For 3 panels this is negligible. As Tier 2 adds Blacksmith/Hospital/Chapel/Training Grounds, the scene array grows but stays manageable.
- **No transition animations.** Camp → panel is an instant pop-in. Tier 2 polish would add a fade/slide tween. Out of Tier 1 scope.
- **The `close()` helper duplicates across three stub files.** When tasks 13/14/15 fill them in, the helper stays. Could be extracted to a shared mixin or utility — defer until the third panel actually shows the duplication is painful, since real bodies will obscure the helper anyway.
