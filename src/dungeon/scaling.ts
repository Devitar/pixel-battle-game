import type { ScaleFactors } from './node';

export function floorScale(floorNumber: number): ScaleFactors {
  if (floorNumber < 1) {
    throw new Error(`floorScale: floorNumber must be >= 1, got ${floorNumber}`);
  }
  const mult = 1 + 0.1 * (floorNumber - 1);
  return { hp: mult, attack: mult };
}
