export interface Vault {
  readonly gold: number;
}

export function createVault(): Vault {
  return { gold: 0 };
}

export function balance(vault: Vault): number {
  return vault.gold;
}

export function credit(vault: Vault, amount: number): Vault {
  if (amount < 0) {
    throw new Error(`credit: amount must be non-negative, got ${amount}`);
  }
  return { gold: vault.gold + amount };
}

export function spend(vault: Vault, amount: number): Vault {
  if (amount < 0) {
    throw new Error(`spend: amount must be non-negative, got ${amount}`);
  }
  if (amount > vault.gold) {
    throw new Error(`spend: insufficient funds — balance ${vault.gold}, requested ${amount}`);
  }
  return { gold: vault.gold - amount };
}
