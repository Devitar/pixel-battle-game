# Combat Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the combat scene that animates `resolveCombat`'s event log — replacing the dungeon scene's inline synchronous combat call. 3 heroes vs 3–4 enemies on a 960×540 canvas; per-event animations driven by an async loop; FF toggle (1× ↔ 3×); 800ms final-tableau linger; control returns to the dungeon scene which keeps its existing result/wipe panels. Also refactors `dungeon_scene.startCombatAtCurrentNode` from inline `resolveCombat` to `scene.start('combat')` with handoff via an ephemeral module-level slot.

**Architecture:** Six tasks, sequenced bottom-up. (1) `combat_handoff.ts` — pure module-level slot, no deps. (2) `enemy_placeholder.ts` — render layer for enemies until task 19 ships sprites. (3) `combat_actor.ts` — wraps `Paperdoll` (heroes) or `EnemyPlaceholder` (enemies); exposes lunge/pulse/flash/hp-tween/status-glyph/collapse animation primitives. (4) `combat_playback.ts` — `CombatPlayback` class running an async event-loop with look-ahead batching for AoE damage and post-death collapse. (5) `combat_scene.ts` + `main.ts` registration — Phaser scene shell that reads runState, runs `resolveCombat`, builds layout, kicks off playback, returns result via handoff. (6) `dungeon_scene.ts` refactor — replace inline `resolveCombat` with `scene.start('combat')` and consume handoff in `create()`.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4 (existing 493 tests stay green; no new tests — same precedent as tasks 13–16), Phaser 4 (Scene, Container, Rectangle, Text, Tween, time.delayedCall, tweens.timeScale, time.timeScale, Paperdoll), async/await for the playback driver.

**Spec:** `docs/superpowers/specs/2026-04-25-combat-scene-design.md`

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/combat_handoff.ts` | **Create** | Module-level ephemeral slot — `setCombatResult` / `consumeCombatResult`. Memory-only, never serialized to save. ~25 lines. |
| `src/render/enemy_placeholder.ts` | **Create** | 16×24 colored rect placeholder for enemies until task 19. Tinted by role (boss vs minion). Exposes `flash(color)` / `unflash()` for hit visuals. ~55 lines. |
| `src/render/combat_actor.ts` | **Create** | `class CombatActor extends Phaser.GameObjects.Container`. Body (Paperdoll \| EnemyPlaceholder), name text, HP bar, status strip, actor outline. Exposes `lunge`, `pulse`, `flashHit`, `flashHeal`, `setHpBar`, `setOutline`, `addStatusGlyph`, `removeStatusGlyph`, `spawnNumber`, `collapse`, `moveToSlotX`. ~190 lines. |
| `src/scenes/combat_playback.ts` | **Create** | `class CombatPlayback`. Async event-loop driver, per-event handlers, look-ahead batching for AoE/collapse, `setSpeed` for FF toggle. Owns the `runningState` mirror. ~290 lines. |
| `src/scenes/combat_scene.ts` | **Create** | Phaser scene shell (key `'combat'`). `create()` reads runState, runs engine, builds layout, kicks off `CombatPlayback`. On end, sets handoff and `scene.start('dungeon')`. Builds HUD chrome (round counter, round banner, action log, FF button) and `CombatActor`s. ~170 lines. |
| `src/main.ts` | **Modify** | Register `CombatScene` after `DungeonScene` and before `CampScreenScene`. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Refactor `startCombatAtCurrentNode` to `scene.start('combat')`; restructure `create()` to detect returning-from-combat via `consumeCombatResult()` and process result via a new `processCombatReturn` method. Remove the `resolveCombat` / `buildCombatState` imports. |

The bottom-up order ensures each task typechecks independently. Tasks 1–4 ship pure additions; Task 5 wires them into a runnable scene; Task 6 flips the dungeon scene to use the new path.

---

## Task 1: Combat handoff module

**Files:**
- Create: `src/scenes/combat_handoff.ts`

The simplest piece — a module-level ephemeral slot used to pass `CombatResult` + post-combat rng state from the combat scene back to the dungeon scene. Memory-only; intentionally not part of `appState` because it must never serialize to localStorage.

- [ ] **Step 1: Create `src/scenes/combat_handoff.ts`**

```ts
import type { CombatResult } from '../combat/types';

let pending: { result: CombatResult; rngStateAfter: number } | undefined;

export function setCombatResult(result: CombatResult, rngStateAfter: number): void {
  pending = { result, rngStateAfter };
}

export function consumeCombatResult(): { result: CombatResult; rngStateAfter: number } | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass.

- [ ] **Step 4: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/combat_handoff.ts
git commit -m "scenes: add combat_handoff module for ephemeral cross-scene result"
```

---

## Task 2: Enemy placeholder render module

**Files:**
- Create: `src/render/enemy_placeholder.ts`

Renders enemies as a tinted 16×24 rectangle until task 19 ships real sprites. Tint is by role: bosses dark red, minions muted brown. Exposes `flash(color)` / `unflash()` so `CombatActor` can drive hit-flash and heal-flash visuals on it.

- [ ] **Step 1: Create `src/render/enemy_placeholder.ts`**

```ts
import * as Phaser from 'phaser';
import { ENEMIES } from '../data/enemies';
import type { EnemyId } from '../data/types';

const RECT_W = 16;
const RECT_H = 24;
const TINT_BOSS = 0x882222;
const TINT_MINION = 0x664444;
const STROKE_COLOR = 0x222222;

export class EnemyPlaceholder extends Phaser.GameObjects.Container {
  private body: Phaser.GameObjects.Rectangle;
  private originalTint: number;

  constructor(scene: Phaser.Scene, x: number, y: number, enemyId: EnemyId) {
    super(scene, x, y);
    const def = ENEMIES[enemyId];
    this.originalTint = def.role === 'boss' ? TINT_BOSS : TINT_MINION;
    this.body = scene.add
      .rectangle(0, 0, RECT_W, RECT_H, this.originalTint)
      .setStrokeStyle(1, STROKE_COLOR);
    this.add(this.body);
    scene.add.existing(this);
  }

  flash(color: number): void {
    this.body.setFillStyle(color);
  }

  unflash(): void {
    this.body.setFillStyle(this.originalTint);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass.

- [ ] **Step 4: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/render/enemy_placeholder.ts
git commit -m "render: add EnemyPlaceholder for combat scene enemies"
```

---

## Task 3: CombatActor wrapper

**Files:**
- Create: `src/render/combat_actor.ts`

The combat scene's per-combatant container. Wraps a `Paperdoll` (for heroes) or `EnemyPlaceholder` (for enemies); owns the name label, HP bar (+ text), status strip, actor outline. Exposes the animation primitives (`lunge`, `pulse`, `flashHit`, `setHpBar`, `setOutline`, `addStatusGlyph`, `removeStatusGlyph`, `spawnNumber`, `collapse`, `moveToSlotX`) used by the playback driver in Task 4.

- [ ] **Step 1: Create `src/render/combat_actor.ts`**

```ts
import * as Phaser from 'phaser';
import type { CombatantId } from '../combat/types';
import type { EnemyId, StatusId } from '../data/types';
import type { Hero } from '../heroes/hero';
import { EnemyPlaceholder } from './enemy_placeholder';
import { heroToLoadout } from './hero_loadout';
import { Paperdoll } from './paperdoll';

const STATUS_GLYPHS: Partial<Record<StatusId, { letter: string; color: string }>> = {
  stunned: { letter: 'S', color: '#ff9944' },
  bulwark: { letter: 'B', color: '#44aacc' },
  taunting: { letter: 'T', color: '#ffcc44' },
  marked: { letter: 'M', color: '#cc4444' },
  blessed: { letter: '+', color: '#ffdd66' },
  rotting: { letter: 'r', color: '#aa44aa' },
  frailty: { letter: '−', color: '#888888' },
};
const STATUS_FALLBACK = { letter: '?', color: '#888888' };

const HP_BAR_W = 56;
const HP_BAR_H = 4;
const STATUS_SPACING = 10;
const STATUS_FONT = '10px';
const OUTLINE_W = 60;
const OUTLINE_H = 80;
const OUTLINE_COLOR = 0xffcc66;
const FLASH_HIT_DURATION = 100;
const FLASH_HIT_COLOR = 0xffffff;
const FLASH_HEAL_COLOR = 0x44ff44;
const LUNGE_DISTANCE = 20;
const LUNGE_DURATION = 350;
const PULSE_DURATION = 250;
const PULSE_SCALE = 1.1;
const HP_TWEEN_DURATION = 200;
const NUMBER_RISE = 20;
const NUMBER_DURATION = 400;
const COLLAPSE_DURATION = 400;
const COLLAPSE_DROP = 8;
const SLOT_MOVE_DURATION = 300;

const NAME_Y = -56;
const HPBAR_Y = -44;
const HPTEXT_Y = -38;
const STATUS_Y = 38;

export type CombatActorKind = 'hero' | 'enemy';

export interface HeroActorInit {
  kind: 'hero';
  combatantId: CombatantId;
  displayName: string;
  hero: Hero;
  currentHp: number;
  maxHp: number;
}

export interface EnemyActorInit {
  kind: 'enemy';
  combatantId: CombatantId;
  displayName: string;
  enemyId: EnemyId;
  currentHp: number;
  maxHp: number;
  bodyScale?: number;
}

export type CombatActorInit = HeroActorInit | EnemyActorInit;

export class CombatActor extends Phaser.GameObjects.Container {
  readonly combatantId: CombatantId;
  private body: Paperdoll | EnemyPlaceholder;
  private bodyScale: number;
  private nameText: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private hpText: Phaser.GameObjects.Text;
  private statusStrip: Phaser.GameObjects.Container;
  private statusGlyphs: Map<StatusId, Phaser.GameObjects.Text> = new Map();
  private actorOutline: Phaser.GameObjects.Rectangle;
  private currentHp: number;
  private maxHp: number;
  private bodyType: CombatActorKind;

  constructor(scene: Phaser.Scene, x: number, y: number, init: CombatActorInit) {
    super(scene, x, y);
    this.combatantId = init.combatantId;
    this.currentHp = init.currentHp;
    this.maxHp = init.maxHp;
    this.bodyType = init.kind;

    if (init.kind === 'hero') {
      this.body = new Paperdoll(scene, 0, 0, heroToLoadout(init.hero));
      this.bodyScale = 3;
    } else {
      this.body = new EnemyPlaceholder(scene, 0, 0, init.enemyId);
      this.bodyScale = init.bodyScale ?? 3;
    }
    this.body.setScale(this.bodyScale);
    this.add(this.body);

    this.actorOutline = scene.add
      .rectangle(0, 0, OUTLINE_W, OUTLINE_H)
      .setStrokeStyle(2, OUTLINE_COLOR)
      .setFillStyle();
    this.actorOutline.setAlpha(0);
    this.add(this.actorOutline);

    this.nameText = scene.add
      .text(0, NAME_Y, init.displayName, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add(this.nameText);

    this.hpBarBg = scene.add.rectangle(0, HPBAR_Y, HP_BAR_W, HP_BAR_H, 0x333333);
    this.add(this.hpBarBg);
    this.hpBarFill = scene.add
      .rectangle(-HP_BAR_W / 2, HPBAR_Y, HP_BAR_W, HP_BAR_H, this.hpColor(1))
      .setOrigin(0, 0.5);
    this.add(this.hpBarFill);

    this.hpText = scene.add
      .text(0, HPTEXT_Y, `${init.currentHp}/${init.maxHp}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#cccccc',
      })
      .setOrigin(0.5);
    this.add(this.hpText);

    this.statusStrip = scene.add.container(0, STATUS_Y);
    this.add(this.statusStrip);

    this.refreshHpVisual();
    scene.add.existing(this);
  }

  setOutline(active: boolean): void {
    this.actorOutline.setAlpha(active ? 1 : 0);
  }

  lunge(toward: 'left' | 'right'): Promise<void> {
    const direction = toward === 'right' ? 1 : -1;
    const startX = this.x;
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        x: startX + direction * LUNGE_DISTANCE,
        duration: LUNGE_DURATION / 3,
        yoyo: true,
        hold: 50,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.x = startX;
          resolve();
        },
      });
    });
  }

  pulse(): Promise<void> {
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this.body,
        scale: this.bodyScale * PULSE_SCALE,
        duration: PULSE_DURATION / 2,
        yoyo: true,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          this.body.setScale(this.bodyScale);
          resolve();
        },
      });
    });
  }

  flashHit(): Promise<void> {
    return this.flashColor(FLASH_HIT_COLOR);
  }

  flashHeal(): Promise<void> {
    return this.flashColor(FLASH_HEAL_COLOR);
  }

  private flashColor(color: number): Promise<void> {
    if (this.bodyType === 'enemy') {
      (this.body as EnemyPlaceholder).flash(color);
      return new Promise(resolve => {
        this.scene.time.delayedCall(FLASH_HIT_DURATION, () => {
          (this.body as EnemyPlaceholder).unflash();
          resolve();
        });
      });
    }
    // Hero paperdoll: tint each layered child
    const paperdoll = this.body as Paperdoll;
    for (const child of paperdoll.list) {
      const img = child as Phaser.GameObjects.Image;
      if (img.setTintFill) img.setTintFill(color);
    }
    return new Promise(resolve => {
      this.scene.time.delayedCall(FLASH_HIT_DURATION, () => {
        for (const child of paperdoll.list) {
          const img = child as Phaser.GameObjects.Image;
          if (img.clearTint) img.clearTint();
        }
        resolve();
      });
    });
  }

  setHpBar(currentHp: number, maxHp: number): Promise<void> {
    const clamped = Math.max(0, Math.min(maxHp, currentHp));
    this.currentHp = clamped;
    this.maxHp = maxHp;
    const ratio = maxHp > 0 ? clamped / maxHp : 0;
    const targetWidth = HP_BAR_W * ratio;
    this.hpBarFill.setFillStyle(this.hpColor(ratio));
    this.hpText.setText(`${clamped}/${maxHp}`);
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this.hpBarFill,
        width: targetWidth,
        duration: HP_TWEEN_DURATION,
        ease: 'Quad.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  spawnNumber(text: string, color: string): void {
    const num = this.scene.add
      .text(this.x, this.y - 30, text, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.scene.tweens.add({
      targets: num,
      y: num.y - NUMBER_RISE,
      alpha: 0,
      duration: NUMBER_DURATION,
      ease: 'Quad.easeOut',
      onComplete: () => num.destroy(),
    });
  }

  addStatusGlyph(statusId: StatusId): void {
    if (this.statusGlyphs.has(statusId)) return;
    const info = STATUS_GLYPHS[statusId] ?? STATUS_FALLBACK;
    const glyph = this.scene.add
      .text(0, 0, info.letter, {
        fontFamily: 'monospace',
        fontSize: STATUS_FONT,
        color: info.color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.statusGlyphs.set(statusId, glyph);
    this.statusStrip.add(glyph);
    this.scene.tweens.add({
      targets: glyph,
      scale: { from: 1.3, to: 1 },
      duration: 150,
      ease: 'Back.easeOut',
    });
    this.relayoutStatusStrip();
  }

  removeStatusGlyph(statusId: StatusId): void {
    const glyph = this.statusGlyphs.get(statusId);
    if (!glyph) return;
    this.statusGlyphs.delete(statusId);
    this.scene.tweens.add({
      targets: glyph,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        glyph.destroy();
        this.relayoutStatusStrip();
      },
    });
  }

  clearStatusGlyphs(): void {
    for (const glyph of this.statusGlyphs.values()) glyph.destroy();
    this.statusGlyphs.clear();
    this.relayoutStatusStrip();
  }

  collapse(): Promise<void> {
    this.clearStatusGlyphs();
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        y: this.y + COLLAPSE_DROP,
        duration: COLLAPSE_DURATION,
        ease: 'Quad.easeIn',
        onComplete: () => resolve(),
      });
    });
  }

  moveToSlotX(targetX: number): Promise<void> {
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        x: targetX,
        duration: SLOT_MOVE_DURATION,
        ease: 'Quad.easeInOut',
        onComplete: () => resolve(),
      });
    });
  }

  jiggle(): Promise<void> {
    const startX = this.x;
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        x: startX + 4,
        duration: 50,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          this.x = startX;
          resolve();
        },
      });
    });
  }

  private relayoutStatusStrip(): void {
    const glyphs = Array.from(this.statusGlyphs.values());
    const totalWidth = (glyphs.length - 1) * STATUS_SPACING;
    const startX = -totalWidth / 2;
    glyphs.forEach((g, i) => g.setPosition(startX + i * STATUS_SPACING, 0));
  }

  private refreshHpVisual(): void {
    const ratio = this.maxHp > 0 ? this.currentHp / this.maxHp : 0;
    this.hpBarFill.setSize(HP_BAR_W * ratio, HP_BAR_H);
    this.hpBarFill.setFillStyle(this.hpColor(ratio));
    this.hpText.setText(`${this.currentHp}/${this.maxHp}`);
  }

  private hpColor(ratio: number): number {
    if (ratio > 0.5) return 0x44aa44;
    if (ratio > 0.25) return 0xaaaa44;
    return 0xaa4444;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass.

- [ ] **Step 4: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/render/combat_actor.ts
git commit -m "render: add CombatActor wrapper with animation primitives"
```

---

## Task 4: CombatPlayback driver

**Files:**
- Create: `src/scenes/combat_playback.ts`

The async event-loop driver. Iterates over `result.events`; for each, dispatches to a per-event handler that tweens visuals via `CombatActor`'s API and awaits completion. Look-ahead batching collapses AoE damage events into one concurrent flash and post-death `position_changed{reason:'collapse'}` events into one concurrent slide. The driver owns the `runningState` mirror (HP, slot, statuses, isDead, side, displayName per combatant) — engine events carry deltas; mirror tracks current state.

FF toggle: `setSpeed(s)` sets `scene.tweens.timeScale = s` and `scene.time.timeScale = s`. Both reset to 1 in `CombatScene.shutdown()`.

- [ ] **Step 1: Create `src/scenes/combat_playback.ts`**

```ts
import * as Phaser from 'phaser';
import { ABILITIES } from '../data/abilities';
import type { AbilityId, SlotIndex, StatusId } from '../data/types';
import type {
  Combatant,
  CombatantId,
  CombatEvent,
  CombatSide,
  CombatState,
} from '../combat/types';
import type { CombatActor } from '../render/combat_actor';

export interface CombatPlaybackHud {
  roundCounter: Phaser.GameObjects.Text;
  roundBanner: Phaser.GameObjects.Text;
  actionLog: Phaser.GameObjects.Text;
}

interface RunningEntry {
  hp: number;
  maxHp: number;
  slot: SlotIndex;
  statuses: Set<StatusId>;
  isDead: boolean;
  side: CombatSide;
  displayName: string;
}

const PARTY_X: Record<SlotIndex, number> = { 1: 400, 2: 320, 3: 240, 4: 160 } as Record<SlotIndex, number>;
const ENEMY_X: Record<SlotIndex, number> = { 1: 560, 2: 640, 3: 720, 4: 800 } as Record<SlotIndex, number>;

const D_ROUND_BANNER_IN = 100;
const D_ROUND_BANNER_HOLD = 100;
const D_ROUND_BANNER_OUT = 200;
const D_TURN_START = 100;
const D_TURN_SKIP_STUNNED = 250;
const D_SHUFFLE = 200;
const D_DAMAGE = 200;
const D_HEAL = 200;
const D_STATUS_APPLIED = 150;
const D_STATUS_EXPIRED = 100;
const D_DEATH = 500;
const D_ROUND_END = 100;
const D_FINAL_LINGER = 800;
const D_LOG_PULSE = 80;

const COLOR_DAMAGE = '#ff5555';
const COLOR_HEAL = '#44ff44';

function slotX(side: CombatSide, slot: SlotIndex): number {
  return side === 'player' ? PARTY_X[slot] : ENEMY_X[slot];
}

function hasDamageEffect(abilityId: AbilityId): boolean {
  const ability = ABILITIES[abilityId];
  return ability.effects.some(e => e.kind === 'damage');
}

function isMeleeAbility(abilityId: AbilityId): boolean {
  const ability = ABILITIES[abilityId];
  return ability.canCastFrom.includes(1) && hasDamageEffect(abilityId);
}

export class CombatPlayback {
  private scene: Phaser.Scene;
  private events: readonly CombatEvent[];
  private actors: Map<CombatantId, CombatActor>;
  private hud: CombatPlaybackHud;
  private running: Map<CombatantId, RunningEntry>;
  private i = 0;
  private aborted = false;
  private currentOutlineId: CombatantId | undefined;
  private currentLogLine = '';
  onComplete?: () => void;

  constructor(
    scene: Phaser.Scene,
    events: readonly CombatEvent[],
    actors: Map<CombatantId, CombatActor>,
    hud: CombatPlaybackHud,
    initialState: CombatState,
    displayNames: Map<CombatantId, string>,
  ) {
    this.scene = scene;
    this.events = events;
    this.actors = actors;
    this.hud = hud;
    this.running = new Map();
    for (const c of initialState.combatants) {
      this.running.set(c.id, {
        hp: c.currentHp,
        maxHp: c.maxHp,
        slot: c.slot,
        statuses: new Set(),
        isDead: c.isDead,
        side: c.side,
        displayName: displayNames.get(c.id) ?? c.id,
      });
    }
  }

  setSpeed(s: 1 | 3): void {
    this.scene.tweens.timeScale = s;
    this.scene.time.timeScale = s;
  }

  abort(): void {
    this.aborted = true;
  }

  async run(): Promise<void> {
    while (this.i < this.events.length) {
      if (this.aborted || !this.scene.sys.isActive()) return;
      const ev = this.events[this.i];
      const consumed = await this.dispatch(ev);
      this.i += consumed;
    }
    await this.delay(D_FINAL_LINGER);
    if (!this.aborted) this.onComplete?.();
  }

  private async dispatch(ev: CombatEvent): Promise<number> {
    switch (ev.kind) {
      case 'combat_start': return this.onCombatStart();
      case 'round_start': return this.onRoundStart(ev);
      case 'turn_start': return this.onTurnStart(ev);
      case 'turn_skipped': return this.onTurnSkipped(ev);
      case 'ability_cast': return this.onAbilityCast(ev);
      case 'shuffle': return this.onShuffle(ev);
      case 'damage_applied': return this.onDamage(ev);
      case 'heal_applied': return this.onHeal(ev);
      case 'status_applied': return this.onStatusApplied(ev);
      case 'status_expired': return this.onStatusExpired(ev);
      case 'position_changed': return this.onPositionChanged(ev);
      case 'death': return this.onDeath(ev);
      case 'round_end': return this.onRoundEnd();
      case 'combat_end': return this.onCombatEnd();
    }
  }

  private async onCombatStart(): Promise<number> {
    return 1;
  }

  private async onRoundStart(ev: Extract<CombatEvent, { kind: 'round_start' }>): Promise<number> {
    this.hud.roundCounter.setText(`Round ${ev.round}`);
    this.hud.roundBanner.setText(`Round ${ev.round}`);
    this.setLog(`— Round ${ev.round} —`);
    await new Promise<void>(resolve => {
      this.scene.tweens.add({
        targets: this.hud.roundBanner,
        alpha: 1,
        duration: D_ROUND_BANNER_IN,
        onComplete: () => resolve(),
      });
    });
    await this.delay(D_ROUND_BANNER_HOLD);
    if (this.aborted) return 1;
    await new Promise<void>(resolve => {
      this.scene.tweens.add({
        targets: this.hud.roundBanner,
        alpha: 0,
        duration: D_ROUND_BANNER_OUT,
        onComplete: () => resolve(),
      });
    });
    return 1;
  }

  private async onTurnStart(ev: Extract<CombatEvent, { kind: 'turn_start' }>): Promise<number> {
    if (this.currentOutlineId) {
      this.actors.get(this.currentOutlineId)?.setOutline(false);
    }
    this.actors.get(ev.combatantId)?.setOutline(true);
    this.currentOutlineId = ev.combatantId;
    await this.delay(D_TURN_START);
    return 1;
  }

  private async onTurnSkipped(ev: Extract<CombatEvent, { kind: 'turn_skipped' }>): Promise<number> {
    if (ev.reason === 'dead') return 1;
    const actor = this.actors.get(ev.combatantId);
    actor?.spawnNumber('Z', '#aaaaff');
    await this.delay(D_TURN_SKIP_STUNNED);
    return 1;
  }

  private async onAbilityCast(ev: Extract<CombatEvent, { kind: 'ability_cast' }>): Promise<number> {
    const ability = ABILITIES[ev.abilityId];
    const caster = this.actors.get(ev.casterId);
    const casterEntry = this.running.get(ev.casterId);
    if (!caster || !casterEntry) return 1;

    const targetNames = ev.targetIds
      .map(id => this.running.get(id)?.displayName ?? id)
      .join(', ');
    const isAoE = ev.targetIds.length > 1;
    const log = isAoE
      ? `${casterEntry.displayName} casts ${ability.name}`
      : `${casterEntry.displayName} casts ${ability.name} on ${targetNames}`;
    this.setLog(log);

    if (isAoE) {
      // Look ahead: consume contiguous damage_applied events with same casterId.
      const followingDamages: Array<Extract<CombatEvent, { kind: 'damage_applied' }>> = [];
      let j = this.i + 1;
      while (j < this.events.length) {
        const next = this.events[j];
        if (next.kind === 'damage_applied' && next.sourceId === ev.casterId) {
          followingDamages.push(next);
          j++;
        } else {
          break;
        }
      }
      // Caster pulse + concurrent target flashes/HP-tweens/numbers.
      const pulsePromise = caster.pulse();
      const damagePromises = followingDamages.map(d => this.applyDamageVisual(d, true));
      await Promise.all([pulsePromise, ...damagePromises]);
      // Append damage summary to log.
      if (followingDamages.length > 0) {
        const dmgs = followingDamages.map(d => d.amount).join('/');
        this.appendLog(` — ${dmgs} dmg`);
      }
      return 1 + followingDamages.length;
    }

    if (isMeleeAbility(ev.abilityId)) {
      const direction: 'left' | 'right' = casterEntry.side === 'player' ? 'right' : 'left';
      await caster.lunge(direction);
    } else {
      await caster.pulse();
    }
    return 1;
  }

  private async onShuffle(ev: Extract<CombatEvent, { kind: 'shuffle' }>): Promise<number> {
    const actor = this.actors.get(ev.combatantId);
    const entry = this.running.get(ev.combatantId);
    if (entry) this.setLog(`${entry.displayName} shuffles`);
    if (actor) await actor.jiggle();
    else await this.delay(D_SHUFFLE);
    return 1;
  }

  private async onDamage(ev: Extract<CombatEvent, { kind: 'damage_applied' }>): Promise<number> {
    await this.applyDamageVisual(ev, false);
    this.appendLog(` — ${ev.amount} dmg`);
    return 1;
  }

  private async applyDamageVisual(
    ev: Extract<CombatEvent, { kind: 'damage_applied' }>,
    concurrent: boolean,
  ): Promise<void> {
    const actor = this.actors.get(ev.targetId);
    const entry = this.running.get(ev.targetId);
    if (!actor || !entry) return;
    const newHp = Math.max(0, entry.hp - ev.amount);
    entry.hp = newHp;
    actor.spawnNumber(`-${ev.amount}`, COLOR_DAMAGE);
    const flashPromise = actor.flashHit();
    const hpPromise = actor.setHpBar(newHp, entry.maxHp);
    if (concurrent) {
      await Promise.all([flashPromise, hpPromise]);
    } else {
      await Promise.all([flashPromise, hpPromise]);
      // single-hit handler also waits the base duration for spacing
      await this.delay(Math.max(0, D_DAMAGE - 200));
    }
  }

  private async onHeal(ev: Extract<CombatEvent, { kind: 'heal_applied' }>): Promise<number> {
    const actor = this.actors.get(ev.targetId);
    const entry = this.running.get(ev.targetId);
    const sourceEntry = this.running.get(ev.sourceId);
    if (!actor || !entry) return 1;
    const newHp = Math.min(entry.maxHp, entry.hp + ev.amount);
    entry.hp = newHp;
    actor.spawnNumber(`+${ev.amount}`, COLOR_HEAL);
    const flashPromise = actor.flashHeal();
    const hpPromise = actor.setHpBar(newHp, entry.maxHp);
    if (sourceEntry) {
      this.setLog(`${sourceEntry.displayName} heals ${entry.displayName} — +${ev.amount} HP`);
    }
    await Promise.all([flashPromise, hpPromise]);
    return 1;
  }

  private async onStatusApplied(ev: Extract<CombatEvent, { kind: 'status_applied' }>): Promise<number> {
    const actor = this.actors.get(ev.targetId);
    const entry = this.running.get(ev.targetId);
    if (entry) entry.statuses.add(ev.statusId);
    actor?.addStatusGlyph(ev.statusId);
    this.appendLog(` (${ev.statusId})`);
    await this.delay(D_STATUS_APPLIED);
    return 1;
  }

  private async onStatusExpired(ev: Extract<CombatEvent, { kind: 'status_expired' }>): Promise<number> {
    const actor = this.actors.get(ev.targetId);
    const entry = this.running.get(ev.targetId);
    if (entry) {
      entry.statuses.delete(ev.statusId);
      this.setLog(`${entry.displayName} is no longer ${ev.statusId}`);
    }
    actor?.removeStatusGlyph(ev.statusId);
    await this.delay(D_STATUS_EXPIRED);
    return 1;
  }

  private async onPositionChanged(
    ev: Extract<CombatEvent, { kind: 'position_changed' }>,
  ): Promise<number> {
    const actor = this.actors.get(ev.combatantId);
    const entry = this.running.get(ev.combatantId);
    if (!actor || !entry) return 1;
    entry.slot = ev.toSlot;
    if (ev.toSlot >= 1) {
      await actor.moveToSlotX(slotX(entry.side, ev.toSlot));
    }
    return 1;
  }

  private async onDeath(ev: Extract<CombatEvent, { kind: 'death' }>): Promise<number> {
    const actor = this.actors.get(ev.combatantId);
    const entry = this.running.get(ev.combatantId);
    if (entry) {
      entry.isDead = true;
      entry.statuses.clear();
      this.setLog(`${entry.displayName} falls`);
    }
    if (actor) await actor.collapse();

    // Look ahead: collapse position_changed events that follow.
    const collapses: Array<Extract<CombatEvent, { kind: 'position_changed' }>> = [];
    let j = this.i + 1;
    while (j < this.events.length) {
      const next = this.events[j];
      if (next.kind === 'position_changed' && next.reason === 'collapse') {
        collapses.push(next);
        j++;
      } else {
        break;
      }
    }
    if (collapses.length > 0) {
      const promises = collapses.map(c => {
        const cActor = this.actors.get(c.combatantId);
        const cEntry = this.running.get(c.combatantId);
        if (!cActor || !cEntry) return Promise.resolve();
        cEntry.slot = c.toSlot;
        if (c.toSlot < 1) return Promise.resolve();
        return cActor.moveToSlotX(slotX(cEntry.side, c.toSlot));
      });
      await Promise.all(promises);
    }
    return 1 + collapses.length;
  }

  private async onRoundEnd(): Promise<number> {
    await this.delay(D_ROUND_END);
    return 1;
  }

  private async onCombatEnd(): Promise<number> {
    return 1;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => this.scene.time.delayedCall(ms, () => resolve()));
  }

  private setLog(text: string): void {
    this.currentLogLine = text;
    this.hud.actionLog.setText(text);
    this.hud.actionLog.setAlpha(0.4);
    this.scene.tweens.add({
      targets: this.hud.actionLog,
      alpha: 1,
      duration: D_LOG_PULSE,
    });
  }

  private appendLog(suffix: string): void {
    this.currentLogLine = this.currentLogLine + suffix;
    this.hud.actionLog.setText(this.currentLogLine);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass.

- [ ] **Step 4: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/combat_playback.ts
git commit -m "scenes: add CombatPlayback driver for combat scene event loop"
```

---

## Task 5: Combat scene + main.ts registration

**Files:**
- Create: `src/scenes/combat_scene.ts`
- Modify: `src/main.ts`

The Phaser scene shell. `create()` reads `runState`/`runRngState` from `appState`, builds the combat state, restores rng, calls `resolveCombat`, builds the layout (background, HUD chrome, `CombatActor`s for each combatant), and kicks off `CombatPlayback`. On playback complete, sets the handoff and transitions to `'dungeon'`. On scene shutdown, aborts playback and resets `tweens.timeScale` / `time.timeScale`.

After this task lands, the combat scene is registered but **nothing launches it yet** — Task 6 wires the dungeon scene to `scene.start('combat')`. To smoke-test in isolation between tasks, you can briefly add a temporary keyboard shortcut in the dungeon scene, but the plan keeps the smoke test in Task 6 once the full path is wired.

- [ ] **Step 1: Create `src/scenes/combat_scene.ts`**

```ts
import * as Phaser from 'phaser';
import { resolveCombat } from '../combat/combat';
import type { CombatantId, CombatState } from '../combat/types';
import { ENEMIES } from '../data/enemies';
import type { Hero } from '../heroes/hero';
import { CombatActor } from '../render/combat_actor';
import { buildCombatState } from '../run/combat_setup';
import { currentNode, type RunState } from '../run/run_state';
import { createRngFromState } from '../util/rng';
import { setCombatResult } from './combat_handoff';
import { CombatPlayback, type CombatPlaybackHud } from './combat_playback';
import { appState } from './app_state';

const PARTY_X = [0, 400, 320, 240] as const; // index by SlotIndex 1..3
const ENEMY_X = [0, 560, 640, 720, 800] as const; // index by SlotIndex 1..4
const ROW_Y = 300;
const BG_COLOR = 0x1a1020;
const GROUND_Y = 480;
const ROUND_COUNTER_Y = 24;
const ROUND_BANNER_Y = 200;
const ACTION_LOG_Y = 510;
const FF_X = 940;
const FF_Y = 24;
const FF_W = 60;
const FF_H = 24;
const BOSS_BODY_SCALE = 4.5; // 1.5× the minion 3× scale

export class CombatScene extends Phaser.Scene {
  private actors = new Map<CombatantId, CombatActor>();
  private playback?: CombatPlayback;
  private speed: 1 | 3 = 1;
  private ffBg!: Phaser.GameObjects.Rectangle;
  private ffLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('combat');
  }

  create(): void {
    const state = appState.get();
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('CombatScene entered without active in_dungeon runState');
      this.scene.start('camp');
      return;
    }
    if (state.runRngState === undefined) {
      console.warn('CombatScene entered without runRngState');
      this.scene.start('camp');
      return;
    }

    const run = state.runState;
    const node = currentNode(run);
    const rng = createRngFromState(state.runRngState);
    const combatState = buildCombatState(run.party, node.encounter);
    const result = resolveCombat(combatState, rng);

    this.buildBackground();
    const hud = this.buildHud();
    const displayNames = this.buildDisplayNames(run, combatState);
    this.buildActors(combatState, run, displayNames);

    this.playback = new CombatPlayback(
      this,
      result.events,
      this.actors,
      hud,
      combatState,
      displayNames,
    );
    this.playback.onComplete = () => {
      setCombatResult(result, rng.getState());
      this.scene.start('dungeon');
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.playback?.abort();
      this.tweens.timeScale = 1;
      this.time.timeScale = 1;
    });

    void this.playback.run();
  }

  private buildBackground(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, BG_COLOR).setOrigin(0, 0);
    this.add.rectangle(0, GROUND_Y, this.scale.width, 1, 0x555555).setOrigin(0, 0);
  }

  private buildHud(): CombatPlaybackHud {
    const roundCounter = this.add
      .text(480, ROUND_COUNTER_Y, 'Round 1', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    const roundBanner = this.add
      .text(480, ROUND_BANNER_Y, '', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffcc66',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const actionLog = this.add
      .text(480, ACTION_LOG_Y, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.ffBg = this.add
      .rectangle(FF_X, FF_Y, FF_W, FF_H, 0x222222)
      .setOrigin(1, 0)
      .setStrokeStyle(2, 0x666666);
    this.ffLabel = this.add
      .text(FF_X - FF_W / 2, FF_Y + FF_H / 2, '1×', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.ffBg.setInteractive({ useHandCursor: true });
    this.ffBg.on('pointerdown', () => this.toggleSpeed());
    this.input.keyboard?.on('keydown-F', () => this.toggleSpeed());

    return { roundCounter, roundBanner, actionLog };
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 3 : 1;
    this.playback?.setSpeed(this.speed);
    this.ffLabel.setText(`${this.speed}×`);
    this.ffBg.setStrokeStyle(2, this.speed === 3 ? 0x44cc44 : 0x666666);
  }

  private buildDisplayNames(
    run: RunState,
    combatState: CombatState,
  ): Map<CombatantId, string> {
    const names = new Map<CombatantId, string>();
    for (let i = 0; i < run.party.length; i++) {
      names.set(`p${i}`, run.party[i].name);
    }
    for (const c of combatState.combatants) {
      if (c.side === 'enemy' && c.enemyId) {
        names.set(c.id, ENEMIES[c.enemyId].name);
      }
    }
    return names;
  }

  private buildActors(
    combatState: CombatState,
    run: RunState,
    displayNames: Map<CombatantId, string>,
  ): void {
    for (const c of combatState.combatants) {
      const x = c.side === 'player' ? PARTY_X[c.slot] : ENEMY_X[c.slot];
      const displayName = displayNames.get(c.id) ?? c.id;
      let actor: CombatActor;
      if (c.side === 'player') {
        const heroIdx = parseInt(c.id.slice(1), 10);
        const hero: Hero = run.party[heroIdx];
        actor = new CombatActor(this, x, ROW_Y, {
          kind: 'hero',
          combatantId: c.id,
          displayName,
          hero,
          currentHp: c.currentHp,
          maxHp: c.maxHp,
        });
      } else {
        const enemyId = c.enemyId!;
        const isBoss = ENEMIES[enemyId].role === 'boss';
        actor = new CombatActor(this, x, ROW_Y, {
          kind: 'enemy',
          combatantId: c.id,
          displayName,
          enemyId,
          currentHp: c.currentHp,
          maxHp: c.maxHp,
          bodyScale: isBoss ? BOSS_BODY_SCALE : 3,
        });
      }
      this.actors.set(c.id, actor);
    }
  }
}
```

- [ ] **Step 2: Modify `src/main.ts` to register `CombatScene`**

Add the import and place `CombatScene` in the scene array between `DungeonScene` and `CampScreenScene`. The full updated body:

```ts
import * as Phaser from 'phaser';
import './style.css';
import { BarracksPanelScene } from './scenes/barracks_panel_scene';
import { BootScene } from './scenes/boot_scene';
import { CampScene } from './scenes/camp_scene';
import { CampScreenScene } from './scenes/camp_screen_scene';
import { CombatScene } from './scenes/combat_scene';
import { ExplorerScene } from './scenes/dev/explorer_scene';
import { MainScene } from './scenes/dev/main_scene';
import { DungeonScene } from './scenes/dungeon_scene';
import { NoticeboardPanelScene } from './scenes/noticeboard_panel_scene';
import { TavernPanelScene } from './scenes/tavern_panel_scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    NoticeboardPanelScene,
    DungeonScene,
    CombatScene,
    CampScreenScene,
    MainScene,
    ExplorerScene,
  ],
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass.

- [ ] **Step 5: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/combat_scene.ts src/main.ts
git commit -m "scenes: add CombatScene with HUD, actors, and playback wiring"
```

---

## Task 6: Dungeon scene refactor

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

Replace the inline `resolveCombat` call in `startCombatAtCurrentNode` with `scene.start('combat')`. Restructure `create()` to detect "returning from combat" via `consumeCombatResult()` and run `completeCombat` in a new `processCombatReturn` helper. The result/wipe panels stay in the dungeon scene unchanged.

Key invariant: the `appState.update` that pairs `runState` (advanced by `completeCombat`) with `runRngState` (advanced by combat playback) is now in `processCombatReturn`. Combat scene itself never writes to `appState`.

- [ ] **Step 1: Rewrite `src/scenes/dungeon_scene.ts`**

Replace the entire contents of the file with:

```ts
import * as Phaser from 'phaser';
import { removeHero } from '../camp/roster';
import type { CombatResult } from '../combat/types';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import {
  completeCombat,
  type WipeOutcome,
} from '../run/run_state';
import { createRngFromState, type Rng } from '../util/rng';
import { appState } from './app_state';
import { consumeCombatResult } from './combat_handoff';

type DungeonSceneState =
  | 'walking_in'
  | 'walking_to_next'
  | 'showing_result'
  | 'showing_wipe';

const NODE_X = [180, 360, 540, 720] as const;
const NODE_Y = 460;
const NODE_LABEL_Y = 498;
const PARTY_BASE_Y = 440;
const PARTY_OFFSCREEN_X = -80;
const SLOT_X_OFFSETS = [-40, 0, 40] as const;

const COMBAT_NODE_REWARD = 15;
const BOSS_NODE_REWARD = 100;

const WALK_IN_DURATION = 800;
const WALK_NEXT_DURATION = 600;

export class DungeonScene extends Phaser.Scene {
  private rng!: Rng;
  private partyContainer!: Phaser.GameObjects.Container;
  private nodeIcons: Phaser.GameObjects.Text[] = [];
  private nodeLabels: Phaser.GameObjects.Text[] = [];
  private hudFloor!: Phaser.GameObjects.Text;
  private hudPack!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private resultPanel?: Phaser.GameObjects.Container;
  private preCombatHp = new Map<string, number>();
  private wipeOutcome?: WipeOutcome;

  constructor() {
    super('dungeon');
  }

  create(): void {
    this.nodeIcons = [];
    this.nodeLabels = [];
    this.preCombatHp.clear();
    this.resultPanel = undefined;
    this.wipeOutcome = undefined;

    const state = appState.get();
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('DungeonScene entered without active runState');
      this.scene.start('camp');
      return;
    }

    this.rng = createRngFromState(state.runRngState!);

    this.buildBackground();
    this.buildHud();
    this.buildNodes();
    this.buildParty();
    this.buildStatusBar();

    const handoff = consumeCombatResult();
    if (handoff) {
      this.processCombatReturn(handoff.result, handoff.rngStateAfter);
    } else {
      this.refreshHud();
      this.refreshNodeColors();
      this.refreshStatusBar();
      this.setState('walking_in');
    }
  }

  private processCombatReturn(result: CombatResult, rngStateAfter: number): void {
    const run = appState.get().runState!;

    this.preCombatHp.clear();
    for (const hero of run.party) {
      this.preCombatHp.set(hero.id, hero.currentHp);
    }

    const { runState: nextRun, wipe } = completeCombat(run, result);

    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: rngStateAfter,
    }));

    // Position party at the just-completed node (skip walking_in tween).
    // run.currentNodeIndex is the just-completed node for both wipe and victory cases:
    //   - wipe: completeCombat doesn't advance the index
    //   - boss victory: completeCombat sets status='camp_screen' but doesn't advance the index
    //   - combat-node victory: completeCombat advances the index, but `run` here is pre-update
    this.partyContainer.x = this.partyXForNode(run.currentNodeIndex);

    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();

    if (wipe) {
      this.wipeOutcome = wipe;
      this.setState('showing_wipe');
    } else {
      this.setState('showing_result');
    }
  }

  private buildBackground(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1020)
      .setOrigin(0, 0);
    this.add.rectangle(0, 480, this.scale.width, 1, 0x555555).setOrigin(0, 0);
  }

  private buildHud(): void {
    this.hudFloor = this.add
      .text(16, 16, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0, 0);
    this.hudPack = this.add
      .text(944, 16, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffcc66',
      })
      .setOrigin(1, 0);
  }

  private buildNodes(): void {
    const run = appState.get().runState!;
    for (let i = 0; i < run.currentFloorNodes.length; i++) {
      const node = run.currentFloorNodes[i];
      const glyph = node.type === 'boss' ? '☠' : '⚔';
      const x = NODE_X[i];
      const icon = this.add
        .text(x, NODE_Y, glyph, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#888888',
        })
        .setOrigin(0.5);
      const label = this.add
        .text(x, NODE_LABEL_Y, node.type, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      this.nodeIcons.push(icon);
      this.nodeLabels.push(label);
    }
  }

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

  private buildStatusBar(): void {
    this.statusText = this.add
      .text(16, 524, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      })
      .setOrigin(0, 0);
  }

  private setState(next: DungeonSceneState): void {
    switch (next) {
      case 'walking_in':
        this.tweenPartyTo(
          this.partyXForNode(this.currentNodeIndex()),
          WALK_IN_DURATION,
          'Cubic.easeOut',
          () => this.startCombatAtCurrentNode(),
        );
        break;
      case 'walking_to_next':
        this.tweenPartyTo(
          this.partyXForNode(this.currentNodeIndex()),
          WALK_NEXT_DURATION,
          'Cubic.easeInOut',
          () => this.startCombatAtCurrentNode(),
        );
        break;
      case 'showing_result':
        this.buildResultPanel();
        break;
      case 'showing_wipe':
        this.buildWipePanel();
        break;
    }
  }

  private tweenPartyTo(
    targetX: number,
    duration: number,
    ease: string,
    onComplete: () => void,
  ): void {
    this.tweens.add({
      targets: this.partyContainer,
      x: targetX,
      duration,
      ease,
      onComplete,
    });
  }

  private partyXForNode(nodeIndex: number): number {
    return NODE_X[nodeIndex] - 80;
  }

  private currentNodeIndex(): number {
    return appState.get().runState!.currentNodeIndex;
  }

  private startCombatAtCurrentNode(): void {
    this.scene.start('combat');
  }

  private buildResultPanel(): void {
    const run = appState.get().runState!;

    const isBoss = run.status === 'camp_screen';
    const justCompletedIdx = isBoss ? run.currentNodeIndex : run.currentNodeIndex - 1;
    const completedNode = run.currentFloorNodes[justCompletedIdx];
    const reward =
      completedNode.type === 'boss'
        ? BOSS_NODE_REWARD * run.currentFloorNumber
        : COMBAT_NODE_REWARD * run.currentFloorNumber;

    const bg = this.add
      .rectangle(0, 0, 320, 180, 0x1a1a1a)
      .setStrokeStyle(2, 0x666666);
    const title = this.add
      .text(0, -65, 'Victory!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#4caf50',
      })
      .setOrigin(0.5);
    const gold = this.add
      .text(0, -42, `+${reward}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.Text[] = [];
    let y = -18;
    for (const hero of run.party) {
      const before = this.preCombatHp.get(hero.id) ?? hero.currentHp;
      const delta = before - hero.currentHp;
      const text =
        delta === 0
          ? `${hero.name}: untouched`
          : `${hero.name}: -${delta} HP (${hero.currentHp}/${hero.maxHp})`;
      lines.push(
        this.add
          .text(0, y, text, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#aaaaaa',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }

    const dismiss = this.add
      .text(0, 70, '▸ click to continue', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#888888',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    this.resultPanel = this.add.container(480, 270, [bg, title, gold, ...lines, dismiss]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onResultDismiss());
  }

  private onResultDismiss(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = undefined;
    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();

    const run = appState.get().runState!;
    if (run.status === 'camp_screen') {
      this.scene.start('camp_screen');
    } else if (run.status === 'in_dungeon') {
      this.setState('walking_to_next');
    }
  }

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

  private onWipeReturn(): void {
    const lostIds = new Set(this.wipeOutcome!.heroesLost.map((h) => h.id));

    appState.update((s) => {
      let roster = s.roster;
      for (const id of lostIds) {
        if (roster.heroes.some((h) => h.id === id)) {
          roster = removeHero(roster, id);
        }
      }
      return {
        ...s,
        roster,
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.start('camp');
  }

  private refreshHud(): void {
    const run = appState.get().runState!;
    const total = run.currentFloorNodes.length;
    const displayIdx =
      run.status === 'camp_screen' ? total : run.currentNodeIndex + 1;
    this.hudFloor.setText(
      `The Crypt · Floor ${run.currentFloorNumber} · Node ${displayIdx} / ${total}`,
    );
    this.hudPack.setText(`Pack: ${run.pack.gold}g`);
  }

  private refreshNodeColors(): void {
    const run = appState.get().runState!;
    for (let i = 0; i < this.nodeIcons.length; i++) {
      const node = run.currentFloorNodes[i];
      const isBoss = node.type === 'boss';
      let color: string;
      if (i < run.currentNodeIndex) color = '#444444';
      else if (i === run.currentNodeIndex && run.status === 'in_dungeon') color = '#ffcc66';
      else color = isBoss ? '#cc6666' : '#888888';
      this.nodeIcons[i].setColor(color);
      this.nodeLabels[i].setColor(i < run.currentNodeIndex ? '#555555' : '#aaaaaa');
    }
  }

  private refreshStatusBar(): void {
    const run = appState.get().runState!;
    const parts = run.party.map((h) => `${h.name} ${h.currentHp}/${h.maxHp}`);
    this.statusText.setText(parts.join(' · '));
  }
}
```

The diff from today's `dungeon_scene.ts`:
- **Removed imports:** `resolveCombat`, `buildCombatState`, `currentNode` (no longer needed; `processCombatReturn` doesn't need `currentNode` because it reads `run.currentNodeIndex` directly).
- **Added imports:** `consumeCombatResult` from `combat_handoff`, `CombatResult` type.
- **`create()`:** branches on `consumeCombatResult()`. Cold entry path is unchanged (`setState('walking_in')`). Returning-from-combat path calls `processCombatReturn`.
- **New `processCombatReturn` method:** snapshots `preCombatHp` from pre-completeCombat `runState.party`, calls `completeCombat`, atomic `appState.update` pairs `runState` + `runRngState`, positions party at just-completed node x, sets state to `showing_result` or `showing_wipe`.
- **`startCombatAtCurrentNode`:** reduced to one line — `this.scene.start('combat')`.
- **`buildResultPanel`, `buildWipePanel`, `onResultDismiss`, `onWipeReturn`:** unchanged — same panel UI, same dismiss logic.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass.

- [ ] **Step 4: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Smoke test the full path**

Run: `npm run dev`. Open `http://localhost:5173`.

Walk through each acceptance scenario:

1. **Cold start, single fight.** Clear localStorage. Hire 3 heroes (Tavern), build a party (Noticeboard), Descend. Watch the dungeon scene walk in to node 0 → combat scene takes over.
   - Confirm round counter and round banner update.
   - Caster outline (yellow ring) jumps each turn.
   - Melee abilities (Knight Slash, Bone Slash) lunge; ranged (Archer Shoot) pulses; AoE (Volley if archer in party + has it; otherwise just verify Bone Lich's Necrotic Wave on boss floor) flashes all party simultaneously.
   - Damage numbers float and fade.
   - HP bars tween smoothly; HP text updates.
   - Status glyphs appear (e.g., Bless `+`, Bulwark `B`, Stunned `S`) and disappear on expire.
   - Action log updates per event (cast lines, damage suffixes, deaths, round separators).
   - Combat ends with 800ms linger.
   - Returns to dungeon scene; result panel shows correct HP deltas (compare against the HP changes you watched).

2. **FF toggle.** Mid-combat, click the FF button (top-right) or press `F`. Confirm in-flight tweens accelerate immediately and remaining playback runs ~3× faster. Toggle back; pace returns to 1×.

3. **Multi-fight pacing.** Walk through all 4 nodes (3 combat + 1 boss). Confirm each combat enters the combat scene cleanly, returns cleanly, and the rng has clearly advanced (different combats produce different events).

4. **Wipe.** Force a wipe. Easiest: hire 3 heroes, immediately descend, hand-hold party into a Crypt-floor-1 boss fight by editing `currentNodeIndex` in localStorage to 3 (or just lose naturally on a low-level boss after a few floors). Confirm:
   - Combat scene plays through to player_defeat.
   - Returns to dungeon; wipe panel appears with heroes-lost list.
   - Click "Return to Camp" → camp scene; lost heroes removed from roster.

5. **Reload mid-playback.** Start a fight, mid-animation press F5. Confirm:
   - Boot routes back to dungeon (runState present).
   - Dungeon walks in (cold-entry; handoff slot is empty).
   - Combat scene replays the same fight (deterministic).

6. **Boss → camp_screen.** Defeat the boss. Confirm:
   - Boss combat plays out; final tableau lingers.
   - Result panel shows boss reward (`+100g × floor`).
   - Click → camp screen scene loads with correct gold + survivors.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/dungeon_scene.ts
git commit -m "scenes: refactor dungeon to launch combat scene via scene.start"
```

---

## Self-review summary

**Spec coverage:** Every section of the spec maps to a task:
- §Module layout → Tasks 1–6 (one task per file).
- §Layout (coordinates) → Task 5 (`combat_scene.ts` constants) + Task 3 (`combat_actor.ts` internal layout).
- §Status letter glyphs → Task 3 (`STATUS_GLYPHS` map).
- §Data flow → Tasks 5 + 6 (combat scene `create()` + dungeon `processCombatReturn`).
- §combat_handoff.ts → Task 1.
- §CombatPlayback driver (construction, helpers, main loop, dispatch, per-event handlers, batching, action log, caster heuristic, abort/shutdown) → Task 4.
- §RunningState mirror update points → Task 4 (per-event `running.set` / `entry.hp = ...` writes match the spec table).
- §CombatActor → Task 3.
- §Dungeon scene refactor → Task 6.
- §Smoke test plan → Task 6 step 5.
- §Risks → noted in spec; smoke test exercises the live behaviors.

**Type consistency check:**
- `setCombatResult(result, rngStateAfter)` and `consumeCombatResult()` shape match between Task 1 (definition), Task 5 (combat scene set), and Task 6 (dungeon consume). ✓
- `CombatPlayback` constructor signature matches between Task 4 (definition) and Task 5 (instantiation): `(scene, events, actors, hud, initialState, displayNames)`. ✓
- `CombatActor` constructor signature: Task 3 defines `CombatActorInit` discriminated union with `kind: 'hero' | 'enemy'`; Task 5 instantiates with both shapes. ✓
- `EnemyPlaceholder.flash(color)` / `unflash()`: defined Task 2, used in Task 3's `flashColor`. ✓
- `CombatPlaybackHud` interface (Task 4) matches what Task 5's `buildHud` returns. ✓

**No placeholders:** all code is concrete; no TBD/TODO/elided sections.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-combat-scene.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
