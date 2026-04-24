import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { resolveTargetSelector } from '../target_selector';
import type { StatusInstance } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

const rng = createRng(1);

function tauntingStatus(sourceId = 'src'): StatusInstance {
  return {
    statusId: 'taunting',
    remainingTurns: 2,
    effect: { kind: 'taunt', duration: 2, statusId: 'taunting' },
    sourceId,
  };
}

describe('resolveTargetSelector', () => {
  it('side: self returns just the caster', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], []);
    expect(resolveTargetSelector({ side: 'self' }, p0, state, rng)).toEqual(['p0']);
  });

  it('side: ally excludes caster from own-side candidates', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const p1 = makeHeroCombatant('priest', 3, 'p1', { currentHp: 5 });
    const state = makeTestState([p0, p1], []);
    expect(resolveTargetSelector({ side: 'ally' }, p0, state, rng)).toEqual(['p1']);
  });

  it('side: enemy returns opposite-side combatants', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    expect(resolveTargetSelector({ side: 'enemy' }, p0, state, rng)).toEqual(['e0']);
  });

  it('excludes the dead', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { isDead: true });
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    expect(resolveTargetSelector({ side: 'enemy' }, p0, state, rng)).toEqual(['e1']);
  });

  it('slots: [1] filters to slot 1', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    expect(resolveTargetSelector({ side: 'enemy', slots: [1] }, p0, state, rng)).toEqual(['e0']);
  });

  it("slots: 'all' keeps everyone", () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    expect(resolveTargetSelector({ side: 'enemy', slots: 'all' }, p0, state, rng).sort()).toEqual(
      ['e0', 'e1'].sort(),
    );
  });

  it("slots: 'furthest' keeps only the highest-occupied slot", () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const e2 = makeEnemyCombatant('skeleton_archer', 3, 'e2');
    const state = makeTestState([p0], [e0, e1, e2]);
    expect(resolveTargetSelector({ side: 'enemy', slots: 'furthest' }, p0, state, rng)).toEqual([
      'e2',
    ]);
  });

  it('filter: hurt excludes full-HP candidates', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1');
    const p2 = makeHeroCombatant('archer', 3, 'p2', { currentHp: 10 });
    const state = makeTestState([p0, p1, p2], []);
    const result = resolveTargetSelector(
      { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['p2']);
  });

  it('filter: lacksStatus excludes combatants with that status', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    e0.statuses['marked'] = {
      statusId: 'marked',
      remainingTurns: 2,
      effect: { kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' },
      sourceId: 'p0',
    };
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    const result = resolveTargetSelector(
      { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'marked' }, pick: 'first' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['e1']);
  });

  it('filter: hasTag matches enemy CombatantTag', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('cultist', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    const result = resolveTargetSelector(
      { side: 'enemy', filter: { kind: 'hasTag', tag: 'undead' }, pick: 'first' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['e0']);
  });

  it('taunt narrows enemy-side targeting to taunting combatants', () => {
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const p1 = makeHeroCombatant('priest', 3, 'p1');
    p0.statuses['taunting'] = tauntingStatus();
    const state = makeTestState([p0, p1], [e0]);
    const result = resolveTargetSelector(
      { side: 'enemy', slots: 'all', pick: 'first' },
      e0,
      state,
      rng,
    );
    expect(result).toEqual(['p0']);
  });

  it("pick: 'first' returns lowest-slot candidate", () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('ghoul', 2, 'e1');
    const state = makeTestState([p0], [e0, e1]);
    const result = resolveTargetSelector(
      { side: 'enemy', slots: 'all', pick: 'first' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['e0']);
  });

  it("pick: 'lowestHp' breaks ties on slot ascending", () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1', { currentHp: 5, maxHp: 20 });
    const p2 = makeHeroCombatant('archer', 3, 'p2', { currentHp: 5, maxHp: 14 });
    const state = makeTestState([p0, p1, p2], []);
    const result = resolveTargetSelector(
      { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual(['p1']);
  });

  it('returns empty when no candidate matches', () => {
    const p0 = makeHeroCombatant('priest', 2, 'p0');
    const p1 = makeHeroCombatant('knight', 1, 'p1');
    const state = makeTestState([p0, p1], []);
    const result = resolveTargetSelector(
      { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
      p0,
      state,
      rng,
    );
    expect(result).toEqual([]);
  });
});
