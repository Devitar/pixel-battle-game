import { ConstraintMode, Clickable, Frame, UiScene } from 'phaser-pixui';
import { listHeroes } from '@camp/roster';
import { CLASSES } from '@data/classes';
import { CLASS_PERK_PAIRS, PERKS } from '@data/perks';
import type { PerkId } from '@data/types';
import { applyPerk } from '@heroes/hero';
import { heroToLoadout } from '@render/hero_loadout';
import { PixuiPaperdoll } from '@render/pixui_paperdoll';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { appState } from './app_state';

// Panel dimensions (match original constants for layout parity).
const PANEL_W = 680;
const PANEL_H = 360;

// Left of panel center, slightly above center.
const PAPERDOLL_REL_X = -200;
const PAPERDOLL_REL_Y = -70;
const PAPERDOLL_SCALE = 4;

// Right of paperdoll, spanning from near top to mid-panel.
const HEADER_REL_X = -100;
const HEADER_NAME_REL_Y = -140;
const HEADER_CLASS_REL_Y = -112;
const HEADER_LEVEL_REL_Y = -86;
const HEADER_PROMPT_REL_Y = -40;

// Cards side-by-side below panel center, symmetric around panel midline.
const CARD_W = 260;
const CARD_H = 140;
const CARD_Y_REL = 110;
const CARD_A_X_REL = -150;
const CARD_B_X_REL = 150;

export class PerkOverlayScene extends UiScene {
  private heroId!: string;

  constructor() {
    super({
      key: 'perk_overlay',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  init(data: { heroId: string }): void {
    this.heroId = data.heroId;
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    const hero = listHeroes(appState.get().roster).find((h) => h.id === this.heroId);
    if (!hero || !hero.pendingPerk) {
      // Defensive — shouldn't happen given camp's gate, but guard against
      // scene-restart edge cases.
      this.close();
      return;
    }

    // Full-canvas dim overlay; raw Phaser rectangle (pixui has no bare-canvas
    // primitive). setInteractive() blocks clicks from reaching scenes below.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel chrome.
    const panel = this.insert.center.frame({ width: PANEL_W, height: PANEL_H });

    // Paperdoll — centered on a sub-frame at the left of the panel.
    const dollFrame = panel.insert.center.frame({
      x: PAPERDOLL_REL_X,
      y: PAPERDOLL_REL_Y,
      width: PAPERDOLL_SCALE * 16,
      height: PAPERDOLL_SCALE * 16,
    });
    const paperdoll = new PixuiPaperdoll(this, heroToLoadout(hero), { scale: PAPERDOLL_SCALE });
    dollFrame.attach(paperdoll);

    // Header text block — 4 textArea lines right of paperdoll.
    const classDef = CLASSES[hero.classId];
    panel.insert.center.textArea({
      x: HEADER_REL_X,
      y: HEADER_NAME_REL_Y,
      text: hero.name,
    });
    panel.insert.center.textArea({
      x: HEADER_REL_X,
      y: HEADER_CLASS_REL_Y,
      text: `${classDef.name} · Level ${hero.level}`,
    });
    panel.insert.center.textArea({
      x: HEADER_REL_X,
      y: HEADER_LEVEL_REL_Y,
      text: `Reached Level ${hero.level}!`,
    });
    panel.insert.center.textArea({
      x: HEADER_REL_X,
      y: HEADER_PROMPT_REL_Y,
      text: 'Choose a perk:',
    });

    // Perk cards — Frame + Clickable rather than Button: pixui.Button is
    // single-string only, but perk cards need title + description visual
    // hierarchy. Frame + two textAreas + Clickable preserves the two tiers.
    const [perkAId, perkBId] = CLASS_PERK_PAIRS[hero.classId];
    this.buildPerkCard(panel, CARD_A_X_REL, perkAId);
    this.buildPerkCard(panel, CARD_B_X_REL, perkBId);

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildPerkCard(panel: Frame, cardXRel: number, perkId: PerkId): void {
    const perk = PERKS[perkId];

    // Card frame — visible chrome.
    const card = panel.insert.center.frame({
      x: cardXRel,
      y: CARD_Y_REL,
      width: CARD_W,
      height: CARD_H,
    });

    // Border highlight rectangle — swapped on hover. Factory attaches it for us.
    const border = card.insert.center.rectangle({
      width: CARD_W,
      height: CARD_H,
      borderColor: 0x444444,
      borderWidth: 1,
    });

    // Perk name (title): y=16 from top edge.
    card.insert.top.textArea({ y: 16, text: perk.name });

    // Perk description (body): y=16 offset from card center.
    card.insert.center.textArea({ y: 16, text: perk.description });

    // Clickable overlay (covers full card, on top of all children).
    const clickable = new Clickable(this, {
      width: CARD_W,
      height: CARD_H,
      onClick: () => this.onPick(perkId),
    });
    card.attach(clickable);

    // Hover highlight: gold border on pointer-over, reset on pointer-out.
    clickable.events.on('pointerover', () => {
      border.borderColor = 0xffcc66;
      border.borderWidth = 2;
    });
    clickable.events.on('pointerout', () => {
      border.borderColor = 0x444444;
      border.borderWidth = 1;
    });
  }

  private onPick(perkId: PerkId): void {
    appState.update((s) => ({
      ...s,
      roster: {
        ...s.roster,
        heroes: s.roster.heroes.map((h) =>
          h.id === this.heroId ? applyPerk(h, perkId) : h,
        ),
      },
    }));
    this.close();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
