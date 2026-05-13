import { LEGENDARY_DEFS, LEGENDARY_PASSIVE_DEFS } from '@data/legendaries';
import { PERKS } from '@data/perks';
import type {
  AbilityEffect,
  BuffableStat,
  LegendaryId,
  LegendaryPassiveId,
  PerkAction,
  PerkId,
  PerkTrigger,
  StatusId,
  TriggeredEffect,
} from '@data/types';
import type { Combatant, CombatEvent } from './types';

/**
 * Maximum number of co-existing snowball stacks per perk id on a single combatant.
 * Reached via repeated triggers; once at cap, further triggers refresh all stack
 * durations to full (see addStack).
 */
export const STACK_CAP = 5;

/**
 * Default `damageBonus` for a synthetic `'marked'` status applied via PerkAction.applyStatus
 * when the perk definition omits an explicit payload. Mirrors the canonical mark shape used
 * by the Hunter's Mark ability family. Individual perks (e.g. eagles_mark, arcane_surge)
 * override this via `action.payload.damageBonus`.
 */
const DEFAULT_MARK_DAMAGE_BONUS = 0.5;
/** Default heal-per-turn for a synthetic `'regen'` status applied without a payload. */
const DEFAULT_REGEN_HEAL_PER_TURN = 5;
/** Default damage-per-turn for a synthetic `'poisoned'` status applied without a payload. */
const DEFAULT_POISON_DAMAGE_PER_TURN = 3;

export interface ApplyPerkActionArgs {
  self: Combatant;
  other: Combatant | undefined;
  /** The triggered-effect source: a picked perk id, an equipped named-legendary id,
   *  or an equipped random-legendary passive id. All three are string-literal types
   *  at compile time and behave identically at runtime (used as the prefix for
   *  stack/aura status keys). */
  sourceId: PerkId | LegendaryId | LegendaryPassiveId;
  action: PerkAction;
  events: CombatEvent[];
}

/**
 * Apply a single PerkAction. State-bearing actions (gainStat, applyStatus) mutate
 * the relevant combatant's `statuses` map; pure modifiers (damageMod, damageMitigation,
 * lifesteal) are no-ops here and are consumed at their call sites (applyDamage, etc.)
 * via the compute* helpers below.
 */
export function applyPerkAction(args: ApplyPerkActionArgs): void {
  const { self, other, sourceId, action, events } = args;
  switch (action.kind) {
    case 'gainStat':
      if (action.duration !== undefined && action.stacking) {
        addStack(self, sourceId, action);
      } else if (action.duration !== undefined) {
        // Timed non-stacking: keep a single slot; subsequent triggers overwrite.
        const key = `perk_stack_${sourceId}_0`;
        self.statuses[key] = {
          statusId: key as StatusId,
          remainingTurns: action.duration,
          effect: makeBuffEffect(action.stat, action.delta, action.duration, key),
          sourceId: self.id,
        };
      } else {
        // Untimed aura: applied/removed in lockstep with whenBelowHp transitions.
        const key = `perk_aura_${sourceId}`;
        self.statuses[key] = {
          statusId: key as StatusId,
          remainingTurns: Number.POSITIVE_INFINITY,
          effect: makeBuffEffect(action.stat, action.delta, Number.POSITIVE_INFINITY, key),
          sourceId: self.id,
        };
      }
      return;
    case 'applyStatus': {
      const target = action.target === 'self' ? self : other;
      if (!target) return;
      target.statuses[action.statusId] = {
        statusId: action.statusId,
        remainingTurns: action.duration,
        effect: synthesizeStatusEffect(action.statusId, action.duration, action.payload),
        sourceId: self.id,
      };
      events.push({
        kind: 'status_applied',
        sourceId: self.id,
        targetId: target.id,
        statusId: action.statusId,
        duration: action.duration,
      });
      return;
    }
    case 'damageMod':
    case 'damageMitigation':
    case 'lifesteal':
      // Consumed at the applyDamage call site, not applied as state.
      return;
  }
}

function addStack(
  self: Combatant,
  sourceId: PerkId | LegendaryId | LegendaryPassiveId,
  action: Extract<PerkAction, { kind: 'gainStat' }>,
): void {
  for (let i = 0; i < STACK_CAP; i++) {
    const key = `perk_stack_${sourceId}_${i}`;
    if (!self.statuses[key]) {
      self.statuses[key] = {
        statusId: key as StatusId,
        remainingTurns: action.duration!,
        effect: makeBuffEffect(action.stat, action.delta, action.duration!, key),
        sourceId: self.id,
      };
      return;
    }
  }
  // All STACK_CAP slots full: refresh existing stacks to full duration.
  refreshAllStackDurations(self, sourceId, action.duration!);
}

function refreshAllStackDurations(
  self: Combatant,
  sourceId: PerkId | LegendaryId | LegendaryPassiveId,
  duration: number,
): void {
  for (let i = 0; i < STACK_CAP; i++) {
    const key = `perk_stack_${sourceId}_${i}`;
    if (self.statuses[key]) {
      self.statuses[key].remainingTurns = duration;
    }
  }
}

/**
 * Remove the continuous-aura status associated with a perk or legendary, if present.
 * Used by whenBelowHp recompute (Task 11) to drop the aura when the bearer
 * crosses back above the threshold.
 */
export function clearPerkAura(self: Combatant, sourceId: PerkId | LegendaryId | LegendaryPassiveId): void {
  const key = `perk_aura_${sourceId}`;
  if (self.statuses[key]) {
    delete self.statuses[key];
  }
}

/**
 * Collect all triggered effects for a combatant from all three sources: perks,
 * named legendaries, and random-legendary passives. Perks lookup via PERKS (skipping
 * perks without a triggeredEffect); named legendaries lookup via LEGENDARY_DEFS (all
 * defs have a triggeredEffect by interface); random-legendary passives lookup via
 * LEGENDARY_PASSIVE_DEFS (likewise). Returned in iteration order: perks first, then
 * named legendaries, then passive legendaries. The returned `sourceId` is the
 * stack-key prefix used by applyPerkAction.
 */
export function gatherTriggeredEffects(
  combatant: Combatant,
): readonly { sourceId: PerkId | LegendaryId | LegendaryPassiveId; effect: TriggeredEffect }[] {
  const out: { sourceId: PerkId | LegendaryId | LegendaryPassiveId; effect: TriggeredEffect }[] = [];
  for (const perkId of combatant.pickedPerks) {
    const e = PERKS[perkId]?.triggeredEffect;
    if (e) out.push({ sourceId: perkId, effect: e });
  }
  for (const legId of combatant.equippedLegendaryIds) {
    out.push({ sourceId: legId, effect: LEGENDARY_DEFS[legId].triggeredEffect });
  }
  for (const passId of combatant.equippedLegendaryPassiveIds) {
    out.push({ sourceId: passId, effect: LEGENDARY_PASSIVE_DEFS[passId].triggeredEffect });
  }
  return out;
}

/**
 * Recompute `whenBelowHp` continuous-aura statuses for the given combatant.
 * Called at every HP-mutation site (damage, lifesteal heal, heal effect,
 * round-start regen, tickStatuses regen tick, combat-start init). For each
 * picked perk with a `whenBelowHp` trigger, applies the aura when HP fraction
 * is strictly below the ratio and removes it when at-or-above.
 *
 * Semantics:
 * - The `<` boundary is exclusive: at exactly `ratio`, the aura is NOT active.
 * - Dead combatants and combatants with `maxHp <= 0` are skipped to avoid
 *   NaN / spurious aura applies on freshly-constructed or already-removed
 *   actors.
 * - Re-entrancy-safe: `applyPerkAction` for an untimed-gainStat only writes
 *   to `statuses`, never to HP, so this never recurses.
 * - No event is pushed for aura apply/remove — `applyPerkAction` skips
 *   `status_applied` for the untimed-aura branch by design.
 */
export function recomputeBelowHpAuras(self: Combatant, events: CombatEvent[]): void {
  if (self.isDead) return;
  if (self.maxHp <= 0) return;
  const hpRatio = self.currentHp / self.maxHp;
  for (const { sourceId, effect: t } of gatherTriggeredEffects(self)) {
    if (t.trigger.kind !== 'whenBelowHp') continue;
    const shouldBeActive = hpRatio < t.trigger.ratio;
    const auraKey = `perk_aura_${sourceId}`;
    const currentlyActive = self.statuses[auraKey] !== undefined;
    if (shouldBeActive && !currentlyActive) {
      applyPerkAction({ self, other: undefined, sourceId, action: t.action, events });
    } else if (!shouldBeActive && currentlyActive) {
      clearPerkAura(self, sourceId);
    }
  }
}

/**
 * The set of trigger kinds that flow through `firePerkTrigger`. Excludes:
 *  - `whenBelowHp` — continuous-aura trigger re-evaluated on HP changes
 *    (see recomputeBelowHpAuras).
 *  - `onHit` — fires once per outgoing damage instance; consumed by the
 *    lifesteal block in applyDamage. `firePerkTrigger` does NOT iterate
 *    onHit triggers to avoid double-firing.
 */
export type FireableTriggerKind = 'onCrit' | 'onKill' | 'onStruck' | 'firstAttack';

export interface FirePerkTriggerArgs {
  self: Combatant;
  other: Combatant | undefined;
  triggerKind: FireableTriggerKind;
  events: CombatEvent[];
}

/**
 * Iterate the bearer's triggered-effect sources (picked perks + equipped legendaries);
 * for each whose triggeredEffect matches the fired trigger kind, apply the bound
 * PerkAction. `whenBelowHp` triggers are not handled here — they're recomputed by a
 * separate path on HP transitions.
 */
export function firePerkTrigger(args: FirePerkTriggerArgs): void {
  for (const { sourceId, effect: t } of gatherTriggeredEffects(args.self)) {
    if (!matchesTrigger(t.trigger, args)) continue;
    applyPerkAction({
      self: args.self,
      other: args.other,
      sourceId,
      action: t.action,
      events: args.events,
    });
  }
}

function matchesTrigger(trigger: PerkTrigger, args: FirePerkTriggerArgs): boolean {
  // whenAtFullHp filtering for onStruck is applied at its fire-site (Task 8),
  // since it needs pre-write HP. Other filters (if any) likewise live at the
  // call site, not here.
  return trigger.kind === args.triggerKind;
}

/**
 * Fire the non-damageMitigation onStruck actions for `self` (the perk-bearer
 * that was just hit). damageMitigation actions are intentionally skipped here
 * because they modify the incoming damage number and must be consumed inline
 * at the `applyDamage` call site (before the HP write). `wasFullHp` must be
 * captured BEFORE the HP write so the `whenAtFullHp` filter reflects the
 * bearer's HP at the moment of being struck, not after.
 */
export function fireOnStruckNonMitigation(
  self: Combatant,
  attacker: Combatant,
  wasFullHp: boolean,
  events: CombatEvent[],
): void {
  for (const { sourceId, effect: t } of gatherTriggeredEffects(self)) {
    if (t.trigger.kind !== 'onStruck') continue;
    if (t.trigger.whenAtFullHp && !wasFullHp) continue;
    if (t.action.kind === 'damageMitigation') continue; // handled inline at the applyDamage call site
    applyPerkAction({ self, other: attacker, sourceId, action: t.action, events });
  }
}


function makeBuffEffect(
  stat: BuffableStat,
  delta: number,
  duration: number,
  statusId: string,
): AbilityEffect {
  return {
    kind: 'buff',
    stat,
    delta,
    duration,
    statusId: statusId as StatusId,
  };
}

/**
 * Map a perk-applied StatusId to the canonical AbilityEffect shape so that
 * tickStatuses (regen/poison) and getEffectiveStat (buff/debuff) handle it the
 * same way as ability-applied statuses. Payload overrides the per-status defaults.
 *
 * Defaults are placeholders — L10 perk defs (Task 13) should supply explicit payloads
 * (e.g. eagles_mark damageBonus 0.25 vs arcane_surge 0.5). A missing payload silently
 * uses the default and may mask a balance bug; integration tests per perk catch this.
 */
function synthesizeStatusEffect(
  statusId: StatusId,
  duration: number,
  payload: { damageBonus?: number; healPerTurn?: number; damagePerTurn?: number } | undefined,
): AbilityEffect {
  switch (statusId) {
    case 'marked':
      return {
        kind: 'mark',
        damageBonus: payload?.damageBonus ?? DEFAULT_MARK_DAMAGE_BONUS,
        duration,
        statusId,
      };
    case 'blessed':
      // 'blessed' is the StatusId; the AbilityEffect.kind it produces is 'regen'.
      // Spec/plan text sometimes refers to this as "the regen status" — same thing.
      return {
        kind: 'regen',
        healPerTurn: payload?.healPerTurn ?? DEFAULT_REGEN_HEAL_PER_TURN,
        duration,
        statusId,
      };
    case 'poisoned':
    case 'burning':
    case 'rotting':
    case 'drowning':
      return {
        kind: 'poison',
        damagePerTurn: payload?.damagePerTurn ?? DEFAULT_POISON_DAMAGE_PER_TURN,
        duration,
        statusId,
      };
    default:
      // Fallback: a no-op buff that still decays via tickStatuses for cleanup.
      return { kind: 'buff', stat: 'attack', delta: 0, duration, statusId };
  }
}
