import { CRYPT_BOSS, CRYPT_POOL, SUNKEN_KEEP_BOSS, SUNKEN_KEEP_POOL } from './enemies';
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    tier: 1,
    floorsPerRun: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
  sunken_keep: {
    id: 'sunken_keep',
    name: 'The Sunken Keep',
    theme: 'Flooded castle',
    tier: 2,
    floorsPerRun: 3,
    rowsPerFloor: 10,
    enemyPool: SUNKEN_KEEP_POOL,
    bossId: SUNKEN_KEEP_BOSS,
    unlockRequirement: 'Defeat the Bone Lich',
  },
};
