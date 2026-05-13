import { ABILITIES } from '@data/abilities';
import type { Ability, AbilityEffect } from '@data/types';
import { HEAVY_HIT_WOUND_THRESHOLD, WOUND_CHANCE_PERCENT, WOUND_IDS } from '@data/wounds';
import type { Rng } from '@util/rng';
import { pickAbility } from './ability_priority';
import { setCooldown } from './cooldowns';
import {
  fireOnStruckNonMitigation,
  firePerkTrigger,
  gatherTriggeredEffects,
  recomputeBelowHpAuras,
} from './perk_hooks';
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
  // Consume a stashed firstAttack damageMod, if present. Applies before mark
  // amplification, defense, and crit doubling so the multiplier scales the
  // base attack value rather than the post-defense final.
  if (caster.pendingDamageMod !== undefined && caster.pendingDamageMod !== 1) {
    raw = Math.round(raw * caster.pendingDamageMod);
    caster.pendingDamageMod = 1;
  }
  const mark = target.statuses['marked'];
  if (mark && mark.effect.kind === 'mark') {
    raw = Math.round(raw * (1 + mark.effect.damageBonus));
  }
  const wasCrit = rng.percent(getEffectiveStat(caster, 'crit') + (effect.bonusCrit ?? 0));
  if (wasCrit) {
    raw = raw * 2;
    firePerkTrigger({
      self: caster,
      other: target,
      triggerKind: 'onCrit',
      events,
    });
  }
  const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
  const exhAmp =
    target.side === 'player' && state.exhaustionLevel > 0
      ? Math.max(1, Math.round(final * (1 + 0.10 * state.exhaustionLevel)))
      : final;
  const amplified =
    target.damageTakenMultiplier !== undefined && target.damageTakenMultiplier !== 1
      ? Math.max(1, Math.round(exhAmp * target.damageTakenMultiplier))
      : exhAmp;
  // onStruck — captured BEFORE the HP write so `whenAtFullHp` reflects the
  // bearer's HP at the moment of being struck.
  let mitigated = amplified;
  if (!target.isDead) {
    const wasFullHp = target.currentHp >= target.maxHp;
    // Pass 1: collect & apply damageMitigation multipliers from matching
    // onStruck triggered effects (perks + equipped legendaries). Multiple
    // multipliers stack multiplicatively. The existing 1-damage floor is preserved.
    for (const { effect: t } of gatherTriggeredEffects(target)) {
      if (t.trigger.kind !== 'onStruck') continue;
      if (t.trigger.whenAtFullHp && !wasFullHp) continue;
      if (t.action.kind === 'damageMitigation') {
        mitigated = Math.max(1, Math.round(mitigated * t.action.multiplier));
      }
    }
    // Pass 2: fire non-damageMitigation onStruck actions (status applies,
    // gainStat, etc.). These are evaluated against the same pre-write HP.
    fireOnStruckNonMitigation(target, caster, wasFullHp, events);
  }
  target.currentHp -= mitigated;
  recomputeBelowHpAuras(target, events);
  const lethal = target.currentHp <= 0;
  if (lethal) {
    firePerkTrigger({
      self: caster,
      other: target,
      triggerKind: 'onKill',
      events,
    });
  }
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: mitigated,
    lethal,
    wasCrit,
  });
  if (caster.lifestealPercent !== undefined && caster.lifestealPercent > 0) {
    const heal = Math.floor(mitigated * caster.lifestealPercent / 100);
    if (heal > 0) {
      const actual = Math.min(heal, caster.maxHp - caster.currentHp);
      if (actual > 0) {
        caster.currentHp += actual;
        recomputeBelowHpAuras(caster, events);
        events.push({
          kind: 'heal_applied',
          sourceId: caster.id,
          targetId: caster.id,
          amount: actual,
        });
      }
    }
  }
  if (caster.burningWeaponDamage !== undefined && !lethal) {
    target.statuses['burning'] = {
      statusId: 'burning',
      remainingTurns: 2,
      effect: { kind: 'poison', damagePerTurn: caster.burningWeaponDamage, duration: 2, statusId: 'burning' },
      sourceId: caster.id,
    };
    events.push({
      kind: 'status_applied',
      sourceId: caster.id,
      targetId: target.id,
      statusId: 'burning',
      duration: 2,
    });
  }
  if (caster.venomousDamage !== undefined && !lethal) {
    const duration = caster.venomousDuration ?? 2;
    target.statuses['poisoned'] = {
      statusId: 'poisoned',
      remainingTurns: duration,
      effect: { kind: 'poison', damagePerTurn: caster.venomousDamage, duration, statusId: 'poisoned' },
      sourceId: caster.id,
    };
    events.push({
      kind: 'status_applied',
      sourceId: caster.id,
      targetId: target.id,
      statusId: 'poisoned',
      duration,
    });
  }
  if (target.thornsDamage !== undefined && target.thornsDamage > 0 && !caster.isDead) {
    const thorn = target.thornsDamage;
    caster.currentHp -= thorn;
    recomputeBelowHpAuras(caster, events);
    const sourceLethal = caster.currentHp <= 0;
    events.push({
      kind: 'damage_applied',
      sourceId: target.id,
      targetId: caster.id,
      amount: thorn,
      lethal: sourceLethal,
      wasCrit: false,
    });
    if (sourceLethal) {
      caster.isDead = true;
      events.push({ kind: 'death', combatantId: caster.id });
    }
  }
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
    if (effect.healOnKill !== undefined) {
      const healAmount = Math.round(effect.healOnKill * getEffectiveStat(caster, scalingStat));
      const actual = Math.min(healAmount, caster.maxHp - caster.currentHp);
      caster.currentHp += actual;
      recomputeBelowHpAuras(caster, events);
      events.push({
        kind: 'heal_applied',
        sourceId: caster.id,
        targetId: caster.id,
        amount: actual,
      });
    }
  } else if (target.kind === 'hero') {
    const isHeavy = mitigated >= target.maxHp * HEAVY_HIT_WOUND_THRESHOLD;
    if ((isHeavy || wasCrit) && rng.percent(WOUND_CHANCE_PERCENT)) {
      const woundId = rng.pick(WOUND_IDS);
      events.push({ kind: 'wound_inflicted', combatantId: target.id, woundId });
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
  recomputeBelowHpAuras(target, events);
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
  if (effect.chance !== undefined && !rng.percent(effect.chance)) return;
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
        // hp-debuff shifts both currentHp (via clamp) and maxHp denominator;
        // resync any whenBelowHp aura against the new ratio.
        recomputeBelowHpAuras(target, events);
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
    case 'regen':
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
    case 'commandPet': {
      const pet = state.combatants.find(
        (c) => c.kind === 'pet' && c.ownerHeroId === caster.id && !c.isDead,
      );
      if (!pet) return;
      const picked = pickAbility(pet, state, rng);
      if (!picked) return;
      const petAbility = ABILITIES[picked.abilityId];
      // Defensive: a pet ability cannot itself be commandPet (only Hunters have command_strike).
      // If a future pet kit ever adds commandPet, no-op to avoid infinite recursion.
      if (petAbility.effects.some((e) => e.kind === 'commandPet')) return;
      applyAbility(petAbility, pet, picked.targetIds, state, rng, events);
      if (petAbility.cooldown !== undefined) {
        setCooldown(pet, petAbility.id, petAbility.cooldown + 1);
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
