import { describe, expect, it } from 'vitest';
import { computeCardPositions } from '../expeditions_layout';

describe('computeCardPositions', () => {
  it('N=1 centers the card at panelHeight/2', () => {
    const positions = computeCardPositions(1, 460, 96, 12);
    expect(positions.length).toBe(1);
    expect(positions[0]).toBe(230);  // (460 - 96)/2 + 96/2 = 230
  });

  it('N=4 fits within panelHeight=460', () => {
    const positions = computeCardPositions(4, 460, 96, 12);
    expect(positions.length).toBe(4);
    const firstTop = positions[0] - 96 / 2;
    const lastBottom = positions[3] + 96 / 2;
    expect(lastBottom - firstTop).toBe(420);  // 4*96 + 3*12
  });

  it('positions are monotonically increasing', () => {
    const positions = computeCardPositions(3, 460, 96, 12);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
  });

  it('N=2 — vertical distance between cards is cardHeight + gap', () => {
    const positions = computeCardPositions(2, 460, 96, 12);
    expect(positions[1] - positions[0]).toBe(96 + 12);
  });
});
