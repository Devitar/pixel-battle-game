import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import type { AbilityEffect, AbilityId, StatusId, TargetFilter } from '../types';

const EXPECTED_IDS: readonly AbilityId[] = [
  'knight_slash',
  'shield_bash',
  'bulwark',
  'taunt',
  'archer_shoot',
  'piercing_shot',
  'volley',
  'flare_arrow',
  'priest_strike',
  'mend',
  'smite',
  'bless',
  'bone_slash',
  'bone_arrow',
  'rotting_bite',
  'dark_bolt',
  'dark_pact',
  'necrotic_wave',
  'lich_strike',
  'curse_of_frailty',
];

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function producedStatusIds(effects: readonly AbilityEffect[]): readonly StatusId[] {
  const out: StatusId[] = [];
  for (const e of effects) {
    if (e.kind === 'buff' || e.kind === 'debuff' || e.kind === 'mark' || e.kind === 'taunt') {
      out.push(e.statusId);
    }
  }
  return out;
}

function filterStatusId(filter: TargetFilter | undefined): StatusId | undefined {
  if (!filter) return undefined;
  if (filter.kind === 'hasStatus' || filter.kind === 'lacksStatus') return filter.statusId;
  return undefined;
}

describe('ABILITIES', () => {
  it('registers every expected ability id', () => {
    for (const id of EXPECTED_IDS) {
      expect(ABILITIES[id], `missing ability ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(ABILITIES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('ability %s', (id) => {
    it('has matching id field', () => {
      expect(ABILITIES[id].id).toBe(id);
    });

    it('has a non-empty canCastFrom of valid slots', () => {
      const slots = ABILITIES[id].canCastFrom;
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
    });

    it('has at least one effect', () => {
      expect(ABILITIES[id].effects.length).toBeGreaterThan(0);
    });

    it('has valid target slots if array', () => {
      const slots = ABILITIES[id].target.slots;
      if (Array.isArray(slots)) {
        for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
      }
    });

    it('produces only kebab-case statusIds', () => {
      for (const sid of producedStatusIds(ABILITIES[id].effects)) {
        expect(sid, `bad statusId on ${id}: ${sid}`).toMatch(KEBAB_CASE);
      }
    });

    it('round-trips statusId between filter and effect', () => {
      const filterId = filterStatusId(ABILITIES[id].target.filter);
      const produced = producedStatusIds(ABILITIES[id].effects);
      if (filterId && produced.length > 0) {
        expect(
          produced.includes(filterId),
          `ability ${id} filters on '${filterId}' but does not produce it`,
        ).toBe(true);
      }
    });
  });
});
