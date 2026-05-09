import * as Phaser from 'phaser';
import type { EventOutcome } from '@run/event_resolver';
import { applyEventChoice } from '@run/event_resolver';
import { currentNode } from '@run/run_state';
import { EVENTS, describePayload, type EventCard, type EventChoice } from '@data/events';
import type { Item } from '@data/types';
import { heroToLoadout } from '@render/hero_loadout';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import {
  assertWidgetAssetsLoaded,
  createBitmapText,
  createPanel,
  createPaperdoll,
} from '@ui/widgets';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

// Module-level state survives scene.restart() between overlay-state
// transitions. Reset on first-open (when scene starts) and on
// outcome-dismiss.
let _overlayState: 'card' | 'hero_picker' | 'outcome' = 'card';
let _pendingChoiceIndex: 0 | 1 = 0;
let _lastOutcome: EventOutcome | undefined;

// Panel — centered on canvas.
const PANEL_W = 540;
const PANEL_H = 380;
const PANEL_X = 480 - PANEL_W / 2; // 210
const PANEL_Y = 270 - PANEL_H / 2; // 80
const PANEL_CX = 480;
const PANEL_CY = 270;

// Card layout.
const BODY_Y = PANEL_CY - 60; // 210
const BODY_WRAP_W = 460;
const CHOICE_W = 440;
const CHOICE_H = 64;
const CHOICE_A_Y = PANEL_CY + 40;  // 310
const CHOICE_B_Y = PANEL_CY + 116; // 386

// Hero picker layout.
const HERO_ROW_W = 460;
const HERO_ROW_H = 70;
const HERO_ROW_Y_BASE = PANEL_CY - 75;
const HERO_ROW_STRIDE = 80;
const PAPERDOLL_SCALE = 2;
const PAPERDOLL_OFFSET_X = -200; // from row center

// Outcome layout.
const OUTCOME_LINE_HEIGHT = 22;
const OUTCOME_START_Y = PANEL_CY - 90;
const DISMISS_BUTTON_Y = PANEL_CY + 110;
const DISMISS_BUTTON_W = 200;
const DISMISS_BUTTON_H = 36;

// Per-line outcome colors (raw Phaser text — bitmap text has only uniform tint).
const RARITY_COLOR: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};
const COLOR_HP_GAIN = '#44cc44';
const COLOR_HP_LOSS = '#cc6666';
const COLOR_GOLD = '#ffcc66';
const COLOR_LOST = '#aa66aa';

export class EventOverlayScene extends Phaser.Scene {
  constructor() {
    super('event_overlay');
  }

  create(): void {
    assertWidgetAssetsLoaded(this);

    if (_overlayState === 'card' && _lastOutcome === undefined) {
      _pendingChoiceIndex = 0;
    }

    // Dim overlay.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    if (_overlayState === 'card') {
      this.buildCardState();
    } else if (_overlayState === 'hero_picker') {
      this.buildHeroPickerState();
    } else {
      this.buildOutcomeState();
    }

    this.input.keyboard?.on('keydown-ESC', () => this.handleEsc());
  }

  // ── Card state ─────────────────────────────────────────────────────────────

  private buildCardState(): void {
    const card = this.currentCard();

    createBitmapText({
      scene: this,
      x: PANEL_CX,
      y: PANEL_Y + 20,
      text: 'Event',
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    // Body — needs word wrap; raw Phaser text supports wordWrap.
    this.add
      .text(PANEL_CX, BODY_Y, card.body, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#dddddd',
        wordWrap: { width: BODY_WRAP_W },
        align: 'center',
      })
      .setOrigin(0.5);

    this.buildChoiceCard(card.choices[0], 0, CHOICE_A_Y);
    this.buildChoiceCard(card.choices[1], 1, CHOICE_B_Y);
  }

  // Choice card with title + subtitle + hover highlight. Hand-rolled (not
  // Button widget) because Button is single-string.
  private buildChoiceCard(choice: EventChoice, index: 0 | 1, cy: number): void {
    const subtitle =
      choice.payloads.length === 0
        ? 'Walk away'
        : choice.payloads.map(describePayload).join(' · ');

    const cardTop = cy - CHOICE_H / 2;

    const card = this.add
      .rectangle(PANEL_CX, cy, CHOICE_W, CHOICE_H, 0x222222)
      .setStrokeStyle(1, 0x888888);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerover', () => card.setStrokeStyle(2, 0xffcc66));
    card.on('pointerout', () => card.setStrokeStyle(1, 0x888888));
    card.on('pointerup', () => this.onChoiceClicked(index));

    createBitmapText({
      scene: this,
      x: PANEL_CX,
      y: cardTop + 10,
      text: choice.label,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });
    createBitmapText({
      scene: this,
      x: PANEL_CX,
      y: cardTop + CHOICE_H - 26,
      text: subtitle,
      font: 'small',
      size: 16,
      originX: 0.5,
    });
  }

  private onChoiceClicked(index: 0 | 1): void {
    const card = this.currentCard();
    const choice = card.choices[index];
    const needsHeroPick = choice.payloads.some((p) => p.kind === 'lose_hero');
    if (needsHeroPick) {
      _pendingChoiceIndex = index;
      _overlayState = 'hero_picker';
      this.scene.restart();
    } else {
      this.applyChoice(index);
    }
  }

  // ── Hero picker state ──────────────────────────────────────────────────────

  private buildHeroPickerState(): void {
    createBitmapText({
      scene: this,
      x: PANEL_CX,
      y: PANEL_Y + 20,
      text: 'Pick a hero to be Lost.',
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    // Back button (small, top-right of panel inner).
    this.buildSmallBorderedButton(
      PANEL_X + PANEL_W - 8 - 60,
      PANEL_Y + 8,
      60,
      26,
      'Back',
      0x888888,
      () => {
        _overlayState = 'card';
        this.scene.restart();
      },
    );

    const run = appState.get().runState!;
    for (let i = 0; i < run.party.length; i++) {
      this.buildHeroRow(i);
    }
  }

  private buildHeroRow(heroIndex: number): void {
    const run = appState.get().runState!;
    const hero = run.party[heroIndex];
    const cy = HERO_ROW_Y_BASE + heroIndex * HERO_ROW_STRIDE;

    // Row chrome.
    this.add
      .rectangle(PANEL_CX, cy, HERO_ROW_W, HERO_ROW_H, 0x111111)
      .setStrokeStyle(1, 0x444444);

    // Paperdoll (left of row center).
    createPaperdoll({
      scene: this,
      x: PANEL_CX + PAPERDOLL_OFFSET_X,
      y: cy,
      loadout: heroToLoadout(hero),
      scale: PAPERDOLL_SCALE,
    });

    // Name + HP (right of paperdoll).
    createBitmapText({
      scene: this,
      x: PANEL_CX - 100,
      y: cy - 18,
      text: hero.name,
      font: 'medium',
      size: 16,
    });
    createBitmapText({
      scene: this,
      x: PANEL_CX - 100,
      y: cy + 2,
      text: `${hero.currentHp}/${hero.maxHp} HP`,
      font: 'small',
      size: 16,
    });

    // Pick button (right side of row).
    this.buildSmallBorderedButton(
      PANEL_CX + HERO_ROW_W / 2 - 8 - 60,
      cy - 15,
      60,
      30,
      'Pick',
      0x66aa66,
      () => this.applyChoice(_pendingChoiceIndex, heroIndex),
    );
  }

  // ── Outcome state ──────────────────────────────────────────────────────────

  private buildOutcomeState(): void {
    createBitmapText({
      scene: this,
      x: PANEL_CX,
      y: PANEL_Y + 20,
      text: 'Event - Outcome',
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    if (_lastOutcome === undefined) {
      throw new Error('event_overlay: outcome state entered without _lastOutcome set');
    }
    const outcome = _lastOutcome;
    const lines: { text: string; color: string; subText?: string }[] = [];

    if (outcome.hpChanges) {
      const run = appState.get().runState!;
      for (const ch of outcome.hpChanges) {
        const hero = run.party[ch.heroIndex];
        const name = hero ? hero.name : `Hero ${ch.heroIndex}`;
        const sign = ch.delta >= 0 ? '+' : '';
        lines.push({
          text: `${name}: ${sign}${ch.delta} HP`,
          color: ch.delta >= 0 ? COLOR_HP_GAIN : COLOR_HP_LOSS,
        });
      }
    }

    if (outcome.goldDelta !== undefined && outcome.goldDelta !== 0) {
      const sign = outcome.goldDelta >= 0 ? '+' : '';
      lines.push({ text: `${sign}${outcome.goldDelta}g`, color: COLOR_GOLD });
    }

    if (outcome.itemAdded) {
      const item: Item = outcome.itemAdded;
      const affix = itemAffixDescription(item);
      lines.push({
        text: `Got: ${itemDisplayName(item)}`,
        color: RARITY_COLOR[item.rarity],
        subText: affix.length > 0 ? affix : undefined,
      });
    }

    if (outcome.heroLost) {
      lines.push({ text: `${outcome.heroLost.heroName} is Lost.`, color: COLOR_LOST });
    }

    if (lines.length === 0) {
      createBitmapText({
        scene: this,
        x: PANEL_CX,
        y: PANEL_CY - 8,
        text: 'Nothing happened.',
        font: 'small',
        size: 16,
        originX: 0.5,
      });
    } else {
      let cursorY = OUTCOME_START_Y;
      for (const line of lines) {
        this.add
          .text(PANEL_CX, cursorY, line.text, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: line.color,
          })
          .setOrigin(0.5);
        cursorY += OUTCOME_LINE_HEIGHT;
        if (line.subText) {
          this.add
            .text(PANEL_CX, cursorY, line.subText, {
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#999999',
            })
            .setOrigin(0.5);
          cursorY += 18;
        }
      }
    }

    // Dismiss button — same hover-highlight pattern as the choice cards.
    this.buildSmallBorderedButton(
      PANEL_CX - DISMISS_BUTTON_W / 2,
      DISMISS_BUTTON_Y - DISMISS_BUTTON_H / 2,
      DISMISS_BUTTON_W,
      DISMISS_BUTTON_H,
      'Dismiss',
      0xaa66aa,
      () => this.dismiss(),
    );
  }

  // Hover-highlighted bordered button. Single rectangle handles visual +
  // click target; matches the perk-card and choice-card pattern. Default
  // border color, gold-on-hover.
  private buildSmallBorderedButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    borderColor: number,
    onClick: () => void,
  ): void {
    const rect = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, 0x222222)
      .setStrokeStyle(2, borderColor);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => rect.setStrokeStyle(2, 0xffcc66));
    rect.on('pointerout', () => rect.setStrokeStyle(2, borderColor));
    rect.on('pointerup', onClick);

    createBitmapText({
      scene: this,
      x: x + w / 2,
      y: y + h / 2,
      text: label,
      font: 'medium',
      size: 16,
      originX: 0.5,
      originY: 0.42,
    });
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  private currentCard(): EventCard {
    const run = appState.get().runState!;
    const node = currentNode(run);
    if (node.type !== 'event') {
      throw new Error(`event_overlay: current node is '${node.type}', not 'event'`);
    }
    return EVENTS[node.cardId];
  }

  private applyChoice(choiceIndex: 0 | 1, selectedHeroIndex?: number): void {
    const initialRs = appState.get().runState!;
    const node = currentNode(initialRs);
    if (node.type !== 'event') {
      throw new Error(`event_overlay: applyChoice called when current node is '${node.type}'`);
    }
    const card = EVENTS[node.cardId];
    const args = selectedHeroIndex !== undefined ? { selectedHeroIndex } : {};
    const rng = this.rng();
    const result = applyEventChoice(initialRs, card, choiceIndex, args, rng);
    const awaitingClick = { ...result.runState, awaitingFork: true };

    appState.update((s) => ({
      ...s,
      runState: awaitingClick,
      runRngState: rng.getState(),
    }));

    _lastOutcome = result.outcome;
    _overlayState = 'outcome';
    this.scene.restart();
  }

  private rng() {
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      throw new Error('EventOverlayScene: runRngState missing');
    }
    return createRngFromState(rngState);
  }

  private handleEsc(): void {
    if (_overlayState === 'card') return;
    if (_overlayState === 'hero_picker') {
      _overlayState = 'card';
      this.scene.restart();
      return;
    }
    this.dismiss();
  }

  private dismiss(): void {
    _overlayState = 'card';
    _lastOutcome = undefined;
    _pendingChoiceIndex = 0;
    this.scene.stop();
    this.scene.resume('corridor');
  }
}
