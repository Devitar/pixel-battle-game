import type { Stats } from '../combat/types';

export type ClassId = 'knight' | 'archer' | 'priest';

export type AbilityId =
  | 'knight_slash'
  | 'shield_bash'
  | 'bulwark'
  | 'taunt'
  | 'archer_shoot'
  | 'piercing_shot'
  | 'volley'
  | 'flare_arrow'
  | 'priest_strike'
  | 'mend'
  | 'smite'
  | 'bless'
  | 'bone_slash'
  | 'bone_arrow'
  | 'rotting_bite'
  | 'dark_bolt'
  | 'dark_pact'
  | 'necrotic_wave'
  | 'lich_strike'
  | 'curse_of_frailty';

export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned';

export type AbilityTag = 'radiant';

export type CombatantTag = 'undead' | 'beast' | 'humanoid';

export type WeaponType = 'sword' | 'bow' | 'holy_symbol';

export type SlotIndex = 1 | 2 | 3 | 4;

export type Side = 'self' | 'ally' | 'enemy';

export type BuffableStat = 'hp' | 'attack' | 'defense' | 'speed';

export type TargetFilter =
  | { kind: 'hurt' }
  | { kind: 'hasStatus'; statusId: StatusId }
  | { kind: 'lacksStatus'; statusId: StatusId }
  | { kind: 'hasTag'; tag: CombatantTag };

export interface TargetSelector {
  side: Side;
  slots?: readonly SlotIndex[] | 'all' | 'furthest';
  filter?: TargetFilter;
  pick?: 'first' | 'random' | 'lowestHp' | 'highestHp';
}

export type AbilityEffect =
  | { kind: 'damage'; power: number }
  | { kind: 'heal'; power: number }
  | { kind: 'stun'; duration: number }
  | { kind: 'shove'; slots: number }
  | { kind: 'pull'; slots: number }
  | { kind: 'buff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId }
  | { kind: 'debuff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId }
  | { kind: 'mark'; damageBonus: number; duration: number; statusId: StatusId }
  | { kind: 'taunt'; duration: number; statusId: StatusId };

export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
}

export interface StarterLoadout {
  weapon: string;
  shield?: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  baseStats: Stats;
  preferredWeapon: WeaponType;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  starterLoadout: StarterLoadout;
}

export type EnemyId =
  | 'skeleton_warrior'
  | 'skeleton_archer'
  | 'ghoul'
  | 'cultist'
  | 'bone_lich';

export type EnemyRole = 'minion' | 'boss';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  role: EnemyRole;
  baseStats: Stats;
  tags: readonly CombatantTag[];
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots: readonly SlotIndex[];
  spriteId: string;
}
