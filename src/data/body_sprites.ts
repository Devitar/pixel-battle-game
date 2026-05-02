import { SPRITE_NAMES } from '@render/sprite_names.generated';

export const PLAYER_BODY_SPRITES: readonly string[] = [
  String(SPRITE_NAMES.character.female_light),
  String(SPRITE_NAMES.character.male_light),
  String(SPRITE_NAMES.character.female_tan),
  String(SPRITE_NAMES.character.male_tan),
  String(SPRITE_NAMES.character.female_dark),
  String(SPRITE_NAMES.character.male_dark),
  String(SPRITE_NAMES.character.female_orc),
  String(SPRITE_NAMES.character.male_orc),
];

export const PLAYER_LEGS_SPRITES: readonly string[] = [
  String(SPRITE_NAMES.legs.black),
  String(SPRITE_NAMES.legs.brown),
  String(SPRITE_NAMES.legs.cream),
  String(SPRITE_NAMES.legs.white),
  String(SPRITE_NAMES.legs.blue),
  String(SPRITE_NAMES.legs.orange),
  String(SPRITE_NAMES.legs.purple),
  String(SPRITE_NAMES.legs.green),
];

// Excludes the `_large` feet variants — uniform proportions across the roster.
export const PLAYER_FEET_SPRITES: readonly string[] = [
  String(SPRITE_NAMES.feet.black),
  String(SPRITE_NAMES.feet.brown),
  String(SPRITE_NAMES.feet.cream),
  String(SPRITE_NAMES.feet.white),
  String(SPRITE_NAMES.feet.blue),
  String(SPRITE_NAMES.feet.orange),
  String(SPRITE_NAMES.feet.purple),
  String(SPRITE_NAMES.feet.green),
];

export const DEFAULT_LEGS_SPRITE = String(SPRITE_NAMES.legs.black);
export const DEFAULT_FEET_SPRITE = String(SPRITE_NAMES.feet.black);
