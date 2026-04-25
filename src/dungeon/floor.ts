import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import type { Node } from './node';
import { floorScale } from './scaling';

export function generateFloor(dungeonId: DungeonId, floorNumber: number, rng: Rng): Node[] {
  const dungeon = DUNGEONS[dungeonId];
  const scale = floorScale(floorNumber);
  const nodes: Node[] = [];

  for (let i = 0; i < dungeon.floorLength; i++) {
    nodes.push({
      id: `${dungeonId}-f${floorNumber}-n${i}`,
      type: 'combat',
      encounter: composeCombatEncounter(dungeon.enemyPool, scale, rng),
    });
  }

  nodes.push({
    id: `${dungeonId}-f${floorNumber}-boss`,
    type: 'boss',
    encounter: composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng),
  });

  return nodes;
}
