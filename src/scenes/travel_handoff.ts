let pending: { deltas: readonly number[] } | undefined;

export function setTravelDeltas(deltas: readonly number[]): void {
  pending = { deltas };
}

export function consumeTravelDeltas(): { deltas: readonly number[] } | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
