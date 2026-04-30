# Lost-hero scene rendering + roster bugfix — Design

- **TODO entry:** Cluster B · 11 ("Lost" hero handling in scenes).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Surface narratively-Lost heroes (`runState.lost`) in three scene-level views, and fix the latent roster-removal bug at two cashout call sites.

**Rendering touchpoints:**

1. **Dungeon party row** — append a `🪦` tombstone glyph for each Lost hero after the surviving heroes.
2. **Post-boss cashout summary** — `Lost: name1, name2` line below the existing `Fallen` line.
3. **Wipe panel** — separate `Heroes Fallen:` and `Heroes Lost:` sections with distinct color labels.

**Bug-fix touchpoints:**

4. **`camp_screen_scene.onLeave`** — add `removeHero` calls for `outcome.heroesLost`.
5. **`camp_node_overlay_scene.applyLeave`** — same.

The `heroesFallen` / `heroesLost` outcome split shipped in Cluster A · 15. The `runState.lost` array shipped in Cluster A · 13. This task is scenes-only.

**Out of scope:**

- Per-hero slot preservation in dungeon party row (slot-agnostic append, per Q1 design call).
- New asset / icon work — using emoji glyphs.
- Animations (Lost moment → tombstone appearing).
- Per-hero category tracking on Hero records (`runState.lost` is the categorical store).

## 2 · Dungeon party row — tombstones

`src/scenes/dungeon_scene.ts:buildParty()` (around line 182). Currently iterates `run.party` and renders one paperdoll per slot. Extend to also render a `🪦` tombstone glyph for each `run.lost[i]`, appended after the surviving heroes:

```ts
private buildParty(): void {
  const run = appState.get().runState!;
  this.partyContainer = this.add.container(PARTY_OFFSCREEN_X, PARTY_BASE_Y);
  for (let i = 0; i < run.party.length; i++) {
    const hero = run.party[i];
    const doll = new Paperdoll(this, SLOT_X_OFFSETS[i], 0, heroToLoadout(hero));
    doll.setScale(2);
    this.partyContainer.add(doll);
  }
  // Tombstones for Lost heroes — appended after surviving heroes in the row.
  for (let i = 0; i < run.lost.length; i++) {
    const slotIndex = run.party.length + i;
    if (slotIndex >= SLOT_X_OFFSETS.length) break;  // defensive
    const tombstone = this.add.text(SLOT_X_OFFSETS[slotIndex], 0, '🪦', {
      fontFamily: 'monospace',
      fontSize: '32px',
    }).setOrigin(0.5);
    this.partyContainer.add(tombstone);
  }
}
```

`SLOT_X_OFFSETS = [-40, 0, 40]` provides 3 slot positions. With max party of 3 and max Lost count of 3 (impossible in practice — would mean 0 surviving), the row never overflows in realistic gameplay. Defensive `break` guards against over-running.

**Glyph: `🪦` gravestone emoji.** Reads as "this slot used to have someone." Sized to roughly match paperdoll height at scale=2.

**Re-build trigger:** `buildParty` is called once on dungeon-scene `create`. Lost-hero state is established before the dungeon scene is built (Lost happens on the run prior, or via event cards which aren't in the floor generator yet). No mid-scene re-build is required for this task.

## 3 · Cashout summary — Lost line

`src/scenes/camp_screen_scene.ts:buildFallenLine()` (around line 86). Currently renders a single line for fallen if non-empty. Extend to render a parallel Lost line:

```ts
private buildFallenLine(run: RunState): void {
  let y = 360;
  if (run.fallen.length > 0) {
    const names = run.fallen.map((h) => h.name).join(', ');
    this.add
      .text(480, y, `Fallen: ${names}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc8888',
      })
      .setOrigin(0.5);
    y += 14;
  }
  if (run.lost.length > 0) {
    const names = run.lost.map((h) => h.name).join(', ');
    this.add
      .text(480, y, `Lost: ${names}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aa66aa',
      })
      .setOrigin(0.5);
  }
}
```

**Color scheme:**
- `#cc8888` (existing pinkish-red) for Fallen.
- `#aa66aa` (muted purple) for Lost.

The two distinct colors let the player scan the death list and immediately distinguish category.

The method name `buildFallenLine` becomes a slight misnomer (it now also builds the Lost line), but renaming would propagate beyond this task's scope. Left as-is; future cleanup if it bothers.

## 4 · Wipe panel — Lost section

`src/scenes/dungeon_scene.ts:buildWipePanel()` (around line 497). Currently renders only `wipe.heroesFallen` under a `Heroes lost:` subtitle (a misnomer the wipe inherits from pre-Cluster-A-15 naming). Reorganize into two sections with dynamic panel height:

```ts
private buildWipePanel(): void {
  const wipe = this.wipeOutcome!;
  const fallenCount = wipe.heroesFallen.length;
  const lostCount = wipe.heroesLost.length;
  const totalLines =
    fallenCount + lostCount +
    (fallenCount > 0 ? 1 : 0) +    // "Heroes Fallen:" header
    (lostCount > 0 ? 1 : 0);        // "Heroes Lost:" header

  // Dynamic panel height: minimum 220, +14 per extra line over baseline 4.
  const baseHeight = 220;
  const extraLines = Math.max(0, totalLines - 4);
  const panelHeight = baseHeight + extraLines * 14;

  const bg = this.add.rectangle(0, 0, 400, panelHeight, 0x1a1a1a)
    .setStrokeStyle(2, 0xcc6666);
  const title = this.add.text(0, -panelHeight / 2 + 20, 'Wipe!', {
    fontFamily: 'monospace', fontSize: '16px', color: '#cc6666',
  }).setOrigin(0.5);

  const lines: Phaser.GameObjects.Text[] = [];
  let y = -panelHeight / 2 + 50;

  if (fallenCount > 0) {
    lines.push(this.add.text(0, y, 'Heroes Fallen:', {
      fontFamily: 'monospace', fontSize: '12px', color: '#cc8888',
    }).setOrigin(0.5));
    y += 16;
    for (const hero of wipe.heroesFallen) {
      lines.push(this.add.text(0, y, hero.name, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5));
      y += 14;
    }
  }

  if (lostCount > 0) {
    lines.push(this.add.text(0, y, 'Heroes Lost:', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aa66aa',
    }).setOrigin(0.5));
    y += 16;
    for (const hero of wipe.heroesLost) {
      lines.push(this.add.text(0, y, hero.name, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5));
      y += 14;
    }
  }

  const btnY = panelHeight / 2 - 30;
  const btnBg = this.add.rectangle(0, btnY, 180, 34, 0x2a4a2a)
    .setStrokeStyle(2, 0x44cc44);
  const btnLabel = this.add.text(0, btnY, 'Return to Camp', {
    fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
  }).setOrigin(0.5);
  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on('pointerdown', () => this.onWipeReturn());

  this.add.container(480, 270, [bg, title, ...lines, btnBg, btnLabel]);
}
```

Same color scheme as cashout summary: `#cc8888` for Fallen header, `#aa66aa` for Lost header. Hero names within each section render in white.

**Edge case — both empty:** if both `fallenCount === 0` and `lostCount === 0`, the panel renders title + button with no list. The total lines = 0, panel height stays at base. (Realistically a wipe always has at least one fallen hero, but the code handles the edge cleanly.)

## 5 · Roster cleanup bug fix — both call sites

The existing fallen-removal logic in `camp_screen_scene.onLeave` and `camp_node_overlay_scene.applyLeave` doesn't remove Lost heroes from the roster, so a Lost hero appears alive in Tavern/Barracks after cashout — contradicting gdd §8.

### 5.1 · `camp_screen_scene.ts:onLeave()`

Currently around line 156–187. Add a parallel Lost-removal block alongside the existing fallen-removal:

```ts
private onLeave(): void {
  const run = appState.get().runState!;
  const { outcome } = cashout(run);
  const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
  const lostIds = new Set(outcome.heroesLost.map((h) => h.id));   // NEW

  appState.update((s) => {
    const vault = credit(s.vault, outcome.goldBanked);
    const stash = addItems(s.stash, outcome.itemsBanked);
    let roster = s.roster;
    for (const survivor of outcome.heroesReturned) {
      if (roster.heroes.some((h) => h.id === survivor.id)) {
        roster = updateHero(roster, survivor);
      }
    }
    for (const id of fallenIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    for (const id of lostIds) {                                    // NEW
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    roster = tickRosterWounds(roster);
    return {
      ...s,
      vault,
      stash,
      roster,
      runState: undefined,
      runRngState: undefined,
    };
  });

  this.scene.start('camp');
}
```

### 5.2 · `camp_node_overlay_scene.ts:applyLeave()`

Mirror the same pattern. Currently the function builds `fallenIds` only:

```ts
const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
const lostIds = new Set(outcome.heroesLost.map((h) => h.id));     // NEW

appState.update((s) => {
  // ... existing credit / addItems / updateHero(survivor) / removeHero(fallen) ...
  for (const id of lostIds) {                                      // NEW
    if (roster.heroes.some((h) => h.id === id)) {
      roster = removeHero(roster, id);
    }
  }
  // ... tickRosterWounds, return ...
});
```

### 5.3 · `dungeon_scene.ts:onWipeReturn()`

Verified to have the same bug — currently removes only `wipe.heroesFallen`. Add the parallel Lost block:

```ts
private onWipeReturn(): void {
  const fallenIds = new Set(this.wipeOutcome!.heroesFallen.map((h) => h.id));
  const lostIds = new Set(this.wipeOutcome!.heroesLost.map((h) => h.id));   // NEW

  appState.update((s) => {
    let roster = s.roster;
    for (const id of fallenIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    for (const id of lostIds) {                                              // NEW
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    roster = tickRosterWounds(roster);
    return {
      ...s,
      roster,
      runState: undefined,
      runRngState: undefined,
    };
  });

  this.scene.start('camp');
}
```

This makes the wipe path consistent with the cashout paths: any hero in `outcome.heroesFallen` or `outcome.heroesLost` (or `wipe.*`) gets removed from the roster.

## 6 · Files touched

| File | Change |
|---|---|
| `src/scenes/dungeon_scene.ts` | `buildParty` extends with tombstones; `buildWipePanel` reorganizes for Fallen + Lost sections with dynamic height; `onWipeReturn` adds Lost-id roster removal. |
| `src/scenes/camp_screen_scene.ts` | `buildFallenLine` extends with Lost line; `onLeave` adds Lost-id roster removal. |
| `src/scenes/camp_node_overlay_scene.ts` | `applyLeave` adds Lost-id roster removal. |

## 7 · Test plan

No unit tests (Phaser scene convention).

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm run build` succeeds.
- Existing tests stay green (no behavioral change to data layer).

**Manual play / hand-crafted verification:**

The only path to Lose a hero today is via event cards. Events aren't in the floor generator yet, so end-to-end manual verification requires hand-crafting state. Plan-level tests:

- Hand-craft a save with `runState.lost: [hero]` and `runState.party: [other, other]`. Open the dungeon scene; verify tombstone renders in the third slot.
- Hand-craft a `wipeOutcome` with both `heroesFallen` and `heroesLost`. Verify the wipe panel shows both sections with distinct colors.
- After cashout (camp_screen and camp_node_overlay paths), check `appState.roster` no longer contains Lost heroes.

These verifications can be done via dev-mode keyboard shortcut or transient test fixture; the production code paths are exercised once the event card UI lands and event-floor-integration ships.

## 8 · Save schema

No change. `runState.lost` exists from Cluster A · 13.

## 9 · Open questions

None at design time.
