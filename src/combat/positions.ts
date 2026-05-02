import type { SlotIndex } from '@data/types';
import type { Combatant, CombatEvent, CombatSide, CombatState } from './types';

function livingOnSide(state: CombatState, side: CombatSide): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.isDead);
}

function setSlot(
  combatant: Combatant,
  toSlot: SlotIndex,
  reason: 'shove' | 'pull' | 'swap' | 'collapse' | 'shuffle',
  events: CombatEvent[],
): void {
  if (combatant.slot === toSlot) return;
  const fromSlot = combatant.slot;
  combatant.slot = toSlot;
  events.push({ kind: 'position_changed', combatantId: combatant.id, fromSlot, toSlot, reason });
}

export function shove(target: Combatant, slots: number, state: CombatState, events: CombatEvent[]): void {
  const sameSide = livingOnSide(state, target.side);
  const maxSlot = sameSide.length as SlotIndex;
  const newSlot = Math.min(maxSlot, target.slot + slots) as SlotIndex;
  if (newSlot === target.slot) return;
  for (const other of sameSide) {
    if (other !== target && other.slot > target.slot && other.slot <= newSlot) {
      setSlot(other, (other.slot - 1) as SlotIndex, 'shove', events);
    }
  }
  setSlot(target, newSlot, 'shove', events);
}

export function pull(target: Combatant, slots: number, state: CombatState, events: CombatEvent[]): void {
  const sameSide = livingOnSide(state, target.side);
  const newSlot = Math.max(1, target.slot - slots) as SlotIndex;
  if (newSlot === target.slot) return;
  for (const other of sameSide) {
    if (other !== target && other.slot < target.slot && other.slot >= newSlot) {
      setSlot(other, (other.slot + 1) as SlotIndex, 'pull', events);
    }
  }
  setSlot(target, newSlot, 'pull', events);
}

export function swap(a: Combatant, b: Combatant, events: CombatEvent[]): void {
  if (a.side !== b.side) throw new Error('swap: combatants must be on the same side');
  const aSlot = a.slot;
  const bSlot = b.slot;
  setSlot(a, bSlot, 'swap', events);
  setSlot(b, aSlot, 'swap', events);
}

export function moveTo(
  combatant: Combatant,
  toSlot: SlotIndex,
  events: CombatEvent[],
): void {
  setSlot(combatant, toSlot, 'swap', events);
}

export function collapseAfterDeath(side: CombatSide, state: CombatState, events: CombatEvent[]): void {
  const living = state.combatants
    .filter((c) => c.side === side && !c.isDead)
    .sort((a, b) => a.slot - b.slot);
  const moved: Array<{ c: Combatant; fromSlot: SlotIndex; toSlot: SlotIndex }> = [];
  for (let i = 0; i < living.length; i++) {
    const newSlot = (i + 1) as SlotIndex;
    if (living[i].slot !== newSlot) {
      moved.push({ c: living[i], fromSlot: living[i].slot, toSlot: newSlot });
      living[i].slot = newSlot;
    }
  }
  for (const c of state.combatants) {
    if (c.side === side && c.isDead) {
      c.slot = -1 as SlotIndex;
    }
  }
  moved.sort((a, b) => a.toSlot - b.toSlot);
  for (const m of moved) {
    events.push({
      kind: 'position_changed',
      combatantId: m.c.id,
      fromSlot: m.fromSlot,
      toSlot: m.toSlot,
      reason: 'collapse',
    });
  }
}

export function shuffleDestination(combatant: Combatant, state: CombatState): SlotIndex | null {
  const sameSide = livingOnSide(state, combatant.side);
  const maxSlot = sameSide.length as SlotIndex;
  if (maxSlot <= 1) return null;

  let towardSlot: SlotIndex;
  const preferred = combatant.preferredSlots;
  if (preferred && preferred.length > 0) {
    const inPreferred = preferred.includes(combatant.slot);
    if (inPreferred) {
      towardSlot = Math.max(1, combatant.slot - 1) as SlotIndex;
    } else {
      const nearest = preferred.reduce((best, p) =>
        Math.abs(p - combatant.slot) < Math.abs(best - combatant.slot) ? p : best,
      );
      towardSlot = (combatant.slot < nearest
        ? combatant.slot + 1
        : combatant.slot - 1) as SlotIndex;
    }
  } else {
    towardSlot = Math.max(1, combatant.slot - 1) as SlotIndex;
    if (towardSlot === combatant.slot) {
      towardSlot = Math.min(maxSlot, combatant.slot + 1) as SlotIndex;
    }
  }

  if (towardSlot === combatant.slot) return null;
  if (!sameSide.some((c) => c.slot === towardSlot)) return null;
  return towardSlot;
}

// True iff a shuffle would actually make progress — i.e., the neighbor at the
// destination wouldn't simply swap right back. Detects the 3v3-melee infinite
// ping-pong where two same-preferences allies shuffle past each other every
// round and never act.
export function shuffleWouldProgress(combatant: Combatant, state: CombatState): boolean {
  const dest = shuffleDestination(combatant, state);
  if (dest === null) return false;
  const neighbor = state.combatants.find(
    (c) => c.side === combatant.side && !c.isDead && c.slot === dest,
  );
  if (!neighbor) return false;
  const np = neighbor.preferredSlots;
  // Neighbor is indifferent — swap freely.
  if (!np || np.length === 0) return true;
  // Neighbor is currently at one of their preferred slots. The swap would
  // displace them to caster's slot — only productive if THAT slot is also
  // preferred for them (otherwise they'd shuffle right back next turn).
  const neighborAtPreferred = np.includes(neighbor.slot);
  if (!neighborAtPreferred) return true;
  return np.includes(combatant.slot);
}

export function shuffle(combatant: Combatant, state: CombatState, events: CombatEvent[]): void {
  const towardSlot = shuffleDestination(combatant, state);
  if (towardSlot === null) return;
  const sameSide = livingOnSide(state, combatant.side);
  const neighbor = sameSide.find((c) => c.slot === towardSlot);
  if (!neighbor) return;
  swap(combatant, neighbor, events);
  const lastTwo = events.slice(-2);
  for (const ev of lastTwo) {
    if (ev.kind === 'position_changed') {
      ev.reason = 'shuffle';
    }
  }
}
