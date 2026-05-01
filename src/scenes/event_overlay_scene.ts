import * as Phaser from 'phaser';
import type { EventOutcome } from '@run/event_resolver';
import { applyEventChoice } from '@run/event_resolver';
import { chooseNextNode, currentNode } from '@run/run_state';
import { EVENTS, describePayload, type EventCard, type EventChoice } from '@data/events';
import type { Item } from '@data/types';
import { Paperdoll } from '@render/paperdoll';
import { heroToLoadout } from '@render/hero_loadout';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 540;
const PANEL_H = 380;

const TITLE_Y = 110;
const BACK_X = 720;
const BACK_Y = TITLE_Y;

const BODY_Y = 150;
const BODY_WRAP_W = 460;

const CHOICE_X = PANEL_CX;
const CHOICE_W = 440;
const CHOICE_H = 64;
const CHOICE_Y_BASE = 235;
const CHOICE_STRIDE = 76;

const HERO_ROW_X = PANEL_CX;
const HERO_ROW_W = 460;
const HERO_ROW_H = 70;
const HERO_ROW_Y_BASE = 175;
const HERO_ROW_STRIDE = 80;

const OUTCOME_LINE_Y_BASE = 160;
const OUTCOME_LINE_HEIGHT = 22;
const DISMISS_BUTTON_Y = 360;
const DISMISS_BUTTON_W = 200;
const DISMISS_BUTTON_H = 36;

const RARITY_HEX: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const COLOR_HP_GAIN = '#44cc44';
const COLOR_HP_LOSS = '#cc6666';
const COLOR_GOLD = '#ffcc66';
const COLOR_LOST = '#aa66aa';

type OverlayState = 'card' | 'hero_picker' | 'outcome';

export class EventOverlayScene extends Phaser.Scene {
  private contentContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private backButton?: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
  private state: OverlayState = 'card';
  private pendingChoiceIndex: 0 | 1 = 0;
  private lastOutcome?: EventOutcome;

  constructor() {
    super('event_overlay');
  }

  create(): void {
    this.state = 'card';
    this.lastOutcome = undefined;
    this.buildBackgroundAndPanel();
    this.contentContainer = this.add.container(0, 0);
    this.rerender();

    this.input.keyboard?.on('keydown-ESC', () => this.handleEsc());
  }

  private buildBackgroundAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.titleText = this.add
      .text(PANEL_CX, TITLE_Y, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private rerender(): void {
    this.contentContainer.removeAll(true);
    this.destroyBackButton();

    if (this.state === 'card') {
      // currentCard() reads the current node's cardId; only safe before applyChoice
      // has advanced currentNodeId. The 'outcome' state runs *after* that advance,
      // so it must not call currentCard() — it reads from this.lastOutcome instead.
      this.titleText.setText('Event');
      this.buildCard(this.currentCard());
    } else if (this.state === 'hero_picker') {
      this.titleText.setText('Pick a hero to be Lost.');
      this.buildBackButton();
      this.buildHeroPicker();
    } else {
      this.titleText.setText('Event · Outcome');
      this.buildOutcome();
    }
  }

  private setOverlayState(s: OverlayState): void {
    this.state = s;
    this.rerender();
  }

  private destroyBackButton(): void {
    if (this.backButton) {
      this.backButton.bg.destroy();
      this.backButton.label.destroy();
      this.backButton = undefined;
    }
  }

  private buildBackButton(): void {
    const bg = this.add
      .rectangle(BACK_X, BACK_Y, 60, 26, 0x444444)
      .setStrokeStyle(1, 0x888888);
    const label = this.add
      .text(BACK_X, BACK_Y, 'Back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.setOverlayState('card'));
    this.backButton = { bg, label };
  }

  private currentCard(): EventCard {
    const run = appState.get().runState!;
    const node = currentNode(run);
    if (node.type !== 'event') {
      throw new Error(`event_overlay: current node is '${node.type}', not 'event'`);
    }
    return EVENTS[node.cardId];
  }

  private buildCard(card: EventCard): void {
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, BODY_Y, card.body, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#dddddd',
          align: 'center',
          wordWrap: { width: BODY_WRAP_W },
        })
        .setOrigin(0.5, 0),
    );

    for (let i = 0; i < 2; i++) {
      this.buildChoiceButton(card.choices[i], i as 0 | 1);
    }
  }

  private buildChoiceButton(choice: EventChoice, index: 0 | 1): void {
    const y = CHOICE_Y_BASE + index * CHOICE_STRIDE;
    const subtitle = choice.payloads.length === 0
      ? 'Walk away'
      : choice.payloads.map(describePayload).join(' · ');

    const bg = this.add
      .rectangle(CHOICE_X, y, CHOICE_W, CHOICE_H, 0x333333)
      .setStrokeStyle(1, 0x888888);
    const label = this.add
      .text(CHOICE_X, y - 12, choice.label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const subtitleText = this.add
      .text(CHOICE_X, y + 14, subtitle, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#bbbbbb',
      })
      .setOrigin(0.5);

    this.contentContainer.add(bg);
    this.contentContainer.add(label);
    this.contentContainer.add(subtitleText);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onChoiceClicked(index));
  }

  private onChoiceClicked(index: 0 | 1): void {
    const card = this.currentCard();
    const choice = card.choices[index];
    const needsHeroPick = choice.payloads.some((p) => p.kind === 'lose_hero');
    if (needsHeroPick) {
      this.pendingChoiceIndex = index;
      this.setOverlayState('hero_picker');
    } else {
      this.applyChoice(index);
    }
  }

  private buildHeroPicker(): void {
    const run = appState.get().runState!;
    for (let i = 0; i < run.party.length; i++) {
      this.buildHeroRow(i);
    }
  }

  private buildHeroRow(heroIndex: number): void {
    const run = appState.get().runState!;
    const hero = run.party[heroIndex];
    const y = HERO_ROW_Y_BASE + heroIndex * HERO_ROW_STRIDE;

    const rowBg = this.add
      .rectangle(HERO_ROW_X, y, HERO_ROW_W, HERO_ROW_H, 0x222222)
      .setStrokeStyle(1, 0x444444);
    this.contentContainer.add(rowBg);

    const doll = new Paperdoll(this, HERO_ROW_X - 200, y, heroToLoadout(hero));
    doll.setScale(2);
    this.contentContainer.add(doll);

    this.contentContainer.add(
      this.add
        .text(HERO_ROW_X - 140, y - 10, hero.name, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );
    this.contentContainer.add(
      this.add
        .text(HERO_ROW_X - 140, y + 10, `${hero.currentHp}/${hero.maxHp} HP`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5),
    );

    const buttonBg = this.add
      .rectangle(HERO_ROW_X + 180, y, 60, 30, 0x335533)
      .setStrokeStyle(1, 0x66aa66);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(HERO_ROW_X + 180, y, 'Pick', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.applyChoice(this.pendingChoiceIndex, heroIndex));
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
    const advanced = chooseNextNode(result.runState, node.nextNodeIds[0]);

    appState.update((s) => ({
      ...s,
      runState: advanced,
      runRngState: rng.getState(),
    }));

    this.lastOutcome = result.outcome;
    this.setOverlayState('outcome');
  }

  private rng() {
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      throw new Error('EventOverlayScene: runRngState missing');
    }
    return createRngFromState(rngState);
  }

  private buildOutcome(): void {
    const outcome = this.lastOutcome ?? {};
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
        color: RARITY_HEX[item.rarity],
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
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, OUTCOME_LINE_Y_BASE + 40, 'Nothing happened.', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#aaaaaa',
          })
          .setOrigin(0.5),
      );
    } else {
      let cursorY = OUTCOME_LINE_Y_BASE;
      for (const line of lines) {
        this.contentContainer.add(
          this.add
            .text(PANEL_CX, cursorY, line.text, {
              fontFamily: 'monospace',
              fontSize: '14px',
              color: line.color,
            })
            .setOrigin(0.5),
        );
        cursorY += OUTCOME_LINE_HEIGHT;
        if (line.subText) {
          this.contentContainer.add(
            this.add
              .text(PANEL_CX, cursorY, line.subText, {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#999999',
              })
              .setOrigin(0.5),
          );
          cursorY += 18;
        }
      }
    }

    const buttonBg = this.add
      .rectangle(PANEL_CX, DISMISS_BUTTON_Y, DISMISS_BUTTON_W, DISMISS_BUTTON_H, 0x553355)
      .setStrokeStyle(2, 0xaa66aa);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, DISMISS_BUTTON_Y, 'Dismiss', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.closeAndAdvance());
  }

  private handleEsc(): void {
    if (this.state === 'card') return;
    if (this.state === 'hero_picker') {
      this.setOverlayState('card');
      return;
    }
    this.closeAndAdvance();
  }

  private closeAndAdvance(): void {
    this.scene.stop();
    this.scene.resume('dungeon');
  }
}
