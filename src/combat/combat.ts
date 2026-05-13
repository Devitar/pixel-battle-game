import { ABILITIES } from '@data/abilities';
import type { Rng } from '@util/rng';
import { pickAbility } from './ability_priority';
import { setCooldown, tickCooldowns } from './cooldowns';
import { applyAbility } from './effects';
import { applyPerkAction, gatherTriggeredEffects, recomputeBelowHpAuras } from './perk_hooks';
import { collapseAfterDeath, shuffle, shuffleWouldProgress } from './positions';
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

const ROUND_CAP = 1000;

function livingBySide(state: CombatState, side: CombatSide): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.isDead);
}

function bothSidesAlive(state: CombatState): boolean {
  return livingBySide(state, 'player').length > 0 && livingBySide(state, 'enemy').length > 0;
}

function computeOutcome(state: CombatState): CombatOutcome {
  const playerAlive = livingBySide(state, 'player').length > 0;
  const enemyAlive = livingBySide(state, 'enemy').length > 0;
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

  // Combat-start init: actors who begin below their whenBelowHp threshold
  // (e.g. wounded heroes returning to the fight) need the aura applied from
  // turn 1 rather than waiting for the next HP write.
  for (const c of state.combatants) {
    recomputeBelowHpAuras(c, events);
  }

  for (let round = 1; round <= ROUND_CAP; round++) {
    state.round = round;

    if (round === 100) {
      state.exhaustionLevel = 1;
      events.push({ kind: 'exhaustion_applied', level: 1 });
    } else if (round > 100 && (round - 100) % 5 === 0) {
      state.exhaustionLevel += 1;
      events.push({ kind: 'exhaustion_applied', level: state.exhaustionLevel });
    }

    const order = computeInitiative(
      state.combatants.filter((c) => !c.isDead),
      rng,
    );
    events.push({ kind: 'round_start', round, order });

    for (const c of state.combatants) {
      if (c.isDead || !c.regenPerRound) continue;
      const heal = Math.min(c.regenPerRound, c.maxHp - c.currentHp);
      if (heal > 0) {
        c.currentHp += heal;
        recomputeBelowHpAuras(c, events);
        events.push({
          kind: 'heal_applied',
          sourceId: c.id,
          targetId: c.id,
          amount: heal,
        });
      }
    }

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
      // tickStatuses can mutate HP via poison ticks (damage) and regen ticks
      // (heal). Recompute the whenBelowHp aura after both directions are
      // resolved for this combatant's turn.
      recomputeBelowHpAuras(combatant, events);

      if (combatant.isDead) {
        // Poison (or future tick-damage status) killed them on their own turn.
        // Collapse the side and skip the rest of the turn.
        collapseAfterDeath(combatant.side, state, events);
        continue;
      }

      tickCooldowns(combatant);

      if (willBeStunned) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'stunned' });
      } else {
        // Fire firstAttack triggered effects the actor hasn't fired yet
        // (picked perks + equipped legendaries). Runs BEFORE action execution
        // so any `damageMod` is stashed on the combatant before applyDamage
        // looks at it. `damageMod` actions are not applied as state — they
        // set pendingDamageMod, which applyDamage consumes once on the next
        // outgoing hit. Non-damageMod actions (gainStat, applyStatus, etc.)
        // fire through applyPerkAction.
        const firedSet = new Set<string>(combatant.firstAttackFiredSourceIds ?? []);
        let firedAny = false;
        for (const { sourceId, effect: t } of gatherTriggeredEffects(combatant)) {
          if (t.trigger.kind !== 'firstAttack') continue;
          if (firedSet.has(sourceId)) continue;
          firedSet.add(sourceId);
          firedAny = true;
          if (t.action.kind === 'damageMod') {
            combatant.pendingDamageMod =
              (combatant.pendingDamageMod ?? 1) * t.action.multiplier;
          } else {
            applyPerkAction({
              self: combatant,
              other: undefined,
              sourceId,
              action: t.action,
              events,
            });
          }
        }
        if (firedAny) {
          combatant.firstAttackFiredSourceIds = Array.from(firedSet);
        }

        const picked = pickAbility(combatant, state, rng);
        if (picked) {
          const ability = ABILITIES[picked.abilityId];
          applyAbility(ability, combatant, picked.targetIds, state, rng, events);
          if (ability.cooldown !== undefined) {
            // Store cooldown + 1: tickCooldowns runs at the start of every subsequent
            // caster-turn before the skip-check, so the stored value must survive
            // `cooldown` decrements before being deleted to give that many skip-turns.
            setCooldown(combatant, ability.id, ability.cooldown + 1);
          }
        } else if (shuffleWouldProgress(combatant, state)) {
          events.push({ kind: 'shuffle', combatantId: id });
          shuffle(combatant, state, events);
        } else {
          // No castable ability AND shuffle would be futile (a satisfied ally
          // would just swap back). Skip the turn rather than infinite-loop.
          events.push({ kind: 'turn_skipped', combatantId: id, reason: 'no_action' });
        }
      }

      if (!bothSidesAlive(state)) {
        combatEndedMidRound = true;
        break;
      }
    }

    events.push({ kind: 'round_end', round });

    if (combatEndedMidRound) break;
    if (round === ROUND_CAP) break;
  }

  const outcome = computeOutcome(state);
  events.push({ kind: 'combat_end', outcome });

  return { finalState: state, events, outcome };
}
