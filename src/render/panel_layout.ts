export interface PanelBounds {
  panelCx: number;
  panelCy: number;
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  panelBottom: number;
}

export function panelLayout(opts: {
  canvasW: number;
  canvasH: number;
  panelW: number;
  panelH: number;
}): PanelBounds {
  // Panel is always centered in the canvas; panelW/H determine the edges only.
  const panelCx = opts.canvasW / 2;
  const panelCy = opts.canvasH / 2;
  return {
    panelCx,
    panelCy,
    panelLeft: panelCx - opts.panelW / 2,
    panelRight: panelCx + opts.panelW / 2,
    panelTop: panelCy - opts.panelH / 2,
    panelBottom: panelCy + opts.panelH / 2,
  };
}

export interface SplitPaneLayout {
  listCx: number;
  listCy: number;
  listW: number;
  listH: number;
  detailCx: number;
  detailCy: number;
  detailW: number;
  detailH: number;
  gap: number;
}

export function splitPaneLayout(opts: {
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  panelBottom: number;
  listW: number;
  detailW: number;
  marginH: number;
  marginV: number;
  /** Override top vertical margin independently (asymmetric layout). */
  marginVTop?: number;
  /** Override bottom vertical margin independently (asymmetric layout). */
  marginVBottom?: number;
}): SplitPaneLayout {
  const panelW = opts.panelRight - opts.panelLeft;
  const gap = panelW - opts.listW - opts.detailW - 2 * opts.marginH;
  if (gap < 0) {
    throw new Error(
      `splitPaneLayout: listW (${opts.listW}) + detailW (${opts.detailW}) + 2*marginH (${2 * opts.marginH}) exceeds panel width (${panelW})`,
    );
  }

  const marginVTop = opts.marginVTop ?? opts.marginV;
  const marginVBottom = opts.marginVBottom ?? opts.marginV;
  const listCx = opts.panelLeft + opts.marginH + opts.listW / 2;
  const detailCx = opts.panelRight - opts.marginH - opts.detailW / 2;
  const paneH = opts.panelBottom - opts.panelTop - marginVTop - marginVBottom;
  const paneCy = opts.panelTop + marginVTop + paneH / 2;

  return {
    listCx,
    listCy: paneCy,
    listW: opts.listW,
    listH: paneH,
    detailCx,
    detailCy: paneCy,
    detailW: opts.detailW,
    detailH: paneH,
    gap,
  };
}

export interface HeaderStripLayout {
  titleCx: number;
  titleY: number;
  goldRightX: number;
  goldY: number;
  closeBtnCx: number;
  closeBtnCy: number;
}

export function headerStripLayout(opts: {
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  padding: number;
  closeBtnSize: number;
  titleYOffset?: number;
  closeBtnYOffset?: number;
  goldYOffset?: number;
  goldRightOffsetFromCloseLeft?: number;
}): HeaderStripLayout {
  const titleYOffset = opts.titleYOffset ?? 20;
  const closeBtnYOffset = opts.closeBtnYOffset ?? 23;
  const goldYOffset = opts.goldYOffset ?? 20;
  const goldRightOffsetFromCloseLeft = opts.goldRightOffsetFromCloseLeft ?? 14;

  const closeBtnCx = opts.panelRight - opts.padding - opts.closeBtnSize / 2;
  const closeBtnLeftEdge = closeBtnCx - opts.closeBtnSize / 2;
  const goldRightX = closeBtnLeftEdge - goldRightOffsetFromCloseLeft;

  return {
    titleCx: (opts.panelLeft + opts.panelRight) / 2,
    titleY: opts.panelTop + titleYOffset,
    goldRightX,
    goldY: opts.panelTop + goldYOffset,
    closeBtnCx,
    closeBtnCy: opts.panelTop + closeBtnYOffset,
  };
}
