import { CRYPT_BOSS, CRYPT_POOL } from './enemies';
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    floorLength: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
};
