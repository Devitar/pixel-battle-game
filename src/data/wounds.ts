import type { WoundDef, WoundId } from './types';

export const WOUNDS: Record<WoundId, WoundDef> = {
  bruised: {
    id: 'bruised',
    name: 'Bruised',
    effect: { kind: 'damageTakenMult', multiplier: 1.20 },
  },
  hobbled: {
    id: 'hobbled',
    name: 'Hobbled',
    effect: { kind: 'statDelta', stat: 'speed', delta: -2 },
  },
  concussed: {
    id: 'concussed',
    name: 'Concussed',
    effect: { kind: 'statDelta', stat: 'mind', delta: -2 },
  },
  winded: {
    id: 'winded',
    name: 'Winded',
    effect: { kind: 'statDelta', stat: 'attack', delta: -2 },
  },
  unsteady: {
    id: 'unsteady',
    name: 'Unsteady',
    effect: { kind: 'statDelta', stat: 'crit', delta: -5 },
  },
  broken_bone: {
    id: 'broken_bone',
    name: 'Broken Bone',
    effect: { kind: 'statDelta', stat: 'hp', delta: -10 },
  },
};

export const WOUND_IDS: readonly WoundId[] = Object.keys(WOUNDS) as WoundId[];

export const HOSPITAL_TREATMENT_COST = 40;
export const DEFAULT_WOUND_RUNS_REMAINING = 5;
export const HEAVY_HIT_WOUND_THRESHOLD = 0.30;
export const WOUND_CHANCE_PERCENT = 30;
