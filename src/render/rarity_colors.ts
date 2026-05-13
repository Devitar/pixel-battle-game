import type { Rarity } from '@data/types';

/**
 * Centralized rarity color palette. Single source of truth for both
 * Phaser hex strings (text/tint via `'#xxxxxx'`) and numeric forms
 * (stroke styles via `0xXXXXXX`). Extend here when adding a new rarity tier.
 */
export const RARITY_COLOR_HEX: Record<Rarity, string> = {
  common:    '#cccccc',
  uncommon:  '#4488ff',
  rare:      '#ffcc66',
  epic:      '#a060ff',
  legendary: '#ff8800',
};

export const RARITY_COLOR_NUM: Record<Rarity, number> = {
  common:    0xcccccc,
  uncommon:  0x4488ff,
  rare:      0xffcc66,
  epic:      0xa060ff,
  legendary: 0xff8800,
};
