# Combat speed persistence

**Source:** TODO.md task 20 — "Combat speed toggle persists between combats"
**Tier:** 2 (QoL polish)

## Problem

The combat scene's FF (1× / 3×) toggle resets to 1× on every new combat. Players who prefer 3× must re-toggle every fight — 4 clicks per Tier-1 floor (3 combats + 1 boss), more on deeper floors. The toggle exists *because* unmodified speed feels slow once you've seen the rhythm; resetting it negates the affordance.

Surfaced during smoke testing of task 18 (camp_screen).

## Decision: cross-session persistence

Persist the player's chosen combat speed to the save file so it survives both scene transitions and page reloads.

Considered in-session only (a module-level variable in `combat_scene.ts`, lost on reload). Rejected because the friction the task describes worsens on reload, and `appState.update()` already does all the persistence work — the marginal cost over an in-memory variable is one optional save field. Cross-session also opens a `preferences` slot for the inevitable next setting (audio mute, autosave on/off).

## Schema

Add an optional `preferences` field to `SaveFile` in `src/save/save.ts`:

```ts
export interface SaveFile {
  version: number;
  roster: Roster;
  vault: Vault;
  unlocks: Unlocks;
  runState?: RunState;
  runRngState?: number;
  preferences?: Preferences;
}

export interface Preferences {
  combatSpeed: 1 | 3;
}
```

**No version bump, no migration.** The field is optional; old saves load unchanged because `isPlausibleRawSave` only checks `version`. Read sites default `preferences?.combatSpeed ?? 1`.

`Preferences` is its own interface (not inlined) so future preferences can be added without touching `SaveFile` again.

## Combat scene changes (`src/scenes/combat_scene.ts`)

**`create()`** — replace the hardcoded `this.speed = 1` with:

```ts
this.speed = appState.get().preferences?.combatSpeed ?? 1;
```

The HUD must reflect this initial state:

- `ffLabel` text is built from `this.speed` (no hardcoded `'1×'`).
- `ffBg` stroke is green (`0x44cc44`) when `this.speed === 3`, else gray (`0x666666`).
- After `playback` is constructed, call `playback.setSpeed(this.speed)` so tweens/time scale match before playback starts.

**`toggleSpeed()`** — after the existing speed flip and HUD update, persist:

```ts
appState.update((s) => ({
  ...s,
  preferences: { ...s.preferences, combatSpeed: this.speed },
}));
```

The spread of `s.preferences` is harmless when undefined and forward-compatible when other preferences are added.

**Shutdown handler (`combat_scene.ts:80-84`)** — keep the `tweens.timeScale = 1` / `time.timeScale = 1` reset. Phaser's `timeScale` is a property of the scene's tween/time managers; leaving it at 3 would carry over to whatever plays in the next scene (camp, dungeon). The reset returns the engine to a known state; the next combat's `create()` re-applies the persisted speed via `playback.setSpeed`. No reconciliation needed.

## Tests

`src/save/__tests__/save.test.ts` (extend existing tests):

- Save with `preferences: { combatSpeed: 3 }` → load round-trips the value.
- Old save (no `preferences` field) loads cleanly, `preferences === undefined`, no warnings.

`combat_scene.ts` is on the Phaser side of the firewall and is not unit-tested. Combat-scene behavior is verified manually.

## Manual acceptance

1. Start combat, toggle to 3×, finish combat. The next combat starts at 3× with the green stroke and `3×` label.
2. Reload the page mid-run. The next combat still starts at 3×.
3. Wipe localStorage. The first combat is at 1×.
