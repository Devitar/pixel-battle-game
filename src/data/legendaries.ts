import type { EnemyId, LegendaryDef, LegendaryId } from './types';

export const LEGENDARY_DEFS: Record<LegendaryId, LegendaryDef> = {
  lichs_crown: {
    id: 'lichs_crown',
    name: "Lich's Crown",
    flavor: "A circlet of bleached vertebrae, still humming with the lich's hunger.",
    slot: 'hat',
    baseId: 'hat_hood',
    stats: { mind: 5, crit: 5 },
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  phylactery: {
    id: 'phylactery',
    name: 'Phylactery',
    flavor: "A glass vial of black ichor; the lich's life force trapped in glass that never breaks.",
    slot: 'outfit',
    baseId: 'outfit_cloth',
    stats: { defense: 2 },
    hpBonus: 15,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'rotting', duration: 2, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
  tidewalker_helm: {
    id: 'tidewalker_helm',
    name: 'Tidewalker Helm',
    flavor: 'A waterlogged crown of brass and barnacle, heavier than it looks.',
    slot: 'hat',
    baseId: 'hat_cap',
    stats: { defense: 3 },
    hpBonus: 5,
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },
  kings_aegis: {
    id: 'kings_aegis',
    name: "King's Aegis",
    flavor: 'A scarred boss-shield etched with sigils that still drip seawater.',
    slot: 'shield',
    baseId: 'shield_basic',
    stats: { defense: 3 },
    hpBonus: 10,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'drowning', duration: 3, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
};

export const BOSS_LEGENDARIES: Partial<Record<EnemyId, readonly LegendaryId[]>> = {
  bone_lich: ['lichs_crown', 'phylactery'],
  drowned_king: ['tidewalker_helm', 'kings_aegis'],
};
