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
import { addHero, canAdd } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import type { Hero } from '@heroes/hero';
import { isSoftlocked } from '@save/save';
import {
  Button,
  HeroCard,
  createBitmapText,
  createPanel,
} from '@ui/widgets';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

// Per-candidate-count slot positions in canvas coords (centered around
// x=480). Each card is 'small' (180px wide); the layout stays balanced as
// the tavern upgrades from L1 (3 candidates) to L3 (5 candidates).
//
// L3 (5 candidates) is the tightest: 180px center spacing means cards
// touch edge-to-edge across the 920px panel.
const SLOT_X_BY_COUNT: Record<3 | 4 | 5, readonly number[]> = {
  3: [170, 480, 790],
  4: [195, 385, 575, 765],
  5: [120, 300, 480, 660, 840],
};

const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

// Card center y (cards are 60 tall in 'small' mode, so card spans y-30..y+30).
const CARD_Y = PANEL_Y + 180;

// Hire button below the card.
const HIRE_BUTTON_Y = CARD_Y + 50;
const HIRE_BUTTON_W = 160;
const HIRE_BUTTON_H = 32;

// Hire reason text below the disabled hire button.
const HIRE_REASON_Y = HIRE_BUTTON_Y + 40;

// Reroll button at panel bottom.
const REROLL_BUTTON_Y = PANEL_Y + PANEL_H - 60;
const REROLL_BUTTON_W = 200;
const REROLL_BUTTON_H = 32;

export class TavernPanelScene extends Phaser.Scene {
  constructor() {
    super('tavern_panel');
  }

  create(): void {
    const state = appState.get();
    const tavernLevel = state.buildingLevels.tavern;
    const targetCount = tavernCandidateCount(tavernLevel);
    const rng = createRngFromState(state.campRngState);
    const free = isSoftlocked(state);
    const vaultGold = balance(state.vault);

    // Persisted candidates: ensure the count matches current cap.
    const ensured = ensureCandidatesForCap(
      state.tavernCandidates,
      targetCount,
      rng,
      state.unlocks.classes,
    );
    // ensureCandidatesForCap only advances rng when it generates new
    // candidates — so a list-unchanged result implies an rng-unchanged result.
    if (ensured !== state.tavernCandidates) {
      appState.update((s) => ({
        ...s,
        tavernCandidates: ensured,
        campRngState: rng.getState(),
      }));
    }
    const candidates = [...ensured];

    // Outer panel chrome.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    // Title (top strip).
    const headerText = free
      ? 'Tavern - Hires are free until you recover'
      : `Tavern - Hire Cost: ${HIRE_COST}g`;
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: headerText,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    // Vault + roster line (top strip, second line).
    createBitmapText({
      scene: this,
      x: 480,
      y: 36,
      text: `Vault: ${vaultGold}g · Roster: ${state.roster.heroes.length} / ${state.roster.capacity}`,
      font: 'small',
      size: 16,
      originX: 0.5,
    });

    // Close button (top strip, far right).
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

    // Tavern upgrade button (top strip, left).
    const next = nextLevel('tavern', tavernLevel);
    if (next !== null) {
      const canAfford = vaultGold >= next.upgradeCost;
      new Button({
        scene: this,
        x: 88,
        y: 4,
        width: 200,
        height: 32,
        enabled: canAfford,
        text: `Upgrade · ${next.upgradeCost}g`,
        font: 'medium',
        fontSize: 16,
        onClick: () => {
          if (!canAfford) return;
          appState.update((s) => applyBuildingUpgrade(s, 'tavern'));
          this.scene.restart();
        },
      });
    }

    // Hire eligibility (shared across all candidate slots).
    const canAddHero = canAdd(state.roster);
    const canAffordHire = free || vaultGold >= HIRE_COST;
    const canHire = canAddHero && canAffordHire;

    let hireReason = '';
    if (!canAffordHire) hireReason = 'Not enough gold';
    else if (!canAddHero) hireReason = 'Roster full';

    // Candidate cards + per-slot Hire buttons.
    const slotXs = SLOT_X_BY_COUNT[candidates.length as 3 | 4 | 5];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const slotX = slotXs[i];

      new HeroCard({
        scene: this,
        x: slotX,
        y: CARD_Y,
        hero: candidate,
        size: 'small',
      });

      new Button({
        scene: this,
        x: slotX - HIRE_BUTTON_W / 2,
        y: HIRE_BUTTON_Y,
        width: HIRE_BUTTON_W,
        height: HIRE_BUTTON_H,
        enabled: canHire,
        text: free ? 'Hire (free)' : `Hire (${HIRE_COST}g)`,
        font: 'medium',
        fontSize: 16,
        onClick: () => this.hire(i, candidates),
      });

      if (!canHire && hireReason) {
        this.add
          .text(slotX, HIRE_REASON_Y, hireReason, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#cc6666',
          })
          .setOrigin(0.5);
      }
    }

    // Reroll button at panel bottom (centered).
    const canAffordReroll = vaultGold >= REROLL_COST;
    new Button({
      scene: this,
      x: 480 - REROLL_BUTTON_W / 2,
      y: REROLL_BUTTON_Y,
      width: REROLL_BUTTON_W,
      height: REROLL_BUTTON_H,
      enabled: canAffordReroll,
      text: `Reroll · ${REROLL_COST}g`,
      font: 'medium',
      fontSize: 16,
      onClick: () => this.reroll(),
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private hire(slotIndex: number, candidates: Hero[]): void {
    const state = appState.get();
    const free = isSoftlocked(state);
    if (!canAdd(state.roster)) return;
    if (!free && balance(state.vault) < HIRE_COST) return;

    const hired = candidates[slotIndex];
    const rng = createRngFromState(state.campRngState);
    const replacement = generateCandidate(rng, state.unlocks.classes);
    const newCandidates = [...candidates];
    newCandidates[slotIndex] = replacement;

    appState.update((s) => ({
      ...s,
      vault: free ? s.vault : spend(s.vault, HIRE_COST),
      roster: addHero(s.roster, hired),
      tavernCandidates: newCandidates,
      campRngState: rng.getState(),
    }));

    this.scene.restart();
  }

  private reroll(): void {
    const state = appState.get();
    if (balance(state.vault) < REROLL_COST) return;

    const tavernLevel = state.buildingLevels.tavern;
    const rng = createRngFromState(state.campRngState);
    const fresh = generateCandidates(
      rng,
      state.unlocks.classes,
      tavernCandidateCount(tavernLevel),
    );

    appState.update((s) => ({
      ...s,
      vault: spend(s.vault, REROLL_COST),
      tavernCandidates: fresh,
      campRngState: rng.getState(),
    }));

    this.scene.restart();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
