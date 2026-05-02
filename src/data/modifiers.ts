import type { BuffableStat } from './types';

export type ModifierId = 'armored' | 'venomous' | 'enraged';

export type ModifierEffect =
  | { kind: 'statDelta'; stat: BuffableStat; delta: number }
  | { kind: 'venomous_on_hit'; damagePerTurn: number; duration: number }
  | { kind: 'enraged_threshold'; hpRatio: number; attackDelta: number };

export interface ModifierDef {
  id: ModifierId;
  name: string;
  effect: ModifierEffect;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  armored:  { id: 'armored',  name: 'Armored',  effect: { kind: 'statDelta',         stat: 'defense', delta: 2 } },
  venomous: { id: 'venomous', name: 'Venomous', effect: { kind: 'venomous_on_hit',   damagePerTurn: 2, duration: 2 } },
  enraged:  { id: 'enraged',  name: 'Enraged',  effect: { kind: 'enraged_threshold', hpRatio: 0.5, attackDelta: 3 } },
};

export const MODIFIER_IDS: readonly ModifierId[] = Object.keys(MODIFIERS) as ModifierId[];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function describeModifierEffect(effect: ModifierEffect): string {
  switch (effect.kind) {
    case 'statDelta': {
      const sign = effect.delta >= 0 ? '+' : '';
      return `${sign}${effect.delta} ${capitalize(effect.stat)}`;
    }
    case 'venomous_on_hit':
      return `+${effect.damagePerTurn} dmg/turn for ${effect.duration} turns on attack`;
    case 'enraged_threshold': {
      const pct = Math.round(effect.hpRatio * 100);
      const sign = effect.attackDelta >= 0 ? '+' : '';
      return `${sign}${effect.attackDelta} Attack while below ${pct}% HP`;
    }
  }
}
