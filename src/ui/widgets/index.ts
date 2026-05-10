// Custom UI widgets layered on raw Phaser primitives, replacing pixui.
// See ./theme.ts for atlas / font / color constants. Atlas + bitmap fonts
// must be loaded by BootScene before any of these are used.

export { ATLAS, FONT, FRAME, COLOR, type FontKey } from './theme';
export { createBitmapText, type BitmapTextOpts } from './text';
export { createPanel, type PanelOpts, type PanelVariant } from './panel';
export { Button, type ButtonOpts, type ButtonVariant } from './button';
export { createDialog, type DialogOpts, type Dialog } from './dialog';
export { createPaperdoll, type PaperdollOpts } from './paperdoll';
export { HeroCard, type HeroCardOpts, type HeroCardSize } from './hero_card';
