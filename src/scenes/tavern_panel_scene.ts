import * as Phaser from 'phaser';
import { nextLevel, tavernCandidateCount } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import {
  ensureCandidatesForCap,
  generateCandidate,
  generateCandidates,
  HIRE_COST,
  REROLL_COST,
} from '@camp/buildings/tavern';
import { addHero, canAdd, listHeroes } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import type { Hero } from '@heroes/hero';
import { HeroCard } from '@ui/hero_card';
import { createRng, type Rng } from '@util/rng';
import { appState } from './app_state';

interface HireButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  reason: Phaser.GameObjects.Text;
  card: HeroCard;
}

// Per-candidate-count slot positions. Tavern uses HeroCard `small` (180px wide).
// Each row is symmetric around the panel center (x=480) so the layout stays
// balanced as the tavern upgrades from L1 (3 candidates) to L3 (5 candidates).
//
// L3 (5 candidates) is the tightest: 180px center spacing means cards touch
// edge-to-edge across the 920px panel (cards span 30-210, 210-390, 390-570,
// 570-750, 750-930). Future polish: shrink HeroCard or wrap to two rows for
// more breathing room — current spec only requires "N candidates show", not
// pixel-perfect spacing.
const SLOT_X_BY_COUNT: Record<3 | 4 | 5, readonly number[]> = {
  3: [170, 480, 790],
  4: [195, 385, 575, 765],
  5: [120, 300, 480, 660, 840],
};
const SLOT_CARD_Y = 230;
const HIRE_BTN_Y = 320;
const REASON_Y = 345;

export class TavernPanelScene extends Phaser.Scene {
  private candidates: Hero[] = [];
  private rng!: Rng;
  private hireButtons: HireButton[] = [];
  private footerText!: Phaser.GameObjects.Text;
  private rerollButton?: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };

  constructor() {
    super('tavern_panel');
  }

  create(): void {
    // Phaser scene instances are reused across launches; reset per-launch state
    // so a re-open does not retain destroyed game objects from a prior session.
    this.candidates = [];
    this.hireButtons = [];
    this.rerollButton = undefined;

    this.buildPanelChrome();

    this.rng = createRng(Date.now());
    const state = appState.get();
    const tavernLevel = state.buildingLevels.tavern;
    const targetCount = tavernCandidateCount(tavernLevel);
    const persisted = state.tavernCandidates;
    const ensured = ensureCandidatesForCap(
      persisted,
      targetCount,
      this.rng,
      state.unlocks.classes,
    );
    if (ensured !== persisted) {
      // ensureCandidatesForCap regenerated (empty save / cap mismatch). Persist.
      appState.update((s) => ({ ...s, tavernCandidates: ensured }));
    }
    this.candidates = [...ensured];

    const slotXs = SLOT_X_BY_COUNT[this.candidates.length as 3 | 4 | 5];
    for (let i = 0; i < this.candidates.length; i++) {
      this.buildSlot(i, slotXs[i]);
    }
    this.buildFooter();
    this.buildRerollButton();
    this.buildUpgradeButton();

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
    // `small` variant (180px wide) is required to fit up to 5 cards across the
    // 920px panel at tavern L3. Earlier `large` (280px) only fit 3 candidates;
    // it still showed full stats + trait text, but that doesn't scale. Small
    // shows trait shortDescription instead of the full description — the
    // tradeoff matches Barracks/Hospital/Expeditions which all use small for
    // multi-card grids.
    const card = new HeroCard(this, x, SLOT_CARD_Y, this.candidates[index], {
      size: 'small',
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

  private buildRerollButton(): void {
    const x = 800;
    const y = 113;
    const bg = this.add
      .rectangle(x, y, 130, 28, 0x333333)
      .setStrokeStyle(2, 0x555555);
    const label = this.add
      .text(x, y, `Reroll · ${REROLL_COST}g`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#777777',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.reroll());
    this.rerollButton = { bg, label };
  }

  private reroll(): void {
    const state = appState.get();
    if (balance(state.vault) < REROLL_COST) return;

    const tavernLevel = state.buildingLevels.tavern;
    const fresh = generateCandidates(
      this.rng,
      state.unlocks.classes,
      tavernCandidateCount(tavernLevel),
    );

    appState.update((s) => ({
      ...s,
      vault: spend(s.vault, REROLL_COST),
      tavernCandidates: fresh,
    }));

    this.candidates = [...fresh];
    for (let i = 0; i < this.hireButtons.length; i++) {
      this.hireButtons[i].card.setHero(this.candidates[i]);
    }
    this.refreshButtons();
    this.refreshFooter();
  }

  private buildUpgradeButton(): void {
    const level = appState.get().buildingLevels.tavern;
    const next = nextLevel('tavern', level);
    if (next === null) return; // Already at max — no button rendered.

    const gold = balance(appState.get().vault);
    const canAfford = gold >= next.upgradeCost;

    const x = 160;
    const y = 113;
    const bgColor = canAfford ? 0x2a4a2a : 0x333333;
    const strokeColor = canAfford ? 0x44cc44 : 0x555555;
    const labelColor = canAfford ? '#ffffff' : '#777777';

    const bg = this.add
      .rectangle(x, y, 160, 28, bgColor)
      .setStrokeStyle(2, strokeColor);
    this.add
      .text(x, y, `Upgrade · ${next.upgradeCost}g`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: labelColor,
      })
      .setOrigin(0.5);
    this.add
      .text(x, y + 22, `→ ${next.unlockDescription}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    if (canAfford) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        appState.update((s) => applyBuildingUpgrade(s, 'tavern'));
        this.scene.restart();
      });
    }
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
    const replacement = generateCandidate(this.rng, state.unlocks.classes);
    this.candidates[slotIndex] = replacement;

    appState.update((s) => ({
      ...s,
      vault: spend(s.vault, HIRE_COST),
      roster: addHero(s.roster, hired),
      tavernCandidates: [...this.candidates],
    }));

    this.hireButtons[slotIndex].card.setHero(replacement);
    this.refreshButtons();
    this.refreshFooter();
  }

  private refreshButtons(): void {
    const state = appState.get();
    const gold = balance(state.vault);
    const canAddHero = canAdd(state.roster);
    const canAffordHire = gold >= HIRE_COST;
    const enabled = canAddHero && canAffordHire;

    let reason = '';
    if (!canAffordHire) reason = 'Not enough gold';
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

    // Reroll button is gated only by gold (rerolling doesn't add to roster).
    if (this.rerollButton) {
      const canAffordReroll = gold >= REROLL_COST;
      if (canAffordReroll) {
        this.rerollButton.bg.setFillStyle(0x2a4a2a).setStrokeStyle(2, 0x44cc44);
        this.rerollButton.label.setColor('#ffffff');
      } else {
        this.rerollButton.bg.setFillStyle(0x333333).setStrokeStyle(2, 0x555555);
        this.rerollButton.label.setColor('#777777');
      }
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
