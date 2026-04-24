import type { Ability, AbilityId } from './types';

export const ABILITIES: Record<AbilityId, Ability> = {
  knight_slash: {
    id: 'knight_slash',
    name: 'Slash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
  shield_bash: {
    id: 'shield_bash',
    name: 'Shield Bash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [
      { kind: 'damage', power: 0.6 },
      { kind: 'stun', duration: 1 },
    ],
  },
  bulwark: {
    id: 'bulwark',
    name: 'Bulwark',
    canCastFrom: [1, 2, 3],
    target: { side: 'self', filter: { kind: 'lacksStatus', statusId: 'bulwark' } },
    effects: [{ kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' }],
  },
  taunt: {
    id: 'taunt',
    name: 'Taunt',
    canCastFrom: [1, 2, 3],
    target: { side: 'self', filter: { kind: 'lacksStatus', statusId: 'taunting' } },
    effects: [{ kind: 'taunt', duration: 2, statusId: 'taunting' }],
  },

  archer_shoot: {
    id: 'archer_shoot',
    name: 'Shoot',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', slots: 'all', pick: 'first' },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
  piercing_shot: {
    id: 'piercing_shot',
    name: 'Piercing Shot',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [3, 4], pick: 'first' },
    effects: [{ kind: 'damage', power: 1.4 }],
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: 'all' },
    effects: [{ kind: 'damage', power: 0.5 }],
  },
  flare_arrow: {
    id: 'flare_arrow',
    name: 'Flare Arrow',
    canCastFrom: [2, 3],
    target: { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'marked' }, pick: 'first' },
    effects: [{ kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' }],
  },

  priest_strike: {
    id: 'priest_strike',
    name: 'Strike',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 0.8 }],
  },
  mend: {
    id: 'mend',
    name: 'Mend',
    canCastFrom: [2, 3],
    target: { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
    effects: [{ kind: 'heal', power: 1.2 }],
  },
  smite: {
    id: 'smite',
    name: 'Smite',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.1 }],
    tags: ['radiant'],
  },
  bless: {
    id: 'bless',
    name: 'Bless',
    canCastFrom: [2, 3],
    target: { side: 'ally', filter: { kind: 'lacksStatus', statusId: 'blessed' }, pick: 'first' },
    effects: [{ kind: 'buff', stat: 'attack', delta: 2, duration: 2, statusId: 'blessed' }],
  },
};
