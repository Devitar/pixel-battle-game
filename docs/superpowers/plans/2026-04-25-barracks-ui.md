# Barracks UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace task 12's `BarracksPanelScene` stub with a split-pane Barracks UI showing the 12-slot roster grid on the left and a full per-hero detail pane (paperdoll + stats + trait + ability breakdown) on the right.

**Architecture:** Two units. (1) A pure-TS `describeAbility(ability)` helper in `src/data/` that synthesizes display strings from the structured `Ability` data — independently testable, reusable by future combat-scene tooltips. (2) A single-file rewrite of `src/scenes/barracks_panel_scene.ts` that wires the helper into a Phaser overlay scene with a list pane (12 slots, `HeroCard` `small` variant for filled, faded placeholder for empty), a detail pane container, and click-to-select selection model keyed by hero id.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4 (existing 481 tests + ~12 new), Phaser 4 (Container, Rectangle, Text, Paperdoll, pointer/keyboard input).

**Spec:** `docs/superpowers/specs/2026-04-25-barracks-ui-design.md`

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/data/ability_describe.ts` | **Create** | Pure TS. `describeAbility(ability) → { castLine, targetLine, effectLines }`. ~110 lines. |
| `src/data/__tests__/ability_describe.test.ts` | **Create** | ~12 unit tests covering each `effects`/`target` shape. |
| `src/scenes/barracks_panel_scene.ts` | **Rewrite** | Full scene: panel chrome, list pane (2×6 grid of small `HeroCard`s + faded empty cells), detail pane container, selection by id, ability blocks rendered via `describeAbility`. ~220 lines. |

Scene is already registered in `src/main.ts:4,26` — no main wiring changes needed. The scene key (`'barracks_panel'`) and the `close()` shape (`scene.stop()` + `scene.resume('camp')`) match the stub and the Tavern pattern from task 13.

---

## Task 1: Implement `describeAbility` helper (TDD)

**Files:**
- Create: `src/data/__tests__/ability_describe.test.ts`
- Create: `src/data/ability_describe.ts`

The helper is pure TS, no Phaser, no DOM. Built TDD: write the test file with all 12 assertions, observe failure, then implement until green. The implementation is small enough (~110 lines) to write in one shot — incremental TDD per case would be theater.

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/ability_describe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { describeAbility } from '../ability_describe';
import type { Ability } from '../types';

describe('describeAbility', () => {
  it('describes single-effect damage (Slash)', () => {
    expect(describeAbility(ABILITIES.knight_slash)).toEqual({
      castLine: 'slot 1 or 2',
      targetLine: 'enemy slot 1',
      effectLines: ['Deal 100% damage'],
    });
  });

  it('describes multi-effect damage + stun (Shield Bash)', () => {
    expect(describeAbility(ABILITIES.shield_bash)).toEqual({
      castLine: 'slot 1 or 2',
      targetLine: 'enemy slot 1',
      effectLines: ['Deal 60% damage', 'Stun for 1 turn'],
    });
  });

  it("renders slots:'all' as 'all enemies' (Volley)", () => {
    expect(describeAbility(ABILITIES.volley)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'all enemies',
      effectLines: ['Deal 50% damage'],
    });
  });

  it("combines hurt filter + pick:'lowestHp' (Mend)", () => {
    expect(describeAbility(ABILITIES.mend)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'ally (hurt), lowest HP',
      effectLines: ['Heal 120% power'],
    });
  });

  it('renders self-target with lacksStatus filter (Bulwark)', () => {
    expect(describeAbility(ABILITIES.bulwark)).toEqual({
      castLine: 'any slot',
      targetLine: 'self (not bulwark)',
      effectLines: ['+3 Defense for 2 turns'],
    });
  });

  it("combines lacksStatus + pick:'first' (Flare Arrow)", () => {
    expect(describeAbility(ABILITIES.flare_arrow)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'enemy (not marked), first available',
      effectLines: ['Mark target for +50% damage (2 turns)'],
    });
  });

  it("renders canCastFrom of all 4 slots as 'any slot' (Necrotic Wave)", () => {
    expect(describeAbility(ABILITIES.necrotic_wave).castLine).toBe('any slot');
  });

  it("renders single-slot canCastFrom as 'slot N'", () => {
    const ability: Ability = {
      id: 'knight_slash',
      name: 'X',
      canCastFrom: [1],
      target: { side: 'enemy', slots: [1] },
      effects: [{ kind: 'damage', power: 1.0 }],
    };
    expect(describeAbility(ability).castLine).toBe('slot 1');
  });

  it('describes buff effects with positive sign (Bless)', () => {
    expect(describeAbility(ABILITIES.bless)).toEqual({
      castLine: 'slot 2 or 3',
      targetLine: 'ally (not blessed), first available',
      effectLines: ['+2 Attack for 2 turns'],
    });
  });

  it("treats slots:'all' + pick:'first' specially as 'side, first available' (Shoot)", () => {
    expect(describeAbility(ABILITIES.archer_shoot).targetLine).toBe('enemy, first available');
  });

  it('describes debuff effects with negative sign (Rotting Bite)', () => {
    expect(describeAbility(ABILITIES.rotting_bite).effectLines).toEqual([
      'Deal 90% damage',
      '-1 Attack for 2 turns',
    ]);
  });

  it('describes taunt effect (Taunt)', () => {
    expect(describeAbility(ABILITIES.taunt).effectLines).toEqual(['Taunt for 2 turns']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/__tests__/ability_describe.test.ts`
Expected: 12 failures (`describeAbility is not a function` or module not found).

- [ ] **Step 3: Implement the helper**

Create `src/data/ability_describe.ts`:

```ts
import type {
  Ability,
  AbilityEffect,
  BuffableStat,
  SlotIndex,
  StatusId,
  TargetSelector,
} from './types';

export interface AbilityDescription {
  castLine: string;
  targetLine: string;
  effectLines: string[];
}

export function describeAbility(ability: Ability): AbilityDescription {
  return {
    castLine: describeCast(ability.canCastFrom),
    targetLine: describeTarget(ability.target),
    effectLines: ability.effects.map(describeEffect),
  };
}

const ALL_SLOTS: readonly SlotIndex[] = [1, 2, 3, 4];

function describeCast(slots: readonly SlotIndex[]): string {
  const sorted = [...slots].sort((a, b) => a - b);
  if (
    sorted.length === ALL_SLOTS.length &&
    sorted.every((s, i) => s === ALL_SLOTS[i])
  ) {
    return 'any slot';
  }
  if (sorted.length === 1) return `slot ${sorted[0]}`;
  if (sorted.length === 2) return `slot ${sorted[0]} or ${sorted[1]}`;
  const head = sorted.slice(0, -1).join(', ');
  return `slot ${head}, or ${sorted[sorted.length - 1]}`;
}

const STATUS_LABEL: Record<StatusId, string> = {
  bulwark: 'bulwark',
  taunting: 'taunting',
  marked: 'marked',
  blessed: 'blessed',
  rotting: 'rotting',
  frailty: 'frailty',
  stunned: 'stunned',
};

function describeFilter(filter: TargetSelector['filter']): string {
  if (!filter) return '';
  switch (filter.kind) {
    case 'hurt':
      return '(hurt)';
    case 'hasStatus':
      return `(${STATUS_LABEL[filter.statusId]})`;
    case 'lacksStatus':
      return `(not ${STATUS_LABEL[filter.statusId]})`;
    case 'hasTag':
      return `(${filter.tag})`;
  }
}

function describePick(pick: TargetSelector['pick']): string {
  if (!pick) return '';
  if (pick === 'lowestHp') return ', lowest HP';
  if (pick === 'highestHp') return ', highest HP';
  if (pick === 'first') return ', first available';
  return '';
}

function describeSlotPhrase(
  slots: readonly SlotIndex[] | 'all' | 'furthest',
): string {
  if (slots === 'all') return 'all';
  if (slots === 'furthest') return 'furthest';
  if (slots.length === 1) return `slot ${slots[0]}`;
  if (slots.length === 2) return `slot ${slots[0]} or ${slots[1]}`;
  const sorted = [...slots].sort((a, b) => a - b);
  const head = sorted.slice(0, -1).join(', ');
  return `slot ${head}, or ${sorted[sorted.length - 1]}`;
}

function describeTarget(t: TargetSelector): string {
  // Special case: slots:'all' + pick:'first' reads "side, first available"
  // (avoids the ungrammatical "all enemies, first available")
  if (t.slots === 'all' && t.pick === 'first') {
    const filter = describeFilter(t.filter);
    return filter ? `${t.side} ${filter}, first available` : `${t.side}, first available`;
  }

  // Pure 'all' (no pick): "all enemies" / "all allies"
  if (t.slots === 'all') {
    const plural =
      t.side === 'enemy' ? 'enemies' : t.side === 'ally' ? 'allies' : 'self';
    const filter = describeFilter(t.filter);
    return filter ? `all ${plural} ${filter}` : `all ${plural}`;
  }

  // Default: side [+ slot phrase] [+ filter] [+ pick suffix]
  const slotPhrase = t.slots ? describeSlotPhrase(t.slots) : '';
  const filter = describeFilter(t.filter);

  let main = slotPhrase ? `${t.side} ${slotPhrase}` : t.side;
  if (filter) main = `${main} ${filter}`;
  return main + describePick(t.pick);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function capStat(stat: BuffableStat): string {
  if (stat === 'hp') return 'HP';
  return stat[0].toUpperCase() + stat.slice(1);
}

function turnWord(n: number): string {
  return n === 1 ? 'turn' : 'turns';
}

function describeEffect(e: AbilityEffect): string {
  switch (e.kind) {
    case 'damage':
      return `Deal ${Math.round(e.power * 100)}% damage`;
    case 'heal':
      return `Heal ${Math.round(e.power * 100)}% power`;
    case 'stun':
      return `Stun for ${e.duration} ${turnWord(e.duration)}`;
    case 'shove':
      return `Shove ${e.slots} slot${e.slots === 1 ? '' : 's'} back`;
    case 'pull':
      return `Pull ${e.slots} slot${e.slots === 1 ? '' : 's'} forward`;
    case 'buff':
      return `${signed(e.delta)} ${capStat(e.stat)} for ${e.duration} ${turnWord(e.duration)}`;
    case 'debuff':
      return `${signed(e.delta)} ${capStat(e.stat)} for ${e.duration} ${turnWord(e.duration)}`;
    case 'mark':
      return `Mark target for +${Math.round(e.damageBonus * 100)}% damage (${e.duration} ${turnWord(e.duration)})`;
    case 'taunt':
      return `Taunt for ${e.duration} ${turnWord(e.duration)}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/__tests__/ability_describe.test.ts`
Expected: 12 passes.

- [ ] **Step 5: Typecheck and full test suite**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: 481 + 12 = 493 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/ability_describe.ts src/data/__tests__/ability_describe.test.ts
git commit -m "data: add describeAbility helper for UI ability display"
```

---

## Task 2: Rewrite `BarracksPanelScene` with full split-pane UI

**Files:**
- Rewrite: `src/scenes/barracks_panel_scene.ts`

Same lesson as Tavern (task 13): TypeScript's strict `noUnusedLocals` rejects scaffold-then-fill task structures, so this rewrite is one task with the full code. Per-launch state reset at the top of `create()` is load-bearing — Phaser scene instances are reused across `scene.launch` calls.

- [ ] **Step 1: Rewrite the scene file**

Replace the entire contents of `src/scenes/barracks_panel_scene.ts` with:

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

interface RosterCard {
  bg: Phaser.GameObjects.Rectangle;
  card: HeroCard;
  hero: Hero;
}

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const LIST_PANE_CX = 245;
const LIST_PANE_CY = 270;
const LIST_PANE_W = 380;
const LIST_PANE_H = 360;

const DETAIL_PANE_CX = 715;
const DETAIL_PANE_CY = 270;
const DETAIL_PANE_W = 440;
const DETAIL_PANE_H = 360;

const SLOT_X_LEFT = 150;
const SLOT_X_RIGHT = 340;
const SLOT_Y_BASE = 120;
const SLOT_STRIDE = 60;
const SLOT_BG_W = 184;
const SLOT_BG_H = 60;
const ROSTER_CAP_DISPLAY = 12;

const DETAIL_PAPERDOLL_X = 540;
const DETAIL_PAPERDOLL_Y = 145;
const DETAIL_TEXT_X = 590;

const ABILITY_X = 515;
const ABILITY_HEADER_Y = 215;
const ABILITY_BLOCK_START_Y = 235;
const ABILITY_NAME_LINE_HEIGHT = 16;
const ABILITY_LINE_HEIGHT = 14;
const ABILITY_BLOCK_GAP = 6;

export class BarracksPanelScene extends Phaser.Scene {
  private rosterCards: RosterCard[] = [];
  private selectedHeroId: string | null = null;
  private detailContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;

  constructor() {
    super('barracks_panel');
  }

  create(): void {
    // Phaser scene instances are reused across launches; reset per-launch state.
    this.rosterCards = [];
    this.selectedHeroId = null;

    this.buildOverlayAndPanel();
    this.buildCloseButton();

    const heroes = listHeroes(appState.get().roster);
    const cap = appState.get().roster.capacity;
    this.titleText.setText(`Barracks · ${heroes.length} / ${cap}`);

    this.buildListPane(heroes);
    this.buildDetailPaneBackground();
    this.detailContainer = this.add.container(0, 0);

    this.selectHero(heroes[0]?.id ?? null);

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildOverlayAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);
    this.titleText = this.add
      .text(PANEL_CX, 60, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(933, 63, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(933, 63, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private buildListPane(heroes: readonly Hero[]): void {
    this.add
      .rectangle(LIST_PANE_CX, LIST_PANE_CY, LIST_PANE_W, LIST_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);

    for (let i = 0; i < ROSTER_CAP_DISPLAY; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? SLOT_X_LEFT : SLOT_X_RIGHT;
      const y = SLOT_Y_BASE + row * SLOT_STRIDE;

      if (i < heroes.length) {
        this.buildFilledSlot(heroes[i], x, y);
      } else {
        this.buildEmptySlot(x, y);
      }
    }
  }

  private buildFilledSlot(hero: Hero, x: number, y: number): void {
    const bg = this.add
      .rectangle(x, y, SLOT_BG_W, SLOT_BG_H, 0x000000, 0)
      .setStrokeStyle(2, 0xffcc66, 0);
    const card = new HeroCard(this, x, y, hero, { size: 'small' });
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));
    this.rosterCards.push({ bg, card, hero });
  }

  private buildEmptySlot(x: number, y: number): void {
    this.add
      .rectangle(x, y, 180, 56, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333);
    this.add
      .text(x, y, 'empty', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#555555',
      })
      .setOrigin(0.5);
  }

  private buildDetailPaneBackground(): void {
    this.add
      .rectangle(DETAIL_PANE_CX, DETAIL_PANE_CY, DETAIL_PANE_W, DETAIL_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
  }

  private selectHero(id: string | null): void {
    this.selectedHeroId = id;
    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }

  private refreshSelectionHighlights(): void {
    for (const rc of this.rosterCards) {
      const isSelected = rc.hero.id === this.selectedHeroId;
      rc.bg.setStrokeStyle(2, 0xffcc66, isSelected ? 1 : 0);
    }
  }

  private rebuildDetail(): void {
    this.detailContainer.removeAll(true);

    const hero = this.selectedHeroId
      ? this.rosterCards.find((rc) => rc.hero.id === this.selectedHeroId)?.hero
      : null;

    if (!hero) {
      this.detailContainer.add(
        this.add
          .text(DETAIL_PANE_CX, DETAIL_PANE_CY, 'No heroes — visit the Tavern to recruit.', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const classDef = CLASSES[hero.classId];
    const traitDef = TRAITS[hero.traitId];

    const paperdoll = new Paperdoll(
      this,
      DETAIL_PAPERDOLL_X,
      DETAIL_PAPERDOLL_Y,
      heroToLoadout(hero),
    );
    paperdoll.setScale(4);
    this.detailContainer.add(paperdoll);

    this.detailContainer.add(
      this.add.text(DETAIL_TEXT_X, 110, hero.name, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      }),
    );
    this.detailContainer.add(
      this.add.text(DETAIL_TEXT_X, 132, classDef.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#aaaaaa',
      }),
    );
    this.detailContainer.add(
      this.add.text(
        DETAIL_TEXT_X,
        152,
        `HP ${hero.currentHp}/${hero.maxHp} · ATK ${hero.baseStats.attack} · DEF ${hero.baseStats.defense} · SPD ${hero.baseStats.speed}`,
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#dddddd',
        },
      ),
    );
    this.detailContainer.add(
      this.add.text(
        DETAIL_TEXT_X,
        172,
        `trait: ${traitDef.name} — ${traitDef.description}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ccbbaa',
        },
      ),
    );

    this.detailContainer.add(
      this.add.text(ABILITY_X, ABILITY_HEADER_Y, 'ABILITIES', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      }),
    );

    let yCursor = ABILITY_BLOCK_START_Y;
    for (const abilityId of classDef.abilities) {
      const ability = ABILITIES[abilityId];
      const desc = describeAbility(ability);

      this.detailContainer.add(
        this.add.text(ABILITY_X, yCursor, ability.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        }),
      );
      yCursor += ABILITY_NAME_LINE_HEIGHT;

      this.detailContainer.add(
        this.add.text(
          ABILITY_X,
          yCursor,
          `Cast: ${desc.castLine} · Target: ${desc.targetLine}`,
          {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#999999',
          },
        ),
      );
      yCursor += ABILITY_LINE_HEIGHT;

      for (const line of desc.effectLines) {
        this.detailContainer.add(
          this.add.text(ABILITY_X, yCursor, `→ ${line}`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          }),
        );
        yCursor += ABILITY_LINE_HEIGHT;
      }

      yCursor += ABILITY_BLOCK_GAP;
    }
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass (481 + 12 from Task 1; this task adds no tests).

- [ ] **Step 4: Production build succeeds**

Run: `npm run build`
Expected: `tsc + vite build` finishes without errors. Pre-existing chunk-size warning is unrelated.

- [ ] **Step 5: Smoke test (manual, dev server)**

Run: `npm run dev`. Open `http://localhost:5173`.

Walk through the spec's smoke-test sequence (`docs/superpowers/specs/2026-04-25-barracks-ui-design.md` §Tests > Smoke test):

1. **Initial state.** Use the post-task-13 save (some heroes hired). Camp HUD shows current gold; click the gray Barracks building.
2. **Panel opens.** Title `Barracks · {N} / 12`. Left pane shows N filled small `HeroCard`s (paperdoll + name + class + HP) plus (12-N) faded `empty` placeholders, in a 2×6 grid. Right pane auto-renders `roster.heroes[0]`'s detail: paperdoll (×4 scale), name + class, stats line, trait line, then 4 ability blocks each with `Cast: ... · Target: ...` meta line and one-or-more `→ {effect}` lines.
3. **Selection highlight.** First filled card has a 2px yellow outline (`#ffcc66`). Click any other filled card — its outline becomes yellow, previous selection's clears. Detail pane repaints with the new hero's data.
4. **Click an empty placeholder.** Nothing happens (no click handler registered on empty slots).
5. **Verify ability rendering across all three classes.** Hire enough heroes (or edit save) to have at least one Knight, Archer, and Priest. For each class, click their card and verify against the spec's targetLine table (§describeAbility):
   - **Knight** (`Slash`, `Shield Bash`, `Bulwark`, `Taunt`): Slash → `Target: enemy slot 1`; Shield Bash shows two `→` lines (`Deal 60% damage`, `Stun for 1 turn`); Bulwark → `Target: self (not bulwark)`, effect `+3 Defense for 2 turns`.
   - **Archer** (`Shoot`, `Piercing Shot`, `Volley`, `Flare Arrow`): Shoot → `Target: enemy, first available`; Volley → `Target: all enemies`; Flare Arrow → `Target: enemy (not marked), first available`, effect `Mark target for +50% damage (2 turns)`.
   - **Priest** (`Strike`, `Mend`, `Smite`, `Bless`): Mend → `Target: ally (hurt), lowest HP`, effect `Heal 120% power`; Bless → `Target: ally (not blessed), first available`, effect `+2 Attack for 2 turns`.
6. **Trait line.** Each hero's trait row reads `trait: {Name} — {description}` matching the `TRAITS` map (e.g., `trait: Quick — +1 Speed`, `trait: Cowardly — -1 Speed when in slot 1`).
7. **ESC closes.** Press ESC — panel disappears, camp re-emerges (gold HUD unchanged since Barracks made no mutations).
8. **Reopen.** Click Barracks again. Auto-selects `heroes[0]` (no selection persistence).
9. **Empty roster scenario.** In DevTools → Application → Local Storage, edit `pixel-battle-game/save`: set `roster.heroes = []`, save, reload page. Open Barracks. Title reads `Barracks · 0 / 12`. List pane shows 12 `empty` placeholders. Detail pane shows `No heroes — visit the Tavern to recruit.` ESC closes.

If any step diverges, stop and debug before committing. Re-run typecheck/tests after any code change.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/barracks_panel_scene.ts
git commit -m "barracks: rewrite stub with split-pane roster + ability detail"
```

---

## Verification summary

After both tasks:

- `npx tsc --noEmit` — clean
- `npm test` — 493 tests passing (481 existing + 12 new)
- `npm run build` — succeeds
- Manual smoke test — all 9 steps pass
- No `appState` mutations from Barracks (Tier 1 read-only confirmed)

---

## Out of scope (per spec §Risks and follow-ups)

- Sort / filter for the roster list (Tier 2 when class roster grows)
- Persisting selection across panel opens (Tier 2 with equip flow)
- Computed effective stats (would duplicate `getEffectiveStat`)
- Equip / formation default / dismiss actions (Tier 2)
- Detail pane scrolling for long ability lists (Tier 2)
- Localization of `describeAbility` output
- Surfacing ability `tags` (e.g., `radiant`) in the description (Tier 2)

---

## Notes for the implementer

- **Phaser scene reuse trap.** `create()` runs every `scene.launch`, but the JS instance persists. The `this.rosterCards = []; this.selectedHeroId = null` reset at the top of `create()` is load-bearing for re-opens. Same pattern as Tavern (task 13).
- **`bg` rectangle is the click target *and* selection outline.** Fill alpha is 0 (transparent); stroke alpha toggles between 0 (hidden) and 1 (visible yellow). The HeroCard has no `onClick`, so clicks pass through to `bg` underneath. Z-order: `bg` is added first, HeroCard on top — Phaser hit-tests through the non-interactive HeroCard to the interactive `bg`.
- **`describeAbility` is pure TS.** No Phaser imports; lives in `src/data/`. Tests mount `ABILITIES` directly; no fixtures needed.
- **Ability block layout uses a `y_cursor`**, not a fixed index — block heights vary because `effectLines.length` does. Stride after a block is `ABILITY_BLOCK_GAP` (6px). Worst case (4 Knight abilities incl. Shield Bash with 2 effects) ≈ 208px starting at y=235 → ends y=443, inside detail pane bottom y=450.
- **`appState` is read once in `create()`** then captured in scene state for the duration. Barracks mutates nothing; the camp's `RESUME` listener will fire on close as a no-op refresh, which is fine (consistent with Tavern).
- **Empty-slot placeholders use 180×56** (not 184×60 like the click bg) — they're visual filler, not interactive, so they match the HeroCard footprint exactly.
