import { describe, expect, it } from 'vitest';
import { panelLayout, splitPaneLayout, headerStripLayout } from '../panel_layout';

describe('panelLayout', () => {
  it('centers the panel in the canvas', () => {
    const b = panelLayout({ canvasW: 960, canvasH: 540, panelW: 920, panelH: 460 });
    expect(b.panelCx).toBe(480);
    expect(b.panelCy).toBe(270);
  });

  it('computes correct bounds for standard 960x540 / 920x460 layout', () => {
    const b = panelLayout({ canvasW: 960, canvasH: 540, panelW: 920, panelH: 460 });
    expect(b.panelLeft).toBe(20);
    expect(b.panelRight).toBe(940);
    expect(b.panelTop).toBe(40);
    expect(b.panelBottom).toBe(500);
  });
});

describe('splitPaneLayout', () => {
  it('produces symmetric left/right margins', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 50,
    });
    // marginH = 20 → list left edge = 40 → listCx = 40 + 190 = 230
    expect(s.listCx).toBe(230);
    // detail right edge = 940 - 20 = 920 → detailCx = 920 - 220 = 700
    expect(s.detailCx).toBe(700);
  });

  it('computes the gap as remaining horizontal space', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 50,
    });
    // panelW=920, content=380+440=820, marginH*2=40, gap = 920-820-40 = 60
    expect(s.gap).toBe(60);
  });

  it('throws if listW + detailW + 2*marginH > panel width', () => {
    expect(() => splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 500, detailW: 500, marginH: 20, marginV: 50,
    })).toThrow('splitPaneLayout: listW (500) + detailW (500)');
  });

  it('respects vertical margin (marginV) for pane height', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 80,
    });
    // panelH = 460, marginV*2 = 160, paneH = 300
    expect(s.listH).toBe(300);
    expect(s.detailH).toBe(300);
    // listCy = panelTop + marginV + listH/2 = 40 + 80 + 150 = 270
    expect(s.listCy).toBe(270);
    expect(s.detailCy).toBe(270);
  });

  it('produces matching widths and heights for both panes', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 65,
    });
    expect(s.listW).toBe(380);
    expect(s.detailW).toBe(440);
    expect(s.listH).toBe(s.detailH);
  });

  it('supports asymmetric vertical margins via marginVTop / marginVBottom', () => {
    // Reproduces the blacksmith layout: paneTop=120, paneBottom=450 → marginVTop=80, marginVBottom=50
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 0,
      marginVTop: 80, marginVBottom: 50,
    });
    // paneH = 500 - 40 - 80 - 50 = 330
    expect(s.listH).toBe(330);
    expect(s.detailH).toBe(330);
    // paneCy = 40 + 80 + 165 = 285
    expect(s.listCy).toBe(285);
    expect(s.detailCy).toBe(285);
  });
});

describe('headerStripLayout', () => {
  it('places close button inside the panel with the configured padding', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    // close right edge at 940-8 = 932; closeBtnCx = 932 - 14 = 918
    expect(h.closeBtnCx).toBe(918);
  });

  it('right-aligns gold to leave room for the close button', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    // close left edge = 918 - 14 = 904; gold right edge = 904 - 14 = 890
    expect(h.goldRightX).toBe(890);
  });

  it('positions title at the panel center', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    // titleCx = (panelLeft + panelRight) / 2 = 480
    expect(h.titleCx).toBe(480);
  });

  it('uses default y offsets when not provided (title at panelTop+20, close at panelTop+23)', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    expect(h.titleY).toBe(60);
    expect(h.closeBtnCy).toBe(63);
    expect(h.goldY).toBe(60);
  });

  it('respects custom title/close/gold y offsets', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
      titleYOffset: 25, closeBtnYOffset: 28, goldYOffset: 25,
    });
    expect(h.titleY).toBe(65);
    expect(h.closeBtnCy).toBe(68);
    expect(h.goldY).toBe(65);
  });

  it('respects custom goldRightOffsetFromCloseLeft', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
      goldRightOffsetFromCloseLeft: 30,
    });
    // close left edge = 904; gold right edge = 904 - 30 = 874
    expect(h.goldRightX).toBe(874);
  });
});
