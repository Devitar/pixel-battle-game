import type { Encounter } from '@dungeon/node';

export interface SurpriseSpec {
  encounter: Encounter;
  spawnFraction: number;  // 0.4–0.6 of WORLD_SCROLL_DISTANCE — random per fire
}

export interface CorridorHandoffPayload {
  deltas: readonly number[];
  surprise: SurpriseSpec | null;
}

let pending: CorridorHandoffPayload | undefined;

export function setCorridorHandoff(payload: CorridorHandoffPayload): void {
  pending = payload;
}

export function consumeCorridorHandoff(): CorridorHandoffPayload | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
