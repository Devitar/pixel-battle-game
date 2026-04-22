import * as Phaser from 'phaser';
import { SHEET } from './frames';
import { Paperdoll, type Loadout } from './paperdoll';
import { SPRITE_NAMES } from './sprite_names.generated';

const SCALE = 6;

const KNIGHT: Loadout = {
  body: SPRITE_NAMES.character.male_light,
  legs: SPRITE_NAMES.legs.black,
  feet: SPRITE_NAMES.feet.black,
  outfit: SPRITE_NAMES.torso.ironarmor_tier1,
  hair: SPRITE_NAMES.hair.brown_1,
  hat: SPRITE_NAMES.head.fullhelmet_1,
  weapon: SPRITE_NAMES.weapon.sword_tier2,
  shield: SPRITE_NAMES.shield.iron_shield_1,
};

const MAGE: Loadout = {
  body: SPRITE_NAMES.character.female_light,
  legs: SPRITE_NAMES.legs.purple,
  feet: SPRITE_NAMES.feet.purple,
  outfit: SPRITE_NAMES.torso.toga_purple,
  hair: SPRITE_NAMES.hair.blonde_1,
  hat: SPRITE_NAMES.head.wizardhat_1,
  weapon: SPRITE_NAMES.weapon.staff_pink_tier3,
};

const RANGER: Loadout = {
  body: SPRITE_NAMES.character.male_tan,
  legs: SPRITE_NAMES.legs.green,
  feet: SPRITE_NAMES.feet.brown,
  outfit: SPRITE_NAMES.torso.shirt_green_long,
  hair: SPRITE_NAMES.hair.black_1,
  weapon: SPRITE_NAMES.weapon.bow_wood_tier2,
};

const ORC: Loadout = {
  body: SPRITE_NAMES.character.male_orc,
  legs: SPRITE_NAMES.legs.brown,
  feet: SPRITE_NAMES.feet.brown,
  outfit: SPRITE_NAMES.torso.leatherarmor_tier3,
  hat: SPRITE_NAMES.head.wingedhelmet_2,
  weapon: SPRITE_NAMES.weapon.battleaxe_tier4,
  shield: SPRITE_NAMES.shield.wood_tower_tier2,
};

const DEMO: Array<{ label: string; loadout: Loadout }> = [
  { label: 'knight', loadout: KNIGHT },
  { label: 'mage', loadout: MAGE },
  { label: 'ranger', loadout: RANGER },
  { label: 'orc', loadout: ORC },
];

export class MainScene extends Phaser.Scene {
  constructor() {
    super('main');
  }

  preload() {
    this.load.spritesheet(SHEET.key, SHEET.url, {
      frameWidth: SHEET.frameWidth,
      frameHeight: SHEET.frameHeight,
      margin: SHEET.margin,
      spacing: SHEET.spacing,
    });
  }

  create() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .text(cx, 40, 'Pixel Battle', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const gap = 180;
    const startX = cx - (gap * (DEMO.length - 1)) / 2;

    DEMO.forEach(({ label, loadout }, i) => {
      const x = startX + i * gap;
      const doll = new Paperdoll(this, x, cy, loadout);
      doll.setScale(SCALE);

      this.add
        .text(x, cy + 80, label, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
    });
  }
}
