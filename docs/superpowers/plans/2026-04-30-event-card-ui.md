# Event card UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-skip event-node stub in `dungeon_scene.ts` with a real overlay scene. Player walks onto an event node, sees the card body and two choice buttons; choices apply via `applyEventChoice`; `lose_hero` choices show a hero-picker sub-state; outcome panel shows what changed; Dismiss advances. Also fixes a latent dungeon-scene bug where `buildParty()` is never re-called after mid-scene party changes.

**Architecture:** Three sequential tasks.

1. Add the `describePayload(payload)` helper in `src/data/events.ts` plus tests. Pure-TS data-layer helper used by the card-stage subtitle.
2. Add the `EventOverlayScene` Phaser class with the three-state machine ('card' / 'hero_picker' / 'outcome'). Modeled after `camp_node_overlay_scene.ts`.
3. Wire the scene into `dungeon_scene.ts` (replace the stub, add `rebuildParty()` and call it from RESUME + `processCombatReturn`) and register in `main.ts`. Manual-play verification.

**Tech Stack:** TypeScript, Vitest (data layer); Phaser 3 (scene). The scene may import Phaser; the data helper must not.

**Spec:** `docs/superpowers/specs/2026-04-30-event-card-ui-design.md`. Read before starting.

---

## Task 1: `describePayload` helper

Pure-TS function in `src/data/events.ts` that turns one `EventPayload` into a player-facing short string. Used by the `EventOverlayScene` (Task 2) for the card-stage choice-button subtitle. Living here keeps the data-layer firewall intact.

**Files:**
- Modify: `src/data/events.ts`
- Modify: `src/data/__tests__/events.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass (1301 as of the prior task; may be slightly higher).

- [ ] **Step 1.2: Append failing tests to `src/data/__tests__/events.test.ts`**

Open `src/data/__tests__/events.test.ts`. The existing top of the file imports `EVENTS, type EventCard, type EventPayload`. Extend the import:

```typescript
import { describePayload, EVENTS, type EventCard, type EventPayload } from '../events';
```

Then append this describe block at the end of the file:

```typescript
describe('describePayload', () => {
  it('renders a negative hp_delta_party as "Party loses N% HP"', () => {
    expect(describePayload({ kind: 'hp_delta_party', percent: -0.20 }))
      .toBe('Party loses 20% HP');
  });

  it('renders a positive hp_delta_party as "Party heals N% HP"', () => {
    expect(describePayload({ kind: 'hp_delta_party', percent: 0.25 }))
      .toBe('Party heals 25% HP');
  });

  it('renders a positive gold_delta with a + sign', () => {
    expect(describePayload({ kind: 'gold_delta', amount: 150 }))
      .toBe('+150g');
  });

  it('renders a negative gold_delta with the literal sign', () => {
    expect(describePayload({ kind: 'gold_delta', amount: -80 }))
      .toBe('-80g');
  });

  it('renders add_item with the rarity word', () => {
    expect(describePayload({ kind: 'add_item', rarity: 'common' }))
      .toBe('Gain a common item');
    expect(describePayload({ kind: 'add_item', rarity: 'uncommon' }))
      .toBe('Gain a uncommon item');
    expect(describePayload({ kind: 'add_item', rarity: 'rare' }))
      .toBe('Gain a rare item');
  });

  it('renders lose_hero as "Lose a hero"', () => {
    expect(describePayload({ kind: 'lose_hero' }))
      .toBe('Lose a hero');
  });
});
```

**Note on grammar:** `'Gain a uncommon item'` is mildly grammatically off ("an" would be correct before a vowel sound). Per spec §12 ambiguity note, the decision is to use a single uniform `"a"` rule rather than add a vowel-sound check — the player is unlikely to notice and a single rule keeps the renderer trivial.

- [ ] **Step 1.3: Run the test file and verify it fails**

Run: `npx vitest run src/data/__tests__/events.test.ts`

Expected: FAIL — `describePayload is not exported from '../events'`.

- [ ] **Step 1.4: Add the helper to `src/data/events.ts`**

Open `src/data/events.ts`. At the end of the file (after the `EVENTS` export), append:

```typescript
export function describePayload(payload: EventPayload): string {
  switch (payload.kind) {
    case 'hp_delta_party': {
      const pct = Math.abs(Math.round(payload.percent * 100));
      return payload.percent >= 0 ? `Party heals ${pct}% HP` : `Party loses ${pct}% HP`;
    }
    case 'gold_delta':
      return payload.amount >= 0 ? `+${payload.amount}g` : `${payload.amount}g`;
    case 'add_item':
      return `Gain a ${payload.rarity} item`;
    case 'lose_hero':
      return 'Lose a hero';
  }
}
```

- [ ] **Step 1.5: Run the test file and verify it passes**

Run: `npx vitest run src/data/__tests__/events.test.ts`

Expected: PASS — all describePayload cases green.

- [ ] **Step 1.6: Run the full test suite**

Run: `npm test`

Expected: PASS for the whole suite. Test count up by 6 from Step 1.1's baseline.

- [ ] **Step 1.7: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit.

- [ ] **Step 1.8: Commit**

```bash
git add src/data/events.ts src/data/__tests__/events.test.ts
git commit -m "describePayload helper for event card UI (Cluster B · 5)"
```

---

## Task 2: EventOverlayScene

The Phaser scene with the three-state machine. Mirrors `camp_node_overlay_scene.ts`'s patterns: single overlay, `setOverlayState(s) → rerender()` switching, Back button on sub-states, `closeAndAdvance()` shape.

**Files:**
- Create: `src/scenes/event_overlay_scene.ts`

- [ ] **Step 2.1: Create the scene file**

Create `src/scenes/event_overlay_scene.ts` with this exact content:

```typescript
import * as Phaser from 'phaser';
import type { EventOutcome } from '../run/event_resolver';
import { applyEventChoice } from '../run/event_resolver';
import { chooseNextNode, currentNode } from '../run/run_state';
import { EVENTS, describePayload, type EventCard, type EventChoice } from '../data/events';
import type { Item } from '../data/types';
import { Paperdoll } from '../render/paperdoll';
import { heroToLoadout } from '../render/hero_loadout';
import { itemAffixDescription, itemDisplayName } from '../items/selectors';
import { createRngFromState } from '../util/rng';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 540;
const PANEL_H = 380;

const TITLE_Y = 110;
const BACK_X = 720;
const BACK_Y = TITLE_Y;

const BODY_Y = 150;
const BODY_WRAP_W = 460;

const CHOICE_X = PANEL_CX;
const CHOICE_W = 440;
const CHOICE_H = 64;
const CHOICE_Y_BASE = 235;
const CHOICE_STRIDE = 76;

const HERO_ROW_X = PANEL_CX;
const HERO_ROW_W = 460;
const HERO_ROW_H = 70;
const HERO_ROW_Y_BASE = 175;
const HERO_ROW_STRIDE = 80;

const OUTCOME_LINE_Y_BASE = 160;
const OUTCOME_LINE_HEIGHT = 22;
const DISMISS_BUTTON_Y = 360;
const DISMISS_BUTTON_W = 200;
const DISMISS_BUTTON_H = 36;

const RARITY_HEX: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const COLOR_HP_GAIN = '#44cc44';
const COLOR_HP_LOSS = '#cc6666';
const COLOR_GOLD = '#ffcc66';
const COLOR_LOST = '#aa66aa';

type OverlayState = 'card' | 'hero_picker' | 'outcome';

export class EventOverlayScene extends Phaser.Scene {
  private contentContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private backButton?: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
  private state: OverlayState = 'card';
  private pendingChoiceIndex: 0 | 1 = 0;
  private lastOutcome?: EventOutcome;

  constructor() {
    super('event_overlay');
  }

  create(): void {
    this.state = 'card';
    this.lastOutcome = undefined;
    this.buildBackgroundAndPanel();
    this.contentContainer = this.add.container(0, 0);
    this.rerender();

    this.input.keyboard?.on('keydown-ESC', () => this.handleEsc());
  }

  private buildBackgroundAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.titleText = this.add
      .text(PANEL_CX, TITLE_Y, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private rerender(): void {
    this.contentContainer.removeAll(true);
    this.destroyBackButton();

    const card = this.currentCard();

    if (this.state === 'card') {
      this.titleText.setText('Event');
      this.buildCard(card);
    } else if (this.state === 'hero_picker') {
      this.titleText.setText('Pick a hero to be Lost.');
      this.buildBackButton();
      this.buildHeroPicker();
    } else {
      this.titleText.setText('Event · Outcome');
      this.buildOutcome();
    }
  }

  private setOverlayState(s: OverlayState): void {
    this.state = s;
    this.rerender();
  }

  private destroyBackButton(): void {
    if (this.backButton) {
      this.backButton.bg.destroy();
      this.backButton.label.destroy();
      this.backButton = undefined;
    }
  }

  private buildBackButton(): void {
    const bg = this.add
      .rectangle(BACK_X, BACK_Y, 60, 26, 0x444444)
      .setStrokeStyle(1, 0x888888);
    const label = this.add
      .text(BACK_X, BACK_Y, 'Back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.setOverlayState('card'));
    this.backButton = { bg, label };
  }

  private currentCard(): EventCard {
    const run = appState.get().runState!;
    const node = currentNode(run);
    if (node.type !== 'event') {
      throw new Error(`event_overlay: current node is '${node.type}', not 'event'`);
    }
    return EVENTS[node.cardId];
  }

  private buildCard(card: EventCard): void {
    // Body text (word-wrapped).
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, BODY_Y, card.body, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#dddddd',
          align: 'center',
          wordWrap: { width: BODY_WRAP_W },
        })
        .setOrigin(0.5, 0),
    );

    // Two choice buttons.
    for (let i = 0; i < 2; i++) {
      this.buildChoiceButton(card.choices[i], i as 0 | 1);
    }
  }

  private buildChoiceButton(choice: EventChoice, index: 0 | 1): void {
    const y = CHOICE_Y_BASE + index * CHOICE_STRIDE;
    const subtitle = choice.payloads.length === 0
      ? 'Walk away'
      : choice.payloads.map(describePayload).join(' · ');

    const bg = this.add
      .rectangle(CHOICE_X, y, CHOICE_W, CHOICE_H, 0x333333)
      .setStrokeStyle(1, 0x888888);
    const label = this.add
      .text(CHOICE_X, y - 12, choice.label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const subtitleText = this.add
      .text(CHOICE_X, y + 14, subtitle, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#bbbbbb',
      })
      .setOrigin(0.5);

    this.contentContainer.add(bg);
    this.contentContainer.add(label);
    this.contentContainer.add(subtitleText);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onChoiceClicked(index));
  }

  private onChoiceClicked(index: 0 | 1): void {
    const card = this.currentCard();
    const choice = card.choices[index];
    const needsHeroPick = choice.payloads.some((p) => p.kind === 'lose_hero');
    if (needsHeroPick) {
      this.pendingChoiceIndex = index;
      this.setOverlayState('hero_picker');
    } else {
      this.applyChoice(index);
    }
  }

  private buildHeroPicker(): void {
    const run = appState.get().runState!;
    for (let i = 0; i < run.party.length; i++) {
      this.buildHeroRow(i);
    }
  }

  private buildHeroRow(heroIndex: number): void {
    const run = appState.get().runState!;
    const hero = run.party[heroIndex];
    const y = HERO_ROW_Y_BASE + heroIndex * HERO_ROW_STRIDE;

    const rowBg = this.add
      .rectangle(HERO_ROW_X, y, HERO_ROW_W, HERO_ROW_H, 0x222222)
      .setStrokeStyle(1, 0x444444);
    this.contentContainer.add(rowBg);

    // Paperdoll thumbnail (left).
    const doll = new Paperdoll(this, HERO_ROW_X - 200, y, heroToLoadout(hero));
    doll.setScale(2);
    this.contentContainer.add(doll);

    // Name + HP (center).
    this.contentContainer.add(
      this.add
        .text(HERO_ROW_X - 140, y - 10, hero.name, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );
    this.contentContainer.add(
      this.add
        .text(HERO_ROW_X - 140, y + 10, `${hero.currentHp}/${hero.maxHp} HP`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5),
    );

    // Pick button (right).
    const buttonBg = this.add
      .rectangle(HERO_ROW_X + 180, y, 60, 30, 0x335533)
      .setStrokeStyle(1, 0x66aa66);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(HERO_ROW_X + 180, y, 'Pick', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.applyChoice(this.pendingChoiceIndex, heroIndex));
  }

  private applyChoice(choiceIndex: 0 | 1, selectedHeroIndex?: number): void {
    const initialRs = appState.get().runState!;
    const node = currentNode(initialRs);
    if (node.type !== 'event') {
      throw new Error(`event_overlay: applyChoice called when current node is '${node.type}'`);
    }
    const card = EVENTS[node.cardId];
    const args = selectedHeroIndex !== undefined ? { selectedHeroIndex } : {};
    const rng = this.rng();
    const result = applyEventChoice(initialRs, card, choiceIndex, args, rng);
    const advanced = chooseNextNode(result.runState, node.nextNodeIds[0]);

    appState.update((s) => ({
      ...s,
      runState: advanced,
      runRngState: rng.getState(),
    }));

    this.lastOutcome = result.outcome;
    this.setOverlayState('outcome');
  }

  private rng() {
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      throw new Error('EventOverlayScene: runRngState missing');
    }
    return createRngFromState(rngState);
  }

  private buildOutcome(): void {
    const outcome = this.lastOutcome ?? {};
    const lines: { text: string; color: string; subText?: string }[] = [];

    if (outcome.hpChanges) {
      const run = appState.get().runState!;
      // After applyChoice, lose_hero may have removed a hero from party — but
      // hpChanges references the *pre-choice* heroIndex, which still maps to
      // initialRs.party. Use lastInitialPartyNames captured at apply-time would
      // be cleanest; for v1 we prefer to re-read from party where possible
      // (loseHero happens before hpChanges in payload order in current cards).
      // Fall back to a placeholder name if the hero is no longer present.
      // The current EVENTS deck never combines hp_delta_party with lose_hero
      // in the same choice, so this fallback is defensive and unreachable today.
      for (const ch of outcome.hpChanges) {
        const hero = run.party[ch.heroIndex];
        const name = hero ? hero.name : `Hero ${ch.heroIndex}`;
        const sign = ch.delta >= 0 ? '+' : '';
        lines.push({
          text: `${name}: ${sign}${ch.delta} HP`,
          color: ch.delta >= 0 ? COLOR_HP_GAIN : COLOR_HP_LOSS,
        });
      }
    }

    if (outcome.goldDelta !== undefined && outcome.goldDelta !== 0) {
      const sign = outcome.goldDelta >= 0 ? '+' : '';
      lines.push({
        text: `${sign}${outcome.goldDelta}g`,
        color: COLOR_GOLD,
      });
    }

    if (outcome.itemAdded) {
      const item: Item = outcome.itemAdded;
      const affix = itemAffixDescription(item);
      lines.push({
        text: `Got: ${itemDisplayName(item)}`,
        color: RARITY_HEX[item.rarity],
        subText: affix.length > 0 ? affix : undefined,
      });
    }

    if (outcome.heroLost) {
      lines.push({
        text: `${outcome.heroLost.heroName} is Lost.`,
        color: COLOR_LOST,
      });
    }

    if (lines.length === 0) {
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, OUTCOME_LINE_Y_BASE + 40, 'Nothing happened.', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#aaaaaa',
          })
          .setOrigin(0.5),
      );
    } else {
      let cursorY = OUTCOME_LINE_Y_BASE;
      for (const line of lines) {
        this.contentContainer.add(
          this.add
            .text(PANEL_CX, cursorY, line.text, {
              fontFamily: 'monospace',
              fontSize: '14px',
              color: line.color,
            })
            .setOrigin(0.5),
        );
        cursorY += OUTCOME_LINE_HEIGHT;
        if (line.subText) {
          this.contentContainer.add(
            this.add
              .text(PANEL_CX, cursorY, line.subText, {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#999999',
              })
              .setOrigin(0.5),
          );
          cursorY += 18;
        }
      }
    }

    // Dismiss button.
    const buttonBg = this.add
      .rectangle(PANEL_CX, DISMISS_BUTTON_Y, DISMISS_BUTTON_W, DISMISS_BUTTON_H, 0x553355)
      .setStrokeStyle(2, 0xaa66aa);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, DISMISS_BUTTON_Y, 'Dismiss', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.closeAndAdvance());
  }

  private handleEsc(): void {
    if (this.state === 'card') return;          // events are mandatory
    if (this.state === 'hero_picker') {
      this.setOverlayState('card');
      return;
    }
    this.closeAndAdvance();
  }

  private closeAndAdvance(): void {
    this.scene.stop();
    this.scene.resume('dungeon');
  }
}
```

- [ ] **Step 2.2: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit. The scene file uses imports from existing modules — `applyEventChoice` from `run/event_resolver`, `chooseNextNode`/`currentNode` from `run/run_state`, `EVENTS`/`describePayload` from `data/events` (Task 1), `Paperdoll` from `render/paperdoll`, `heroToLoadout` from `render/hero_loadout`, `itemAffixDescription`/`itemDisplayName` from `items/selectors`. If anything fails to resolve, fix the import path before continuing.

- [ ] **Step 2.3: Run tests**

Run: `npm test`

Expected: PASS — total unchanged from end of Task 1. The scene file is not yet imported anywhere (Task 3 wires it up), so it's compiled but inert.

- [ ] **Step 2.4: Commit**

```bash
git add src/scenes/event_overlay_scene.ts
git commit -m "EventOverlayScene with card/picker/outcome states (Cluster B · 5)"
```

---

## Task 3: Wire-up + `rebuildParty()` fix + verification

Replace the auto-skip stub in `dungeon_scene.ts` with a launch of the new scene. Add the `rebuildParty()` private method and call it from the existing RESUME handler and `processCombatReturn`. Register the scene in `main.ts`. Final manual-play verification.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts` — replace stub at ~lines 264-277; add `rebuildParty()`; call from RESUME handler (~lines 76-81) and `processCombatReturn` (~lines 113-117)
- Modify: `src/main.ts` — import + register

- [ ] **Step 3.1: Replace the auto-skip stub in `dungeon_scene.ts`**

Open `src/scenes/dungeon_scene.ts`. Find the block in `handleArrival()` that handles event nodes (around line 264):

```typescript
    if (node.type === 'event') {
      // Stub: auto-skip until Cluster B · 5 ships the event overlay.
      // Player sees event nodes in the icon row but doesn't engage with them.
      // Equivalent to a "Decline" choice — no payload applied.
      appState.update((s) => ({
        ...s,
        runState: chooseNextNode(s.runState!, node.nextNodeIds[0]),
      }));
      this.refreshHud();
      this.refreshNodeColors();
      this.refreshStatusBar();
      this.setState('walking_to_next');
      return;
    }
```

Replace it with:

```typescript
    if (node.type === 'event') {
      this.scene.launch('event_overlay');
      this.scene.pause();
      return;
    }
```

- [ ] **Step 3.2: Add `rebuildParty()` private method to `dungeon_scene.ts`**

In `src/scenes/dungeon_scene.ts`, find `private buildParty(): void {` (around line 183). Immediately *after* the closing brace of `buildParty()` (right before `private buildStatusBar(): void {`), insert:

```typescript
  private rebuildParty(): void {
    const x = this.partyContainer.x;
    this.partyContainer.destroy();
    this.buildParty();
    this.partyContainer.x = x;
  }
```

This destroys the old container, lets `buildParty()` re-read `runState.party` and `runState.lost`, and restores the container's x position so any in-progress walk animations don't visually jump.

- [ ] **Step 3.3: Call `rebuildParty()` from the RESUME handler**

In `src/scenes/dungeon_scene.ts`, find the RESUME handler in `create()` (around line 76):

```typescript
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.refreshNodeColors();
      this.refreshStatusBar();
      this.setState('walking_to_next');
    });
```

Add the `rebuildParty()` call before `setState`:

```typescript
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.refreshNodeColors();
      this.refreshStatusBar();
      this.rebuildParty();
      this.setState('walking_to_next');
    });
```

- [ ] **Step 3.4: Call `rebuildParty()` from `processCombatReturn`**

Still in `src/scenes/dungeon_scene.ts`, find `processCombatReturn` (around line 94). Locate the existing refresh trio (around line 115-117):

```typescript
    this.partyContainer.x = this.partyXForNode(this.pathPositionFor(run));

    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();
```

Add `rebuildParty()` after the refresh trio:

```typescript
    this.partyContainer.x = this.partyXForNode(this.pathPositionFor(run));

    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();
    this.rebuildParty();
```

This fixes the latent visual bug where a hero who Falls in combat (but the party survives) would leave a stale paperdoll in the row.

- [ ] **Step 3.5: Register `EventOverlayScene` in `main.ts`**

Open `src/main.ts`. Import the new class. Add this line in alphabetical position (between `EquipPanelScene` and `HospitalPanelScene` — keeping the existing alphabetic ordering):

```typescript
import { EventOverlayScene } from './scenes/event_overlay_scene';
```

Then add it to the `scene:` array. The other overlay scenes (`ShopOverlayScene`, `CampNodeOverlayScene`) are registered after the camp-screen and equip scenes; place `EventOverlayScene` alongside them:

```typescript
scene: [
  BootScene,
  CampScene,
  TavernPanelScene,
  BarracksPanelScene,
  BlacksmithPanelScene,
  HospitalPanelScene,
  NoticeboardPanelScene,
  DungeonScene,
  CombatScene,
  CampScreenScene,
  EquipPanelScene,
  PerkOverlayScene,
  ShopOverlayScene,
  CampNodeOverlayScene,
  EventOverlayScene,
  MainScene,
  ExplorerScene,
],
```

- [ ] **Step 3.6: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit. (`chooseNextNode` stays imported — it's also used by the fork-pick path further down in the file.)

- [ ] **Step 3.7: Run tests**

Run: `npm test`

Expected: PASS — same total as end of Task 1 (no new tests, no regressions).

- [ ] **Step 3.8: Run the build**

Run: `npm run build`

Expected: clean tsc + vite build to `dist/`. No errors.

- [ ] **Step 3.9: Manual play verification**

Per CLAUDE.md, browser smoke tests are skipped by default. Confirm with the user before driving the browser. If running manually:

1. `npm run dev`, open `http://localhost:5173`.
2. Start a Crypt run; advance until you hit an event node (the `❓` glyph in the path). Event nodes appear at forks ~40% of the time per `event_floor_integration` HISTORY entry — may need a few re-rolls.
3. Walk onto the event node; overlay opens with body + 2 choice buttons.
4. **Decline path:** click a choice with no payload (e.g., "Walk away"). Outcome panel shows "Nothing happened." Click Dismiss. Party walks to next node.
5. **HP-trade path:** click a choice with `hp_delta_party` (e.g., hooded_stranger's "Bleed and pass"). Outcome shows per-hero HP deltas in pink. Pack-gold delta in gold-yellow. Dismiss → party walks; HP bars in dungeon HUD reflect the change.
6. **Item-gain path:** trigger any card with `add_item` (e.g., dark_pact). Outcome shows `Got: {item}` in the rarity color, with affixes on a sub-line. Open Equip panel mid-run to verify the item is in the pack.
7. **Lose-hero path:** trigger a `lose_hero` card (cursed_mirror, the_pit, siren_song, or the Crypt-specific one). Click the lose-hero choice → hero picker appears with 3 paperdolls + Pick buttons. Click Back → returns to card. Click the choice again → picker re-appears. Pick a hero → outcome shows "{name} is Lost." in purple, plus any other payload (e.g., the rare item from cursed_mirror). Dismiss → dungeon party row shows 2 paperdolls + 🪦 tombstone for the Lost hero.
8. **ESC behavior:** ESC on card = no-op. ESC on hero picker = back to card. ESC on outcome = same as Dismiss.
9. **Combat-Fallen regression:** intentionally let a hero Fall in combat (party survives). After returning to dungeon, party row shows fewer paperdolls — confirms the bundled `rebuildParty()` fix in `processCombatReturn`.
10. **Refresh mid-card:** with the card overlay open, refresh the browser. Dungeon reopens, event still pending (state was not yet committed). Overlay re-launches.
11. **Refresh mid-outcome:** apply a choice that changes state (e.g., gold delta), then refresh before clicking Dismiss. Dungeon reopens at the *next* node (state was committed). Outcome readout is lost; vault/HP/etc. reflect the post-choice state.

- [ ] **Step 3.10: Commit**

```bash
git add src/scenes/dungeon_scene.ts src/main.ts
git commit -m "Wire EventOverlayScene + rebuildParty fix (Cluster B · 5)"
```

- [ ] **Step 3.11: Migrate TODO entry to HISTORY**

Per CLAUDE.md workflow, after a task ships its TODO entry moves to `HISTORY.md` with implementation-time context added. Offer this to the user — do not modify either file without explicit direction in the same turn.

---

## Self-review (already applied)

**Spec coverage:**
- Decisions table (§2 of spec) → reflected in scene structure, atomic persist+advance, RNG-from-state, ESC policy, rebuildParty inclusion.
- Three-state machine (§3) → Task 2 `OverlayState` type and `setOverlayState`/`rerender` pattern.
- Apply-choice flow (§4) → Task 2 `applyChoice` method.
- Outcome panel rendering rules (§5) → Task 2 `buildOutcome` method's per-field branches.
- Card-stage rendering with `describePayload` subtitle (§6) + helper (§6.1) → Task 1 + Task 2 `buildChoiceButton`.
- Hero-picker rendering with paperdoll + name + HP + Pick button (§7) → Task 2 `buildHeroPicker` / `buildHeroRow`.
- `rebuildParty()` fix (§8) → Task 3 steps 3.2–3.4.
- Replacing the auto-skip stub (§9) → Task 3 step 3.1.
- Files-touched table (§10) → matches Task list exactly.
- Save-schema invariance (§11) → no schema work in any task.
- Test plan (§12) → Task 1 covers describePayload; Task 3 manual-play covers everything else.

**Placeholder scan:** No `TODO`, `TBD`, or "implement later". Every code block is concrete.

**Type consistency:**
- `OverlayState`, `pendingChoiceIndex: 0 | 1`, `lastOutcome?: EventOutcome`, `EventCard`, `EventChoice` — used consistently.
- `describePayload` signature `(payload: EventPayload) => string` — defined in Task 1, called in Task 2 `buildChoiceButton`.
- `RARITY_HEX` triple — same `#cccccc / #4488ff / #ffcc66` used in equip_panel and blacksmith_panel.
- `closeAndAdvance` only stops + resumes; does NOT call `chooseNextNode` (that already ran inside `applyChoice`). Persistence semantics consistent with §4 of spec.
