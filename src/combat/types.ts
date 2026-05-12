import type {
  AbilityEffect,
  AbilityId,
  ClassId,
  CombatantTag,
  EnemyId,
  PerkId,
  PetSpeciesId,
  SlotIndex,
  StatusId,
  TraitId,
  WoundId,
} from '@data/types';

export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  mind: number;
  crit: number;
  dodge: number;
}

export type CombatantId = string;

export type CombatSide = 'player' | 'enemy';

export interface StatusInstance {
  statusId: StatusId;
  remainingTurns: number;
  effect: AbilityEffect;
  sourceId: CombatantId;
}

export interface Combatant {
  id: CombatantId;
  side: CombatSide;
  slot: SlotIndex;
  kind: 'hero' | 'enemy' | 'pet';
  classId?: ClassId;
  enemyId?: EnemyId;
  ownerHeroId?: string;          // pet → owning Hunter's Hero.id
  petSpeciesId?: PetSpeciesId;   // pet → species id (for sprite resolution)
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  statuses: Record<string, StatusInstance>;
  cooldowns: Partial<Record<AbilityId, number>>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots?: readonly SlotIndex[];
  tags?: readonly CombatantTag[];
  traitIds?: readonly TraitId[];
  pickedPerks: readonly PerkId[];
  /** Per-combat tracker for firstAttack-triggered perks. Cleared at combat start.
   *  Holds perk ids that have already fired their firstAttack trigger this combat. */
  firstAttackFiredPerkIds?: readonly PerkId[];
  /** Stashed multiplier for the next outgoing damage instance. Used by firstAttack
   *  perks with damageMod action. Consumed once at applyDamage and reset to 1. */
  pendingDamageMod?: number;
  damageTakenMultiplier?: number;
  // Candidates for consolidation into a `passives` bag once 3+ more land.
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
  burningWeaponDamage?: number;
  venomousDamage?: number;
  venomousDuration?: number;
  enragedThreshold?: number;
  enragedAttackDelta?: number;
  isDead: boolean;
}

export interface CombatState {
  combatants: Combatant[];
  round: number;
  exhaustionLevel: number;
}

export type CombatOutcome = 'player_victory' | 'player_defeat';

export type CombatEvent =
  | { kind: 'combat_start'; party: readonly CombatantId[]; enemies: readonly CombatantId[] }
  | { kind: 'round_start'; round: number; order: readonly CombatantId[] }
  | { kind: 'turn_start'; combatantId: CombatantId }
  | { kind: 'turn_skipped'; combatantId: CombatantId; reason: 'stunned' | 'dead' | 'no_action' }
  | { kind: 'ability_cast'; casterId: CombatantId; abilityId: AbilityId; targetIds: readonly CombatantId[] }
  | { kind: 'shuffle'; combatantId: CombatantId }
  | { kind: 'damage_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number; lethal: boolean; wasCrit: boolean }
  | { kind: 'attack_dodged'; sourceId: CombatantId; targetId: CombatantId; abilityId: AbilityId }
  | { kind: 'wound_inflicted'; combatantId: CombatantId; woundId: WoundId }
  | { kind: 'heal_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number }
  | { kind: 'status_applied'; sourceId: CombatantId; targetId: CombatantId; statusId: StatusId; duration: number }
  | { kind: 'status_expired'; targetId: CombatantId; statusId: StatusId }
  | { kind: 'position_changed'; combatantId: CombatantId; fromSlot: SlotIndex; toSlot: SlotIndex; reason: 'shove' | 'pull' | 'swap' | 'collapse' | 'shuffle' }
  | { kind: 'death'; combatantId: CombatantId }
  | { kind: 'round_end'; round: number }
  | { kind: 'exhaustion_applied'; level: number }
  | { kind: 'combat_end'; outcome: CombatOutcome };

export interface CombatResult {
  finalState: CombatState;
  events: readonly CombatEvent[];
  outcome: CombatOutcome;
}
