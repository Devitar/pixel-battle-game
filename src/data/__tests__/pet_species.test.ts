import { describe, expect, it } from 'vitest';
import { PET_SPECIES } from '../pet_species';
import { ABILITIES } from '../abilities';
import type { PetSpeciesId } from '../types';

const EXPECTED: readonly PetSpeciesId[] = ['wolf', 'hawk', 'bear'];

describe('PET_SPECIES registry', () => {
  it('contains exactly the 3 species', () => {
    expect(Object.keys(PET_SPECIES).sort()).toEqual([...EXPECTED].sort());
  });

  it('each species has preferredSlots [4]', () => {
    for (const id of EXPECTED) {
      expect(PET_SPECIES[id].preferredSlots).toEqual([4]);
    }
  });

  it('each species references valid AbilityIds', () => {
    for (const id of EXPECTED) {
      const def = PET_SPECIES[id];
      expect(ABILITIES[def.basicAbility]).toBeDefined();
      for (const a of def.abilities) {
        expect(ABILITIES[a]).toBeDefined();
      }
    }
  });

  it('each species aiPriority is a subset of its abilities', () => {
    for (const id of EXPECTED) {
      const def = PET_SPECIES[id];
      for (const a of def.aiPriority) {
        expect(def.abilities).toContain(a);
      }
    }
  });

  it('all species are tagged beast', () => {
    for (const id of EXPECTED) {
      expect(PET_SPECIES[id].tags).toContain('beast');
    }
  });

  it('attackScaleFromHunter is a positive fraction', () => {
    for (const id of EXPECTED) {
      const s = PET_SPECIES[id].attackScaleFromHunter;
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
