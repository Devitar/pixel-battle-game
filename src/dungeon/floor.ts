import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng, WeightedOption } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import { composeEliteEncounter } from './elite';
import type { Node } from './node';
import { floorScale } from './scaling';
import { generateShop } from './shop';

type ForkShape = 'shop_vs_combat' | 'elite_vs_combat' | 'elite_vs_shop';

const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  { value: 'shop_vs_combat',  weight: 1 },
  { value: 'elite_vs_combat', weight: 1 },
  { value: 'elite_vs_shop',   weight: 1 },
];

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

  // Roll fork shape and which branch (A or B) gets the more-distinguished
  // node. Drawn first so RNG consumption order downstream stays deterministic.
  const shape: ForkShape = rng.weighted(FORK_SHAPE_WEIGHTS);
  const specialOnBranchA = rng.next() < 0.5;

  const enc0 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc1 = composeCombatEncounter(dungeon.enemyPool, scale, rng);

  // Conditionally compose only the encounters/inventory the rolled shape
  // requires. RNG order: combat-fork-branch encounter (if shape uses combat),
  // then elite encounter (if shape uses elite), then shop inventory (if shape
  // uses shop).
  const usesCombatBranch = shape === 'shop_vs_combat' || shape === 'elite_vs_combat';
  const usesEliteBranch  = shape === 'elite_vs_combat' || shape === 'elite_vs_shop';
  const usesShopBranch   = shape === 'shop_vs_combat'  || shape === 'elite_vs_shop';

  const combatBranchEnc = usesCombatBranch
    ? composeCombatEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const eliteBranchEnc = usesEliteBranch
    ? composeEliteEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const shopBranchInv = usesShopBranch ? generateShop(floorNumber, rng).inventory : undefined;

  const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);

  // Build the two branch nodes per shape. `specialOnBranchA` decides which
  // side gets the more-distinguished node:
  //   shop_vs_combat:   true → A is shop, B is combat
  //   elite_vs_combat:  true → A is elite, B is combat
  //   elite_vs_shop:    true → A is elite, B is shop
  const buildCombatBranch = (id: string): Node => {
    if (combatBranchEnc === undefined) {
      throw new Error(`generateFloor: combatBranchEnc undefined for shape '${shape}'`);
    }
    return { id, type: 'combat', encounter: combatBranchEnc, nextNodeIds: [idBoss] };
  };
  const buildEliteBranch = (id: string): Node => {
    if (eliteBranchEnc === undefined) {
      throw new Error(`generateFloor: eliteBranchEnc undefined for shape '${shape}'`);
    }
    return { id, type: 'elite', encounter: eliteBranchEnc, nextNodeIds: [idBoss] };
  };
  const buildShopBranch = (id: string): Node => {
    if (shopBranchInv === undefined) {
      throw new Error(`generateFloor: shopBranchInv undefined for shape '${shape}'`);
    }
    return { id, type: 'shop', inventory: shopBranchInv, nextNodeIds: [idBoss] };
  };

  let node2a: Node;
  let node2b: Node;
  switch (shape) {
    case 'shop_vs_combat':
      node2a = specialOnBranchA ? buildShopBranch(id2a) : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildShopBranch(id2b);
      break;
    case 'elite_vs_combat':
      node2a = specialOnBranchA ? buildEliteBranch(id2a) : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildEliteBranch(id2b);
      break;
    case 'elite_vs_shop':
      node2a = specialOnBranchA ? buildEliteBranch(id2a) : buildShopBranch(id2a);
      node2b = specialOnBranchA ? buildShopBranch(id2b) : buildEliteBranch(id2b);
      break;
  }

  const nodes: Node[] = [
    { id: id0, type: 'combat', encounter: enc0, nextNodeIds: [id1] },
    { id: id1, type: 'combat', encounter: enc1, nextNodeIds: [id2a, id2b] },
    node2a,
    node2b,
    { id: idBoss, type: 'boss', encounter: encBoss, nextNodeIds: [] },
  ];

  return { nodes, startNodeId: id0 };
}
