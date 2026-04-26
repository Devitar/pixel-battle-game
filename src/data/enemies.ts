import type { EnemyDef, EnemyId } from './types';

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  skeleton_warrior: {
    id: 'skeleton_warrior',
    name: 'Skeleton Warrior',
    role: 'minion',
    baseStats: { hp: 12, attack: 3, defense: 2, speed: 3 },
    tags: ['undead'],
    abilities: ['bone_slash'],
    aiPriority: ['bone_slash'],
    preferredSlots: [1, 2],
    spriteId: 'skeleton_warrior',
  },
  skeleton_archer: {
    id: 'skeleton_archer',
    name: 'Skeleton Archer',
    role: 'minion',
    baseStats: { hp: 10, attack: 4, defense: 1, speed: 4 },
    tags: ['undead'],
    abilities: ['bone_arrow'],
    aiPriority: ['bone_arrow'],
    preferredSlots: [3, 4],
    spriteId: 'skeleton_archer',
  },
  ghoul: {
    id: 'ghoul',
    name: 'Ghoul',
    role: 'minion',
    baseStats: { hp: 14, attack: 3, defense: 2, speed: 3 },
    tags: ['undead'],
    abilities: ['rotting_bite'],
    aiPriority: ['rotting_bite'],
    preferredSlots: [1, 2],
    spriteId: 'ghoul',
  },
  cultist: {
    id: 'cultist',
    name: 'Cultist',
    role: 'minion',
    baseStats: { hp: 10, attack: 3, defense: 1, speed: 3 },
    tags: ['humanoid'],
    abilities: ['dark_pact', 'dark_bolt'],
    aiPriority: ['dark_pact', 'dark_bolt'],
    preferredSlots: [3, 4],
    spriteId: 'cultist',
  },
  bone_lich: {
    id: 'bone_lich',
    name: 'Bone Lich',
    role: 'boss',
    baseStats: { hp: 35, attack: 5, defense: 3, speed: 3 },
    tags: ['undead'],
    abilities: ['curse_of_frailty', 'necrotic_wave', 'lich_strike'],
    aiPriority: ['curse_of_frailty', 'necrotic_wave', 'lich_strike'],
    preferredSlots: [3, 4],
    spriteId: 'bone_lich',
  },
};

export const CRYPT_POOL: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghoul',
  'cultist',
];

export const CRYPT_BOSS: EnemyId = 'bone_lich';
