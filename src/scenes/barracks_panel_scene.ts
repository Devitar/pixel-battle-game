import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { ABILITIES } from '../data/abilities';
import { describeAbility } from '../data/ability_describe';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { Hero } from '../heroes/hero';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import { HeroCard } from '../ui/hero_card';
import { appState } from './app_state';

interface RosterCard {
  bg: Phaser.GameObjects.Rectangle;
  card: HeroCard;
  hero: Hero;
}

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const LIST_PANE_CX = 245;
const LIST_PANE_CY = 270;
const LIST_PANE_W = 380;
const LIST_PANE_H = 360;

const DETAIL_PANE_CX = 715;
const DETAIL_PANE_CY = 270;
const DETAIL_PANE_W = 440;
const DETAIL_PANE_H = 360;

const SLOT_X_LEFT = 150;
const SLOT_X_RIGHT = 340;
const SLOT_Y_BASE = 120;
const SLOT_STRIDE = 60;
const SLOT_BG_W = 184;
const SLOT_BG_H = 60;
const ROSTER_CAP_DISPLAY = 12;

const DETAIL_PAPERDOLL_X = 540;
const DETAIL_PAPERDOLL_Y = 145;
const DETAIL_TEXT_X = 590;

const ABILITY_X = 515;
const ABILITY_HEADER_Y = 215;
const ABILITY_BLOCK_START_Y = 235;
const ABILITY_NAME_LINE_HEIGHT = 16;
const ABILITY_LINE_HEIGHT = 14;
const ABILITY_BLOCK_GAP = 6;

export class BarracksPanelScene extends Phaser.Scene {
  private rosterCards: RosterCard[] = [];
  private selectedHeroId: string | null = null;
  private detailContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;

  constructor() {
    super('barracks_panel');
  }

  create(): void {
    // Phaser scene instances are reused across launches; reset per-launch state.
    this.rosterCards = [];
    this.selectedHeroId = null;

    this.buildOverlayAndPanel();
    this.buildCloseButton();

    const heroes = listHeroes(appState.get().roster);
    const cap = appState.get().roster.capacity;
    this.titleText.setText(`Barracks · ${heroes.length} / ${cap}`);

    this.buildListPane(heroes);
    this.buildDetailPaneBackground();
    this.detailContainer = this.add.container(0, 0);

    this.selectHero(heroes[0]?.id ?? null);

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildOverlayAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);
    this.titleText = this.add
      .text(PANEL_CX, 60, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(933, 63, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(933, 63, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private buildListPane(heroes: readonly Hero[]): void {
    this.add
      .rectangle(LIST_PANE_CX, LIST_PANE_CY, LIST_PANE_W, LIST_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);

    for (let i = 0; i < ROSTER_CAP_DISPLAY; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? SLOT_X_LEFT : SLOT_X_RIGHT;
      const y = SLOT_Y_BASE + row * SLOT_STRIDE;

      if (i < heroes.length) {
        this.buildFilledSlot(heroes[i], x, y);
      } else {
        this.buildEmptySlot(x, y);
      }
    }
  }

  private buildFilledSlot(hero: Hero, x: number, y: number): void {
    const bg = this.add
      .rectangle(x, y, SLOT_BG_W, SLOT_BG_H, 0x000000, 0)
      .setStrokeStyle(2, 0xffcc66, 0);
    const card = new HeroCard(this, x, y, hero, { size: 'small' });
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));
    this.rosterCards.push({ bg, card, hero });
  }

  private buildEmptySlot(x: number, y: number): void {
    this.add
      .rectangle(x, y, 180, 56, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333);
    this.add
      .text(x, y, 'empty', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#555555',
      })
      .setOrigin(0.5);
  }

  private buildDetailPaneBackground(): void {
    this.add
      .rectangle(DETAIL_PANE_CX, DETAIL_PANE_CY, DETAIL_PANE_W, DETAIL_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
  }

  private selectHero(id: string | null): void {
    this.selectedHeroId = id;
    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }

  private refreshSelectionHighlights(): void {
    for (const rc of this.rosterCards) {
      const isSelected = rc.hero.id === this.selectedHeroId;
      rc.bg.setStrokeStyle(2, 0xffcc66, isSelected ? 1 : 0);
    }
  }

  private rebuildDetail(): void {
    this.detailContainer.removeAll(true);

    const hero = this.selectedHeroId
      ? this.rosterCards.find((rc) => rc.hero.id === this.selectedHeroId)?.hero
      : null;

    if (!hero) {
      this.detailContainer.add(
        this.add
          .text(DETAIL_PANE_CX, DETAIL_PANE_CY, 'No heroes — visit the Tavern to recruit.', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const classDef = CLASSES[hero.classId];
    const traitDef = TRAITS[hero.traitId];

    const paperdoll = new Paperdoll(
      this,
      DETAIL_PAPERDOLL_X,
      DETAIL_PAPERDOLL_Y,
      heroToLoadout(hero),
    );
    paperdoll.setScale(4);
    this.detailContainer.add(paperdoll);

    this.detailContainer.add(
      this.add.text(DETAIL_TEXT_X, 110, hero.name, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      }),
    );
    this.detailContainer.add(
      this.add.text(DETAIL_TEXT_X, 132, classDef.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#aaaaaa',
      }),
    );
    this.detailContainer.add(
      this.add.text(
        DETAIL_TEXT_X,
        152,
        `HP ${hero.currentHp}/${hero.maxHp} · ATK ${hero.baseStats.attack} · DEF ${hero.baseStats.defense} · SPD ${hero.baseStats.speed}`,
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#dddddd',
        },
      ),
    );
    this.detailContainer.add(
      this.add.text(
        DETAIL_TEXT_X,
        172,
        `trait: ${traitDef.name} — ${traitDef.description}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ccbbaa',
        },
      ),
    );

    this.detailContainer.add(
      this.add.text(ABILITY_X, ABILITY_HEADER_Y, 'ABILITIES', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      }),
    );

    let yCursor = ABILITY_BLOCK_START_Y;
    for (const abilityId of classDef.abilities) {
      const ability = ABILITIES[abilityId];
      const desc = describeAbility(ability);

      this.detailContainer.add(
        this.add.text(ABILITY_X, yCursor, ability.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        }),
      );
      yCursor += ABILITY_NAME_LINE_HEIGHT;

      this.detailContainer.add(
        this.add.text(
          ABILITY_X,
          yCursor,
          `Cast: ${desc.castLine} · Target: ${desc.targetLine}`,
          {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#999999',
          },
        ),
      );
      yCursor += ABILITY_LINE_HEIGHT;

      for (const line of desc.effectLines) {
        this.detailContainer.add(
          this.add.text(ABILITY_X, yCursor, `→ ${line}`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          }),
        );
        yCursor += ABILITY_LINE_HEIGHT;
      }

      yCursor += ABILITY_BLOCK_GAP;
    }
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
