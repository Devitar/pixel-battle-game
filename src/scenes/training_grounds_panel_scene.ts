import * as Phaser from 'phaser';
import {
  TRAINEE_PRO_RATE,
  TRAINEE_SLOT_CAPACITY,
  nextLevel,
} from '@camp/building_levels';
import { listHeroes } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import type { Hero } from '@heroes/hero';
import type { BuildingLevel } from '@save/save';
import { Button, HeroCard } from '@ui/widgets';
import { appState } from './app_state';

// Layout — mirrors the expeditions party_picker panel size/style.
const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W  = 920;
const PANEL_H  = 500;

const TITLE_Y    = 60;
const SUBTITLE_Y = 88;

// Slot row.
const SLOT_Y = 175;
const SLOT_W = 200;
const SLOT_H = 80;
const SLOT_LABEL_Y = 120;
const SLOT_STRIDE = 220;

// Eligible grid.
const ELIGIBLE_LABEL_Y = 250;
const ELIGIBLE_Y_BASE  = 300;
const ELIGIBLE_Y_STRIDE = 64;
const ELIGIBLE_COLS = 4;
const ELIGIBLE_COL_STRIDE = 200;

// Upgrade button (bottom).
const UPGRADE_Y = 470;

/** Returns evenly spaced x-coordinates for `capacity` slots, centered on PANEL_CX. */
function slotXs(capacity: number): readonly number[] {
  const totalWidth = (capacity - 1) * SLOT_STRIDE;
  const firstX = PANEL_CX - totalWidth / 2;
  return Array.from({ length: capacity }, (_, i) => firstX + i * SLOT_STRIDE);
}

/**
 * Training Grounds panel — drag heroes from the "Eligible" grid into one of
 * the `capacity` trainee slots; trainees passively gain a fraction of run
 * XP awarded to active party members.
 *
 * Drag mechanics mirror `expeditions_panel_scene.ts` stage 2 (`buildPartyPickerStage`):
 * HeroCards are draggable, the hit-area is interactive+draggable, and
 * `card.events` re-emits Phaser drag events. We update slot state on drop,
 * then `scene.restart()` for a full re-layout.
 */
export class TrainingGroundsPanelScene extends Phaser.Scene {
  constructor() {
    super('training_grounds_panel');
  }

  create(): void {
    // Dim overlay behind the panel.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel chrome.
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x668866);

    const state = appState.get();
    const level = state.buildingLevels.training_grounds;
    const capacity = TRAINEE_SLOT_CAPACITY[level];
    const proRate = TRAINEE_PRO_RATE[level];
    const traineeIds = state.traineeHeroIds;
    const slotsUsed = traineeIds.filter((id) => id !== null).length;

    // Title + subtitle.
    this.add
      .text(PANEL_CX, TITLE_Y, `Training Grounds · Lv ${level}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#aaddaa',
      })
      .setOrigin(0.5);

    this.add
      .text(
        PANEL_CX,
        SUBTITLE_Y,
        `Slots: ${slotsUsed} / ${capacity} · Trainees gain ${Math.round(proRate * 100)}% of run XP`,
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#aaaaaa',
        },
      )
      .setOrigin(0.5);

    // Slot row label.
    this.add
      .text(PANEL_CX, SLOT_LABEL_Y, 'Trainee slots', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    // Slots + drag handlers.
    this.buildSlotsAndDrag(traineeIds, capacity);

    // Eligible grid label.
    this.add
      .text(PANEL_CX, ELIGIBLE_LABEL_Y, 'Eligible heroes (drag to a slot)', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    // Upgrade row.
    this.buildUpgradeButton(level);

    // Close button — match other panels (top-right corner of canvas, like
    // expeditions/chapel).
    new Button({
      scene: this,
      x: 908,
      y: 4,
      width: 48,
      height: 32,
      text: 'X',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.close(),
    });

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  // --- Slots + drag ---------------------------------------------------------

  private buildSlotsAndDrag(
    traineeIds: readonly (string | null)[],
    capacity: number,
  ): void {
    const xs = slotXs(capacity);
    const allHeroes = listHeroes(appState.get().roster);

    // Drop zones — one invisible interactive rect per slot. The eligible
    // and slot card drag handlers query this list (by indexOf) to find
    // which slot they were dropped into.
    const slotDropZones: Phaser.GameObjects.Rectangle[] = xs.map((x) => {
      const zone = this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H, 0x1a1a1a)
        .setInteractive({ dropZone: true });
      return zone;
    });

    // Slot frames (visual border, separate from the drop zone so we can
    // recolor based on occupancy without affecting hit-testing).
    xs.forEach((x, slotIndex) => {
      const occupied = traineeIds[slotIndex] !== null && traineeIds[slotIndex] !== undefined;
      this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H)
        .setFillStyle(0x000000, 0)
        .setStrokeStyle(2, occupied ? 0x88cc88 : 0x555555);
    });

    // Slot contents — either an empty hint or a draggable HeroCard.
    xs.forEach((x, slotIndex) => {
      const slotId = traineeIds[slotIndex] ?? null;
      if (slotId === null) {
        this.add
          .text(x, SLOT_Y, 'drag a hero here', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#666666',
            fontStyle: 'italic',
          })
          .setOrigin(0.5);
        return;
      }
      const hero = allHeroes.find((h) => h.id === slotId);
      if (!hero) {
        // Save normalization should scrub stale ids, but defensive — render
        // a placeholder rather than crashing.
        this.add
          .text(x, SLOT_Y, '(missing hero)', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#aa6666',
          })
          .setOrigin(0.5);
        return;
      }
      const card = new HeroCard({
        scene: this,
        x,
        y: SLOT_Y,
        hero,
        size: 'small',
        draggable: true,
      });
      this.installSlotCardDrag(card, hero, slotIndex, x, SLOT_Y, slotDropZones);
    });

    // Eligible grid — every hero in the roster not already assigned to a
    // slot. Drag any of them into a slot to assign (overwriting whatever
    // was there).
    const assignedSet = new Set(
      traineeIds.filter((id): id is string => id !== null),
    );
    const eligible = allHeroes.filter((h) => !assignedSet.has(h.id));

    const gridFirstX =
      PANEL_CX - ((ELIGIBLE_COLS - 1) * ELIGIBLE_COL_STRIDE) / 2;

    eligible.forEach((hero, i) => {
      const col = i % ELIGIBLE_COLS;
      const row = Math.floor(i / ELIGIBLE_COLS);
      const homeX = gridFirstX + col * ELIGIBLE_COL_STRIDE;
      const homeY = ELIGIBLE_Y_BASE + row * ELIGIBLE_Y_STRIDE;
      const card = new HeroCard({
        scene: this,
        x: homeX,
        y: homeY,
        hero,
        size: 'small',
        draggable: true,
      });
      this.installEligibleCardDrag(card, hero, homeX, homeY, slotDropZones);
    });
  }

  // Drag-from-slot: dropping on another slot swaps; dropping outside any
  // slot clears the source slot (unassigns the trainee).
  private installSlotCardDrag(
    card: HeroCard,
    hero: Hero,
    fromSlotIndex: number,
    homeX: number,
    homeY: number,
    slotDropZones: readonly Phaser.GameObjects.Rectangle[],
  ): void {
    let grabOffsetX = 0;
    let grabOffsetY = 0;

    card.events.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      grabOffsetX = pointer.x - card.container.x;
      grabOffsetY = pointer.y - card.container.y;
    });

    card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
      card.container.x = pointer.x - grabOffsetX;
      card.container.y = pointer.y - grabOffsetY;
    });

    card.events.on(
      'drop',
      (_p: Phaser.Input.Pointer, dropZone: Phaser.GameObjects.GameObject) => {
        const toSlotIndex = slotDropZones.indexOf(
          dropZone as Phaser.GameObjects.Rectangle,
        );
        if (toSlotIndex < 0) {
          card.container.x = homeX;
          card.container.y = homeY;
          return;
        }
        if (toSlotIndex === fromSlotIndex) {
          card.container.x = homeX;
          card.container.y = homeY;
          return;
        }
        this.updateSlots((ids) => {
          const next = ids.slice() as (string | null)[];
          const tmp = next[fromSlotIndex];
          next[fromSlotIndex] = next[toSlotIndex];
          next[toSlotIndex] = tmp;
          return next;
        });
        this.scene.restart();
      },
    );

    card.events.on(
      'dragend',
      (_p: Phaser.Input.Pointer, _dx: number, _dy: number, dropped: boolean) => {
        if (dropped) return;
        // Dropped outside any drop zone — unassign this slot.
        this.updateSlots((ids) =>
          ids.map((id, i) => (i === fromSlotIndex ? null : id)),
        );
        this.scene.restart();
      },
    );
    // Reference `hero` once so it's part of the closure (and not flagged as
    // unused — useful for future per-hero validation, e.g. "wounded heroes
    // can't train").
    void hero;
  }

  // Drag-from-eligible: dropping on a slot assigns (overwrites occupant);
  // dropping outside snaps back home.
  private installEligibleCardDrag(
    card: HeroCard,
    hero: Hero,
    homeX: number,
    homeY: number,
    slotDropZones: readonly Phaser.GameObjects.Rectangle[],
  ): void {
    let grabOffsetX = 0;
    let grabOffsetY = 0;

    card.events.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      grabOffsetX = pointer.x - card.container.x;
      grabOffsetY = pointer.y - card.container.y;
    });

    card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
      card.container.x = pointer.x - grabOffsetX;
      card.container.y = pointer.y - grabOffsetY;
    });

    card.events.on(
      'drop',
      (_p: Phaser.Input.Pointer, dropZone: Phaser.GameObjects.GameObject) => {
        const toSlotIndex = slotDropZones.indexOf(
          dropZone as Phaser.GameObjects.Rectangle,
        );
        if (toSlotIndex < 0) {
          card.container.x = homeX;
          card.container.y = homeY;
          return;
        }
        const heroId = hero.id;
        this.updateSlots((ids) =>
          ids.map((id, i) => (i === toSlotIndex ? heroId : id)),
        );
        this.scene.restart();
      },
    );

    card.events.on(
      'dragend',
      (_p: Phaser.Input.Pointer, _dx: number, _dy: number, dropped: boolean) => {
        if (!dropped) {
          card.container.x = homeX;
          card.container.y = homeY;
        }
      },
    );
  }

  private updateSlots(
    fn: (ids: readonly (string | null)[]) => readonly (string | null)[],
  ): void {
    appState.update((s) => ({ ...s, traineeHeroIds: fn(s.traineeHeroIds) }));
  }

  // --- Upgrade button -------------------------------------------------------

  private buildUpgradeButton(level: BuildingLevel): void {
    const next = nextLevel('training_grounds', level);
    if (!next) {
      this.add
        .text(PANEL_CX, UPGRADE_Y, 'Max level reached', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#888888',
        })
        .setOrigin(0.5);
      return;
    }
    const state = appState.get();
    const canAfford = balance(state.vault) >= next.upgradeCost;

    const label = `Upgrade to L${next.level} — ${next.upgradeCost}g`;
    const bg = this.add
      .rectangle(PANEL_CX, UPGRADE_Y, 300, 36, canAfford ? 0x336633 : 0x333333)
      .setStrokeStyle(2, canAfford ? 0x66aa66 : 0x555555);
    this.add
      .text(PANEL_CX, UPGRADE_Y, label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canAfford ? '#aaddaa' : '#888888',
      })
      .setOrigin(0.5);

    this.add
      .text(PANEL_CX, UPGRADE_Y + 22, next.unlockDescription, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    if (!canAfford) return;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.doUpgrade(next.level, next.upgradeCost));
  }

  private doUpgrade(toLevel: BuildingLevel, cost: number): void {
    appState.update((s) => {
      const nextVault = spend(s.vault, cost);
      // Pad traineeHeroIds with a null for the new slot. normalizeSaveFile
      // would do this on the next load anyway (length-matched to capacity),
      // but doing it here keeps in-memory state consistent for the very
      // next render after scene.restart().
      const nextTrainees = [...s.traineeHeroIds, null];
      return {
        ...s,
        vault: nextVault,
        buildingLevels: { ...s.buildingLevels, training_grounds: toLevel },
        traineeHeroIds: nextTrainees,
      };
    });
    this.scene.restart();
  }

  // --- Close ----------------------------------------------------------------

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
