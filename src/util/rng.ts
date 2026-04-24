export interface WeightedOption<T> {
  value: T;
  weight: number;
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(array: readonly T[]): T;
  shuffle<T>(array: readonly T[]): T[];
  weighted<T>(options: readonly WeightedOption<T>[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(array: readonly T[]): T {
      if (array.length === 0) throw new Error('rng.pick: empty array');
      return array[Math.floor(next() * array.length)];
    },
    shuffle<T>(array: readonly T[]): T[] {
      const out = array.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted<T>(options: readonly WeightedOption<T>[]): T {
      if (options.length === 0) throw new Error('rng.weighted: empty options');
      let total = 0;
      for (const o of options) total += o.weight;
      if (total <= 0) throw new Error('rng.weighted: total weight must be > 0');
      let roll = next() * total;
      for (const o of options) {
        roll -= o.weight;
        if (roll < 0) return o.value;
      }
      return options[options.length - 1].value;
    },
  };
}
