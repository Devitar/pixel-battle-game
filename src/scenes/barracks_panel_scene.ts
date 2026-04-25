import * as Phaser from 'phaser';

export class BarracksPanelScene extends Phaser.Scene {
  constructor() {
    super('barracks_panel');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);

    const panelW = 600;
    const panelH = 400;
    this.add
      .rectangle(cx, cy, panelW, panelH, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.add
      .text(cx, cy - panelH / 2 + 24, 'Barracks (stub)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + panelH / 2 - 32, 'Press ESC or click × to close', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#888888',
      })
      .setOrigin(0.5);

    const closeX = cx + panelW / 2 - 18;
    const closeY = cy - panelH / 2 + 18;
    const closeBg = this.add
      .rectangle(closeX, closeY, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(closeX, closeY, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
