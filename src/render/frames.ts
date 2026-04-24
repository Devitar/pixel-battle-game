export const SHEET = {
  key: 'base',
  url: 'assets/base_sprites.png',
  columns: 54,
  rows: 12,
  frameWidth: 16,
  frameHeight: 16,
  spacing: 1,
  margin: 0,
} as const;

export type CategoryName =
  | 'character'
  | 'undergarment'
  | 'outergarment'
  | 'hair'
  | 'hat'
  | 'shield'
  | 'weapon';

export interface CategoryRange {
  firstCol: number;
  lastCol: number;
}

export const CATEGORIES: Record<CategoryName, CategoryRange> = {
  character: { firstCol: 0, lastCol: 1 },
  undergarment: { firstCol: 3, lastCol: 4 },
  outergarment: { firstCol: 6, lastCol: 17 },
  hair: { firstCol: 19, lastCol: 26 },
  hat: { firstCol: 28, lastCol: 31 },
  shield: { firstCol: 33, lastCol: 40 },
  weapon: { firstCol: 42, lastCol: 53 },
};

export const frameAt = (col: number, row: number): number =>
  row * SHEET.columns + col;

export const firstFrameOf = (category: CategoryName): number =>
  frameAt(CATEGORIES[category].firstCol, 0);
