// Theme constants for the custom UI widget library. Centralizes the atlas
// key, bitmap font names, atlas frame names, and default colors so scenes
// don't sprinkle string literals around.
//
// Loaded by BootScene (atlas + fonts) so every scene in the game has them
// available without re-loading.

export const ATLAS = 'mana_soul';

// Bitmap font keys, loaded by BootScene from packed_assets/{name}.bmfont.
// Roughly: roots = small body, trunk = medium / button labels,
// branches = large / headers.
export const FONT = {
  small: 'mana_roots',
  medium: 'mana_trunk',
  large: 'mana_branches',
} as const;

export type FontKey = keyof typeof FONT;

// Atlas frame names — all live in mana_soul.atlas.
export const FRAME = {
  panelLight: 'frame_light',
  panelBright: 'frame_bright',
  panelDark: 'frame_dark',
  buttonUp: 'button_up',
  buttonHover: 'button_hover',
  buttonDown: 'button_down',
  buttonDisabled: 'button_disabled',
  buttonSettingsUp: 'button_settings_up',
  buttonSettingsHover: 'button_settings_hover',
  buttonSettingsDown: 'button_settings_down',
  buttonSettingsDisabled: 'button_settings_disabled',
  progressBg: 'progress_curly',
  progressBar: 'bar_green',
  headerScroll: 'header_scroll',
} as const;

// Common colors. Numeric form (0xRRGGBB) for tint / fill / stroke calls.
// Use raw `scene.add.text({ color: '#xxxxxx' })` when multi-color or
// per-character tint is needed — bitmap-font labels only support a uniform
// numeric tint.
export const COLOR = {
  textDefault: 0xfbe4af,
  textDisabled: 0x7bb6bc,

  selectionGold: 0xffcc66,
  affordable: 0xffcc66,
  unaffordable: 0xcc6666,

  rowBg: 0x1a1a1a,
  rowBgSelected: 0x2a2418,
  rowStroke: 0x222222,
  rowStrokeSelected: 0xffcc66,

  paneBg: 0x1a1a1a,
  paneStroke: 0x444444,

  rarityCommon: 0xcccccc,
  rarityUncommon: 0x4488ff,
  rarityRare: 0xffcc66,
} as const;
