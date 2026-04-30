import { DUNGEONS } from '../data/dungeons';
import { EVENTS } from '../data/events';
import type { DungeonId } from '../data/types';
import type { Rng, WeightedOption } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import { composeEliteEncounter } from './elite';
import { drawEventCard } from './event_deck';
import { stampCombatModifiers, stampEliteModifiers } from './modifier_stamp';
import type { Node } from './node';
import { floorScale } from './scaling';
import { generateShop } from './shop';

type ForkShape =
  | 'shop_vs_combat'
  | 'elite_vs_combat'
  | 'elite_vs_shop'
  | 'camp_vs_combat'
  | 'camp_vs_shop'
  | 'camp_vs_elite'
  | 'event_vs_combat'
  | 'event_vs_shop'
  | 'event_vs_elite'
  | 'event_vs_camp';

const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  { value: 'shop_vs_combat',  weight: 1 },
  { value: 'elite_vs_combat', weight: 1 },
  { value: 'elite_vs_shop',   weight: 1 },
  { value: 'camp_vs_combat',  weight: 1 },
  { value: 'camp_vs_shop',    weight: 1 },
  { value: 'camp_vs_elite',   weight: 1 },
  { value: 'event_vs_combat', weight: 1 },
  { value: 'event_vs_shop',   weight: 1 },
  { value: 'event_vs_elite',  weight: 1 },
  { value: 'event_vs_camp',   weight: 1 },
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

  const enc0Raw = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc0: typeof enc0Raw = {
    ...enc0Raw,
    enemies: stampCombatModifiers(enc0Raw.enemies, floorNumber, rng),
  };
  const enc1Raw = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc1: typeof enc1Raw = {
    ...enc1Raw,
    enemies: stampCombatModifiers(enc1Raw.enemies, floorNumber, rng),
  };

  // Conditionally compose only the encounters/inventory the rolled shape
  // requires. Camp nodes consume no RNG (pure data construction).
  const usesCombatBranch =
    shape === 'shop_vs_combat' ||
    shape === 'elite_vs_combat' ||
    shape === 'camp_vs_combat' ||
    shape === 'event_vs_combat';
  const usesEliteBranch =
    shape === 'elite_vs_combat' ||
    shape === 'elite_vs_shop' ||
    shape === 'camp_vs_elite' ||
    shape === 'event_vs_elite';
  const usesShopBranch =
    shape === 'shop_vs_combat' ||
    shape === 'elite_vs_shop' ||
    shape === 'camp_vs_shop' ||
    shape === 'event_vs_shop';
  const usesCampBranch =
    shape === 'camp_vs_combat' ||
    shape === 'camp_vs_shop' ||
    shape === 'camp_vs_elite' ||
    shape === 'event_vs_camp';
  const usesEventBranch =
    shape === 'event_vs_combat' ||
    shape === 'event_vs_shop' ||
    shape === 'event_vs_elite' ||
    shape === 'event_vs_camp';

  const combatBranchEncRaw = usesCombatBranch
    ? composeCombatEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const combatBranchEnc = combatBranchEncRaw === undefined
    ? undefined
    : { ...combatBranchEncRaw, enemies: stampCombatModifiers(combatBranchEncRaw.enemies, floorNumber, rng) };

  const eliteBranchEncRaw = usesEliteBranch
    ? composeEliteEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const eliteBranchEnc = eliteBranchEncRaw === undefined
    ? undefined
    : { ...eliteBranchEncRaw, enemies: stampEliteModifiers(eliteBranchEncRaw.enemies, rng) };
  const shopBranchInv = usesShopBranch ? generateShop(floorNumber, rng).inventory : undefined;

  const eventBranchCardId = usesEventBranch
    ? drawEventCard(Object.values(EVENTS), dungeonId, rng).id
    : undefined;

  const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);

  // Build the two branch nodes per shape. `specialOnBranchA` decides which
  // side gets the more-distinguished node.
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
  const buildCampBranch = (id: string): Node => {
    if (!usesCampBranch) {
      throw new Error(`generateFloor: camp branch not in shape '${shape}'`);
    }
    return { id, type: 'camp', nextNodeIds: [idBoss] };
  };
  const buildEventBranch = (id: string): Node => {
    if (eventBranchCardId === undefined) {
      throw new Error(`generateFloor: eventBranchCardId undefined for shape '${shape}'`);
    }
    return { id, type: 'event', cardId: eventBranchCardId, nextNodeIds: [idBoss] };
  };

  let node2a: Node;
  let node2b: Node;
  switch (shape) {
    case 'shop_vs_combat':
      node2a = specialOnBranchA ? buildShopBranch(id2a)   : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildShopBranch(id2b);
      break;
    case 'elite_vs_combat':
      node2a = specialOnBranchA ? buildEliteBranch(id2a)  : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildEliteBranch(id2b);
      break;
    case 'elite_vs_shop':
      node2a = specialOnBranchA ? buildEliteBranch(id2a)  : buildShopBranch(id2a);
      node2b = specialOnBranchA ? buildShopBranch(id2b)   : buildEliteBranch(id2b);
      break;
    case 'camp_vs_combat':
      node2a = specialOnBranchA ? buildCampBranch(id2a)   : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildCampBranch(id2b);
      break;
    case 'camp_vs_shop':
      node2a = specialOnBranchA ? buildCampBranch(id2a)   : buildShopBranch(id2a);
      node2b = specialOnBranchA ? buildShopBranch(id2b)   : buildCampBranch(id2b);
      break;
    case 'camp_vs_elite':
      node2a = specialOnBranchA ? buildCampBranch(id2a)   : buildEliteBranch(id2a);
      node2b = specialOnBranchA ? buildEliteBranch(id2b)  : buildCampBranch(id2b);
      break;
    case 'event_vs_combat':
      node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildEventBranch(id2b);
      break;
    case 'event_vs_shop':
      node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildShopBranch(id2a);
      node2b = specialOnBranchA ? buildShopBranch(id2b)   : buildEventBranch(id2b);
      break;
    case 'event_vs_elite':
      node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildEliteBranch(id2a);
      node2b = specialOnBranchA ? buildEliteBranch(id2b)  : buildEventBranch(id2b);
      break;
    case 'event_vs_camp':
      node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildCampBranch(id2a);
      node2b = specialOnBranchA ? buildCampBranch(id2b)   : buildEventBranch(id2b);
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
