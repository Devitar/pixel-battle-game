import * as Phaser from 'phaser';

const TOOLTIP_FONT_SIZE = 11;
const TOOLTIP_LINE_HEIGHT = 14;
const TOOLTIP_PADDING_X = 8;
const TOOLTIP_PADDING_Y = 6;
const TOOLTIP_BG_COLOR = 0x1a1a1a;
const TOOLTIP_BORDER_COLOR = 0x666666;
const TOOLTIP_TEXT_COLOR = '#dddddd';
const TOOLTIP_GAP_ABOVE_TRIGGER = 6;

// Lightweight tooltip builder. Caller toggles via tap-to-show / tap-again-to-hide
// (no hover, no global "tap elsewhere to dismiss"). Positions the tooltip
// above-and-centered on the trigger anchor; the tooltip is added as a child of
// `parent` so its lifecycle follows the trigger's container — when the parent
// is destroyed (e.g., HeroCard rebuild, scene shutdown), the tooltip vanishes
// with it.
export function createTooltip(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  anchorX: number,
  anchorY: number,
  lines: readonly string[],
): Phaser.GameObjects.Container {
  const container = scene.add.container(anchorX, anchorY);

  const texts: Phaser.GameObjects.Text[] = lines.map((line, i) =>
    scene.add
      .text(0, i * TOOLTIP_LINE_HEIGHT, line, {
        fontFamily: 'monospace',
        fontSize: `${TOOLTIP_FONT_SIZE}px`,
        color: TOOLTIP_TEXT_COLOR,
      })
      .setOrigin(0.5, 0),
  );

  const widest = texts.reduce((max, t) => Math.max(max, t.width), 0);
  const w = widest + TOOLTIP_PADDING_X * 2;
  const h = TOOLTIP_LINE_HEIGHT * lines.length + TOOLTIP_PADDING_Y * 2 - 2;

  const bg = scene.add
    .rectangle(0, h / 2, w, h, TOOLTIP_BG_COLOR, 0.95)
    .setStrokeStyle(1, TOOLTIP_BORDER_COLOR);

  // Re-position: bg + texts vertically centered around y = h/2; lift the whole
  // container so its bottom edge is `TOOLTIP_GAP_ABOVE_TRIGGER` above the
  // anchor (so the tooltip floats above the badge, not over it).
  container.add(bg);
  for (const t of texts) {
    t.y += TOOLTIP_PADDING_Y;
    container.add(t);
  }
  container.y = anchorY - h - TOOLTIP_GAP_ABOVE_TRIGGER;

  parent.add(container);
  return container;
}
