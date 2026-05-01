import type { Rng } from '@util/rng';
import type { RunState } from '@run/run_state';

export type CampNodeChoice =
  | { kind: 'heal_party' }
  | { kind: 'treat_wound'; heroIndex: number; woundIndex: number }
  | { kind: 'leave' };

export const HEAL_PARTY_PERCENT = 0.25;

// `rng` is reserved for future variance (e.g. random wound-pick mode).
// No current effect consumes RNG; the parameter exists for API parity with
// other apply-effect functions in the codebase.
export function applyCampNodeEffect(
  runState: RunState,
  choice: Exclude<CampNodeChoice, { kind: 'leave' }>,
  _rng: Rng,
): RunState {
  if (choice.kind === 'heal_party') {
    const newParty = runState.party.map((hero) => {
      const healed = Math.round(hero.maxHp * HEAL_PARTY_PERCENT);
      return { ...hero, currentHp: Math.min(hero.maxHp, hero.currentHp + healed) };
    });
    return { ...runState, party: newParty };
  }

  // treat_wound
  const { heroIndex, woundIndex } = choice;
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(`applyCampNodeEffect: heroIndex ${heroIndex} out of range [0, ${runState.party.length})`);
  }
  const hero = runState.party[heroIndex];
  if (hero.wounds.length === 0) {
    throw new Error(`applyCampNodeEffect: hero at index ${heroIndex} has no wounds to treat`);
  }
  if (woundIndex < 0 || woundIndex >= hero.wounds.length) {
    throw new Error(`applyCampNodeEffect: woundIndex ${woundIndex} out of range [0, ${hero.wounds.length})`);
  }
  const newWounds = hero.wounds.filter((_, i) => i !== woundIndex);
  const newParty = runState.party.map((h, i) =>
    i === heroIndex ? { ...h, wounds: newWounds } : h,
  );
  return { ...runState, party: newParty };
}
