# Retire Hero from Barracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a destructive Retire button to the Barracks detail pane next to Equip Gear. Click → inline two-step confirm (warning text + Cancel + Confirm Retire). Confirm calls `removeHero`, persists via `appState.update`, and `scene.restart()`s the panel so the just-retired hero falls out of the list.

**Architecture:** Single-file additive change in `src/scenes/barracks_panel_scene.ts`. Add a `confirmRetirePending` boolean field to the scene; clear it in `selectHero`; replace the existing Equip-Gear-only button block at the bottom of `rebuildDetail` with a branch that renders either the action row (Equip Gear + Retire) or the confirm row (warning text + Cancel + Confirm Retire). No new files; no data-layer / save-schema / combat changes.

**Tech Stack:** TypeScript, Phaser 3. UI/scene-only; no unit tests (Phaser convention; matches the floor-modifier visibility, wound-badge-in-combat, equip-from-stash, tavern-reroll, hospital, camp-node-UI tasks).

**Spec:** `docs/superpowers/specs/2026-05-01-retire-from-barracks-design.md`. Read before starting.

---

## Task 1: Retire button + inline confirm

Touches one file end-to-end. The `confirmRetirePending` field, the `selectHero` clear, and the new render branch ship together — landing them separately would create dead-field intermediate states.

**Files:**
- Modify: `src/scenes/barracks_panel_scene.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass (1321 as of the prior task). Note the count for the post-change comparison.

- [ ] **Step 1.2: Add `removeHero` to the existing `'../camp/roster'` import**

Open `src/scenes/barracks_panel_scene.ts`. Line 2 currently reads:

```ts
import { listHeroes } from '../camp/roster';
```

Change it to:

```ts
import { listHeroes, removeHero } from '../camp/roster';
```

- [ ] **Step 1.3: Add the `confirmRetirePending` field to the scene class**

Find the field block at the top of `BarracksPanelScene` (around line 56). It currently reads:

```ts
export class BarracksPanelScene extends Phaser.Scene {
  private rosterCards: RosterCard[] = [];
  private selectedHeroId: string | null = null;
  private detailContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
```

Add the new field directly below `selectedHeroId`:

```ts
export class BarracksPanelScene extends Phaser.Scene {
  private rosterCards: RosterCard[] = [];
  private selectedHeroId: string | null = null;
  private confirmRetirePending: boolean = false;
  private detailContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
```

The field initializer of `false` ensures `scene.restart()` after a confirm always lands back in normal state.

- [ ] **Step 1.4: Clear the field in `selectHero` so switching heroes mid-confirm is an implicit cancel**

Find `selectHero` (around line 171). It currently reads:

```ts
  private selectHero(id: string | null): void {
    this.selectedHeroId = id;
    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }
```

Add the clear between the assignment and the highlight refresh:

```ts
  private selectHero(id: string | null): void {
    this.selectedHeroId = id;
    this.confirmRetirePending = false;
    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }
```

Without this line, selecting hero B while confirm is pending on hero A would render the confirm UI for hero B, and clicking Confirm would retire hero B — silent footgun.

- [ ] **Step 1.5: Replace the existing Equip-Gear-only block with a state-branch in `rebuildDetail`**

Find the block at the end of `rebuildDetail` (currently lines 351–370 — the `// Equip Gear button — fixed position…` comment through `equipBtn.on('pointerdown', () => { this.scene.launch(...); this.scene.pause(); });`). The block currently reads:

```ts
    // Equip Gear button — fixed position at bottom of the detail pane.
    const equipBtn = this.add
      .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x335533)
      .setStrokeStyle(2, 0x66aa66);
    this.detailContainer.add(equipBtn);
    this.detailContainer.add(
      this.add
        .text(DETAIL_TEXT_X + 80, 430, 'Equip Gear', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    equipBtn.setInteractive({ useHandCursor: true });
    equipBtn.on('pointerdown', () => {
      this.scene.launch('barracks_equip', { heroId: hero.id });
      this.scene.pause();
    });
  }
```

Replace the whole block (everything from the `// Equip Gear button` comment up to and including the `equipBtn.on(...)` call, but NOT the closing `}` of `rebuildDetail`) with:

```ts
    // Bottom action row — either normal (Equip Gear + Retire) or confirm
    // (warning + Cancel + Confirm Retire).
    if (!this.confirmRetirePending) {
      // Equip Gear — left slot
      const equipBtn = this.add
        .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x335533)
        .setStrokeStyle(2, 0x66aa66);
      this.detailContainer.add(equipBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 80, 430, 'Equip Gear', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      equipBtn.setInteractive({ useHandCursor: true });
      equipBtn.on('pointerdown', () => {
        this.scene.launch('barracks_equip', { heroId: hero.id });
        this.scene.pause();
      });

      // Retire — right slot, destructive red
      const retireBtn = this.add
        .rectangle(DETAIL_TEXT_X + 230, 430, 140, 32, 0x553333)
        .setStrokeStyle(2, 0x885555);
      this.detailContainer.add(retireBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 230, 430, 'Retire', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      retireBtn.setInteractive({ useHandCursor: true });
      retireBtn.on('pointerdown', () => {
        this.confirmRetirePending = true;
        this.rebuildDetail();
      });
    } else {
      // Confirm row — warning text above, Cancel + Confirm Retire below
      const rosterLen = appState.get().roster.heroes.length;
      let warning = `Retire ${hero.name}? Hero is gone forever. No refund.`;
      if (rosterLen - 1 < 3) {
        warning += ' ⚠ Roster will drop below 3 — recruit at the Tavern before starting a run.';
      }

      this.detailContainer.add(
        this.add
          .text(DETAIL_PANE_CX, 405, warning, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ff6666',
            align: 'center',
            wordWrap: { width: 400 },
          })
          .setOrigin(0.5, 1),
      );

      // Cancel — left slot, muted gray
      const cancelBtn = this.add
        .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x444444)
        .setStrokeStyle(2, 0x888888);
      this.detailContainer.add(cancelBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 80, 430, 'Cancel', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      cancelBtn.setInteractive({ useHandCursor: true });
      cancelBtn.on('pointerdown', () => {
        this.confirmRetirePending = false;
        this.rebuildDetail();
      });

      // Confirm Retire — right slot, destructive red
      const confirmBtn = this.add
        .rectangle(DETAIL_TEXT_X + 230, 430, 140, 32, 0x553333)
        .setStrokeStyle(2, 0x885555);
      this.detailContainer.add(confirmBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 230, 430, 'Confirm Retire', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      confirmBtn.setInteractive({ useHandCursor: true });
      confirmBtn.on('pointerdown', () => {
        appState.update((s) => ({ ...s, roster: removeHero(s.roster, hero.id) }));
        this.scene.restart();
      });
    }
  }
```

Reference values used:
- `DETAIL_TEXT_X = 590` → `+80 = 670` (left slot x), `+230 = 820` (right slot x). Both sit inside the detail pane (x=495–935).
- `DETAIL_PANE_CX = 715` (warning text x).
- y=430 for the button row (matches the existing Equip Gear position); y=405 with `setOrigin(0.5, 1)` for the warning text (bottom-anchored so multi-line wraps grow upward).

- [ ] **Step 1.6: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green / build succeeds. Test count unchanged from the baseline captured in Step 1.1.

- [ ] **Step 1.7: Commit**

```bash
git add src/scenes/barracks_panel_scene.ts
git commit -m "feat(barracks): retire hero with inline confirm"
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Single task landed in 1 commit** with green tests + tsc + build.
- [ ] **No `phaser` imports outside `src/scenes/`, `src/ui/`, `src/render/`, `src/main.ts`** (unchanged from baseline — `barracks_panel_scene.ts` already imports Phaser).
- [ ] **Data layer untouched** — `removeHero` is the existing pure helper from `src/camp/roster.ts`; no new helper added.
- [ ] **Save schema untouched** — the mutation goes through the existing `appState.update` path.
- [ ] **Manual play verification:**
  - Open Barracks with 4+ heroes. Detail pane shows Equip Gear (green) + Retire (red) side by side at the bottom.
  - Click Retire. Buttons swap to Cancel (gray) + Confirm Retire (red). Warning line appears above in red, single line for full rosters.
  - Click Cancel. Buttons revert to Equip Gear + Retire. No state change.
  - Click Retire on hero A → click hero B in the list. Detail pane rebuilds for hero B in normal state (Equip Gear + Retire); confirm pending was cleared by `selectHero`.
  - Click Retire → click Confirm Retire. Scene restarts. The retired hero is gone from the list. The first remaining hero is selected (or "No heroes — visit the Tavern" if last). Title text shows updated `N / capacity`.
  - Open Barracks with exactly 3 heroes. Click Retire on any. Warning text wraps to multiple lines and includes the "⚠ Roster will drop below 3" notice. Confirm proceeds normally; post-confirm the title shows `2 / 12`.
  - Open Barracks with 1 hero. Click Retire → Confirm. Scene restarts; "No heroes — visit the Tavern to recruit." message renders.
  - Open Barracks → Equip Gear → exit BarracksEquipScene back to Barracks. Detail pane resumes via the existing RESUME handler in normal state (the field's `false` value persists across the launch+resume cycle since the parent scene is paused, not destroyed).
  - ESC closes Barracks normally; reopening starts in normal state.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 14 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +0 (UI/scene convention).
