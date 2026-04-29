# Barracks panel — resolved kit display

**Status:** spec for the highest-priority follow-up to the gear-modifies-abilities task (HISTORY 2026-04-27). Small, focused.

**Source:** Identified in the gear-modifies-abilities HISTORY entry: *"Barracks panel resolved-kit display. Currently shows `CLASSES[classId].abilities` directly; will become misleading once players equip non-preferred weapons."*

**Scope:** swap the Barracks ability list to show `resolveCombatAbilities(hero)` output, and add a one-line "kit status" indicator next to the ABILITIES header explaining the current band (Full kit / Off-preferred / Wrong family / No shield).

---

## 1 · Architecture & changes

**New helper in `src/items/kit.ts`** — `describeKitStatus(hero) → string`. Pure function. Companion to `resolveCombatAbilities`.

**New constant in `src/data/items.ts`** — `WEAPON_DISPLAY_NAME: Record<WeaponType, string>`. Maps weapon types to human-readable names (e.g., `holy_symbol` → `'Holy Symbol'`).

**Edited:**
- `src/items/kit.ts` — adds `describeKitStatus` export.
- `src/items/__tests__/kit.test.ts` — extended with ~10 cases for `describeKitStatus`.
- `src/data/items.ts` — adds `WEAPON_DISPLAY_NAME` table.
- `src/data/__tests__/items.test.ts` — extended with one integrity test for the table.
- `src/scenes/barracks_panel_scene.ts` — `rebuildDetail` calls `resolveCombatAbilities(hero)` instead of using `classDef.abilities`. Adds the kit status text element next to the ABILITIES header.

**Phaser firewall:** clean. New helper is pure-TS in `src/items/`. Scene edit is the only consumer.

---

## 2 · Data & API

### `src/data/items.ts` — `WEAPON_DISPLAY_NAME`

```typescript
export const WEAPON_DISPLAY_NAME: Record<WeaponType, string> = {
  sword: 'Sword',
  axe: 'Axe',
  daggers: 'Daggers',
  bow: 'Bow',
  staff: 'Staff',
  holy_symbol: 'Holy Symbol',
};
```

**Why a new table** instead of reusing `BASE_ITEMS[baseId].name`: the status string describes weapon-type categories, not specific item bases. The base name "Mace" wouldn't read correctly as "your hero is using a Mace, which is in the magic family" — but "Holy Symbol" does. `WEAPON_DISPLAY_NAME` is the weapon-type label; `BASE_ITEMS.name` is the item-instance label.

### `src/items/kit.ts` — `describeKitStatus`

```typescript
import { ABILITIES } from '../data/abilities';
import { CLASSES } from '../data/classes';
import { WEAPON_DISPLAY_NAME, WEAPON_FAMILY } from '../data/items';
import type { Hero } from '../heroes/hero';

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

### Output by case

| Hero state | Output |
|---|---|
| Knight + sword + shield | `Sword + Shield · Full kit` |
| Knight + sword + no shield | `Sword · No shield (Shield Bash unavailable)` |
| Knight + axe (with or without shield) | `Axe · Off-preferred (1 swap)` |
| Knight + bow | `Bow · Wrong family (basic only)` |
| Archer + bow | `Bow · Full kit` |
| Archer + sword | `Sword · Wrong family (basic only)` |
| Mage + staff | `Staff · Full kit` |
| Mage + holy_symbol | `Holy Symbol · Off-preferred (1 swap)` |
| Mage + sword | `Sword · Wrong family (basic only)` |
| Priest + holy_symbol | `Holy Symbol · Full kit` |
| Priest + staff | `Staff · Off-preferred (1 swap)` |

### Decisions baked in

1. **`+ Shield` / `No shield` suffix is class-conditional**, not just shield-presence-conditional. Mage with no shield doesn't show "no shield" because Mage has no shield-required ability; nothing to be missing. The `shieldRequiredInClass` check makes this work.

2. **Wholly-wrong band's message is `"Wrong family (basic only)"`**, class-agnostic. Mage + sword and Knight + bow show the same shape — the player learns the pattern.

3. **No specific swap-replacement name** in the status string. The ability list itself shows the resolved kit; redundant to also name the swap in the status. Player sees `Cleaving Swing` in the list and infers the swap.

4. **`describeKitStatus` is the only new function in `kit.ts`.** It does NOT call `resolveCombatAbilities` — it derives band from the same inputs independently. This keeps the function returnable from a single Hero-state read; no caching question.

---

## 3 · Barracks scene wiring

### Ability list — switch from class default to resolved kit

In `src/scenes/barracks_panel_scene.ts`, `rebuildDetail`:

**Before** (line 256):
```typescript
for (const abilityId of classDef.abilities) {
```

**After:**
```typescript
const { abilities } = resolveCombatAbilities(hero);
for (const abilityId of abilities) {
```

Also add the import at top of file:
```typescript
import { describeKitStatus, resolveCombatAbilities } from '../items/kit';
```

### Kit status line — render alongside the ABILITIES header

The existing header at `(ABILITY_X=515, ABILITY_HEADER_Y=215)` renders "ABILITIES" in gold (#ffcc66). Add a second text element 80px to the right, same y, in muted color:

```typescript
this.detailContainer.add(
  this.add.text(ABILITY_X, ABILITY_HEADER_Y, 'ABILITIES', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ffcc66',
  }),
);
this.detailContainer.add(
  this.add.text(ABILITY_X + 80, ABILITY_HEADER_Y, `· ${describeKitStatus(hero)}`, {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#aaaaaa',
  }),
);
```

The 80px offset places the status to the right of "ABILITIES"; 11px muted text matches the existing per-ability sub-line color (`#aaaaaa` — same as the class label below the hero name).

### Layout — no shift to ability blocks

`ABILITY_BLOCK_START_Y=235` stays. The status text uses previously-blank space to the right of the header. No vertical layout shift.

### "Always render" status

The status renders for every hero — including the default Band 1 + has-shield case. *Why:* consistency. The player learns the shape; off-spec heroes stand out by saying something different. Hiding-when-default would create a "where did the indicator go?" moment when equipment changes.

---

## 4 · Testing

### `src/items/__tests__/kit.test.ts` — extended

Append a new top-level describe block with ~10 cases covering every status-string output:

```typescript
import { describeKitStatus } from '../kit';

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

  it('Archer + sword → wrong family', () => {
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

`makeHeroWith` is the existing test fixture in `kit.test.ts`; reused as-is.

### `src/data/__tests__/items.test.ts` — `WEAPON_DISPLAY_NAME` integrity

```typescript
describe('WEAPON_DISPLAY_NAME', () => {
  it('has an entry for every WeaponType', () => {
    const weaponTypes = ['sword', 'axe', 'daggers', 'bow', 'staff', 'holy_symbol'] as const;
    for (const wt of weaponTypes) {
      expect(WEAPON_DISPLAY_NAME[wt]).toBeTruthy();
    }
  });
});
```

### Barracks scene — no automated tests

Per the existing codebase convention (no `BarracksPanelScene` tests today, no scene tests in general except `app_state.test.ts`). Manual verification:
- Open Barracks → see the status line next to ABILITIES showing default-loadout state.
- Run a combat to a camp_screen, swap a hero's weapon via the equip panel, return to camp, open Barracks → ability list and status update to reflect the swap.

### Coverage explicitly NOT written

- Visual layout / pixel tests (no Phaser scene-tests in the codebase).
- Equip-panel ability preview (separate follow-up, out of scope).
- Combat-engine tests (no behavior change — kit resolution alone determines the kit, and `resolveCombatAbilities` is already tested).

---

## 5 · Out of scope (explicitly deferred)

- **Equip-panel ability preview** — "swapping to this weapon will swap Shield Bash → Cleaving Swing" overlay. Future enhancement to the equip-swap UI.
- **Other places that show ability lists.** Currently only Barracks lists abilities. If a future panel (Hospital, Tavern, Camp Screen) adds ability listings, it would need the same wiring.
- **Tooltip on the status line** explaining the rule in detail. The status text is self-explanatory enough; tooltips would be over-design.
- **Color-coding the status line by band** (green for full kit, amber for off-preferred, red for wrong family). Considered but rejected — adds visual noise; the text is enough.

---

## 6 · Open questions / risk flags

- **The `+ Shield` suffix only appears for Knight today** (only class with a shield-required ability). If a future class's kit gains a shield-required ability (e.g., a future Paladin), the suffix logic would need that class's preferred-weapon-with-shield default to inform "+ Shield" presence. Currently the algorithm correctly says "+ Shield" if the class has any shield-required ability AND the hero has a shield equipped — generalizes naturally.
- **Wording: "Off-preferred (1 swap)".** "1 swap" implies plurality (could there be 2 swaps?). Currently always exactly 1 swap per class per alt weapon — no class has multi-swap mappings. If a future class introduces 2-swap variants, the wording needs updating. Acceptable now.
- **The 80px header offset** is a magic number. If "ABILITIES" font size or label changes, the offset stops aligning. Worth a code comment near the constant.
- **Manual testing requires real items in pack** — the equip panel is the only way to swap weapons mid-game. For dev verification, the simplest path is to advance to a boss, equip a non-preferred weapon, return to camp, open Barracks. A bit of friction; could add a dev-mode shortcut in the future if Barracks-display testing becomes a regular need.
