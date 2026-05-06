/**
 * Returns the y-coordinates (centers) of N stacked cards centered vertically
 * in a panel of given height, with a fixed cardHeight and gap between cards.
 *
 * Pure function — used by ExpeditionsPanelScene's dungeon-list rendering.
 * Tested in isolation since the scene itself isn't unit-testable.
 *
 * Returned values are panel-relative: 0 = top of panel, panelHeight = bottom.
 * Caller offsets to scene coordinates.
 */
export function computeCardPositions(
  n: number,
  panelHeight: number,
  cardHeight: number,
  gap: number,
): number[] {
  const totalH = n * cardHeight + (n - 1) * gap;
  const startY = (panelHeight - totalH) / 2 + cardHeight / 2;
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    result.push(startY + i * (cardHeight + gap));
  }
  return result;
}
