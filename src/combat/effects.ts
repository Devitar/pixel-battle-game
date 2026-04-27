import type { Ability, AbilityEffect } from '../data/types';
import type { Rng } from '../util/rng';
import { collapseAfterDeath, moveTo, pull, shove, swap } from './positions';
import { getEffectiveStat } from './statuses';
import type { Combatant, CombatantId, CombatEvent, CombatState, StatusInstance } from './types';

function findById(state: CombatState, id: CombatantId): Combatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

function tagBonusMultiplier(ability: Ability, target: Combatant): number {
  if (!ability.tags || !target.tags) return 1.0;
  for (const atag of ability.tags) {
    if (atag === 'radiant' && target.tags.includes('undead')) return 1.5;
  }
  return 1.0;
}

function applyDamage(
  caster: Combatant,
  target: Combatant,
  effect: Extract<AbilityEffect, { kind: 'damage' }>,
  ability: Ability,
  state: CombatState,
  rng: Rng,
  events: CombatEvent[],
): void {
  const bonus = tagBonusMultiplier(ability, target);
  const scalingStat = effect.scalingStat ?? 'attack';
  let raw = Math.round(effect.power * getEffectiveStat(caster, scalingStat) * bonus);
  const mark = target.statuses['marked'];
  if (mark && mark.effect.kind === 'mark') {
    raw = Math.round(raw * (1 + mark.effect.damageBonus));
  }
  const wasCrit = rng.percent(getEffectiveStat(caster, 'crit') + (effect.bonusCrit ?? 0));
  if (wasCrit) raw = raw * 2;
  const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
  const amplified =
    target.side === 'player' && state.exhaustionLevel > 0
      ? Math.max(1, Math.round(final * (1 + 0.10 * state.exhaustionLevel)))
      : final;
  target.currentHp -= amplified;
  const lethal = target.currentHp <= 0;
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: amplified,
    lethal,
    wasCrit,
  });
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
    if (effect.healOnKill !== undefined) {
      const healAmount = Math.round(effect.healOnKill * getEffectiveStat(caster, scalingStat));
      const actual = Math.min(healAmount, caster.maxHp - caster.currentHp);
      caster.currentHp += actual;
      events.push({
        kind: 'heal_applied',
        sourceId: caster.id,
        targetId: caster.id,
        amount: actual,
      });
    }
  }
}

function applyHeal(
  caster: Combatant,
  target: Combatant,
  effect: Extract<AbilityEffect, { kind: 'heal' }>,
  events: CombatEvent[],
): void {
  const scalingStat = effect.scalingStat ?? 'attack';
  const amount = Math.round(effect.power * getEffectiveStat(caster, scalingStat));
  const actual = Math.min(amount, target.maxHp - target.currentHp);
  target.currentHp += actual;
  events.push({ kind: 'heal_applied', sourceId: caster.id, targetId: target.id, amount: actual });
}

function storeStatus(
  caster: Combatant,
  target: Combatant,
  statusId: StatusInstance['statusId'],
  effect: AbilityEffect,
  duration: number,
  events: CombatEvent[],
): void {
  target.statuses[statusId] = {
    statusId,
    remainingTurns: duration,
    effect,
    sourceId: caster.id,
  };
  events.push({
    kind: 'status_applied',
    sourceId: caster.id,
    targetId: target.id,
    statusId,
    duration,
  });
}

function applyEffect(
  ability: Ability,
  effect: AbilityEffect,
  caster: Combatant,
  target: Combatant,
  state: CombatState,
  rng: Rng,
  events: CombatEvent[],
): void {
  if (target.isDead) return;
  switch (effect.kind) {
    case 'damage':
      applyDamage(caster, target, effect, ability, state, rng, events);
      return;
    case 'heal':
      applyHeal(caster, target, effect, events);
      return;
    case 'stun':
      storeStatus(caster, target, 'stunned', effect, effect.duration, events);
      return;
    case 'buff':
    case 'debuff':
      if (effect.stat === 'hp') {
        target.maxHp += effect.delta;
        target.currentHp = Math.min(target.currentHp, target.maxHp);
      }
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
    case 'mark':
    case 'taunt':
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
    case 'poison':
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
    case 'shove':
      shove(target, effect.slots, state, events);
      return;
    case 'pull':
      pull(target, effect.slots, state, events);
      return;
    case 'moveToSlot': {
      const sameSide = state.combatants.filter(
        (c) => c.side === caster.side && !c.isDead && c.id !== caster.id,
      );
      const occupant = sameSide.find((c) => c.slot === effect.slot);
      if (occupant) {
        swap(caster, occupant, events);
      } else {
        moveTo(caster, effect.slot, events);
      }
      return;
    }
  }
}

export function applyAbility(
  ability: Ability,
  caster: Combatant,
  targetIds: readonly CombatantId[],
  state: CombatState,
  rng: Rng,
  events: CombatEvent[],
): void {
  events.push({ kind: 'ability_cast', casterId: caster.id, abilityId: ability.id, targetIds });

  // Self-target effects fire once per cast, regardless of how many targets dodge.
  // Flavor: a fully-dodged Rampage still costs the caster their defense — the
  // over-extension happens whether or not the swing connects.
  for (const effect of ability.effects) {
    const isSelfTarget =
      effect.kind === 'moveToSlot' ||
      ((effect.kind === 'buff' || effect.kind === 'debuff') && effect.selfTarget === true);
    if (isSelfTarget && !caster.isDead) {
      applyEffect(ability, effect, caster, caster, state, rng, events);
    }
  }

  const hasDamage = ability.effects.some((e) => e.kind === 'damage');
  const sidesWithDeaths = new Set<Combatant['side']>();

  for (const tid of targetIds) {
    const target = findById(state, tid);
    if (!target) continue;
    if (target.isDead) continue;

    if (hasDamage && rng.percent(getEffectiveStat(target, 'dodge'))) {
      events.push({
        kind: 'attack_dodged',
        sourceId: caster.id,
        targetId: target.id,
        abilityId: ability.id,
      });
      continue;
    }

    const wasAlive = !target.isDead;
    for (const effect of ability.effects) {
      if (target.isDead) break;
      const isSelfTarget =
        (effect.kind === 'buff' || effect.kind === 'debuff') && effect.selfTarget === true;
      if (isSelfTarget) continue;
      applyEffect(ability, effect, caster, target, state, rng, events);
    }
    if (wasAlive && target.isDead) sidesWithDeaths.add(target.side);
  }

  for (const side of sidesWithDeaths) {
    collapseAfterDeath(side, state, events);
  }
}
