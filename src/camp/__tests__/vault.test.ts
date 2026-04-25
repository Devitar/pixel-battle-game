import { describe, expect, it } from 'vitest';
import { balance, createVault, credit, spend } from '../vault';

describe('Vault', () => {
  it('createVault starts empty', () => {
    expect(createVault()).toEqual({ gold: 0 });
  });

  it('balance returns the gold field', () => {
    expect(balance({ gold: 42 })).toBe(42);
  });

  it('credit adds gold and returns a new vault', () => {
    const v = createVault();
    const v2 = credit(v, 100);
    expect(v2.gold).toBe(100);
    expect(v.gold).toBe(0);
  });

  it('credit throws on negative', () => {
    expect(() => credit(createVault(), -1)).toThrow();
  });

  it('spend deducts gold', () => {
    const v = credit(createVault(), 50);
    const v2 = spend(v, 20);
    expect(v2.gold).toBe(30);
  });

  it('spend throws on negative', () => {
    const v = credit(createVault(), 50);
    expect(() => spend(v, -1)).toThrow();
  });

  it('spend throws when insufficient', () => {
    const v = credit(createVault(), 10);
    expect(() => spend(v, 15)).toThrow();
  });

  it('spend of exact balance drains to zero', () => {
    const v = credit(createVault(), 25);
    expect(spend(v, 25).gold).toBe(0);
  });

  it('credit and spend are chainable', () => {
    let v = createVault();
    v = credit(v, 100);
    v = spend(v, 30);
    v = credit(v, 50);
    expect(balance(v)).toBe(120);
  });
});
