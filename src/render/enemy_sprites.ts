import type { EnemyId } from '@data/types';
import { SPRITE_NAMES } from './sprite_names.generated';

const ENEMY_BODY = {
  skeleton: 0,
  zombie: 1,
  ghost: 2,
  cultist: 3,
} as const;

export interface EnemyVisual {
  bodyFrame?: number;
  legs?: number;
  feet?: number;
  outfit?: number;
  hair?: number;
  hat?: number;
  weapon?: number;
  shield?: number;
  bossSprite?: number;
  bodyScale?: number;
}

export const ENEMY_VISUALS: Record<EnemyId, EnemyVisual> = {
  skeleton_warrior: {
    bodyFrame: ENEMY_BODY.skeleton,
    weapon: SPRITE_NAMES.weapon.sword_tier1,
    shield: SPRITE_NAMES.shield.wood_buckler_tier1,
  },
  skeleton_archer: {
    bodyFrame: ENEMY_BODY.skeleton,
    weapon: SPRITE_NAMES.weapon.bow_wood_tier1,
  },
  ghost: {
    bodyFrame: ENEMY_BODY.ghost,
  },
  zombie: {
    bodyFrame: ENEMY_BODY.zombie,
    legs: SPRITE_NAMES.legs.black,
    feet: SPRITE_NAMES.feet.black,
  },
  cultist: {
    bodyFrame: ENEMY_BODY.cultist,
    legs: SPRITE_NAMES.legs.black,
    feet: SPRITE_NAMES.feet.black,
    outfit: SPRITE_NAMES.torso.shirt_black_long,
    hat: SPRITE_NAMES.head.wizardhat_4,
    weapon: SPRITE_NAMES.weapon.staff_green_tier2,
  },
  bone_lich: {
    bossSprite: 0,
    bodyScale: 2,
  },
  drowned_knight: {
    bodyFrame: ENEMY_BODY.skeleton,
    weapon: SPRITE_NAMES.weapon.sword_tier2,
    shield: SPRITE_NAMES.shield.wood_buckler_tier1,
  },
  brine_crab: {
    bodyFrame: ENEMY_BODY.zombie,
    legs: SPRITE_NAMES.legs.black,
    feet: SPRITE_NAMES.feet.black,
  },
  drowned_sailor: {
    bodyFrame: ENEMY_BODY.skeleton,
    weapon: SPRITE_NAMES.weapon.bow_wood_tier1,
  },
  siren: {
    bodyFrame: ENEMY_BODY.cultist,
    legs: SPRITE_NAMES.legs.black,
    feet: SPRITE_NAMES.feet.black,
    outfit: SPRITE_NAMES.torso.shirt_black_long,
    hat: SPRITE_NAMES.head.wizardhat_4,
    weapon: SPRITE_NAMES.weapon.staff_green_tier2,
  },
  drowned_king: {
    bossSprite: 0,
    bodyScale: 2,
  },
};
