import type { Ability, AbilityEffect } from '../data/types';
import type { Rng } from '../util/rng';
import { collapseAfterDeath, pull, shove } from './positions';
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
  events: CombatEvent[],
): void {
  const bonus = tagBonusMultiplier(ability, target);
  let raw = Math.round(effect.power * getEffectiveStat(caster, 'attack') * bonus);
  const mark = target.statuses['marked'];
  if (mark && mark.effect.kind === 'mark') {
    raw = Math.round(raw * (1 + mark.effect.damageBonus));
  }
  const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
  target.currentHp -= final;
  const lethal = target.currentHp <= 0;
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: final,
    lethal,
  });
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
  }
}

function applyHeal(
  caster: Combatant,
  target: Combatant,
  effect: Extract<AbilityEffect, { kind: 'heal' }>,
  events: CombatEvent[],
): void {
  const amount = Math.round(effect.power * getEffectiveStat(caster, 'attack'));
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
  events: CombatEvent[],
): void {
  if (target.isDead) return;
  switch (effect.kind) {
    case 'damage':
      applyDamage(caster, target, effect, ability, events);
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
    case 'shove':
      shove(target, effect.slots, state, events);
      return;
    case 'pull':
      pull(target, effect.slots, state, events);
      return;
  }
}

export function applyAbility(
  ability: Ability,
  caster: Combatant,
  targetIds: readonly CombatantId[],
  state: CombatState,
  _rng: Rng,
  events: CombatEvent[],
): void {
  events.push({ kind: 'ability_cast', casterId: caster.id, abilityId: ability.id, targetIds });

  const sidesWithDeaths = new Set<Combatant['side']>();

  for (const effect of ability.effects) {
    for (const tid of targetIds) {
      const target = findById(state, tid);
      if (!target) continue;
      if (target.isDead) continue;
      const wasAlive = !target.isDead;
      applyEffect(ability, effect, caster, target, state, events);
      if (wasAlive && target.isDead) sidesWithDeaths.add(target.side);
    }
  }

  for (const side of sidesWithDeaths) {
    collapseAfterDeath(side, state, events);
  }
}
