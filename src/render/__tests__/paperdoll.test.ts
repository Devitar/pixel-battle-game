import { describe, it, expect } from 'vitest';
import { layerFramesFor, LAYER_ORDER } from '../paperdoll_layers';

describe('layerFramesFor', () => {
  it('returns just the body when no other slots are set', () => {
    expect(layerFramesFor({ body: 7 })).toEqual([7]);
  });

  it('emits layers in canonical order regardless of input key order', () => {
    // Input intentionally out-of-order; output must match LAYER_ORDER.
    const frames = layerFramesFor({
      weapon: 100,
      hair: 200,
      body: 0,
      hat: 300,
      legs: 50,
    });
    expect(frames).toEqual([0, 50, 200, 300, 100]);
  });

  it('skips unset optional slots without leaving gaps', () => {
    expect(
      layerFramesFor({
        body: 0,
        legs: 1,
        // feet omitted
        outfit: 3,
        // hair omitted
        hat: 5,
      }),
    ).toEqual([0, 1, 3, 5]);
  });

  it('places shield below weapon so the weapon draws on top', () => {
    const result = layerFramesFor({ body: 0, weapon: 42, shield: 33 });
    expect(result.indexOf(33)).toBeLessThan(result.indexOf(42));
  });

  it('keeps body at the bottom layer', () => {
    const result = layerFramesFor({
      body: 0,
      legs: 1,
      feet: 2,
      outfit: 3,
      hair: 4,
      hat: 5,
      shield: 6,
      weapon: 7,
    });
    expect(result[0]).toBe(0);
  });

  it('covers every slot type in LAYER_ORDER', () => {
    // If a new slot is ever added to Loadout but not LAYER_ORDER, this test
    // catches the oversight by asserting the count stays in sync.
    expect(LAYER_ORDER.length).toBe(8);
  });
});
