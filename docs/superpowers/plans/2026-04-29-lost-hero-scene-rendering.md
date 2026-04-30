# Lost-Hero Scene Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface narratively-Lost heroes in three scene-level views (dungeon party row, cashout summary, wipe panel) and fix the latent roster-removal bug at three cashout/wipe call sites so Lost heroes don't appear "alive" in Tavern/Barracks after a run ends.

**Architecture:** Two sequential tasks, grouped by risk. Task 1 handles the data-bug fixes (smaller blast radius, mostly mechanical, no visual surprises). Task 2 handles the rendering changes (visual changes only, easy to verify by inspection).

**Tech Stack:** TypeScript, Phaser 3. Scene-only changes; no unit tests (Phaser convention).

**Spec:** `docs/superpowers/specs/2026-04-29-lost-hero-scene-rendering-design.md`. Read before starting.

---

## Task 1: Roster bug fix at three cashout/wipe call sites

Mechanical addition of Lost-id roster removal alongside the existing Fallen-id removal. After this task, a Lost hero is correctly removed from the roster on cashout (post-boss or mid-floor) and on wipe.

**Files:**
- Modify: `src/scenes/camp_screen_scene.ts:onLeave()` (around line 156)
- Modify: `src/scenes/camp_node_overlay_scene.ts:applyLeave()` (around the bottom of the file)
- Modify: `src/scenes/dungeon_scene.ts:onWipeReturn()` (around line 549)

- [ ] **Step 1.1: Update `camp_screen_scene.ts:onLeave`**

Open `src/scenes/camp_screen_scene.ts`. Find `onLeave` (around line 156). Current:

```ts
private onLeave(): void {
  const run = appState.get().runState!;
  const { outcome } = cashout(run);
  const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));

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
    roster = tickRosterWounds(roster);
    return { ...s, vault, stash, roster, runState: undefined, runRngState: undefined };
  });

  this.scene.start('camp');
}
```

Replace with:

```ts
private onLeave(): void {
  const run = appState.get().runState!;
  const { outcome } = cashout(run);
  const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
  const lostIds = new Set(outcome.heroesLost.map((h) => h.id));

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
    for (const id of lostIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    roster = tickRosterWounds(roster);
    return { ...s, vault, stash, roster, runState: undefined, runRngState: undefined };
  });

  this.scene.start('camp');
}
```

- [ ] **Step 1.2: Update `camp_node_overlay_scene.ts:applyLeave`**

Open `src/scenes/camp_node_overlay_scene.ts`. Find `applyLeave` (it's the last `private apply*` method before `closeAndResume`). Current shape:

```ts
private applyLeave(): void {
  const run = appState.get().runState!;
  const rng = this.rng();
  const result = chooseCampNodeEffect(run, { kind: 'leave' }, rng);
  const outcome = result.outcome!;
  const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));

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

  this.scene.stop();
  this.scene.stop('dungeon');
  this.scene.start('camp');
}
```

Replace with:

```ts
private applyLeave(): void {
  const run = appState.get().runState!;
  const rng = this.rng();
  const result = chooseCampNodeEffect(run, { kind: 'leave' }, rng);
  const outcome = result.outcome!;
  const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
  const lostIds = new Set(outcome.heroesLost.map((h) => h.id));

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
    for (const id of lostIds) {
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

  this.scene.stop();
  this.scene.stop('dungeon');
  this.scene.start('camp');
}
```

- [ ] **Step 1.3: Update `dungeon_scene.ts:onWipeReturn`**

Open `src/scenes/dungeon_scene.ts`. Find `onWipeReturn` (around line 549). Current:

```ts
private onWipeReturn(): void {
  const fallenIds = new Set(this.wipeOutcome!.heroesFallen.map((h) => h.id));

  appState.update((s) => {
    let roster = s.roster;
    for (const id of fallenIds) {
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

Replace with:

```ts
private onWipeReturn(): void {
  const fallenIds = new Set(this.wipeOutcome!.heroesFallen.map((h) => h.id));
  const lostIds = new Set(this.wipeOutcome!.heroesLost.map((h) => h.id));

  appState.update((s) => {
    let roster = s.roster;
    for (const id of fallenIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    for (const id of lostIds) {
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

- [ ] **Step 1.4: Run tsc and tests**

Run: `npx tsc --noEmit && npm test`

Expected: PASS / green. No test count change (data-layer tests already cover `outcome.heroesLost` population from Cluster A · 15; the bug fix is a scene-side consumer of that data).

- [ ] **Step 1.5: Commit**

```bash
git add src/scenes/camp_screen_scene.ts src/scenes/camp_node_overlay_scene.ts src/scenes/dungeon_scene.ts
git commit -m "fix(scenes): remove Lost heroes from roster on cashout/wipe (3 sites)"
```

---

## Task 2: Rendering — tombstones in dungeon party row, Lost line in cashout, Lost section in wipe panel

Visual additions only. Three sites: `buildParty`, `buildFallenLine`, `buildWipePanel`. No data layer changes.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts:buildParty()` (around line 182)
- Modify: `src/scenes/dungeon_scene.ts:buildWipePanel()` (around line 497)
- Modify: `src/scenes/camp_screen_scene.ts:buildFallenLine()` (around line 86)

- [ ] **Step 2.1: Add tombstones to `buildParty`**

Open `src/scenes/dungeon_scene.ts`. Find `buildParty` (around line 182). Current:

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
}
```

Replace with:

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
    if (slotIndex >= SLOT_X_OFFSETS.length) break;
    const tombstone = this.add.text(SLOT_X_OFFSETS[slotIndex], 0, '🪦', {
      fontFamily: 'monospace',
      fontSize: '32px',
    }).setOrigin(0.5);
    this.partyContainer.add(tombstone);
  }
}
```

- [ ] **Step 2.2: Reorganize `buildWipePanel`**

Open `src/scenes/dungeon_scene.ts`. Find `buildWipePanel` (around line 497). Current:

```ts
private buildWipePanel(): void {
  const wipe = this.wipeOutcome!;

  const bg = this.add
    .rectangle(0, 0, 400, 220, 0x1a1a1a)
    .setStrokeStyle(2, 0xcc6666);
  const title = this.add
    .text(0, -85, 'Wipe!', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#cc6666',
    })
    .setOrigin(0.5);
  const subtitle = this.add
    .text(0, -60, 'Heroes lost:', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aaaaaa',
    })
    .setOrigin(0.5);

  const lines: Phaser.GameObjects.Text[] = [];
  let y = -36;
  for (const hero of wipe.heroesFallen) {
    lines.push(
      this.add
        .text(0, y, hero.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
    y += 14;
  }

  const btnBg = this.add
    .rectangle(0, 80, 180, 34, 0x2a4a2a)
    .setStrokeStyle(2, 0x44cc44);
  const btnLabel = this.add
    .text(0, 80, 'Return to Camp', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on('pointerdown', () => this.onWipeReturn());

  this.add.container(480, 270, [bg, title, subtitle, ...lines, btnBg, btnLabel]);
}
```

Replace with:

```ts
private buildWipePanel(): void {
  const wipe = this.wipeOutcome!;
  const fallenCount = wipe.heroesFallen.length;
  const lostCount = wipe.heroesLost.length;
  const totalLines =
    fallenCount + lostCount +
    (fallenCount > 0 ? 1 : 0) +
    (lostCount > 0 ? 1 : 0);

  const baseHeight = 220;
  const extraLines = Math.max(0, totalLines - 4);
  const panelHeight = baseHeight + extraLines * 14;

  const bg = this.add
    .rectangle(0, 0, 400, panelHeight, 0x1a1a1a)
    .setStrokeStyle(2, 0xcc6666);
  const title = this.add
    .text(0, -panelHeight / 2 + 20, 'Wipe!', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#cc6666',
    })
    .setOrigin(0.5);

  const lines: Phaser.GameObjects.Text[] = [];
  let y = -panelHeight / 2 + 50;

  if (fallenCount > 0) {
    lines.push(
      this.add
        .text(0, y, 'Heroes Fallen:', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#cc8888',
        })
        .setOrigin(0.5),
    );
    y += 16;
    for (const hero of wipe.heroesFallen) {
      lines.push(
        this.add
          .text(0, y, hero.name, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }
  }

  if (lostCount > 0) {
    lines.push(
      this.add
        .text(0, y, 'Heroes Lost:', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#aa66aa',
        })
        .setOrigin(0.5),
    );
    y += 16;
    for (const hero of wipe.heroesLost) {
      lines.push(
        this.add
          .text(0, y, hero.name, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }
  }

  const btnY = panelHeight / 2 - 30;
  const btnBg = this.add
    .rectangle(0, btnY, 180, 34, 0x2a4a2a)
    .setStrokeStyle(2, 0x44cc44);
  const btnLabel = this.add
    .text(0, btnY, 'Return to Camp', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on('pointerdown', () => this.onWipeReturn());

  this.add.container(480, 270, [bg, title, ...lines, btnBg, btnLabel]);
}
```

- [ ] **Step 2.3: Extend `buildFallenLine` with the Lost line**

Open `src/scenes/camp_screen_scene.ts`. Find `buildFallenLine` (around line 86). Current:

```ts
private buildFallenLine(run: RunState): void {
  if (run.fallen.length === 0) return;
  const names = run.fallen.map((h) => h.name).join(', ');
  this.add
    .text(480, 360, `Fallen: ${names}`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#cc8888',
    })
    .setOrigin(0.5);
}
```

Replace with:

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

- [ ] **Step 2.4: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green / build succeeds.

- [ ] **Step 2.5: Commit**

```bash
git add src/scenes/dungeon_scene.ts src/scenes/camp_screen_scene.ts
git commit -m "feat(scenes): render Lost heroes (tombstones, cashout/wipe summaries)"
```

---

## Closing checklist

- [ ] **Both tasks landed in 2 commits**, with green tests + tsc + build.
- [ ] **No `phaser` imports outside `src/scenes/`** (unchanged from baseline).
- [ ] **gdd.md** is the design source of truth for the Lost vs Fallen distinction (§8).
- [ ] **Manual play / hand-crafted verification:**
  - Lost-bearing event cards exist in the deck (Cluster A · 14) but events aren't yet in the floor generator. End-to-end manual play requires a future floor-integration task.
  - Hand-crafted state for verification: open dev tools, edit `localStorage`'s save to inject `runState.lost` with a hero record. Reload — the dungeon scene should render the tombstone in the appropriate slot. After cashout, the Lost hero should be gone from `appState.roster`.
  - Wipe-side verification: trigger any wipe from a hand-crafted state with `runState.lost` populated; the wipe panel should show both Fallen and Lost sections; on return to camp, both Fallen and Lost should be gone from the roster.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 11 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +0 (Phaser scene convention; data-layer outcome shape was already covered by Cluster A · 15 tests).
