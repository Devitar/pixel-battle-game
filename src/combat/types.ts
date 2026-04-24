import type {
  AbilityEffect,
  AbilityId,
  ClassId,
  CombatantTag,
  EnemyId,
  SlotIndex,
  StatusId,
} from '../data/types';

export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
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
  kind: 'hero' | 'enemy';
  classId?: ClassId;
  enemyId?: EnemyId;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  statuses: Record<string, StatusInstance>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots?: readonly SlotIndex[];
  tags?: readonly CombatantTag[];
  isDead: boolean;
}

export interface CombatState {
  combatants: Combatant[];
  round: number;
}

export type CombatOutcome = 'player_victory' | 'player_defeat' | 'timeout';

export type CombatEvent =
  | { kind: 'combat_start'; party: readonly CombatantId[]; enemies: readonly CombatantId[] }
  | { kind: 'round_start'; round: number; order: readonly CombatantId[] }
  | { kind: 'turn_start'; combatantId: CombatantId }
  | { kind: 'turn_skipped'; combatantId: CombatantId; reason: 'stunned' | 'dead' }
  | { kind: 'ability_cast'; casterId: CombatantId; abilityId: AbilityId; targetIds: readonly CombatantId[] }
  | { kind: 'shuffle'; combatantId: CombatantId }
  | { kind: 'damage_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number; lethal: boolean }
  | { kind: 'heal_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number }
  | { kind: 'status_applied'; sourceId: CombatantId; targetId: CombatantId; statusId: StatusId; duration: number }
  | { kind: 'status_expired'; targetId: CombatantId; statusId: StatusId }
  | { kind: 'position_changed'; combatantId: CombatantId; fromSlot: SlotIndex; toSlot: SlotIndex; reason: 'shove' | 'pull' | 'swap' | 'collapse' | 'shuffle' }
  | { kind: 'death'; combatantId: CombatantId }
  | { kind: 'round_end'; round: number }
  | { kind: 'combat_end'; outcome: CombatOutcome };

export interface CombatResult {
  finalState: CombatState;
  events: readonly CombatEvent[];
  outcome: CombatOutcome;
}
