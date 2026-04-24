export interface Pack {
  readonly gold: number;
}

export function createPack(): Pack {
  return { gold: 0 };
}

export function addGold(pack: Pack, amount: number): Pack {
  if (amount < 0) {
    throw new Error(`addGold: amount must be non-negative, got ${amount}`);
  }
  return { gold: pack.gold + amount };
}

export function totalGold(pack: Pack): number {
  return pack.gold;
}

export function emptyPack(_pack: Pack): Pack {
  return { gold: 0 };
}
