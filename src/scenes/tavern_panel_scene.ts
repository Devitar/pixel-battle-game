import * as Phaser from 'phaser';
import {
  generateCandidate,
  generateCandidates,
  HIRE_COST,
} from '../camp/buildings/tavern';
import { addHero, canAdd, listHeroes } from '../camp/roster';
import { balance, spend } from '../camp/vault';
import type { Hero } from '../heroes/hero';
import { HeroCard } from '../ui/hero_card';
import { createRng, type Rng } from '../util/rng';
import { appState } from './app_state';

interface HireButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  reason: Phaser.GameObjects.Text;
  card: HeroCard;
}

const SLOT_X = [170, 480, 790] as const;
const SLOT_CARD_Y = 230;
const HIRE_BTN_Y = 320;
const REASON_Y = 345;

export class TavernPanelScene extends Phaser.Scene {
  private candidates: Hero[] = [];
  private rng!: Rng;
  private hireButtons: HireButton[] = [];
  private footerText!: Phaser.GameObjects.Text;

  constructor() {
    super('tavern_panel');
  }

  create(): void {
    // Phaser scene instances are reused across launches; reset per-launch state
    // so a re-open does not retain destroyed game objects from a prior session.
    this.candidates = [];
    this.hireButtons = [];

    this.buildPanelChrome();

    this.rng = createRng(Date.now());
    this.candidates = generateCandidates(this.rng, appState.get().unlocks.classes);

    SLOT_X.forEach((x, i) => this.buildSlot(i, x));
    this.buildFooter();

    this.refreshButtons();
    this.refreshFooter();

    this.buildCloseButton();
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildPanelChrome(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    this.add
      .rectangle(480, 270, 920, 340, 0x222222)
      .setStrokeStyle(2, 0x666666);
    this.add
      .text(480, 110, `Tavern · Hire Cost: ${HIRE_COST}g`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private buildSlot(index: number, x: number): void {
    const card = new HeroCard(this, x, SLOT_CARD_Y, this.candidates[index], {
      size: 'large',
    });

    const bg = this.add
      .rectangle(x, HIRE_BTN_Y, 120, 30, 0x333333)
      .setStrokeStyle(2, 0x555555);
    const label = this.add
      .text(x, HIRE_BTN_Y, `Hire (${HIRE_COST}g)`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#777777',
      })
      .setOrigin(0.5);
    const reason = this.add
      .text(x, REASON_Y, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc6666',
      })
      .setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.hire(index));

    this.hireButtons.push({ bg, label, reason, card });
  }

  private buildFooter(): void {
    this.footerText = this.add
      .text(480, 415, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(933, 113, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(933, 113, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private hire(slotIndex: number): void {
    const state = appState.get();
    if (!canAdd(state.roster) || balance(state.vault) < HIRE_COST) return;

    const hired = this.candidates[slotIndex];
    appState.update((s) => ({
      ...s,
      vault: spend(s.vault, HIRE_COST),
      roster: addHero(s.roster, hired),
    }));

    this.candidates[slotIndex] = generateCandidate(
      this.rng,
      appState.get().unlocks.classes,
    );
    this.hireButtons[slotIndex].card.setHero(this.candidates[slotIndex]);
    this.refreshButtons();
    this.refreshFooter();
  }

  private refreshButtons(): void {
    const state = appState.get();
    const gold = balance(state.vault);
    const canAddHero = canAdd(state.roster);
    const canAfford = gold >= HIRE_COST;
    const enabled = canAddHero && canAfford;

    let reason = '';
    if (!canAfford) reason = 'Not enough gold';
    else if (!canAddHero) reason = 'Roster full';

    for (const btn of this.hireButtons) {
      if (enabled) {
        btn.bg.setFillStyle(0x2a4a2a).setStrokeStyle(2, 0x44cc44);
        btn.label.setColor('#ffffff');
      } else {
        btn.bg.setFillStyle(0x333333).setStrokeStyle(2, 0x555555);
        btn.label.setColor('#777777');
      }
      btn.reason.setText(reason);
    }
  }

  private refreshFooter(): void {
    const state = appState.get();
    const gold = balance(state.vault);
    const heroes = listHeroes(state.roster).length;
    const cap = state.roster.capacity;
    this.footerText.setText(`Vault: ${gold}g · Roster: ${heroes} / ${cap}`);
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
