import { ConstraintMode, Clickable, Frame, UiScene } from 'phaser-pixui';
import type { EventOutcome } from '@run/event_resolver';
import { applyEventChoice } from '@run/event_resolver';
import { currentNode } from '@run/run_state';
import { EVENTS, describePayload, type EventCard, type EventChoice } from '@data/events';
import type { Item } from '@data/types';
import { heroToLoadout } from '@render/hero_loadout';
import { PixuiPaperdoll } from '@render/pixui_paperdoll';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { createRngFromState } from '@util/rng';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { appState } from './app_state';

// Canvas geometry assumed by outcome-line placement (matches viewportConstraints max).
// Panel is centered at canvas center so panel-relative y = PANEL_CY + offset.
const PANEL_CX = 480;
const PANEL_CY = 270;

// Module-level state survives scene.restart() between overlay-state transitions.
// Reset to defaults on first-open (when scene starts) and on outcome-dismiss.
let _overlayState: 'card' | 'hero_picker' | 'outcome' = 'card';
let _pendingChoiceIndex: 0 | 1 = 0;
let _lastOutcome: EventOutcome | undefined;

// Panel dimensions.
const PANEL_W = 540;
const PANEL_H = 380;

// Card state layout.
const BODY_Y_REL = -60;
const BODY_WRAP_W = 460;
const CHOICE_W = 440;
const CHOICE_H = 64;
const CHOICE_A_Y_REL = 40;
const CHOICE_B_Y_REL = 116;

// Hero picker state layout.
const HERO_ROW_W = 460;
const HERO_ROW_H = 70;
const HERO_ROW_Y_BASE_REL = -75;
const HERO_ROW_STRIDE = 80;
const PAPERDOLL_SCALE = 2;
const PAPERDOLL_ROW_OFFSET_X = -200;

// Outcome state layout.
const OUTCOME_LINE_HEIGHT = 22;
const OUTCOME_START_Y_REL = -90;
const DISMISS_BUTTON_Y_REL = 110;
const DISMISS_BUTTON_W = 200;
const DISMISS_BUTTON_H = 36;

// String hex for raw Phaser text (outcome lines use this.add.text because pixui
// TextArea has no per-instance tint support).
const RARITY_COLOR: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};
const COLOR_HP_GAIN = '#44cc44';
const COLOR_HP_LOSS = '#cc6666';
const COLOR_GOLD = '#ffcc66';
const COLOR_LOST = '#aa66aa';

export class EventOverlayScene extends UiScene {
  constructor() {
    super({
      key: 'event_overlay',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    // On initial open (card state with no pending outcome), reset module state
    // so a re-launch doesn't inherit a previous run's outcome or picker state.
    if (_overlayState === 'card' && _lastOutcome === undefined) {
      _pendingChoiceIndex = 0;
    }

    // Full-canvas dim overlay — raw Phaser (pixui has no bare-canvas primitive).
    // setInteractive() blocks clicks from reaching scenes below.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    const panel = this.insert.center.frame({ width: PANEL_W, height: PANEL_H });

    if (_overlayState === 'card') {
      this.buildCardState(panel);
    } else if (_overlayState === 'hero_picker') {
      this.buildHeroPickerState(panel);
    } else {
      this.buildOutcomeState(panel);
    }

    this.input.keyboard?.on('keydown-ESC', () => this.handleEsc());
  }

  // ── Card state ──────────────────────────────────────────────────────────────

  private buildCardState(panel: Frame): void {
    // currentCard() reads the current node's cardId; only safe before applyChoice
    // has advanced currentNodeId. The 'outcome' state runs *after* that advance,
    // so it must not call currentCard() — it reads from _lastOutcome instead.
    const card = this.currentCard();

    panel.insert.top.textArea({ y: 20, text: 'Event' });

    panel.insert.center.textArea({
      y: BODY_Y_REL,
      // Pass an explicit width so the textArea wraps body text without overflowing the panel.
      width: BODY_WRAP_W,
      text: card.body,
    });

    this.buildChoiceButton(panel, card.choices[0], 0, CHOICE_A_Y_REL);
    this.buildChoiceButton(panel, card.choices[1], 1, CHOICE_B_Y_REL);
  }

  private buildChoiceButton(
    panel: Frame,
    choice: EventChoice,
    index: 0 | 1,
    yRel: number,
  ): void {
    const subtitle =
      choice.payloads.length === 0
        ? 'Walk away'
        : choice.payloads.map(describePayload).join(' · ');

    // Frame + Clickable for title + subtitle visual hierarchy (same fallback-B
    // pattern as PerkOverlay — pixui.Button is single-string only).
    const choiceFrame = panel.insert.center.frame({
      y: yRel,
      width: CHOICE_W,
      height: CHOICE_H,
    });

    const border = choiceFrame.insert.center.rectangle({
      width: CHOICE_W,
      height: CHOICE_H,
      borderColor: 0x888888,
      borderWidth: 1,
    });

    choiceFrame.insert.top.textArea({ y: 10, text: choice.label });
    choiceFrame.insert.bottom.textArea({ y: 10, text: subtitle });

    const clickable = new Clickable(this, {
      width: CHOICE_W,
      height: CHOICE_H,
      onClick: () => this.onChoiceClicked(index),
    });
    choiceFrame.attach(clickable);

    clickable.events.on('pointerover', () => {
      border.borderColor = 0xffcc66;
      border.borderWidth = 2;
    });
    clickable.events.on('pointerout', () => {
      border.borderColor = 0x888888;
      border.borderWidth = 1;
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

  // ── Hero picker state ────────────────────────────────────────────────────────

  private buildHeroPickerState(panel: Frame): void {
    panel.insert.top.textArea({ y: 20, text: 'Pick a hero to be Lost.' });

    // Back button — returns to card state.
    const backFrame = panel.insert.topRight.frame({
      x: 8,
      y: 8,
      width: 60,
      height: 26,
    });
    const backBorder = backFrame.insert.center.rectangle({
      width: 60,
      height: 26,
      borderColor: 0x888888,
      borderWidth: 1,
    });
    backFrame.insert.center.textArea({ text: 'Back' });
    const backClickable = new Clickable(this, {
      width: 60,
      height: 26,
      onClick: () => {
        _overlayState = 'card';
        this.scene.restart();
      },
    });
    backFrame.attach(backClickable);
    backClickable.events.on('pointerover', () => {
      backBorder.borderColor = 0xffcc66;
    });
    backClickable.events.on('pointerout', () => {
      backBorder.borderColor = 0x888888;
    });

    const run = appState.get().runState!;
    for (let i = 0; i < run.party.length; i++) {
      this.buildHeroRow(panel, i);
    }
  }

  private buildHeroRow(panel: Frame, heroIndex: number): void {
    const run = appState.get().runState!;
    const hero = run.party[heroIndex];
    const yRel = HERO_ROW_Y_BASE_REL + heroIndex * HERO_ROW_STRIDE;

    const rowFrame = panel.insert.center.frame({
      y: yRel,
      width: HERO_ROW_W,
      height: HERO_ROW_H,
    });

    rowFrame.insert.center.rectangle({
      width: HERO_ROW_W,
      height: HERO_ROW_H,
      borderColor: 0x444444,
      borderWidth: 1,
    });

    // Paperdoll — sub-frame left of row center.
    const dollFrame = rowFrame.insert.center.frame({
      x: PAPERDOLL_ROW_OFFSET_X,
      y: 0,
      width: PAPERDOLL_SCALE * 16,
      height: PAPERDOLL_SCALE * 16,
    });
    const paperdoll = new PixuiPaperdoll(this, heroToLoadout(hero), {
      scale: PAPERDOLL_SCALE,
    });
    dollFrame.attach(paperdoll);

    // Name + HP to the right of the paperdoll.
    rowFrame.insert.center.textArea({ x: -100, y: -10, text: hero.name });
    rowFrame.insert.center.textArea({
      x: -100,
      y: 10,
      text: `${hero.currentHp}/${hero.maxHp} HP`,
    });

    // Pick button — right side of row.
    const pickFrame = rowFrame.insert.right.frame({
      x: 8,
      y: 0,
      width: 60,
      height: 30,
    });
    const pickBorder = pickFrame.insert.center.rectangle({
      width: 60,
      height: 30,
      borderColor: 0x66aa66,
      borderWidth: 1,
    });
    pickFrame.insert.center.textArea({ text: 'Pick' });
    const pickClickable = new Clickable(this, {
      width: 60,
      height: 30,
      onClick: () => this.applyChoice(_pendingChoiceIndex, heroIndex),
    });
    pickFrame.attach(pickClickable);
    pickClickable.events.on('pointerover', () => {
      pickBorder.borderColor = 0xffcc66;
    });
    pickClickable.events.on('pointerout', () => {
      pickBorder.borderColor = 0x66aa66;
    });
  }

  // ── Outcome state ────────────────────────────────────────────────────────────

  private buildOutcomeState(panel: Frame): void {
    panel.insert.top.textArea({ y: 20, text: 'Event · Outcome' });

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
      lines.push({
        text: `${sign}${outcome.goldDelta}g`,
        color: COLOR_GOLD,
      });
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
      lines.push({
        text: `${outcome.heroLost.heroName} is Lost.`,
        color: COLOR_LOST,
      });
    }

    if (lines.length === 0) {
      panel.insert.center.textArea({ text: 'Nothing happened.' });
    } else {
      // Outcome lines need per-line color; pixui TextArea has no tint property
      // (confirmed in shop_overlay_scene.ts comment). Use raw Phaser text at
      // absolute canvas coords — same approach as the original scene.
      const startY = PANEL_CY + OUTCOME_START_Y_REL;
      let cursorY = startY;
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

    // Dismiss button.
    const dismissFrame = panel.insert.center.frame({
      y: DISMISS_BUTTON_Y_REL,
      width: DISMISS_BUTTON_W,
      height: DISMISS_BUTTON_H,
    });

    const dismissBorder = dismissFrame.insert.center.rectangle({
      width: DISMISS_BUTTON_W,
      height: DISMISS_BUTTON_H,
      borderColor: 0xaa66aa,
      borderWidth: 2,
    });

    dismissFrame.insert.center.textArea({ text: 'Dismiss' });

    const dismissClickable = new Clickable(this, {
      width: DISMISS_BUTTON_W,
      height: DISMISS_BUTTON_H,
      onClick: () => this.dismiss(),
    });
    dismissFrame.attach(dismissClickable);
    dismissClickable.events.on('pointerover', () => {
      dismissBorder.borderColor = 0xffcc66;
    });
    dismissClickable.events.on('pointerout', () => {
      dismissBorder.borderColor = 0xaa66aa;
    });
  }

  // ── Shared helpers ───────────────────────────────────────────────────────────

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
    // Click-to-advance: stay at the event node and flag awaitingFork. When the
    // player dismisses the outcome panel and the dungeon scene resumes, it'll
    // light up the next-row choice as a click target rather than auto-walking.
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
    // outcome state
    this.dismiss();
  }

  private dismiss(): void {
    // Reset module state so next open starts fresh.
    _overlayState = 'card';
    _lastOutcome = undefined;
    _pendingChoiceIndex = 0;
    this.scene.stop();
    this.scene.resume('corridor');
  }
}
