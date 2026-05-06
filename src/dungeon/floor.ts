import { DUNGEONS } from '@data/dungeons';
import { EVENTS } from '@data/events';
import type { DungeonId } from '@data/types';
import type { Rng, WeightedOption } from '@util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import { composeEliteEncounter } from './elite';
import { drawEventCard } from './event_deck';
import { stampCombatModifiers, stampEliteModifiers } from './modifier_stamp';
import type { Node } from './node';
import { floorScale } from './scaling';
import { generateShop } from './shop';

// ---- Helpers exported for tests via _internal (see bottom of file). ----

const ROW_SIZE_WEIGHTS: readonly WeightedOption<1 | 2 | 3>[] = [
  { value: 1, weight: 20 },
  { value: 2, weight: 50 },
  { value: 3, weight: 30 },
];

const TWO_SLOT_PAIRS: readonly (readonly [0 | 1 | 2, 0 | 1 | 2])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
];

const EDGE_COUNT_WEIGHTS: readonly WeightedOption<1 | 2>[] = [
  { value: 1, weight: 70 },
  { value: 2, weight: 30 },
];

function rollRowSize(rng: Rng): 1 | 2 | 3 {
  return rng.weighted(ROW_SIZE_WEIGHTS);
}

function pickSlots(rng: Rng, count: 1 | 2 | 3): readonly (0 | 1 | 2)[] {
  if (count === 1) return [1];
  if (count === 3) return [0, 1, 2];
  return rng.pick(TWO_SLOT_PAIRS);
}

function pickEdgeCandidates(
  rng: Rng,
  fromSlot: 0 | 1 | 2,
  nextRowSlots: readonly (0 | 1 | 2)[],
  minTargetSlot: 0 | 1 | 2 = 0,
): readonly (0 | 1 | 2)[] {
  const inRange = nextRowSlots.filter(
    (s) => Math.abs(s - fromSlot) <= 1 && s >= minTargetSlot,
  );
  if (inRange.length === 0) return [];
  const desired = rng.weighted(EDGE_COUNT_WEIGHTS);
  const count = Math.min(desired, inRange.length);
  return rng.shuffle(inRange).slice(0, count);
}

interface QuotaResult {
  combat: number;
  elite: number;
  shop: number;
  camp: number;
  treasure: number;
  event: number;
}

function rollQuota(
  rng: Rng,
  floorNumber: number,
  middleNodeCount: number,
): QuotaResult | null {
  const treasure = rng.weighted([
    { value: 1, weight: 50 },
    { value: 2, weight: 50 },
  ]);
  const event = rng.weighted([
    { value: 1, weight: 50 },
    { value: 2, weight: 50 },
  ]);
  const eliteWeight2 = 40 + 20 * (floorNumber - 1);
  const eliteWeight1 = 100 - eliteWeight2;
  const elite = rng.weighted([
    { value: 1, weight: eliteWeight1 },
    { value: 2, weight: eliteWeight2 },
  ]);
  const shop = 1;
  const camp = 1;
  const sumSpecials = shop + camp + treasure + event + elite;
  const combat = middleNodeCount - sumSpecials;
  if (combat < 0) return null;
  return { combat, elite, shop, camp, treasure, event };
}

type SlottedType = Node['type'];

/**
 * Checks whether placing `candidate` at the current position would violate any
 * placement rule. Adjacency is checked only against ALREADY-PLACED siblings:
 * during left-to-right placement, the right sibling hasn't been placed yet —
 * but it'll check us as its left sibling on its turn, so the check is fully
 * symmetric across the row.
 */
function violatesPlacement(
  candidate: SlottedType,
  leftSiblingType: SlottedType | undefined,
  rightSiblingType: SlottedType | undefined,
  predecessorTypes: readonly SlottedType[],
): boolean {
  if (leftSiblingType === candidate) return true;
  if (rightSiblingType === candidate) return true;
  const isSpecial =
    candidate === 'shop' ||
    candidate === 'camp' ||
    candidate === 'treasure' ||
    candidate === 'event' ||
    candidate === 'elite';
  if (isSpecial) {
    for (const predType of predecessorTypes) {
      if (predType === candidate) return true;
    }
  }
  return false;
}

// ---- Generator orchestrator. ----

const MAX_FLOOR_RETRIES = 100;

export function generateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): { nodes: readonly Node[]; startNodeId: string } {
  for (let attempt = 0; attempt < MAX_FLOOR_RETRIES; attempt++) {
    const result = tryGenerateFloor(dungeonId, floorNumber, rng);
    if (result !== null) return result;
    rng.next();
  }
  throw new Error(
    `generateFloor: exhausted ${MAX_FLOOR_RETRIES} retries for dungeon='${dungeonId}' floor=${floorNumber}`,
  );
}

interface NodeStub {
  id: string;
  row: number;
  slot: 0 | 1 | 2;
  nextNodeIds: string[];
  incoming: string[];
}

function tryGenerateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): { nodes: readonly Node[]; startNodeId: string } | null {
  const dungeon = DUNGEONS[dungeonId];
  const scale = floorScale(floorNumber);

  const rowCount = (dungeon.rowsPerFloor ?? 8) + (floorNumber - 1);
  const idPrefix = `${dungeonId}-f${floorNumber}`;
  const idFor = (r: number, slot: 0 | 1 | 2): string => `${idPrefix}-r${r}-s${slot}`;

  // Pass 1: row sizes.
  const rowSizes: number[] = new Array(rowCount);
  rowSizes[0] = 1;
  rowSizes[rowCount - 1] = 1;
  for (let r = 1; r < rowCount - 1; r++) {
    rowSizes[r] = rollRowSize(rng);
  }

  // Pass 2: slot assignment per row, sorted ascending.
  const rowSlots: (0 | 1 | 2)[][] = rowSizes.map((size) =>
    pickSlots(rng, size as 1 | 2 | 3).slice(),
  );
  for (const row of rowSlots) row.sort((a, b) => a - b);

  // Pass 3: build node stubs.
  const stubs: NodeStub[] = [];
  const stubByRow: NodeStub[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const row: NodeStub[] = [];
    for (const slot of rowSlots[r]) {
      const stub: NodeStub = {
        id: idFor(r, slot),
        row: r,
        slot,
        nextNodeIds: [],
        incoming: [],
      };
      row.push(stub);
      stubs.push(stub);
    }
    stubByRow.push(row);
  }

  // Pass 4: edges (slot ±1 rule + left-to-right monotonic targets to prevent
  // crossings). For row r processed in slot-sorted order, each node's chosen
  // targets must be ≥ the running max-target-slot of previous row-r nodes.
  for (let r = 0; r < rowCount - 1; r++) {
    let curMin: 0 | 1 | 2 = 0;
    const sortedRow = stubByRow[r].slice().sort((a, b) => a.slot - b.slot);
    for (const fromStub of sortedRow) {
      const candidates = pickEdgeCandidates(
        rng,
        fromStub.slot,
        stubByRow[r + 1].map((s) => s.slot),
        curMin,
      );
      for (const targetSlot of candidates) {
        const target = stubByRow[r + 1].find((s) => s.slot === targetSlot)!;
        if (!fromStub.nextNodeIds.includes(target.id)) {
          fromStub.nextNodeIds.push(target.id);
          target.incoming.push(fromStub.id);
        }
      }
      if (candidates.length > 0) {
        const maxChosen = Math.max(...candidates) as 0 | 1 | 2;
        if (maxChosen > curMin) curMin = maxChosen;
      }
    }
  }

  // Pass 5: orphan pruning.
  for (let r = 1; r < rowCount; r++) {
    for (const stub of stubByRow[r]) {
      if (stub.incoming.length > 0) continue;
      let best: NodeStub | undefined;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const prev of stubByRow[r - 1]) {
        const dist = Math.abs(prev.slot - stub.slot);
        if (dist < bestDist || (dist === bestDist && best && prev.slot < best.slot)) {
          best = prev;
          bestDist = dist;
        }
      }
      if (best) {
        best.nextNodeIds.push(stub.id);
        stub.incoming.push(best.id);
      }
    }
  }

  // Pass 6: type quota over middle rows.
  const middleNodeCount = stubByRow
    .slice(1, rowCount - 1)
    .reduce((sum, r) => sum + r.length, 0);
  const quota = rollQuota(rng, floorNumber, middleNodeCount);
  if (quota === null) return null;

  const typedList: SlottedType[] = [];
  for (let i = 0; i < quota.combat; i++) typedList.push('combat');
  for (let i = 0; i < quota.elite; i++) typedList.push('elite');
  for (let i = 0; i < quota.shop; i++) typedList.push('shop');
  for (let i = 0; i < quota.camp; i++) typedList.push('camp');
  for (let i = 0; i < quota.treasure; i++) typedList.push('treasure');
  for (let i = 0; i < quota.event; i++) typedList.push('event');
  const shuffled: SlottedType[] = rng.shuffle(typedList);

  // Pass 7: placement with adjacency + back-to-back enforcement.
  const placedTypes = new Map<string, SlottedType>();
  placedTypes.set(stubByRow[0][0].id, 'combat');
  placedTypes.set(stubByRow[rowCount - 1][0].id, 'boss');

  const remaining = shuffled.slice();
  for (let r = 1; r < rowCount - 1; r++) {
    const rowSorted = stubByRow[r].slice().sort((a, b) => a.slot - b.slot);
    for (let posInRow = 0; posInRow < rowSorted.length; posInRow++) {
      const stub = rowSorted[posInRow];
      const leftStub = rowSorted[posInRow - 1];
      const leftType = leftStub ? placedTypes.get(leftStub.id) : undefined;
      const rightType = undefined;
      const predecessorTypes: SlottedType[] = stub.incoming
        .map((id) => placedTypes.get(id))
        .filter((t): t is SlottedType => t !== undefined);
      let pickIdx = -1;
      for (let j = 0; j < remaining.length; j++) {
        const candidate = remaining[j];
        if (!violatesPlacement(candidate, leftType, rightType, predecessorTypes)) {
          pickIdx = j;
          break;
        }
      }
      if (pickIdx === -1) return null;
      const picked = remaining.splice(pickIdx, 1)[0];
      placedTypes.set(stub.id, picked);
    }
  }

  // Pass 8: penultimate-row guarantee (≥1 camp or treasure).
  const penultRow = stubByRow[rowCount - 2];
  const penultHasRest = penultRow.some((s) => {
    const t = placedTypes.get(s.id);
    return t === 'camp' || t === 'treasure';
  });
  if (!penultHasRest) {
    let swapSourceId: string | undefined;
    for (let r = 1; r < rowCount - 2; r++) {
      for (const s of stubByRow[r]) {
        const t = placedTypes.get(s.id);
        if (t === 'camp' || t === 'treasure') {
          swapSourceId = s.id;
          break;
        }
      }
      if (swapSourceId) break;
    }
    if (!swapSourceId) return null;
    const swapSourceType = placedTypes.get(swapSourceId)!;
    const swapTarget = penultRow.find(
      (s) => placedTypes.get(s.id) !== swapSourceType,
    );
    if (!swapTarget) return null;
    const swapTargetType = placedTypes.get(swapTarget.id)!;
    placedTypes.set(swapSourceId, swapTargetType);
    placedTypes.set(swapTarget.id, swapSourceType);
    // Re-validate both swap targets — including successors, since a swap can
    // introduce a path violation downstream (s→succ where succ shares the new
    // special type).
    for (const id of [swapSourceId, swapTarget.id]) {
      const s = stubs.find((x) => x.id === id)!;
      const newType = placedTypes.get(id)!;
      const rowSorted = stubByRow[s.row].slice().sort((a, b) => a.slot - b.slot);
      const posInRow = rowSorted.findIndex((x) => x.id === id);
      const leftStub = rowSorted[posInRow - 1];
      const rightStub = rowSorted[posInRow + 1];
      const leftType = leftStub ? placedTypes.get(leftStub.id) : undefined;
      const rightType = rightStub ? placedTypes.get(rightStub.id) : undefined;
      const predTypes = s.incoming
        .map((pid) => placedTypes.get(pid))
        .filter((t): t is SlottedType => t !== undefined);
      if (violatesPlacement(newType, leftType, rightType, predTypes)) return null;
      // Successor check: any successor with same special type → s→succ is
      // a path-back-to-back violation.
      const isSpecial =
        newType === 'shop' ||
        newType === 'camp' ||
        newType === 'treasure' ||
        newType === 'event' ||
        newType === 'elite';
      if (isSpecial) {
        for (const succId of s.nextNodeIds) {
          const succType = placedTypes.get(succId);
          if (succType === newType) return null;
        }
      }
    }
  }

  // Pass 9: encounter composition + content per node type.
  const builtNodes: Node[] = [];
  for (const stub of stubs) {
    const type = placedTypes.get(stub.id);
    if (type === undefined) {
      throw new Error(`generateFloor: stub ${stub.id} has no assigned type`);
    }
    if (type === 'combat') {
      const encRaw = composeCombatEncounter(dungeon.enemyPool, scale, rng);
      const enc = { ...encRaw, enemies: stampCombatModifiers(encRaw.enemies, floorNumber, rng) };
      builtNodes.push({ id: stub.id, type, encounter: enc, nextNodeIds: stub.nextNodeIds.slice(), slot: stub.slot });
    } else if (type === 'elite') {
      const encRaw = composeEliteEncounter(dungeon.enemyPool, scale, rng);
      const enc = { ...encRaw, enemies: stampEliteModifiers(encRaw.enemies, rng) };
      builtNodes.push({ id: stub.id, type, encounter: enc, nextNodeIds: stub.nextNodeIds.slice(), slot: stub.slot });
    } else if (type === 'boss') {
      const enc = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);
      builtNodes.push({ id: stub.id, type, encounter: enc, nextNodeIds: stub.nextNodeIds.slice(), slot: stub.slot });
    } else if (type === 'shop') {
      const inv = generateShop(floorNumber, dungeon.tier, rng).inventory;
      builtNodes.push({ id: stub.id, type, inventory: inv, nextNodeIds: stub.nextNodeIds.slice(), slot: stub.slot });
    } else if (type === 'camp') {
      builtNodes.push({ id: stub.id, type, nextNodeIds: stub.nextNodeIds.slice(), slot: stub.slot });
    } else if (type === 'event') {
      const cardId = drawEventCard(Object.values(EVENTS), dungeonId, rng).id;
      builtNodes.push({ id: stub.id, type, cardId, nextNodeIds: stub.nextNodeIds.slice(), slot: stub.slot });
    } else if (type === 'treasure') {
      builtNodes.push({ id: stub.id, type, nextNodeIds: stub.nextNodeIds.slice(), slot: stub.slot });
    }
  }

  return { nodes: builtNodes, startNodeId: stubByRow[0][0].id };
}

// Exported for tests.
export const _internal = {
  rollRowSize,
  pickSlots,
  pickEdgeCandidates,
  rollQuota,
  violatesPlacement,
};
