import * as Phaser from 'phaser';
import { ATLAS, COLOR, FONT, FRAME, type FontKey } from './theme';

export type ButtonVariant = 'primary' | 'settings';

export interface ButtonOpts {
  scene: Phaser.Scene;
  /** Top-left x in canvas coords. */
  x: number;
  /** Top-left y in canvas coords. */
  y: number;
  width: number;
  height: number;
  text: string;
  /** Defaults to true. When false, the button renders the disabled frame
   *  and ignores clicks. */
  enabled?: boolean;
  /** Defaults to 'primary'. 'settings' uses the smaller settings-style
   *  atlas frames. */
  variant?: ButtonVariant;
  onClick?: () => void;
  /** Bitmap font for the label. Defaults to 'medium'. */
  font?: FontKey;
  fontSize?: number;
  /** Text tint. Defaults to theme textDefault when enabled,
   *  textDisabled when disabled. */
  tint?: number;
  tintDisabled?: number;
}

type ButtonState = 'default' | 'hover' | 'pressed' | 'disabled';

/**
 * A NineSlice + label button with up/hover/pressed/disabled states.
 * Visual state is fixed at construction time: pass `enabled: false` to
 * render the disabled frame and ignore clicks. To change a button's
 * enabled state at runtime, destroy and recreate it (every panel scene
 * already rebuilds via `scene.restart()` on state change).
 *
 * The internal NineSlice is the Phaser game object that handles input;
 * `frame` is swapped per hover/pressed state. The label is a separate
 * BitmapText positioned over the NineSlice center. Both live in the
 * public `gameObjects` array for callers that want to add them to their
 * own Phaser Container.
 */
export class Button {
  readonly nineSlice: Phaser.GameObjects.NineSlice;
  readonly label: Phaser.GameObjects.BitmapText;
  readonly gameObjects: Phaser.GameObjects.GameObject[];

  private readonly frames: { up: string; hover: string; down: string; disabled: string };
  private readonly tintEnabled: number;
  private readonly tintDisabled: number;
  private readonly _enabled: boolean;
  private _state: ButtonState;
  private _onClick?: () => void;
  private _destroyed = false;

  constructor(opts: ButtonOpts) {
    const variant = opts.variant ?? 'primary';
    this.frames = framesFor(variant);
    this.tintEnabled = opts.tint ?? COLOR.textDefault;
    this.tintDisabled = opts.tintDisabled ?? COLOR.textDisabled;
    this._enabled = opts.enabled ?? true;
    this._state = this._enabled ? 'default' : 'disabled';
    this._onClick = opts.onClick;

    this.nineSlice = opts.scene.add
      .nineslice(opts.x, opts.y, ATLAS, this.frames.up, opts.width, opts.height)
      .setOrigin(0, 0);

    // Visual center of the rendered button accounts for asymmetric scale9
    // borders. Phaser stretches the middle of the NineSlice; the corners
    // stay fixed-size. button_up has leftBorder=10, rightBorder=16, so
    // the geometric center sits 3px right of the visual center of the
    // stretched region. button_up is also a 3-slice (full height), so
    // Phaser overrides height to frame.height (22) regardless of the
    // user-specified height — the actual visible button is shorter than
    // requested, so we center text against the *frame* height rather
    // than the requested height.
    const renderedHeight = renderedSliceHeight(opts.scene, this.frames.up, opts.height);
    const { cx, cy } = visualCenter(opts.scene, this.frames.up, opts.x, opts.y, opts.width, renderedHeight);

    this.label = opts.scene.add.bitmapText(0, 0, FONT[opts.font ?? 'medium'], opts.text, opts.fontSize ?? 16);
    this.label.setTint(this.tintEnabled);
    // Position by computing actual rendered text bounds. setOrigin(0.5, 0.5)
    // proved unreliable: Phaser's BitmapText origin uses `this.width` which
    // is computed lazily and can be 0 at construction time, so the displayed
    // origin pixel doesn't always match where the centered glyphs actually
    // are. Reading getTextBounds and positioning the top-left manually
    // sidesteps that.
    //
    // Vertical bias: 0.56 not 0.5 because the mana_soul bitmap fonts have
    // 3px of empty space above the caps (yoffset=3) and only 1px below the
    // descenders (lineHeight=17, descender bottom=16). Visual mid-line of a
    // mixed-case glyph run is at y≈9.5/17 ≈ 0.56 of the line box. Using 0.5
    // leaves text ~1.5px below the optical center; 0.42 (a previous attempt)
    // was even further off.
    const bounds = this.label.getTextBounds(true).local;
    this.label.setOrigin(0, 0);
    this.label.setPosition(
      Math.round(cx - bounds.width / 2),
      Math.round(cy - bounds.height * 0.56),
    );

    this.gameObjects = [this.nineSlice, this.label];

    if (this._enabled) this.attachInput();
    this.applyState();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.nineSlice.destroy();
    this.label.destroy();
  }

  private attachInput(): void {
    this.nineSlice.setInteractive({ useHandCursor: true });
    this.nineSlice.on('pointerover', () => this.handle('hover'));
    this.nineSlice.on('pointerout', () => this.handle('default'));
    this.nineSlice.on('pointerdown', () => this.handle('pressed'));
    this.nineSlice.on('pointerup', () => {
      // Only fire onClick if pointerup happened over a pressed button
      // (matches the pattern Phaser/pixui both use to ignore drag-out releases).
      if (this._state === 'pressed') {
        if (this._onClick) this._onClick();
        this.handle('hover');
      }
    });
  }

  private handle(next: ButtonState): void {
    if (!this._enabled) return;
    if (this._state === next) return;
    this._state = next;
    this.applyState();
  }

  private applyState(): void {
    let frame: string;
    switch (this._state) {
      case 'hover': frame = this.frames.hover; break;
      case 'pressed': frame = this.frames.down; break;
      case 'disabled': frame = this.frames.disabled; break;
      default: frame = this.frames.up;
    }
    this.nineSlice.setFrame(frame);
    this.label.setTint(this._state === 'disabled' ? this.tintDisabled : this.tintEnabled);
  }
}

// Phaser NineSlice forces height to frame.height when the frame is a
// 3-slice (scale9Borders.y === 0 && scale9Borders.h === frame.height) —
// the user-specified height is ignored. Return the height that Phaser
// will actually render at, so the label centers vertically on the
// visible button rather than on dead pixels above/below.
function renderedSliceHeight(scene: Phaser.Scene, frameName: string, requestedHeight: number): number {
  const frame = scene.textures.getFrame(ATLAS, frameName);
  const s9 = (frame as unknown as { data?: { scale9Borders?: { x: number; y: number; w: number; h: number } } })
    .data?.scale9Borders;
  if (!s9) return requestedHeight;
  const is3Slice = s9.y === 0 && s9.h === frame.height;
  return is3Slice ? frame.height : requestedHeight;
}

// Compute the visual center of a NineSlice rendered at (x, y, w, h),
// honouring asymmetric scale9 borders. Phaser stretches only the middle
// region of the frame; the corners stay fixed-size, so the visual center
// of the stretched region differs from the geometric (x + w/2, y + h/2)
// center when the borders aren't symmetric.
function visualCenter(
  scene: Phaser.Scene,
  frameName: string,
  x: number,
  y: number,
  width: number,
  height: number,
): { cx: number; cy: number } {
  const cxGeometric = x + width / 2;
  const cyGeometric = y + height / 2;
  const frame = scene.textures.getFrame(ATLAS, frameName);
  const s9 = (frame as unknown as { data?: { scale9Borders?: { x: number; y: number; w: number; h: number } } })
    .data?.scale9Borders;
  if (!s9) return { cx: cxGeometric, cy: cyGeometric };
  const leftBorder = s9.x;
  const rightBorder = frame.width - (s9.x + s9.w);
  const topBorder = s9.y;
  const bottomBorder = frame.height - (s9.y + s9.h);
  return {
    cx: cxGeometric + (leftBorder - rightBorder) / 2,
    cy: cyGeometric + (topBorder - bottomBorder) / 2,
  };
}

function framesFor(variant: ButtonVariant): { up: string; hover: string; down: string; disabled: string } {
  if (variant === 'settings') {
    return {
      up: FRAME.buttonSettingsUp,
      hover: FRAME.buttonSettingsHover,
      down: FRAME.buttonSettingsDown,
      disabled: FRAME.buttonSettingsDisabled,
    };
  }
  return {
    up: FRAME.buttonUp,
    hover: FRAME.buttonHover,
    down: FRAME.buttonDown,
    disabled: FRAME.buttonDisabled,
  };
}
