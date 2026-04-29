# Barracks Panel — Resolved Kit Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Barracks panel show each hero's *actual* combat kit (resolved per equipped weapon and shield) plus a one-line status indicator explaining why the kit looks the way it does.

**Architecture:** Add `describeKitStatus(hero)` to the existing `src/items/kit.ts` module, plus a `WEAPON_DISPLAY_NAME` lookup table in `src/data/items.ts`. The Barracks scene swaps `classDef.abilities` for `resolveCombatAbilities(hero).abilities` and renders the status string next to the existing ABILITIES header.

**Tech Stack:** TypeScript 6.0, Vitest 4.1, Phaser. New code is pure-TS except a small Phaser-side scene edit.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* This plan has no commit steps; the user drives staging and commits.

**Source spec:** [`docs/superpowers/specs/2026-04-27-barracks-resolved-kit-design.md`](../specs/2026-04-27-barracks-resolved-kit-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/items.ts` | Modify | Export `WEAPON_DISPLAY_NAME: Record<WeaponType, string>` table. |
| `src/data/__tests__/items.test.ts` | Modify | One integrity test for the new constant. |
| `src/items/kit.ts` | Modify | Export `describeKitStatus(hero) → string`. |
| `src/items/__tests__/kit.test.ts` | Modify | ~10 tests covering each band/shield combination. |
| `src/scenes/barracks_panel_scene.ts` | Modify | Use `resolveCombatAbilities(hero)` for the ability list; render kit status next to the ABILITIES header. |

---

## Task 1: `WEAPON_DISPLAY_NAME` table

Add the weapon-type → human-readable label table in `src/data/items.ts`. Used by `describeKitStatus` in Task 2.

**Files:**
- Modify: `src/data/items.ts`
- Modify: `src/data/__tests__/items.test.ts`

- [ ] **Step 1: Append failing test to `src/data/__tests__/items.test.ts`**

Find the existing imports at the top of the file and add `WEAPON_DISPLAY_NAME`:

```ts
import { AFFIXES, BASE_ITEMS, BASE_ITEM_STATS, RARE_PROPERTIES, WEAPON_DISPLAY_NAME } from '../items';
```

Append before the file's final closing `});`:

```ts
describe('WEAPON_DISPLAY_NAME', () => {
  it('has an entry for every WeaponType', () => {
    const weaponTypes = ['sword', 'axe', 'daggers', 'bow', 'staff', 'holy_symbol'] as const;
    for (const wt of weaponTypes) {
      expect(WEAPON_DISPLAY_NAME[wt], `missing entry for ${wt}`).toBeTruthy();
    }
  });

  it('holy_symbol displays as "Holy Symbol"', () => {
    expect(WEAPON_DISPLAY_NAME.holy_symbol).toBe('Holy Symbol');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/__tests__/items.test.ts -t "WEAPON_DISPLAY_NAME"`
Expected: FAIL — `WEAPON_DISPLAY_NAME is not exported`.

- [ ] **Step 3: Add the constant in `src/data/items.ts`**

Append after the existing `WEAPON_FAMILY` constant at the bottom of the file:

```ts
export const WEAPON_DISPLAY_NAME: Record<WeaponType, string> = {
  sword: 'Sword',
  axe: 'Axe',
  daggers: 'Daggers',
  bow: 'Bow',
  staff: 'Staff',
  holy_symbol: 'Holy Symbol',
};
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/data/__tests__/items.test.ts -t "WEAPON_DISPLAY_NAME"`
Expected: 2 passing.

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 2: `describeKitStatus` helper

Add the kit-status formatter to `src/items/kit.ts`. Companion to existing `resolveCombatAbilities`.

**Files:**
- Modify: `src/items/kit.ts`
- Modify: `src/items/__tests__/kit.test.ts`

- [ ] **Step 1: Append failing tests to `src/items/__tests__/kit.test.ts`**

Add the import at the top of the file (alongside the existing `resolveCombatAbilities` import):

```ts
import { describeKitStatus, resolveCombatAbilities } from '../kit';
```

Append a new top-level describe block at the end of the file:

```ts
describe('describeKitStatus', () => {
  it('Knight + sword + shield → full kit', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    expect(describeKitStatus(hero)).toBe('Sword + Shield · Full kit');
  });

  it('Knight + sword + no shield → no-shield message', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic' });
    expect(describeKitStatus(hero)).toBe('Sword · No shield (Shield Bash unavailable)');
  });

  it('Knight + axe → off-preferred', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    expect(describeKitStatus(hero)).toBe('Axe · Off-preferred (1 swap)');
  });

  it('Knight + bow → wrong family', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic' });
    expect(describeKitStatus(hero)).toBe('Bow · Wrong family (basic only)');
  });

  it('Archer + bow → full kit (no "+ Shield" suffix — Archer has no shield-required ability)', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'bow_basic' });
    expect(describeKitStatus(hero)).toBe('Bow · Full kit');
  });

  it('Archer + sword → wrong family (no same-family alternative)', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'sword_basic' });
    expect(describeKitStatus(hero)).toBe('Sword · Wrong family (basic only)');
  });

  it('Mage + staff → full kit', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'staff_basic' });
    expect(describeKitStatus(hero)).toBe('Staff · Full kit');
  });

  it('Mage + holy_symbol (mace_basic) → off-preferred', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'mace_basic' });
    expect(describeKitStatus(hero)).toBe('Holy Symbol · Off-preferred (1 swap)');
  });

  it('Priest + staff → off-preferred', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'staff_basic' });
    expect(describeKitStatus(hero)).toBe('Staff · Off-preferred (1 swap)');
  });

  it('Priest + holy_symbol (mace_basic) → full kit', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'mace_basic' });
    expect(describeKitStatus(hero)).toBe('Holy Symbol · Full kit');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items/__tests__/kit.test.ts -t "describeKitStatus"`
Expected: FAIL — `describeKitStatus is not exported`.

- [ ] **Step 3: Add `describeKitStatus` to `src/items/kit.ts`**

Update the imports at the top of the file to include `WEAPON_DISPLAY_NAME`:

```ts
import { ABILITIES } from '../data/abilities';
import { CLASSES } from '../data/classes';
import { WEAPON_DISPLAY_NAME, WEAPON_FAMILY } from '../data/items';
import type { AbilityId } from '../data/types';
import type { Hero } from '../heroes/hero';
```

Append at the end of the file (after the existing `resolveCombatAbilities` function):

```ts
/**
 * Returns a human-readable one-line status describing the hero's current kit
 * configuration: which weapon they have, which band they fall into (full kit /
 * off-preferred / wrong family), and any shield-filter consequence.
 *
 * Output examples:
 *   "Sword + Shield · Full kit"
 *   "Axe · Off-preferred (1 swap)"
 *   "Bow · Wrong family (basic only)"
 *   "Sword · No shield (Shield Bash unavailable)"
 */
export function describeKitStatus(hero: Hero): string {
  const classDef = CLASSES[hero.classId];
  const equippedWeaponType = hero.equipment.weapon.weaponType;
  if (!equippedWeaponType) {
    return 'Unknown weapon';
  }

  const weaponName = WEAPON_DISPLAY_NAME[equippedWeaponType];
  const isPreferred = equippedWeaponType === classDef.preferredWeapon;
  const equippedFamily = WEAPON_FAMILY[equippedWeaponType];
  const sameFamily = equippedFamily === classDef.weaponFamily;

  if (isPreferred) {
    const shieldRequiredInClass = classDef.abilities.some(
      (id) => ABILITIES[id].requiresShield === true,
    );
    if (shieldRequiredInClass && hero.equipment.shield === undefined) {
      return `${weaponName} · No shield (Shield Bash unavailable)`;
    }
    if (shieldRequiredInClass) {
      return `${weaponName} + Shield · Full kit`;
    }
    return `${weaponName} · Full kit`;
  }

  if (sameFamily && classDef.weaponSwaps?.[equippedWeaponType] !== undefined) {
    return `${weaponName} · Off-preferred (1 swap)`;
  }

  return `${weaponName} · Wrong family (basic only)`;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/items/__tests__/kit.test.ts`
Expected: existing 30 + 10 new = 40 tests passing.

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 3: Barracks scene wiring

Replace the static class-default ability list with the resolved kit, and render the kit status next to the ABILITIES header.

**Files:**
- Modify: `src/scenes/barracks_panel_scene.ts`

- [ ] **Step 1: Update imports at the top of `src/scenes/barracks_panel_scene.ts`**

Find the existing imports:

```ts
import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { ABILITIES } from '../data/abilities';
import { describeAbility } from '../data/ability_describe';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { Hero } from '../heroes/hero';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import { HeroCard } from '../ui/hero_card';
import { appState } from './app_state';
```

Add the kit imports after the `TRAITS` line:

```ts
import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { ABILITIES } from '../data/abilities';
import { describeAbility } from '../data/ability_describe';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { Hero } from '../heroes/hero';
import { describeKitStatus, resolveCombatAbilities } from '../items/kit';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import { HeroCard } from '../ui/hero_card';
import { appState } from './app_state';
```

- [ ] **Step 2: Replace the ability iteration in `rebuildDetail`**

Find the existing ability loop (around line 256):

```ts
    let yCursor = ABILITY_BLOCK_START_Y;
    for (const abilityId of classDef.abilities) {
      const ability = ABILITIES[abilityId];
      const desc = describeAbility(ability);
```

Replace the loop opening with:

```ts
    const { abilities: resolvedAbilities } = resolveCombatAbilities(hero);
    let yCursor = ABILITY_BLOCK_START_Y;
    for (const abilityId of resolvedAbilities) {
      const ability = ABILITIES[abilityId];
      const desc = describeAbility(ability);
```

- [ ] **Step 3: Add the kit status text element after the ABILITIES header**

Find the existing ABILITIES header rendering:

```ts
    this.detailContainer.add(
      this.add.text(ABILITY_X, ABILITY_HEADER_Y, 'ABILITIES', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      }),
    );
```

Append the status line immediately after this block (before the `let yCursor = …` line):

```ts
    this.detailContainer.add(
      this.add.text(ABILITY_X, ABILITY_HEADER_Y, 'ABILITIES', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      }),
    );
    // Kit status — shown to the right of the ABILITIES header in muted color.
    // 80px offset clears the "ABILITIES" label at 12px monospace.
    this.detailContainer.add(
      this.add.text(ABILITY_X + 80, ABILITY_HEADER_Y, `· ${describeKitStatus(hero)}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      }),
    );
```

- [ ] **Step 4: Verify typecheck + full test run**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all passing (existing 911 + 12 new = 923).

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`

Open the game in a browser and:
1. Click Barracks → select any hero. Status line shows `<weapon> + Shield · Full kit` (Knight) or `<weapon> · Full kit` (others).
2. Run a combat to a boss → win → reach camp_screen.
3. Open the Equip panel from camp_screen → swap a hero's weapon to a non-preferred (e.g., Knight + axe) and an equipped slot manipulation if desired. Press × to close.
4. Press On → return to camp → open Barracks → select the same hero. Status line and ability list both reflect the new equipment (e.g., "Axe · Off-preferred (1 swap)" with `Cleaving Swing` in the ability list instead of `Shield Bash`).

---

## Verification checklist

- [ ] `npm test` passes (911 → 923 tests).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Phaser firewall intact: `grep -r "from 'phaser'" src/data src/items src/run src/combat src/heroes src/save src/dungeon src/camp` returns nothing.
- [ ] Manual smoke (Step 5 above) shows the status line + resolved kit updating after equipment swap.

---

## Open follow-ups (out of scope this plan)

- **Equip-panel ability preview** — overlay showing "swapping to this weapon will swap Shield Bash → Cleaving Swing" while previewing a pack item. Separate enhancement to the equip-swap panel.
- **Color-coded status by band** (green for Full kit, amber for Off-preferred, red for Wrong family). Considered but rejected during brainstorm — adds visual noise.
- **Tooltip on the status line** explaining the rule. Status text is self-explanatory; tooltip would be over-design.
- **Other panels showing ability lists.** Currently only Barracks; if a future panel adds ability listings, it'll need the same wiring.
