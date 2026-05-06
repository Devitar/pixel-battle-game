import type { Stats } from '@combat/types';

export type ClassId = 'knight' | 'archer' | 'priest' | 'barbarian' | 'rogue' | 'mage' | 'paladin';

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
  | 'bone_throw'
  | 'bone_arrow'
  | 'rotting_bite'
  | 'lurch'
  | 'wail'
  | 'dark_bolt'
  | 'dark_pact'
  | 'necrotic_wave'
  | 'lich_strike'
  | 'curse_of_frailty'
  | 'chilling_touch'
  | 'barbarian_swing'
  | 'cleave'
  | 'rampage'
  | 'bloodthirst'
  | 'rogue_strike'
  | 'backstab'
  | 'vanish'
  | 'poison_strike'
  | 'mage_zap'
  | 'firebolt'
  | 'frost_nova'
  | 'arc_shock'
  | 'knight_cleaving_swing'
  | 'knight_quick_slash'
  | 'barbarian_whirl_strike'
  | 'barbarian_frenzy'
  | 'rogue_riposte'
  | 'rogue_brutal_chop'
  | 'priest_arcane_bolt'
  | 'mage_holy_light'
  // Sunken Keep
  | 'drowning_embrace'
  | 'tidal_smash'
  | 'crushing_wave'
  | 'drowning_lure'
  // Paladin
  | 'paladin_strike'
  | 'lay_on_hands'
  | 'consecrate';

export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled' | 'enraged' | 'poisoned' | 'vanished' | 'slowed' | 'burning' | 'drowning' | 'consecrated';

export type AbilityTag = 'radiant';

export type CombatantTag = 'undead' | 'beast' | 'humanoid';

export type WeaponType = 'sword' | 'bow' | 'holy_symbol' | 'axe' | 'daggers' | 'staff';

export type WeaponFamily = 'melee' | 'ranged' | 'magic';

export type ItemSlot = 'weapon' | 'shield' | 'outfit' | 'hat';

export type Rarity = 'common' | 'uncommon' | 'rare';

export type ItemBaseId =
  | 'sword_basic' | 'bow_basic' | 'mace_basic'
  | 'axe_basic' | 'daggers_basic' | 'staff_basic'
  | 'shield_basic'
  | 'outfit_cloth' | 'outfit_leather'
  | 'hat_cap' | 'hat_hood';

export type AffixId =
  | 'of_power' | 'of_insight' | 'of_the_bear' | 'of_vigor'
  | 'of_swiftness' | 'of_the_hawk' | 'of_evasion';

export type RarePropertyId =
  | 'of_burning' | 'of_vampirism'
  | 'of_thorns'
  | 'of_regeneration';

export interface AffixDef {
  id: AffixId;
  name: string;
  stat: BuffableStat;
  baseValue: number;
  hpMultiplier?: 3;
}

export type RarePropertyDef =
  | { id: 'of_burning'; name: string; slots: readonly ['weapon']; kind: 'burn'; baseDamage: number; turns: 2 }
  | { id: 'of_vampirism'; name: string; slots: readonly ['weapon']; kind: 'lifesteal'; percentOfDamage: number }
  | { id: 'of_thorns'; name: string; slots: readonly ['shield']; kind: 'thorns'; baseDamage: number }
  | { id: 'of_regeneration'; name: string; slots: readonly ['outfit']; kind: 'regen'; baseHeal: number };

export interface RolledAffix {
  affixId: AffixId;
  value: number;
}

export interface RolledRareProperty {
  propertyId: RarePropertyId;
  value: number;
}

export interface Item {
  readonly id: string;
  readonly baseId: ItemBaseId;
  readonly slot: ItemSlot;
  readonly rarity: Rarity;
  readonly weaponType?: WeaponType;
  readonly affixes: readonly RolledAffix[];
  readonly rareProperty?: RolledRareProperty;
  readonly floorRolledAt: number;
}

export interface HeroEquipment {
  weapon: Item;
  shield?: Item;
  outfit?: Item;
  hat?: Item;
}

export type SlotIndex = 1 | 2 | 3 | 4;

export type Side = 'self' | 'ally' | 'enemy';

export type BuffableStat = 'hp' | 'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge';

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
  | { kind: 'damage'; power: number; scalingStat?: 'attack' | 'mind'; healOnKill?: number; bonusCrit?: number; chance?: number }
  | { kind: 'heal'; power: number; scalingStat?: 'attack' | 'mind'; chance?: number }
  | { kind: 'stun'; duration: number; chance?: number }
  | { kind: 'shove'; slots: number; chance?: number }
  | { kind: 'pull'; slots: number; chance?: number }
  | { kind: 'moveToSlot'; slot: SlotIndex; chance?: number }
  | { kind: 'poison'; damagePerTurn: number; duration: number; statusId: StatusId; chance?: number }
  | { kind: 'buff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean; chance?: number }
  | { kind: 'debuff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean; chance?: number }
  | { kind: 'mark'; damageBonus: number; duration: number; statusId: StatusId; chance?: number }
  | { kind: 'taunt'; duration: number; statusId: StatusId; chance?: number }
  | { kind: 'regen'; healPerTurn: number; duration: number; statusId: StatusId; chance?: number };

export type AiCondition =
  | { kind: 'minTargets'; n: number }
  | { kind: 'casterHpBelow'; ratio: number };

export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
  cooldown?: number;
  aiCondition?: AiCondition;
  requiresShield?: boolean;
}

export interface StarterLoadout {
  weapon: ItemBaseId;
  shield?: ItemBaseId;
  outfit?: ItemBaseId;
  hat?: ItemBaseId;
}

export type WoundId =
  | 'bruised'
  | 'hobbled'
  | 'concussed'
  | 'winded'
  | 'unsteady'
  | 'broken_bone';

export type WoundEffect =
  | { kind: 'statDelta'; stat: BuffableStat; delta: number }
  | { kind: 'damageTakenMult'; multiplier: number };

export interface WoundDef {
  id: WoundId;
  name: string;
  effect: WoundEffect;
}

export interface Wound {
  id: WoundId;
  runsRemaining: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  baseStats: Stats;
  primaryStat: BuffableStat;
  preferredWeapon: WeaponType;
  weaponFamily: WeaponFamily;
  basicAbility: AbilityId;
  swapTarget?: AbilityId;
  weaponSwaps?: Partial<Record<WeaponType, AbilityId>>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  starterLoadout: StarterLoadout;
}

export type EnemyId =
  | 'skeleton_warrior'
  | 'skeleton_archer'
  | 'ghost'
  | 'zombie'
  | 'cultist'
  | 'bone_lich'
  // Sunken Keep
  | 'drowned_knight'
  | 'brine_crab'
  | 'drowned_sailor'
  | 'siren'
  | 'drowned_king';

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
}

export type DungeonId = 'crypt' | 'sunken_keep';

export type DungeonTier = 1 | 2 | 3 | 4;

export interface DungeonDef {
  id: DungeonId;
  name: string;
  theme: string;
  tier: DungeonTier;
  floorsPerRun: number;
  rowsPerFloor?: number;
  enemyPool: readonly EnemyId[];
  bossId: EnemyId;
  unlockRequirement?: string;
}

export type MilestoneId = 'first_crypt_clear';

export type TraitId =
  | 'stout'
  | 'quick'
  | 'sturdy'
  | 'sharp_eyed'
  | 'cowardly'
  | 'nervous'
  | 'frail'
  | 'sluggish'
  | 'lucky'
  | 'slippery'
  | 'wise'
  | 'bloodthirsty';

export type TraitCondition =
  | { kind: 'inSlot'; slot: SlotIndex }
  | { kind: 'belowHpRatio'; ratio: number };

export interface TraitHpEffect {
  delta: number;
  mode: 'flat' | 'percent';
}

export interface TraitStatEffect {
  stat: 'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge';
  delta: number;
  condition?: TraitCondition;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  shortDescription: string;
  hpEffect?: TraitHpEffect;
  statEffects?: readonly TraitStatEffect[];
}

export type PerkId =
  | 'iron_will' | 'resolute'
  | 'precise' | 'eagle_eye'
  | 'devout' | 'steadfast'
  | 'berserker' | 'tough_skin'
  | 'lethal' | 'evasive'
  | 'arcane_power' | 'quick_cast'
  // Paladin
  | 'righteous' | 'vindicator';

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  classId: ClassId;
  statEffects?: readonly TraitStatEffect[];
  hpEffect?: TraitHpEffect;
}

export interface Unlocks {
  classes: readonly ClassId[];
  dungeons: readonly DungeonId[];
}
