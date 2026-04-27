import { ENEMIES } from '../data/enemies';
import { BASE_ITEM_STATS } from '../data/items';
import type {
  AffixId, BuffableStat, EnemyId, HeroEquipment, RarePropertyId, RolledRareProperty, SlotIndex, Wound,
} from '../data/types';
import { WOUNDS } from '../data/wounds';
import { createEnemyCombatant, createHeroCombatant } from '../combat/combatant';
import type { CombatState, Combatant, Stats } from '../combat/types';
import type { Encounter, ScaleFactors } from '../dungeon/node';
import type { Hero } from '../heroes/hero';

const AFFIX_TO_STAT: Record<AffixId, BuffableStat> = {
  of_power: 'attack',
  of_insight: 'mind',
  of_the_bear: 'defense',
  of_vigor: 'hp',
  of_swiftness: 'speed',
  of_the_hawk: 'crit',
  of_evasion: 'dodge',
};

function applyWoundsToStats(base: Stats, wounds: readonly Wound[]): Stats {
  const result: Stats = { ...base };
  for (const wound of wounds) {
    const effect = WOUNDS[wound.id].effect;
    if (effect.kind === 'statDelta') {
      result[effect.stat] += effect.delta;
    }
  }
  return result;
}

function computeDamageTakenMultiplier(wounds: readonly Wound[]): number {
  let mult = 1;
  for (const wound of wounds) {
    const effect = WOUNDS[wound.id].effect;
    if (effect.kind === 'damageTakenMult') {
      mult += effect.multiplier - 1;
    }
  }
  return mult;
}

function applyEquipmentToStats(stats: Stats, equipment: HeroEquipment): Stats {
  const result: Stats = { ...stats };
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    const base = BASE_ITEM_STATS[item.baseId];
    for (const k of Object.keys(base) as (keyof Stats)[]) {
      result[k] = result[k] + (base[k] ?? 0);
    }
    for (const a of item.affixes) {
      const stat = AFFIX_TO_STAT[a.affixId];
      result[stat] = result[stat] + a.value;
    }
  }
  return result;
}

interface RarePropertyFields {
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
  burningWeaponDamage?: number;
}

function rarePropertyFields(equipment: HeroEquipment): RarePropertyFields {
  const out: RarePropertyFields = {};
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item || !item.rareProperty) continue;
    const map: Record<RarePropertyId, (rp: RolledRareProperty) => void> = {
      of_burning:      (rp) => { out.burningWeaponDamage = rp.value; },
      of_vampirism:    (rp) => { out.lifestealPercent = rp.value; },
      of_thorns:       (rp) => { out.thornsDamage = rp.value; },
      of_regeneration: (rp) => { out.regenPerRound = rp.value; },
    };
    map[item.rareProperty.propertyId](item.rareProperty);
  }
  return out;
}

function scaleEnemyStats(enemyId: EnemyId, scale: ScaleFactors): Stats {
  const base = ENEMIES[enemyId].baseStats;
  return {
    hp: Math.round(base.hp * scale.hp),
    attack: Math.round(base.attack * scale.attack),
    defense: base.defense,
    speed: base.speed,
    mind: base.mind,
    crit: base.crit,
    dodge: base.dodge,
  };
}

export function buildCombatState(
  party: readonly Hero[],
  encounter: Encounter,
): CombatState {
  const combatants: Combatant[] = [];

  for (let i = 0; i < party.length; i++) {
    const hero = party[i];
    const woundedStats = applyWoundsToStats(hero.baseStats, hero.wounds);
    const fullStats = applyEquipmentToStats(woundedStats, hero.equipment);
    const damageTakenMultiplier = computeDamageTakenMultiplier(hero.wounds);
    const rareFields = rarePropertyFields(hero.equipment);
    const woundedMaxHp = fullStats.hp;
    combatants.push(
      createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
        baseStats: fullStats,
        currentHp: Math.min(hero.currentHp, woundedMaxHp),
        maxHp: woundedMaxHp,
        traitId: hero.traitId,
        ...(damageTakenMultiplier !== 1 ? { damageTakenMultiplier } : {}),
        ...rareFields,
      }),
    );
  }

  for (let i = 0; i < encounter.enemies.length; i++) {
    const placement = encounter.enemies[i];
    const scaled = scaleEnemyStats(placement.enemyId, encounter.scale);
    combatants.push(
      createEnemyCombatant(placement.enemyId, placement.slot, `e${i}`, {
        baseStats: scaled,
        currentHp: scaled.hp,
        maxHp: scaled.hp,
      }),
    );
  }

  return { combatants, round: 0, exhaustionLevel: 0 };
}
