import type { CombatResult } from '../combat/types';

let pending: { result: CombatResult; rngStateAfter: number } | undefined;

export function setCombatResult(result: CombatResult, rngStateAfter: number): void {
  pending = { result, rngStateAfter };
}

export function consumeCombatResult(): { result: CombatResult; rngStateAfter: number } | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
