import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { describeAbility } from '../ability_describe';
import type { Ability } from '../types';

describe('describeAbility', () => {
  it('describes single-effect damage (Slash)', () => {
    expect(describeAbility(ABILITIES.knight_slash)).toEqual({
      castLine: 'slot 1 or 2',
      targetLine: 'enemy slot 1',
      effectLines: ['Deal 100% damage'],
    });
  });

  it('describes multi-effect damage + stun (Shield Bash)', () => {
    expect(describeAbility(ABILITIES.shield_bash)).toEqual({
      castLine: 'slot 1 or 2',
      targetLine: 'enemy slot 1',
      effectLines: ['Deal 60% damage', 'Stun for 1 turn'],
    });
  });

  it("renders slots:'all' as 'all enemies' (Volley)", () => {
    expect(describeAbility(ABILITIES.volley)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'all enemies',
      effectLines: ['Deal 50% damage'],
    });
  });

  it("combines hurt filter + pick:'lowestHp' (Mend)", () => {
    expect(describeAbility(ABILITIES.mend)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'ally (hurt), lowest HP',
      effectLines: ['Heal 120% power'],
    });
  });

  it('renders self-target with lacksStatus filter (Bulwark)', () => {
    expect(describeAbility(ABILITIES.bulwark)).toEqual({
      castLine: 'any slot',
      targetLine: 'self (not bulwark)',
      effectLines: ['+3 Defense for 2 turns'],
    });
  });

  it("combines lacksStatus + pick:'first' (Flare Arrow)", () => {
    expect(describeAbility(ABILITIES.flare_arrow)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'enemy (not marked), first available',
      effectLines: ['Mark target for +50% damage (2 turns)'],
    });
  });

  it("renders canCastFrom of all 4 slots as 'any slot' (Necrotic Wave)", () => {
    expect(describeAbility(ABILITIES.necrotic_wave).castLine).toBe('any slot');
  });

  it("renders single-slot canCastFrom as 'slot N'", () => {
    const ability: Ability = {
      id: 'knight_slash',
      name: 'X',
      canCastFrom: [1],
      target: { side: 'enemy', slots: [1] },
      effects: [{ kind: 'damage', power: 1.0 }],
    };
    expect(describeAbility(ability).castLine).toBe('slot 1');
  });

  it('describes buff effects with positive sign (Bless)', () => {
    expect(describeAbility(ABILITIES.bless)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'ally (not blessed), first available',
      effectLines: ['+2 Attack for 2 turns'],
    });
  });

  it("treats slots:'all' + pick:'first' specially as 'side, first available' (Shoot)", () => {
    expect(describeAbility(ABILITIES.archer_shoot).targetLine).toBe('enemy, first available');
  });

  it('describes debuff effects with negative sign (Rotting Bite)', () => {
    expect(describeAbility(ABILITIES.rotting_bite).effectLines).toEqual([
      'Deal 90% damage',
      '-1 Attack for 2 turns',
    ]);
  });

  it('describes taunt effect (Taunt)', () => {
    expect(describeAbility(ABILITIES.taunt).effectLines).toEqual(['Taunt for 2 turns']);
  });
});
