import { ABILITIES } from '../data/abilities';
import type { Rng } from '../util/rng';
import { pickAbility } from './ability_priority';
import { applyAbility } from './effects';
import { shuffle } from './positions';
import { tickStatuses } from './statuses';
import { computeInitiative } from './turn_order';
import type {
  Combatant,
  CombatEvent,
  CombatOutcome,
  CombatResult,
  CombatSide,
  CombatState,
} from './types';

const ROUND_CAP = 30;

function livingBySide(state: CombatState, side: CombatSide): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.isDead);
}

function bothSidesAlive(state: CombatState): boolean {
  return livingBySide(state, 'player').length > 0 && livingBySide(state, 'enemy').length > 0;
}

function computeOutcome(state: CombatState, hitCap: boolean): CombatOutcome {
  const playerAlive = livingBySide(state, 'player').length > 0;
  const enemyAlive = livingBySide(state, 'enemy').length > 0;
  if (hitCap && playerAlive && enemyAlive) return 'timeout';
  if (playerAlive && !enemyAlive) return 'player_victory';
  return 'player_defeat';
}

export function resolveCombat(initialState: CombatState, rng: Rng): CombatResult {
  const state: CombatState = structuredClone(initialState);
  const events: CombatEvent[] = [];

  events.push({
    kind: 'combat_start',
    party: livingBySide(state, 'player').map((c) => c.id),
    enemies: livingBySide(state, 'enemy').map((c) => c.id),
  });

  let hitCap = false;

  for (let round = 1; round <= ROUND_CAP; round++) {
    state.round = round;
    const order = computeInitiative(
      state.combatants.filter((c) => !c.isDead),
      rng,
    );
    events.push({ kind: 'round_start', round, order });

    let combatEndedMidRound = false;
    for (const id of order) {
      const combatant = state.combatants.find((c) => c.id === id);
      if (!combatant) continue;
      if (combatant.isDead) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'dead' });
        continue;
      }
      events.push({ kind: 'turn_start', combatantId: id });

      const willBeStunned = 'stunned' in combatant.statuses;
      tickStatuses(combatant, events);

      if (willBeStunned) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'stunned' });
      } else {
        const picked = pickAbility(combatant, state, rng);
        if (picked) {
          applyAbility(
            ABILITIES[picked.abilityId],
            combatant,
            picked.targetIds,
            state,
            rng,
            events,
          );
        } else {
          events.push({ kind: 'shuffle', combatantId: id });
          shuffle(combatant, state, events);
        }
      }

      if (!bothSidesAlive(state)) {
        combatEndedMidRound = true;
        break;
      }
    }

    events.push({ kind: 'round_end', round });

    if (combatEndedMidRound) break;
    if (round === ROUND_CAP && bothSidesAlive(state)) {
      hitCap = true;
      break;
    }
  }

  const outcome = computeOutcome(state, hitCap);
  events.push({ kind: 'combat_end', outcome });

  return { finalState: state, events, outcome };
}
