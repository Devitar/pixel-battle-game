# Level-up Perk Picker UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the auto-overlay perk picker so heroes who hit level 5 can choose one of two class-specific perks, closing the loop on the leveling foundation that just shipped.

**Architecture:** Two tasks. (1) Pure-TS hero helpers — `applyPerk(hero, perkId)` and a `computeMaxHp` extension to support perk HP effects. Fully TDD'd. (2) The Phaser side — new `PerkOverlayScene` plus a tiny `CampScene` change that auto-launches the overlay when any hero has `pendingPerk: true`. Scene-rendering is untested by repo convention; the helper carries the test coverage.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4, Phaser 4. Hero helpers stay inside the firewall (`heroes/`); the new scene file lives under `scenes/` per the firewall rule.

**Spec:** [`docs/superpowers/specs/2026-04-28-perk-picker-design.md`](../specs/2026-04-28-perk-picker-design.md)

**Project policy reminder:** Per [`CLAUDE.md`](../../../CLAUDE.md), never run `git commit` without explicit user direction. Each task ends with a "stage and report" step — the user runs the commit themselves.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/heroes/hero.ts` | **Modify** | Add `applyHpEffect(value, effect)` helper; extract `gearTotal(equipment)` helper; extend `computeMaxHp` with optional `perk?: PerkDef`; add `applyPerk(hero, perkId)` function. |
| `src/heroes/__tests__/hero.test.ts` | **Modify** | New `describe('applyPerk', ...)` block (5 cases); new `describe('computeMaxHp — perk HP effect', ...)` block (1 case). |
| `src/scenes/perk_overlay_scene.ts` | **Create** | New `Phaser.Scene` subclass — paperdoll + name/class header + 2 perk cards; click-to-confirm; persists via `appState.update`. |
| `src/scenes/camp_scene.ts` | **Modify** | Add `maybeLaunchPerkPicker()` called from `create()` and the existing `RESUME` handler. |
| `src/main.ts` | **Modify** | Register `PerkOverlayScene` in the scene array. |

No changes to combat code, run state, save schema, or `data/perks.ts` (data unchanged).

---

## Task 1: `applyPerk` and `computeMaxHp` extension

**Goal:** Pure-TS helpers so the picker can persist a perk choice. Stat-effect perks just write `perkId` and clear `pendingPerk`. HP-effect perks (Resolute, Steadfast — both `+10% HP`) recompute `maxHp` and rescale `currentHp` to preserve HP percentage.

**Files:**
- Modify: `src/heroes/hero.ts`
- Modify: `src/heroes/__tests__/hero.test.ts`

- [ ] **Step 1: Write the failing tests for `applyPerk`**

In `src/heroes/__tests__/hero.test.ts`, append a new `describe` block at the bottom (after the existing `describe('createHero — equipment', ...)` block):

```ts
describe('applyPerk', () => {
  it('stat-effect perk preserves HP, sets perkId, clears pendingPerk', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, pendingPerk: true };
    const result = applyPerk(h, 'iron_will');
    expect(result.perkId).toBe('iron_will');
    expect(result.pendingPerk).toBe(false);
    expect(result.maxHp).toBe(h.maxHp);
    expect(result.currentHp).toBe(h.currentHp);
  });

  it('HP-effect perk at full HP: maxHp +10%, currentHp scales to new max', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    // Knight base 20 + Quick (no HP effect) + sword/shield (no HP gear) = 20 maxHp.
    expect(base.maxHp).toBe(20);
    const result = applyPerk(base, 'resolute');
    expect(result.maxHp).toBe(22); // round(20 * 1.1)
    expect(result.currentHp).toBe(22); // proportional from full
  });

  it('HP-effect perk at partial HP: HP percentage preserved within rounding', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, currentHp: 10 }; // 50%
    const result = applyPerk(h, 'resolute');
    expect(result.maxHp).toBe(22);
    // round(10 * 22/20) = round(11) = 11
    expect(result.currentHp).toBe(11);
  });

  it('HP-effect perk: currentHp floors at 1 (defensive)', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, currentHp: 0 };
    const result = applyPerk(h, 'resolute');
    expect(result.currentHp).toBeGreaterThanOrEqual(1);
  });

  it('clears pendingPerk regardless of effect kind', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, pendingPerk: true };
    expect(applyPerk(h, 'iron_will').pendingPerk).toBe(false);
    expect(applyPerk(h, 'resolute').pendingPerk).toBe(false);
  });
});
```

Also append the imports at the top of the file (alongside the existing `import { createHero }`):

```ts
import { applyPerk } from '../hero';
import type { Hero } from '../hero';
```

If `Hero` is not yet imported as a type, adjust to:

```ts
import { applyPerk, createHero, type Hero } from '../hero';
```

(Verify against the existing import line — currently `import { createHero } from '../hero';` — and merge.)

- [ ] **Step 2: Write the failing test for `computeMaxHp` with perk**

In the same test file, append another `describe` block:

```ts
describe('computeMaxHp — perk HP effect', () => {
  it('Stout (+10% HP) + Resolute (+10% HP) Knight stacks: 20 → 22 → 24', () => {
    const knight = createHero('knight', 'K', 'h0', 'stout', 'body1');
    const result = computeMaxHp(
      CLASSES.knight.baseStats.hp,
      TRAITS.stout,
      knight.equipment,
      PERKS.resolute,
    );
    // 20 → round(20 * 1.1) = 22 → round(22 * 1.1) = 24, plus 0 gear HP.
    expect(result).toBe(24);
  });
});
```

Imports needed at the top of the test file (some may already exist — merge):

```ts
import { TRAITS } from '../../data/traits';
import { PERKS } from '../../data/perks';
import { computeMaxHp } from '../hero';
```

- [ ] **Step 3: Run the new tests to confirm they fail**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts`

Expected: failures — `applyPerk` not exported (5 cases); `computeMaxHp` doesn't accept a perk parameter (1 case).

- [ ] **Step 4: Extract helpers and extend `computeMaxHp`**

In `src/heroes/hero.ts`, replace the existing `computeMaxHp` body with this version that uses two extracted helpers and accepts an optional `perk`:

```ts
export function computeMaxHp(
  classBaseHp: number,
  trait: TraitDef,
  equipment: HeroEquipment,
  perk?: PerkDef,
): number {
  let base = classBaseHp;
  if (trait.hpEffect) base = applyHpEffect(base, trait.hpEffect);
  if (perk?.hpEffect) base = applyHpEffect(base, perk.hpEffect);
  return base + gearTotal(equipment);
}

function applyHpEffect(value: number, effect: TraitHpEffect): number {
  const { delta, mode } = effect;
  return mode === 'percent' ? Math.round(value * (1 + delta / 100)) : value + delta;
}

function gearTotal(equipment: HeroEquipment): number {
  let gear = 0;
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    const baseStats = BASE_ITEM_STATS[item.baseId];
    if (baseStats.hp !== undefined) gear += baseStats.hp;
    for (const a of item.affixes) {
      if (a.affixId === 'of_vigor') gear += a.value;
    }
  }
  return gear;
}
```

Add `PerkDef` and `TraitHpEffect` to the existing import block at the top of the file:

```ts
import type {
  ClassId, HeroEquipment, Item, ItemBaseId, ItemSlot,
  PerkDef, PerkId, StarterLoadout, TraitDef, TraitHpEffect, TraitId, Wound,
} from '../data/types';
```

- [ ] **Step 5: Add `applyPerk`**

At the bottom of `src/heroes/hero.ts` (before the helper functions if any are below `computeMaxHp`, or just append):

```ts
export function applyPerk(hero: Hero, perkId: PerkId): Hero {
  const perk = PERKS[perkId];
  const updated: Hero = { ...hero, perkId, pendingPerk: false };
  if (perk.hpEffect) {
    const newMaxHp = applyHpEffect(hero.maxHp, perk.hpEffect);
    const ratio = hero.maxHp > 0 ? newMaxHp / hero.maxHp : 1;
    updated.maxHp = newMaxHp;
    updated.currentHp = Math.max(1, Math.round(hero.currentHp * ratio));
  }
  return updated;
}
```

Add the `PERKS` import to the top of the file:

```ts
import { PERKS } from '../data/perks';
```

(If `applyHpEffect` was declared *after* `applyPerk` in source order, function declarations are hoisted in TypeScript, so order doesn't matter. The file should still read top-down logically — keep `applyHpEffect` and `gearTotal` as the last two private helpers in the file.)

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts`

Expected: PASS. All `applyPerk` cases (5) and the `computeMaxHp` perk case (1) green; existing tests unaffected.

- [ ] **Step 7: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 8: Stage and report**

```bash
git add src/heroes/hero.ts src/heroes/__tests__/hero.test.ts
git status
```

Tell the user: **"Task 1 ready. `applyPerk` added; `computeMaxHp` extended with optional perk parameter; helpers extracted (`applyHpEffect`, `gearTotal`). Suggested commit message: `feat(hero): applyPerk function and computeMaxHp perk extension`. Awaiting your direction."**

---

## Task 2: PerkOverlayScene + CampScene wiring

**Goal:** New Phaser scene renders the picker overlay; CampScene auto-launches it whenever any hero has `pendingPerk: true`. Scene-rendering is Phaser-coupled and untested by repo convention; the helper from Task 1 carries the testable surface.

**Files:**
- Create: `src/scenes/perk_overlay_scene.ts`
- Modify: `src/scenes/camp_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `PerkOverlayScene`**

Create `src/scenes/perk_overlay_scene.ts`:

```ts
import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { CLASSES } from '../data/classes';
import { CLASS_PERK_PAIRS, PERKS } from '../data/perks';
import type { PerkId } from '../data/types';
import { applyPerk, type Hero } from '../heroes/hero';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 680;
const PANEL_H = 360;

const PAPERDOLL_X = 280;
const PAPERDOLL_Y = 200;
const PAPERDOLL_SCALE = 4;

const HEADER_X = 380;
const HEADER_NAME_Y = 130;
const HEADER_CLASS_Y = 158;
const HEADER_LEVEL_Y = 184;
const HEADER_PROMPT_Y = 230;

const CARD_W = 260;
const CARD_H = 140;
const CARD_Y = 380;
const CARD_A_X = 330;
const CARD_B_X = 630;

export class PerkOverlayScene extends Phaser.Scene {
  private heroId!: string;

  constructor() {
    super('perk_overlay');
  }

  init(data: { heroId: string }): void {
    this.heroId = data.heroId;
  }

  create(): void {
    const hero = listHeroes(appState.get().roster).find((h) => h.id === this.heroId);
    if (!hero || !hero.pendingPerk) {
      // Defensive — shouldn't happen given camp's gate, but guard against
      // scene-restart edge cases.
      this.close();
      return;
    }
    this.buildOverlay(hero);
  }

  private buildOverlay(hero: Hero): void {
    // Dim background (full canvas, click-blocking).
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel chrome.
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    // Paperdoll.
    const paperdoll = new Paperdoll(this, PAPERDOLL_X, PAPERDOLL_Y, heroToLoadout(hero));
    paperdoll.setScale(PAPERDOLL_SCALE);

    // Header text.
    const classDef = CLASSES[hero.classId];
    this.add.text(HEADER_X, HEADER_NAME_Y, hero.name, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    });
    this.add.text(HEADER_X, HEADER_CLASS_Y, `${classDef.name} · Level ${hero.level}`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaaaaa',
    });
    this.add.text(HEADER_X, HEADER_LEVEL_Y, `Reached Level ${hero.level}!`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffcc66',
    });
    this.add.text(HEADER_X, HEADER_PROMPT_Y, 'Choose a perk:', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaaaaa',
    });

    // Perk cards.
    const [perkAId, perkBId] = CLASS_PERK_PAIRS[hero.classId];
    this.buildPerkCard(CARD_A_X, perkAId);
    this.buildPerkCard(CARD_B_X, perkBId);
  }

  private buildPerkCard(centerX: number, perkId: PerkId): void {
    const perk = PERKS[perkId];
    const bg = this.add
      .rectangle(centerX, CARD_Y, CARD_W, CARD_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
    this.add
      .text(centerX, CARD_Y - 30, perk.name, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(centerX, CARD_Y + 0, perk.description, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#dddddd',
      })
      .setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffcc66));
    bg.on('pointerout', () => bg.setStrokeStyle(1, 0x444444));
    bg.on('pointerdown', () => this.onPick(perkId));
  }

  private onPick(perkId: PerkId): void {
    appState.update((s) => ({
      ...s,
      roster: {
        ...s.roster,
        heroes: s.roster.heroes.map((h) =>
          h.id === this.heroId ? applyPerk(h, perkId) : h,
        ),
      },
    }));
    this.close();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

- [ ] **Step 2: Register the scene in `src/main.ts`**

In `src/main.ts`, add the import (alongside the other scene imports near the top):

```ts
import { PerkOverlayScene } from './scenes/perk_overlay_scene';
```

And add `PerkOverlayScene` to the `scene` array in the `Phaser.Game` config. Place it next to other panel scenes (just after `EquipPanelScene`):

```ts
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    NoticeboardPanelScene,
    DungeonScene,
    CombatScene,
    CampScreenScene,
    EquipPanelScene,
    PerkOverlayScene,
    MainScene,
    ExplorerScene,
  ],
```

- [ ] **Step 3: Wire the auto-launch into `CampScene`**

In `src/scenes/camp_scene.ts`, add the import for `listHeroes` near the top (alongside the existing `balance` import):

```ts
import { listHeroes } from '../camp/roster';
import { balance } from '../camp/vault';
import { appState } from './app_state';
```

Replace the existing `create()` method's RESUME handler and add a `maybeLaunchPerkPicker()` method. The current code is:

```ts
  create(): void {
    this.buildHud();
    this.buildGround();
    this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
    this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
    this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
    this.buildDevHints();

    this.events.on(Phaser.Scenes.Events.RESUME, () => this.refreshHud());

    this.input.keyboard?.on('keydown-NINE', () => this.scene.start('main'));
    this.input.keyboard?.on('keydown-ZERO', () => this.scene.start('explorer'));
  }
```

Change it to:

```ts
  create(): void {
    this.buildHud();
    this.buildGround();
    this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
    this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
    this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
    this.buildDevHints();

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.maybeLaunchPerkPicker();
    });

    this.input.keyboard?.on('keydown-NINE', () => this.scene.start('main'));
    this.input.keyboard?.on('keydown-ZERO', () => this.scene.start('explorer'));

    this.maybeLaunchPerkPicker();
  }

  private maybeLaunchPerkPicker(): void {
    const pending = listHeroes(appState.get().roster).find((h) => h.pendingPerk);
    if (!pending) return;
    this.scene.launch('perk_overlay', { heroId: pending.id });
    this.scene.pause();
  }
```

- [ ] **Step 4: Run the full test suite as a regression check**

Run: `npm test`

Expected: All tests pass. The new scene file isn't tested directly; existing tests should continue to pass since `applyPerk` from Task 1 is the only behavioral change reachable from a vitest run.

- [ ] **Step 5: Run the type-check**

Run: `npx tsc --noEmit`

Expected: Clean. The new scene file imports `Paperdoll`, `heroToLoadout`, `applyPerk`, etc. — verify all imports resolve.

- [ ] **Step 6: Stage and report**

```bash
git add src/scenes/perk_overlay_scene.ts src/scenes/camp_scene.ts src/main.ts
git status
```

Tell the user: **"Task 2 ready. PerkOverlayScene scaffolded; CampScene auto-launches it on create + RESUME for any pending hero. Suggested commit message: `feat(ui): auto-launch perk picker on camp focus`. Awaiting your direction. If you want to verify the picker visually: `npm run dev`, level a hero to 5, return to camp."**

---

## Post-implementation: TODO and HISTORY

After Task 2 is committed, the user typically migrates the TODO entry into HISTORY. Don't do this unprompted — wait for direction. The TODO entry to migrate is the Cluster B · 8 entry in [`TODO.md`](../../../TODO.md). Per the [slim HISTORY entry policy](../../../CLAUDE.md), keep the new HISTORY entry to ~15-25 lines: Why / Decisions / Surprises / Source.

Suggested HISTORY-entry sketch (write it on the day work completes, newest-on-top):

```markdown
### YYYY-MM-DD · Level-up perk picker UI (Cluster B · 8)

**Why:** Closes the loop on the leveling foundation (Cluster A · 7). Heroes were earning XP, levelling up, and getting flagged `pendingPerk: true` — but had no way to actually pick a perk. The flag accumulated indefinitely; combat saw `perkId: undefined` and applied no effect. This task ships the picker overlay, the `applyPerk` helper, and the camp-scene auto-launch that surfaces the choice as soon as the player returns to camp.

**Decisions:**
- **Auto-overlay on camp focus over Barracks-badge or block-Noticeboard.** Forces the level-up moment as a beat — matches the "rookies become legends" arc framing. Smallest blast radius too: one method on CampScene plus the new scene file. Alternatives (Barracks badge or Descend gate) would touch 2+ scenes and add a "remind me later" code path.
- **Sequential queue, one hero at a time.** A surviving party of 3 can hit level 5 simultaneously; rather than batch view or carousel, just keep launching the overlay until no hero has `pendingPerk`. The RESUME handler does it automatically — fire-and-forget.
- **HP-effect perks scale current `maxHp` rather than recomputing from class base.** Per-level HP bumps from `applyLevelUps` are baked into `maxHp` and not tracked separately; recomputing from base would lose them. Trade-off: equipment HP also gets multiplied. For Tier 2 with two `+10% HP` perks this is small and reads as "Resolute = your hero is 10% beefier" overall.
- **No skip / cancel / ESC.** Matches the auto-overlay model — the player is forced to engage.

**Surprises:**
- Extracted `applyHpEffect(value, effect)` and `gearTotal(equipment)` helpers from the inline `computeMaxHp` math. DRY-up was forced by the perk extension but improves readability of the existing function too.
- `currentHp ≥ 1` guard handles the unlikely `currentHp: 0` edge case (living heroes always have ≥1, but a hand-edited save or future "rested at 0" feature could violate). One line, defensive.

**Source:** TODO.md Cluster B · 8 → spec at `docs/superpowers/specs/2026-04-28-perk-picker-design.md` → plan at `docs/superpowers/plans/2026-04-28-perk-picker.md`.
```

---

## Self-review notes

Reviewed the plan against the spec:

- **Spec coverage:** Trigger flow → Task 2 step 3. Picker scene + layout → Task 2 step 1. `applyPerk` → Task 1 step 5. `computeMaxHp` extension → Task 1 step 4. All 6 spec-mandated tests are explicit steps in Task 1 (5 in `describe('applyPerk', ...)` plus 1 in `describe('computeMaxHp — perk HP effect', ...)`).
- **Type consistency:** `applyPerk(hero, perkId)` signature matches across Task 1 implementation and Task 2 scene call site. `computeMaxHp(classBaseHp, trait, equipment, perk?)` parameter order matches between the function declaration (Task 1 step 4) and the test call (Task 1 step 2). Scene constants (`PANEL_W`, `CARD_W`, etc.) match the spec's layout section.
- **No placeholders:** Every step has actual code or a precise command. The HISTORY-entry sketch uses `YYYY-MM-DD` because the completion date isn't known yet — documentation, not implementation.
- **Test isolation:** Task 1 tests reference `Hero` type, `applyPerk` and `computeMaxHp` exports, plus `PERKS` and `TRAITS` data. All exist or are added by Task 1 itself; no forward references to Task 2.
