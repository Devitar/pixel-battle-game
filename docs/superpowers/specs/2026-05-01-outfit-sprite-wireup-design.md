# Outfit sprite wire-up — Design

- **TODO entry:** Cluster B · 31 (Wire up outfit sprites — no new art needed).
- **Tier:** 2 polish.
- **Date:** 2026-05-01.

## 1 · Scope

Replace placeholder `spriteId: '0'` for `outfit_cloth` and `outfit_leather` in `BASE_ITEMS` with real frame references from `SPRITE_NAMES.torso`. Update the placeholder-guard comment in `hero_loadout.ts` to reflect that only hats still use the sentinel after this change.

**Out of scope:**

- **Hats** (`hat_cap`, `hat_hood`). The 2026-05-01 audit (Cluster C · 2 verification) found the head-frame catalog has no semantic match for "Cap" or "Hood" — those remain a Cluster C art-or-rename task.
- **Removing the `'0'` placeholder guard.** It stays load-bearing for the still-placeholder hats. After both this task and Cluster C · 2 land, the guard could be removed in a follow-up.
- **Random outfit color per recruit** (gdd §3 mentions "Starter outfit — random color so heroes look distinct"). The current `BASE_ITEMS` design has one entry per item type, so picking a single color now is consistent with what the data layer supports today. A future task can add color randomization without disturbing this wire-up.
- **Tier-2/3 frame variants for higher-rarity outfits.** The cloth-armor catalog has tier 1/2/3 visual elaborations per color, but `outfit_cloth` is a single common-rarity item. Higher-rarity outfit items would land via separate `BASE_ITEMS` entries when the gear roll rules need them.

## 2 · Frame choices

| Item | Old `spriteId` | New `spriteId` | Frame number |
|---|---|---|---|
| `outfit_cloth` ("Cloth Robes") | `'0'` | `String(SPRITE_NAMES.torso.clotharmor_tan1)` | 335 |
| `outfit_leather` ("Leather Tunic") | `'0'` | `String(SPRITE_NAMES.torso.leatherarmor_tier1)` | 171 |

**Why tan?** The item name is "Cloth Robes" with no color modifier; tan reads as "plain undyed cloth" without claiming a thematic color. Six color variants exist (orange / blue / purple / green / tan / black) — tan is the most neutral, leaving the most room for the future random-color recruitment layer mentioned in gdd §3.

**Why tier 1?** Common-rarity item. The `_1` / `_2` / `_3` tier suffix in the cloth-armor catalog likely corresponds to visual elaboration (tier 1 simpler, tier 3 fancier). Same call for `leatherarmor_tier1`.

## 3 · Code changes

### 3a · `src/data/items.ts`

Lines 47–48 update from placeholder strings to real frame references. `SPRITE_NAMES` is already imported on line 1; no new import needed.

```ts
// Before:
outfit_cloth:   { baseId: 'outfit_cloth',   name: 'Cloth Robes',     slot: 'outfit',                              spriteId: '0' },
outfit_leather: { baseId: 'outfit_leather', name: 'Leather Tunic',   slot: 'outfit',                              spriteId: '0' },

// After:
outfit_cloth:   { baseId: 'outfit_cloth',   name: 'Cloth Robes',     slot: 'outfit',                              spriteId: String(SPRITE_NAMES.torso.clotharmor_tan1) },
outfit_leather: { baseId: 'outfit_leather', name: 'Leather Tunic',   slot: 'outfit',                              spriteId: String(SPRITE_NAMES.torso.leatherarmor_tier1) },
```

### 3b · `src/render/hero_loadout.ts` (comment refresh)

Line 17 currently reads (the second line of the placeholder-guard comment):

```ts
// (currently outfits + hats per Cluster C · 2). Returning undefined skips the
```

Update to:

```ts
// (currently hats per Cluster C · 2 — outfits wired up in Cluster B · 31).
// Returning undefined skips the
```

The guard logic at lines 19–23 is unchanged — `hat_cap` and `hat_hood` still use `'0'` and the guard still no-ops their layers.

## 4 · Tests

No new tests. The existing `hero_loadout.test.ts` tests added by Cluster B · 17 cover the placeholder-guard behavior; those continue to pass because `hat_cap`/`hat_hood` retain the `'0'` sentinel. No new behavior worth isolating: the change is two literal field values pointing at existing catalog frames.

## 5 · Verification

- `npx tsc --noEmit` confirms `SPRITE_NAMES.torso.clotharmor_tan1` and `SPRITE_NAMES.torso.leatherarmor_tier1` exist on the typed `SPRITE_NAMES` object — typo would error at compile time.
- `npm test` confirms no test regressions (1330 → 1330).
- `npm run build` confirms the production bundle resolves the new spriteIds.
- **Manual play (optional):** spawn a hero with a cloth or leather outfit equipped via Barracks Equip Gear (need a stash item to equip). Paperdoll should now render a torso layer where it used to be empty. Change is mechanical enough that tsc + the existing hero_loadout tests give strong confidence; manual play is nice-to-have, not gating.

## 6 · Files touched

| File | Change |
|---|---|
| `src/data/items.ts` | Replace placeholder `spriteId: '0'` for `outfit_cloth` and `outfit_leather` with real `SPRITE_NAMES.torso.*` references. |
| `src/render/hero_loadout.ts` | Update placeholder-guard comment (line 17) to note outfits are wired up; only hats remain placeholders. Logic unchanged. |

No other files touched. No save schema change. No data shape change. No test additions or removals.

## 7 · Risk

Very low. Two field values change to reference frames already in the catalog (verified in the 2026-05-01 audit). tsc catches any typo at compile time. No behavior change beyond "outfits now render"; no test should regress.

## 8 · Open questions

None at design time.
