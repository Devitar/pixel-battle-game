import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import type { Node } from './node';
import { floorScale } from './scaling';
import { generateShop } from './shop';

export function generateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): { nodes: readonly Node[]; startNodeId: string } {
  const dungeon = DUNGEONS[dungeonId];
  const scale = floorScale(floorNumber);

  const idPrefix = `${dungeonId}-f${floorNumber}`;
  const id0 = `${idPrefix}-n0`;
  const id1 = `${idPrefix}-n1`;
  const id2a = `${idPrefix}-n2a`;
  const id2b = `${idPrefix}-n2b`;
  const idBoss = `${idPrefix}-boss`;

  // Roll which fork branch becomes a shop. Drawn first so RNG consumption
  // for downstream encounters/inventory stays deterministic per seed.
  const shopOnBranchA = rng.next() < 0.5;

  const enc0 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc1 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc2Combat = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const shop = generateShop(floorNumber, rng);
  const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);

  const node2a: Node = shopOnBranchA
    ? { id: id2a, type: 'shop', inventory: shop.inventory, nextNodeIds: [idBoss] }
    : { id: id2a, type: 'combat', encounter: enc2Combat, nextNodeIds: [idBoss] };
  const node2b: Node = shopOnBranchA
    ? { id: id2b, type: 'combat', encounter: enc2Combat, nextNodeIds: [idBoss] }
    : { id: id2b, type: 'shop', inventory: shop.inventory, nextNodeIds: [idBoss] };

  const nodes: Node[] = [
    { id: id0, type: 'combat', encounter: enc0, nextNodeIds: [id1] },
    { id: id1, type: 'combat', encounter: enc1, nextNodeIds: [id2a, id2b] },
    node2a,
    node2b,
    { id: idBoss, type: 'boss', encounter: encBoss, nextNodeIds: [] },
  ];

  return { nodes, startNodeId: id0 };
}
