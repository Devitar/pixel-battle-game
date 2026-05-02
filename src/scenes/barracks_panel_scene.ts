import * as Phaser from 'phaser';
import { nextLevel } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import { listHeroes, removeHero } from '@camp/roster';
import { balance } from '@camp/vault';
import { ABILITIES } from '@data/abilities';
import { describeAbility } from '@data/ability_describe';
import { CLASSES } from '@data/classes';
import { TRAITS } from '@data/traits';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import type { Hero } from '@heroes/hero';
import { describeKitStatus, resolveCombatAbilities } from '@items/kit';
import { applyEquipmentStats, describeRarePropertyFields, rarePropertyFields } from '@items/stats';
import { heroToLoadout } from '@render/hero_loadout';
import { Paperdoll } from '@render/paperdoll';
import { HeroCard } from '@ui/hero_card';
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
const SLOT_BG_W = 184;
const SLOT_BG_H = 60;

// Slot stride is computed per-level so the 2-column grid always fits inside
// LIST_PANE_H = 360 (y=90..450, with first slot center at SLOT_Y_TOP=120 and
// last slot center at SLOT_Y_BOTTOM=420 — preserves the original L1 layout).
//
// At L1 (cap=12 → 6 rows) stride is 60 — cards do not overlap.
// At L2 (cap=16 → 8 rows) stride is ~43 — cards overlap by ~17px.
// At L3 (cap=20 → 10 rows) stride is ~33 — cards overlap by ~27px.
//
// The paperdoll is on the left and the text column on the right, so name
// lines stay readable; trait/HP-bar text bleeds into the next row's name at
// L2/L3. Tradeoff accepted in spec §7 (L1 stays clean; L2/L3 crowded but
// functional). Future polish: option (iii) scrollable list pane.
const SLOT_Y_TOP = 120;     // first slot center
const SLOT_Y_BOTTOM = 420;  // last slot center (matches original L1 bottom row)
function slotStride(cap: number): number {
  const rows = Math.ceil(cap / 2);
  if (rows <= 1) return 0;
  return (SLOT_Y_BOTTOM - SLOT_Y_TOP) / (rows - 1);
}

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
  private confirmRetirePending: boolean = false;
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
    this.buildUpgradeButton();

    const heroes = listHeroes(appState.get().roster);
    const cap = appState.get().roster.capacity;
    this.titleText.setText(`Barracks · ${heroes.length} / ${cap}`);

    this.buildListPane(heroes);
    this.buildDetailPaneBackground();
    this.detailContainer = this.add.container(0, 0);

    this.selectHero(heroes[0]?.id ?? null);

    this.input.keyboard?.on('keydown-ESC', () => this.close());

    // When BarracksEquipScene closes, refresh the detail pane so the post-equip
    // paperdoll / stats / equipment slot strip reflect the new state.
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.rebuildDetail();
    });
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

  private buildUpgradeButton(): void {
    const level = appState.get().buildingLevels.barracks;
    const next = nextLevel('barracks', level);
    if (next === null) return; // Already at max — no button rendered.

    const gold = balance(appState.get().vault);
    const canAfford = gold >= next.upgradeCost;

    // Top-left of the panel header strip (above the list pane). The panel
    // header band runs from y=40 (panel top) to y=90 (list pane top); the
    // close button at (933, 63) sits in the top-right, so the upgrade button
    // anchors top-left to mirror it. The 160-wide button + 10px subtitle
    // below stay above the list pane (y=90) and don't intrude on the title
    // text centered at (480, 60).
    const x = 160;
    const y = 55;
    const bgColor = canAfford ? 0x2a4a2a : 0x333333;
    const strokeColor = canAfford ? 0x44cc44 : 0x555555;
    const labelColor = canAfford ? '#ffffff' : '#777777';

    const bg = this.add
      .rectangle(x, y, 160, 24, bgColor)
      .setStrokeStyle(2, strokeColor);
    this.add
      .text(x, y, `Upgrade · ${next.upgradeCost}g`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: labelColor,
      })
      .setOrigin(0.5);
    this.add
      .text(x, y + 20, `→ ${next.unlockDescription}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    if (canAfford) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        appState.update((s) => applyBuildingUpgrade(s, 'barracks'));
        this.scene.restart();
      });
    }
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

    const cap = appState.get().roster.capacity;
    const stride = slotStride(cap);
    // Scale slot bg height to the stride so click targets and empty-slot
    // strokes don't overlap at L2/L3. L1 keeps SLOT_BG_H = 60 exactly.
    const slotBgH = stride < SLOT_BG_H ? stride - 2 : SLOT_BG_H;
    for (let i = 0; i < cap; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? SLOT_X_LEFT : SLOT_X_RIGHT;
      const y = SLOT_Y_TOP + row * stride;

      if (i < heroes.length) {
        this.buildFilledSlot(heroes[i], x, y, slotBgH);
      } else {
        this.buildEmptySlot(x, y, slotBgH);
      }
    }
  }

  private buildFilledSlot(hero: Hero, x: number, y: number, slotBgH: number): void {
    const bg = this.add
      .rectangle(x, y, SLOT_BG_W, slotBgH, 0x000000, 0)
      .setStrokeStyle(2, 0xffcc66, 0);
    const card = new HeroCard(this, x, y, hero, { size: 'small' });
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));
    this.rosterCards.push({ bg, card, hero });
  }

  private buildEmptySlot(x: number, y: number, slotBgH: number): void {
    this.add
      .rectangle(x, y, 180, slotBgH - 4, 0x1a1a1a)
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
    this.confirmRetirePending = false;
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
      this.add.text(DETAIL_TEXT_X, 132, `${classDef.name} · Lv ${hero.level}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#aaaaaa',
      }),
    );
    const equippedStats = applyEquipmentStats(hero.baseStats, hero.equipment);
    // Split across two lines: primary HP/ATK/DEF/SPD on top, secondary MND/CRT/DDG
    // below. Single-line layout doesn't fit within the detail pane's 345px text
    // width at 12px monospace once Mind/Crit/Dodge are added.
    this.detailContainer.add(
      this.add.text(
        DETAIL_TEXT_X,
        152,
        `HP ${hero.currentHp}/${hero.maxHp} · ATK ${equippedStats.attack} · DEF ${equippedStats.defense} · SPD ${equippedStats.speed}`,
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
        168,
        `MND ${equippedStats.mind} · CRT ${equippedStats.crit}% · DDG ${equippedStats.dodge}%`,
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#bbbbbb',
        },
      ),
    );
    const traitText = this.add.text(
      DETAIL_TEXT_X,
      188,
      `trait: ${traitDef.name} — ${traitDef.description}`,
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ccbbaa',
        wordWrap: { width: 340 },
      },
    );
    this.detailContainer.add(traitText);

    // Cascade: trait line wraps may push subsequent sections; properties block
    // (if any) sits between trait and wounds; wounds block (if any) sits before
    // abilities. Each step Math.max-guards against the prior step's bottom.
    let cursor = traitText.y + traitText.height + 6;

    const propLines = describeRarePropertyFields(rarePropertyFields(hero.equipment));
    if (propLines.length > 0) {
      this.detailContainer.add(
        this.add.text(DETAIL_TEXT_X, cursor, 'PROPERTIES', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#bb9966',
        }),
      );
      cursor += 18;
      for (const line of propLines) {
        this.detailContainer.add(
          this.add.text(DETAIL_TEXT_X, cursor, line, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          }),
        );
        cursor += 14;
      }
      cursor += 6;
    }

    // Single-line trait + no properties produces cursor ~ 208 (188 trait + 14 +
    // 6); keep historical 208 floor for single-line consistency, mirroring the
    // prior 192 floor when the stat line was 4 stats and the trait was at 172.
    let woundsCursor = Math.max(208, cursor);

    if (hero.wounds.length > 0) {
      this.detailContainer.add(
        this.add.text(DETAIL_TEXT_X, woundsCursor, 'WOUNDS', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ff6666',
        }),
      );
      woundsCursor += 18;

      for (const wound of hero.wounds) {
        const def = WOUNDS[wound.id];
        const desc = describeWoundEffect(def.effect);
        this.detailContainer.add(
          this.add.text(DETAIL_TEXT_X, woundsCursor, `${def.name} — ${desc}`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          }),
        );
        woundsCursor += 14;
      }

      woundsCursor += 6;
    }

    const abilityHeaderY = Math.max(ABILITY_HEADER_Y, woundsCursor);
    const abilityBlockStartY = abilityHeaderY + (ABILITY_BLOCK_START_Y - ABILITY_HEADER_Y);

    this.detailContainer.add(
      this.add.text(ABILITY_X, abilityHeaderY, 'ABILITIES', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      }),
    );
    // Kit status — shown to the right of the ABILITIES header in muted color.
    // 80px offset clears the "ABILITIES" label at 12px monospace.
    this.detailContainer.add(
      this.add.text(ABILITY_X + 80, abilityHeaderY, `· ${describeKitStatus(hero)}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      }),
    );

    const { abilities: resolvedAbilities } = resolveCombatAbilities(hero);
    let yCursor = abilityBlockStartY;
    for (const abilityId of resolvedAbilities) {
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

    // Bottom action row — either normal (Equip Gear + Retire) or confirm
    // (warning + Cancel + Confirm Retire).
    if (!this.confirmRetirePending) {
      // Equip Gear — left slot
      const equipBtn = this.add
        .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x335533)
        .setStrokeStyle(2, 0x66aa66);
      this.detailContainer.add(equipBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 80, 430, 'Equip Gear', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      equipBtn.setInteractive({ useHandCursor: true });
      equipBtn.on('pointerdown', () => {
        this.scene.launch('barracks_equip', { heroId: hero.id });
        this.scene.pause();
      });

      // Retire — right slot, destructive red
      const retireBtn = this.add
        .rectangle(DETAIL_TEXT_X + 230, 430, 140, 32, 0x553333)
        .setStrokeStyle(2, 0x885555);
      this.detailContainer.add(retireBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 230, 430, 'Retire', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      retireBtn.setInteractive({ useHandCursor: true });
      retireBtn.on('pointerdown', () => {
        this.confirmRetirePending = true;
        this.rebuildDetail();
      });
    } else {
      // Confirm row — warning text above, Cancel + Confirm Retire below
      const rosterLen = appState.get().roster.heroes.length;
      let warning = `Retire ${hero.name}? Hero is gone forever. No refund.`;
      if (rosterLen - 1 < 3) {
        warning += ' ⚠ Roster will drop below 3 — recruit at the Tavern before starting a run.';
      }

      this.detailContainer.add(
        this.add
          .text(DETAIL_PANE_CX, 405, warning, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ff6666',
            align: 'center',
            wordWrap: { width: 400 },
          })
          .setOrigin(0.5, 1),
      );

      // Cancel — left slot, muted gray
      const cancelBtn = this.add
        .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x444444)
        .setStrokeStyle(2, 0x888888);
      this.detailContainer.add(cancelBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 80, 430, 'Cancel', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      cancelBtn.setInteractive({ useHandCursor: true });
      cancelBtn.on('pointerdown', () => {
        this.confirmRetirePending = false;
        this.rebuildDetail();
      });

      // Confirm Retire — right slot, destructive red
      const confirmBtn = this.add
        .rectangle(DETAIL_TEXT_X + 230, 430, 140, 32, 0x553333)
        .setStrokeStyle(2, 0x885555);
      this.detailContainer.add(confirmBtn);
      this.detailContainer.add(
        this.add
          .text(DETAIL_TEXT_X + 230, 430, 'Confirm Retire', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      confirmBtn.setInteractive({ useHandCursor: true });
      confirmBtn.on('pointerdown', () => {
        appState.update((s) => ({ ...s, roster: removeHero(s.roster, hero.id) }));
        this.scene.restart();
      });
    }
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
