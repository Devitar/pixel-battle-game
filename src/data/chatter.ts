import type { Hero } from '@heroes/hero';
import type { ClassId } from './types';

export type ChatterCondition = 'critical' | 'wounded' | 'healthy';

const CRITICAL_HP_FRACTION = 0.3;

/**
 * Returns the chatter condition for a hero. Precedence: critical > wounded > healthy.
 *
 * - `critical`: currentHp / maxHp < 0.3 (regardless of wounds)
 * - `wounded`:  wounds.length > 0 (and not critical)
 * - `healthy`:  default
 */
export function computeChatterCondition(hero: Hero): ChatterCondition {
  if (hero.maxHp > 0 && hero.currentHp / hero.maxHp < CRITICAL_HP_FRACTION) {
    return 'critical';
  }
  if (hero.wounds.length > 0) {
    return 'wounded';
  }
  return 'healthy';
}

export const CHATTER: Record<ClassId, Record<ChatterCondition, readonly string[]>> = {
  knight: {
    healthy:  ['Forward.', 'Steel and stone.', 'Stand fast, friends.'],
    wounded:  ['I have had worse.', 'These bones ache.', 'Press on.'],
    critical: ['Hold me up...', 'If I fall, avenge me.', 'I can scarcely stand.'],
  },
  archer: {
    healthy:  ['Quiet, isn\'t it?', 'I see no movement.', 'Stay sharp.'],
    wounded:  ['This one will scar.', 'Should have ducked.', 'Mind your six.'],
    critical: ['Cover me...', 'I cannot draw the string.', 'Do not wait for me.'],
  },
  priest: {
    healthy:  ['May the light guide us.', 'We are not alone.', 'A blessing on this path.'],
    wounded:  ['I bear it gladly.', 'Faith carries me.', 'A small price.'],
    critical: ['Forgive my weakness...', 'The light fades...', 'Pray for me.'],
  },
  barbarian: {
    healthy:  ['More! More foes!', 'Bring them on.', 'I hunger for blood.'],
    wounded:  ['A scratch.', 'Pain is but wind.', 'Hah, is that all?'],
    critical: ['I will not... fall...', 'One more... fight...', 'Death will wait...'],
  },
  rogue: {
    healthy:  ['Watch your step.', 'Stay close.', 'I don\'t like this.'],
    wounded:  ['Shouldn\'t have done that.', 'Sloppy.', 'I\'m slowing down.'],
    critical: ['Need... a moment.', 'Can\'t keep up...', 'Leave me a knife.'],
  },
  mage: {
    healthy:  ['Curious markings here.', 'The air is thick with power.', 'I sense something.'],
    wounded:  ['My focus wavers.', 'The pain disrupts the threads.', 'Concentrate...'],
    critical: ['The spell fades...', 'My mind slips...', 'Hold me, I cannot...'],
  },
};
