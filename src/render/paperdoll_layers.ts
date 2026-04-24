export interface Loadout {
  body: number;
  legs?: number;
  feet?: number;
  outfit?: number;
  hair?: number;
  hat?: number;
  weapon?: number;
  shield?: number;
}

export const LAYER_ORDER = [
  'body',
  'legs',
  'feet',
  'outfit',
  'hair',
  'hat',
  'shield',
  'weapon',
] as const;

export type PaperdollSlot = (typeof LAYER_ORDER)[number];
export type OptionalSlot = Exclude<PaperdollSlot, 'body'>;

export function layerFramesFor(loadout: Loadout): number[] {
  const frames: number[] = [];
  for (const slot of LAYER_ORDER) {
    const frame = loadout[slot];
    if (frame !== undefined) frames.push(frame);
  }
  return frames;
}
