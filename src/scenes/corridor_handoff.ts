let pending: { deltas: readonly number[] } | undefined;

export function setCorridorDeltas(deltas: readonly number[]): void {
  pending = { deltas };
}

export function consumeCorridorDeltas(): { deltas: readonly number[] } | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
