import { ConstraintMode, UiScene } from 'phaser-pixui';
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
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { PixuiHeroCard } from '@ui/pixui_hero_card';
import { createRng } from '@util/rng';
import { appState } from './app_state';

// Per-candidate-count slot positions. Tavern uses PixuiHeroCard `small` (180px wide).
// Each row is symmetric around the panel center (x=480) so the layout stays
// balanced as the tavern upgrades from L1 (3 candidates) to L3 (5 candidates).
//
// L3 (5 candidates) is the tightest: 180px center spacing means cards touch
// edge-to-edge across the 920px panel (cards span 30-210, 210-390, 390-570,
// 570-750, 750-930). Future polish: shrink PixuiHeroCard or wrap to two rows for
// more breathing room — current spec only requires "N candidates show".
const SLOT_X_BY_COUNT: Record<3 | 4 | 5, readonly number[]> = {
  3: [170, 480, 790],
  4: [195, 385, 575, 765],
  5: [120, 300, 480, 660, 840],
};

export class TavernPanelScene extends UiScene {
  constructor() {
    super({
      key: 'tavern_panel',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    const state = appState.get();
    const tavernLevel = state.buildingLevels.tavern;
    const targetCount = tavernCandidateCount(tavernLevel);
    const rng = createRng(Date.now());
    const free = isSoftlocked(state);
    const vaultGold = balance(state.vault);

    // Persisted candidates: ensure the count matches current cap (regenerate on
    // cap change post-upgrade, otherwise reuse).
    const ensured = ensureCandidatesForCap(
      state.tavernCandidates,
      targetCount,
      rng,
      state.unlocks.classes,
    );
    if (ensured !== state.tavernCandidates) {
      appState.update((s) => ({ ...s, tavernCandidates: ensured }));
    }
    const candidates = [...ensured];

    // Header
    const headerText = free
      ? 'Tavern · Hires are free until you recover'
      : `Tavern · Hire Cost: ${HIRE_COST}g`;
    this.insert.top.textArea({ y: 28, text: headerText });
    this.insert.top.textArea({ y: 52, text: `Vault: ${vaultGold}g · Roster: ${state.roster.heroes.length} / ${state.roster.capacity}` });
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // Upgrade button (top-left)
    const level = state.buildingLevels.tavern;
    const next = nextLevel('tavern', level);
    if (next !== null) {
      const canAfford = vaultGold >= next.upgradeCost;
      this.insert.topLeft.button({
        x: 4,
        y: 4,
        width: 160,
        enabled: canAfford,
        text: `Upgrade · ${next.upgradeCost}g`,
        onClick: () => {
          appState.update((s) => applyBuildingUpgrade(s, 'tavern'));
          this.scene.restart();
        },
      });
    }

    // Candidate slots
    const canAddHero = canAdd(state.roster);
    const canAffordHire = free || vaultGold >= HIRE_COST;
    const canHire = canAddHero && canAffordHire;

    let hireReason = '';
    if (!canAffordHire) hireReason = 'Not enough gold';
    else if (!canAddHero) hireReason = 'Roster full';

    const slotXs = SLOT_X_BY_COUNT[candidates.length as 3 | 4 | 5];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      // SLOT_X_BY_COUNT is canvas-absolute (centered at x=480); convert to center-relative
      const slotXFromCenter = slotXs[i] - 480;

      const slot = this.insert.center.frame({
        x: slotXFromCenter,
        y: -20,
        width: 200,
        height: 200,
      });

      const card = new PixuiHeroCard(this, candidate, { size: 'small' });
      slot.attach(card);

      slot.insert.bottom.button({
        y: 8,
        width: -16,
        enabled: canHire,
        text: free ? 'Hire (free)' : `Hire (${HIRE_COST}g)`,
        onClick: () => this.hire(i, candidates),
      });

      if (!canHire && hireReason) {
        slot.insert.bottom.textArea({ y: 36, text: hireReason });
      }
    }

    // Re-roll button at bottom
    const canAffordReroll = vaultGold >= REROLL_COST;
    this.insert.bottom.button({
      y: 16,
      width: 200,
      enabled: canAffordReroll,
      text: `Reroll · ${REROLL_COST}g`,
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
    const rng = createRng(Date.now());
    const replacement = generateCandidate(rng, state.unlocks.classes);
    const newCandidates = [...candidates];
    newCandidates[slotIndex] = replacement;

    appState.update((s) => ({
      ...s,
      vault: free ? s.vault : spend(s.vault, HIRE_COST),
      roster: addHero(s.roster, hired),
      tavernCandidates: newCandidates,
    }));

    this.scene.restart();
  }

  private reroll(): void {
    const state = appState.get();
    if (balance(state.vault) < REROLL_COST) return;

    const tavernLevel = state.buildingLevels.tavern;
    const rng = createRng(Date.now());
    const fresh = generateCandidates(
      rng,
      state.unlocks.classes,
      tavernCandidateCount(tavernLevel),
    );

    appState.update((s) => ({
      ...s,
      vault: spend(s.vault, REROLL_COST),
      tavernCandidates: fresh,
    }));

    this.scene.restart();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
