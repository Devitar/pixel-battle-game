import type { EnemyDef, EnemyId } from './types';

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  skeleton_warrior: {
    id: 'skeleton_warrior',
    name: 'Skeleton Warrior',
    role: 'minion',
    baseStats: { hp: 12, attack: 3, defense: 2, speed: 3, mind: 0, crit: 5, dodge: 5 },
    tags: ['undead'],
    abilities: ['bone_slash', 'bone_throw'],
    aiPriority: ['bone_slash', 'bone_throw'],
    preferredSlots: [1, 2],
  },
  skeleton_archer: {
    id: 'skeleton_archer',
    name: 'Skeleton Archer',
    role: 'minion',
    baseStats: { hp: 10, attack: 4, defense: 1, speed: 4, mind: 0, crit: 5, dodge: 5 },
    tags: ['undead'],
    abilities: ['bone_arrow'],
    aiPriority: ['bone_arrow'],
    preferredSlots: [3, 4],
  },
  ghost: {
    id: 'ghost',
    name: 'Ghost',
    role: 'minion',
    baseStats: { hp: 12, attack: 3, defense: 1, speed: 4, mind: 0, crit: 5, dodge: 5 },
    tags: ['undead'],
    abilities: ['chilling_touch', 'wail'],
    aiPriority: ['chilling_touch', 'wail'],
    preferredSlots: [1, 2],
  },
  zombie: {
    id: 'zombie',
    name: 'Zombie',
    role: 'minion',
    baseStats: { hp: 16, attack: 3, defense: 1, speed: 2, mind: 0, crit: 5, dodge: 5 },
    tags: ['undead'],
    abilities: ['rotting_bite', 'lurch'],
    aiPriority: ['rotting_bite', 'lurch'],
    preferredSlots: [1, 2],
  },
  cultist: {
    id: 'cultist',
    name: 'Cultist',
    role: 'minion',
    baseStats: { hp: 10, attack: 3, defense: 1, speed: 3, mind: 3, crit: 5, dodge: 5 },
    tags: ['humanoid'],
    abilities: ['dark_pact', 'dark_bolt'],
    aiPriority: ['dark_pact', 'dark_bolt'],
    preferredSlots: [3, 4],
  },
  bone_lich: {
    id: 'bone_lich',
    name: 'Bone Lich',
    role: 'boss',
    baseStats: { hp: 35, attack: 5, defense: 3, speed: 3, mind: 4, crit: 10, dodge: 5 },
    tags: ['undead'],
    abilities: ['curse_of_frailty', 'necrotic_wave', 'lich_strike'],
    aiPriority: ['curse_of_frailty', 'necrotic_wave', 'lich_strike'],
    preferredSlots: [3, 4],
  },
};

export const CRYPT_POOL: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghost',
  'zombie',
  'cultist',
];

export const CRYPT_BOSS: EnemyId = 'bone_lich';
