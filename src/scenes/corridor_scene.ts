import * as Phaser from 'phaser';
import { resolveCombat } from '@combat/combat';
import type { CombatantId, CombatResult, CombatState } from '@combat/types';
import type { Item } from '@data/types';
import { hospitalTickAmount, hospitalTreatmentCap } from '@camp/building_levels';
import { removeHero, tickRosterWounds } from '@camp/roster';
import { grantTraineeXp } from '@camp/trainee_xp';
import { CHATTER, computeChatterCondition } from '@data/chatter';
import { DUNGEONS } from '@data/dungeons';
import { ENEMIES } from '@data/enemies';
import type { Encounter, Node } from '@dungeon/node';
import type { Hero } from '@heroes/hero';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { CombatActor } from '@render/combat_actor';
import { ENEMY_VISUALS } from '@render/enemy_sprites';
import { RARITY_COLOR_HEX } from '@render/rarity_colors';
import { buildCombatState } from '@run/combat_setup';
import { applyPendingMilestones } from '@run/milestones';
import {
  completeCombat,
  completeSurpriseCombat,
  currentNode,
  nodeRewardGold,
  surpriseRewardGold,
  type RunState,
  type WipeOutcome,
} from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';
import { CombatPlayback, type CombatPlaybackHud } from './combat_playback';
import { consumeCorridorHandoff, type SurpriseSpec } from './corridor_handoff';

// Mirror combat scene exactly so heroes render identically across travel+combat.
const ROW_Y = 300;          // CombatActor anchor y; matches combat_scene.ts
const HERO_X_BY_SLOT: readonly number[] = [400, 320, 240]; // slot 0/1/2 → PARTY_X[1/2/3]
const FLOOR_LINE_Y = 324;   // where heroes' feet land (ROW_Y + CombatActor's FLOOR_Y=24)
const SCENE_W = 960;
const SCENE_H = 540;
const CEILING_Y = 240;      // ceiling band ends here

const STEPS_PER_EDGE = 5;
const STEP_DURATION_MS = 1500;          // per-step duration at 1× walkSpeed
const TOTAL_TRAVEL_MS = STEPS_PER_EDGE * STEP_DURATION_MS; // 7500ms at 1×
const HP_TICK_STEP = 3;                 // step (1-indexed) at which the HP popup fires
const HP_TICK_FRACTION = HP_TICK_STEP / STEPS_PER_EDGE;     // 0.6 — fraction of total travel
const POPUP_DURATION_MS = 500;

const CHATTER_PROBABILITY = 0.7;
const CHATTER_FADE_IN_MS = 150;
const CHATTER_HOLD_MS = 2000;
const CHATTER_FADE_OUT_MS = 250;
const CHATTER_BUBBLE_BG = 0xf4ecd8;
const CHATTER_BUBBLE_BORDER = 0x2a2020;
const CHATTER_TEXT_COLOR = '#2a2020';

const FF_X = 944;
const FF_Y = 48;
const FF_W = 60;
const FF_H = 24;

const WORLD_SCROLL_DISTANCE = 200;  // matches Phase 6a's WALK_DISTANCE
const TILE_W = 32;                   // floor tile width
const TILE_COLORS: readonly number[] = [0x1a1020, 0x251530];
const PILLAR_W = 8;
const PILLAR_H = 60;
const PILLAR_COLOR = 0x3a2a1a;       // placeholder; real torch art replaces later
const PILLAR_SPACING = 160;          // every 5 tiles

const ENEMY_X_BY_SLOT: readonly number[] = [0, 560, 640, 720, 800];
const ROUND_COUNTER_Y = 24;
const ROUND_BANNER_Y = 200;
const ACTION_LOG_Y = 510;
const BOSS_BODY_SCALE = 4.5;

const ENEMY_SLIDE_IN_MS = 600;       // duration of enemy slide-in from off-screen right
const ENEMY_SLIDE_IN_OFFSET = 80;    // px past SCENE_W where enemies spawn before sliding in

interface HeroVisual {
  actor: CombatActor;
  combatantId: CombatantId;
}

export class CorridorScene extends Phaser.Scene {
  private walkSpeed: 1 | 3 = 1;
  private combatSpeed: 1 | 3 = 1;
  private heroVisuals: HeroVisual[] = [];
  private deltas: readonly number[] = [];
  private surprise: SurpriseSpec | null = null;
  private surpriseEnemyActors: CombatActor[] = [];
  private ffBg!: Phaser.GameObjects.Rectangle;
  private ffLabel!: Phaser.GameObjects.Text;
  private combatFfBg?: Phaser.GameObjects.Rectangle;
  private combatFfLabel?: Phaser.GameObjects.Text;
  private worldContainer!: Phaser.GameObjects.Container;
  // Snapshot of party at combat start, captured before completeCombat prunes
  // fallen heroes. Used by the result panel to (a) compute per-hero HP deltas
  // and (b) render Fallen lines for heroes who didn't survive the fight.
  private preCombatParty: Hero[] = [];
  // Items added to the pack during the just-completed combat (rollLoot drops +
  // recovered fallen-hero gear). Captured by diffing pack.items length.
  private combatLoot: readonly Item[] = [];
  private wipeOutcome?: WipeOutcome;
  private resultPanel?: Phaser.GameObjects.Container;
  // Combat playback state (combat plays in-place inside the corridor scene).
  // `actors` includes BOTH heroes (registered at hero-build time) and enemies
  // (registered when combat starts). Heroes persist across combats; enemies are
  // torn down between fights.
  private actors = new Map<CombatantId, CombatActor>();
  private playback?: CombatPlayback;
  private combatHud?: CombatPlaybackHud;
  private combatHudObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('corridor');
  }

  create(): void {
    this.heroVisuals = [];
    this.preCombatParty = [];
    this.combatLoot = [];
    this.resultPanel = undefined;
    this.wipeOutcome = undefined;
    this.actors = new Map();
    this.playback = undefined;
    this.combatHud = undefined;
    this.combatHudObjects = [];
    this.surprise = null;
    this.surpriseEnemyActors = [];
    // Combat FF UI is built/destroyed per-combat; reset refs to undefined in
    // case a previous scene instance left them dangling after a shutdown.
    this.combatFfBg = undefined;
    this.combatFfLabel = undefined;

    const state = appState.get();
    const run = state.runState;
    if (!run || run.status !== 'in_dungeon') {
      console.warn('CorridorScene entered without active in_dungeon runState');
      this.scene.start('camp');
      return;
    }

    this.walkSpeed = state.preferences?.walkSpeed ?? 1;
    const handoff = consumeCorridorHandoff();
    this.deltas = handoff?.deltas ?? [];
    this.surprise = handoff?.surprise ?? null;

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      const r = appState.get().runState;
      if (!r || r.status !== 'in_dungeon') {
        // Cashout from camp ended the run; transition to camp screen.
        this.scene.start('camp');
        return;
      }
      // After overlay close, return to dungeon for next fork pick.
      this.scene.start('dungeon');
    });

    this.buildBackdrop();
    this.buildWorldContainer();
    this.buildHud();
    this.buildHeroes(run.party);
    this.maybeScheduleChatter(run.party);

    if (run.traversedNodeIds.length === 1) {
      // Fresh entry (just past camp / press-on). The player already clicked
      // the start node on the dungeon map — that WAS the engage signal. Skip
      // the walk (no "from" node to scroll from) and engage immediately.
      this.engageDestination();
    } else if (this.surprise) {
      this.startSurpriseWalk();
    } else {
      this.startWalk();
    }
  }

  private buildBackdrop(): void {
    // Solid base background.
    this.add.rectangle(0, 0, SCENE_W, SCENE_H, 0x1a1020).setOrigin(0, 0);
    // Ceiling band suggesting the corridor's top.
    this.add.rectangle(0, 0, SCENE_W, CEILING_Y, 0x251530).setOrigin(0, 0);
    // Floor line where heroes' feet land.
    this.add.rectangle(0, FLOOR_LINE_Y, SCENE_W, 1, 0x555555).setOrigin(0, 0);
    // Subtle floor band below.
    this.add.rectangle(0, FLOOR_LINE_Y + 1, SCENE_W, SCENE_H - FLOOR_LINE_Y - 1, 0x140820).setOrigin(0, 0);
  }

  private buildWorldContainer(): void {
    this.worldContainer = this.add.container(0, 0);

    // Floor tiles spanning from left edge to right + scroll buffer.
    const tilesNeeded = Math.ceil((SCENE_W + WORLD_SCROLL_DISTANCE) / TILE_W);
    for (let i = 0; i < tilesNeeded; i++) {
      const x = i * TILE_W;
      const color = TILE_COLORS[i % TILE_COLORS.length];
      const tile = this.add.rectangle(x, FLOOR_LINE_Y + 1, TILE_W, SCENE_H - FLOOR_LINE_Y - 1, color).setOrigin(0, 0);
      this.worldContainer.add(tile);
    }

    // Pillar/torch placeholders at intervals.
    const pillarsNeeded = Math.ceil((SCENE_W + WORLD_SCROLL_DISTANCE) / PILLAR_SPACING);
    for (let i = 0; i < pillarsNeeded; i++) {
      const x = i * PILLAR_SPACING + PILLAR_SPACING / 2;
      const pillar = this.add.rectangle(x, FLOOR_LINE_Y - PILLAR_H, PILLAR_W, PILLAR_H, PILLAR_COLOR).setOrigin(0.5, 0);
      this.worldContainer.add(pillar);
    }
  }

  private buildHud(): void {
    const run = appState.get().runState!;
    const total = run.currentFloorNodes.length;
    this.add
      .text(16, 16, `The Crypt · Floor ${run.currentFloorNumber} · ${total} nodes`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0, 0);
    const itemCount = run.pack.items.length;
    const packLabel =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    this.add
      .text(944, 16, packLabel, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffcc66',
      })
      .setOrigin(1, 0);

    // Walk-speed toggle — mirrors dungeon scene's FF UI.
    // Toggling mid-travel scales the scene's tween + timer timescales so the
    // in-flight scroll, HP-tick delayedCall, and chatter timing all retune
    // immediately. We must reset to 1 before combat starts (combat-speed has
    // its own timescale via playback.setSpeed). See onTravelComplete.
    this.ffBg = this.add
      .rectangle(FF_X, FF_Y, FF_W, FF_H, 0x222222)
      .setOrigin(1, 0)
      .setStrokeStyle(2, this.walkSpeed === 3 ? 0x44cc44 : 0x666666);
    this.ffLabel = this.add
      .text(FF_X - FF_W / 2, FF_Y + FF_H / 2, `${this.walkSpeed}×`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.ffBg.setInteractive({ useHandCursor: true });
    this.ffBg.on('pointerdown', () => this.toggleWalkSpeed());
    this.input.keyboard?.on('keydown-F', () => this.toggleWalkSpeed());
  }

  private toggleWalkSpeed(): void {
    // During combat, F + click route to combat-speed toggle (per spec §2.5).
    if (this.combatFfBg) {
      this.toggleCombatSpeed();
      return;
    }
    this.walkSpeed = this.walkSpeed === 1 ? 3 : 1;
    this.ffLabel.setText(`${this.walkSpeed}×`);
    this.ffBg.setStrokeStyle(2, this.walkSpeed === 3 ? 0x44cc44 : 0x666666);
    // Apply to the in-flight scroll/HP-tick/chatter so the toggle takes effect
    // immediately, not just on the next travel. Reset on combat-start.
    this.tweens.timeScale = this.walkSpeed;
    this.time.timeScale = this.walkSpeed;
    appState.update((s) => ({
      ...s,
      preferences: {
        combatSpeed: s.preferences?.combatSpeed ?? 1,
        walkSpeed: this.walkSpeed,
      },
    }));
  }

  private toggleCombatSpeed(): void {
    this.combatSpeed = this.combatSpeed === 1 ? 3 : 1;
    this.combatFfLabel?.setText(`${this.combatSpeed}×`);
    this.combatFfBg?.setStrokeStyle(2, this.combatSpeed === 3 ? 0x44cc44 : 0x666666);
    this.playback?.setSpeed(this.combatSpeed);
    appState.update((s) => ({
      ...s,
      preferences: {
        walkSpeed: s.preferences?.walkSpeed ?? 1,
        combatSpeed: this.combatSpeed,
      },
    }));
  }

  private buildHeroes(party: readonly Hero[]): void {
    party.forEach((hero, slot) => {
      if (slot >= HERO_X_BY_SLOT.length) return;
      const x = HERO_X_BY_SLOT[slot];
      const combatantId = `p${slot}` as CombatantId;
      const actor = new CombatActor(this, x, ROW_Y, {
        kind: 'hero',
        combatantId,
        displayName: hero.name,
        hero,
        currentHp: hero.currentHp,
        maxHp: hero.maxHp,
      });

      // Bob (vertical sine) on the actor container; phase-offset per slot.
      const bobPhase = slot * 333;
      this.tweens.add({
        targets: actor,
        y: { from: ROW_Y, to: ROW_Y - 3 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });
      // Rotate the inner body only (so HP bar + name don't tilt).
      this.tweens.add({
        targets: actor.bodyVisual,
        angle: { from: -5, to: 5 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });

      this.actors.set(combatantId, actor);
      this.heroVisuals.push({ actor, combatantId });
    });
  }

  private startWalk(): void {
    // Speed control via scene timescale (so mid-walk toggle takes effect on
    // the in-flight scroll). Duration stays fixed; timescale scales playback.
    this.tweens.timeScale = this.walkSpeed;
    this.time.timeScale = this.walkSpeed;

    // World scrolls left over the travel duration.
    this.tweens.add({
      targets: this.worldContainer,
      x: -WORLD_SCROLL_DISTANCE,
      duration: TOTAL_TRAVEL_MS,
      ease: 'Linear',
      onComplete: () => this.onTravelComplete(),
    });

    // Schedule the HP-tick popups at step 3.
    this.time.delayedCall(TOTAL_TRAVEL_MS * HP_TICK_FRACTION, () => this.fireHpTick());
  }

  private startSurpriseWalk(): void {
    if (!this.surprise) return;

    // Speed control via scene timescale (mirrors startWalk).
    this.tweens.timeScale = this.walkSpeed;
    this.time.timeScale = this.walkSpeed;

    // Embed surprise enemies inside the world container at world-relative
    // x = ENEMY_X_BY_SLOT[slot] + spawnFraction * WORLD_SCROLL_DISTANCE.
    // After scrolling left by spawnFraction*WORLD_SCROLL_DISTANCE, each enemy
    // appears on screen at ENEMY_X_BY_SLOT[slot].
    const fraction = this.surprise.spawnFraction;
    const enemies = this.surprise.encounter.enemies;
    const scale = this.surprise.encounter.scale;
    let enemyIdx = 0;
    for (const placement of enemies) {
      const finalScreenX = ENEMY_X_BY_SLOT[placement.slot];
      const worldRelX = finalScreenX + fraction * WORLD_SCROLL_DISTANCE;
      const enemyId = placement.enemyId;
      const isBoss = ENEMIES[enemyId].role === 'boss';
      const visual = ENEMY_VISUALS[enemyId];
      const bodyScale = visual.bodyScale ?? (isBoss ? BOSS_BODY_SCALE : 3);
      const combatantId = `e${enemyIdx++}` as CombatantId;
      // Pre-scale HP so the placeholder HP bar is full and matches the real
      // combat-start HP (surprises have no modifiers, so scale is the only
      // adjustment to base HP).
      const scaledHp = Math.round(ENEMIES[enemyId].baseStats.hp * scale.hp);
      const actor = new CombatActor(this, worldRelX, ROW_Y, {
        kind: 'enemy',
        combatantId,
        displayName: ENEMIES[enemyId].name,
        enemyId,
        currentHp: scaledHp,
        maxHp: scaledHp,
        bodyScale,
      });
      this.worldContainer.add(actor);
      this.surpriseEnemyActors.push(actor);
    }

    // Schedule chatter only if it would land BEFORE the surprise spawn time.
    this.maybeScheduleSurpriseChatter(appState.get().runState!.party, fraction);

    // Partial scroll: tween to spawnFraction of the full distance.
    const distance = fraction * WORLD_SCROLL_DISTANCE;
    const duration = fraction * TOTAL_TRAVEL_MS;
    this.tweens.add({
      targets: this.worldContainer,
      x: -distance,
      duration,
      ease: 'Linear',
      onComplete: () => this.startSurpriseCombat(),
    });
  }

  private maybeScheduleSurpriseChatter(party: readonly Hero[], spawnFraction: number): void {
    if (Math.random() >= CHATTER_PROBABILITY) return;
    if (party.length === 0) return;
    const step = Math.random() < 0.5 ? 2 : 4;
    const chatterTimeMs = step * STEP_DURATION_MS;
    const surpriseTimeMs = spawnFraction * TOTAL_TRAVEL_MS;
    if (chatterTimeMs >= surpriseTimeMs) return;  // chatter would land in/after combat — skip
    const heroIndex = Math.floor(Math.random() * party.length);
    const hero = party[heroIndex];
    const condition = computeChatterCondition(hero);
    const pool = CHATTER[hero.classId][condition];
    if (pool.length === 0) return;
    const line = pool[Math.floor(Math.random() * pool.length)];
    this.time.delayedCall(chatterTimeMs, () => this.spawnChatterBubble(heroIndex, line));
  }

  private startSurpriseCombat(): void {
    if (!this.surprise) return;
    const state = appState.get();
    const run = state.runState;
    if (!run || run.status !== 'in_dungeon') return;
    if (state.runRngState === undefined) {
      console.warn('CorridorScene: runRngState missing for surprise combat');
      return;
    }

    const encounter = this.surprise.encounter;

    // Stop hero bob/rotate (mirrors startCombatInPlace).
    for (const visual of this.heroVisuals) {
      this.tweens.killTweensOf(visual.actor);
      this.tweens.killTweensOf(visual.actor.bodyVisual);
      visual.actor.setY(ROW_Y);
      visual.actor.bodyVisual.setAngle(0);
    }
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;

    const rng = createRngFromState(state.runRngState);
    const combatState = buildCombatState(run.party, encounter);
    const result = resolveCombat(combatState, rng);

    // Tear down the placeholder surprise enemy actors — buildEnemyActors will
    // create the real ones with correct HP / modifiers.
    for (const a of this.surpriseEnemyActors) a.destroy();
    this.surpriseEnemyActors = [];

    this.combatSpeed = state.preferences?.combatSpeed ?? 1;
    this.ffBg.setVisible(false);
    this.ffLabel.setVisible(false);

    const displayNames = this.buildDisplayNames(run, combatState);
    this.buildSurpriseEnemyActorsForCombat(combatState, displayNames);
    this.combatHud = this.buildCombatHud();

    this.playback = new CombatPlayback(
      this,
      result.events,
      this.actors,
      this.combatHud,
      combatState,
      displayNames,
    );
    this.playback.setSpeed(this.combatSpeed);
    this.playback.onComplete = () => {
      this.processSurpriseCombatResult(result, rng.getState());
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.playback?.abort();
      this.tweens.timeScale = 1;
      this.time.timeScale = 1;
    });

    // No ENEMY_SLIDE_IN_MS delay — enemies were visible during the partial scroll.
    void this.playback.run();
  }

  private buildSurpriseEnemyActorsForCombat(
    combatState: CombatState,
    displayNames: Map<CombatantId, string>,
  ): void {
    // Place enemies at standard ENEMY_X_BY_SLOT positions (NOT in worldContainer)
    // — combat happens against the heroes who are at PARTY_X positions; both
    // sides need to be in scene-space so the bbox calculations in CombatPlayback
    // line up with damage popups, etc.
    for (const c of combatState.combatants) {
      if (c.side !== 'enemy') continue;
      const finalX = ENEMY_X_BY_SLOT[c.slot];
      const enemyId = c.enemyId!;
      const isBoss = ENEMIES[enemyId].role === 'boss';
      const visual = ENEMY_VISUALS[enemyId];
      const bodyScale = visual.bodyScale ?? (isBoss ? BOSS_BODY_SCALE : 3);
      const actor = new CombatActor(this, finalX, ROW_Y, {
        kind: 'enemy',
        combatantId: c.id,
        displayName: displayNames.get(c.id) ?? c.id,
        enemyId,
        currentHp: c.currentHp,
        maxHp: c.maxHp,
        bodyScale,
      });
      this.actors.set(c.id, actor);
    }
  }

  private processSurpriseCombatResult(result: CombatResult, rngStateAfter: number): void {
    const run = appState.get().runState!;
    this.preCombatParty = [...run.party];
    const prePackLen = run.pack.items.length;

    const rng = createRngFromState(rngStateAfter);
    const { runState: nextRun, wipe } = completeSurpriseCombat(run, result, rng);
    this.combatLoot = nextRun.pack.items.slice(prePackLen);

    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: rng.getState(),
    }));

    // Tear down combat HUD (mirrors processCombatResultInline).
    for (const obj of this.combatHudObjects) obj.destroy();
    this.combatHudObjects = [];
    this.combatHud = undefined;
    this.combatFfBg?.destroy();
    this.combatFfLabel?.destroy();
    this.combatFfBg = undefined;
    this.combatFfLabel = undefined;
    this.ffBg.setVisible(true);
    this.ffLabel.setVisible(true);
    for (const [id, actor] of this.actors) {
      if (id.startsWith('e')) {
        actor.destroy();
        this.actors.delete(id);
      }
    }

    if (wipe) {
      this.wipeOutcome = wipe;
      this.buildWipePanel();
    } else {
      this.buildSurpriseResultPanel();
    }
  }

  private buildSurpriseResultPanel(): void {
    const run = appState.get().runState!;
    const reward = surpriseRewardGold(run.currentFloorNumber, DUNGEONS[run.dungeonId].tier);

    const lootCount = this.combatLoot.length;
    const lootBlockHeight = lootCount > 0 ? 16 + lootCount * 14 : 0;
    const bgHeight = 180 + lootBlockHeight;
    const dismissY = 70 + lootBlockHeight;

    const bg = this.add
      .rectangle(0, 0, 320, bgHeight, 0x1a1a1a)
      .setStrokeStyle(2, 0xffaa44);
    const title = this.add
      .text(0, -bgHeight / 2 + 25, 'Ambushed!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffaa44',
      })
      .setOrigin(0.5);
    const gold = this.add
      .text(0, -bgHeight / 2 + 48, `+${reward}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.Text[] = [];
    let y = -bgHeight / 2 + 72;
    const survivorsById = new Map(run.party.map((h) => [h.id, h]));
    for (const preHero of this.preCombatParty) {
      const survivor = survivorsById.get(preHero.id);
      const fallen = survivor === undefined;
      const text = fallen
        ? `${preHero.name}: Fallen`
        : (() => {
            const delta = preHero.currentHp - survivor.currentHp;
            return delta === 0
              ? `${survivor.name}: untouched`
              : `${survivor.name}: -${delta} HP (${survivor.currentHp}/${survivor.maxHp})`;
          })();
      lines.push(
        this.add
          .text(0, y, text, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: fallen ? '#cc8888' : '#aaaaaa',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }

    if (lootCount > 0) {
      y += 4;
      lines.push(
        this.add
          .text(0, y, 'Loot:', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          })
          .setOrigin(0.5),
      );
      y += 14;
      for (const item of this.combatLoot) {
        const name = itemDisplayName(item);
        const affixes = itemAffixDescription(item);
        const text = affixes.length > 0 ? `${name} · ${affixes}` : name;
        lines.push(
          this.add
            .text(0, y, text, {
              fontFamily: 'monospace',
              fontSize: '10px',
              color: RARITY_COLOR_HEX[item.rarity],
            })
            .setOrigin(0.5),
        );
        y += 14;
      }
    }

    const dismiss = this.add
      .text(0, dismissY, '▸ click to continue', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#888888',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    this.resultPanel = this.add.container(480, 270, [bg, title, gold, ...lines, dismiss]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onSurpriseResultDismiss());
  }

  private onSurpriseResultDismiss(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = undefined;
    this.resumeScrollToDestination();
  }

  private resumeScrollToDestination(): void {
    if (!this.surprise) {
      this.engageDestination();
      return;
    }
    const fraction = this.surprise.spawnFraction;

    // Restore travel-time hero animations.
    for (const visual of this.heroVisuals) {
      const slot = this.heroVisuals.indexOf(visual);
      const bobPhase = slot * 333;
      this.tweens.add({
        targets: visual.actor,
        y: { from: ROW_Y, to: ROW_Y - 3 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: visual.actor.bodyVisual,
        angle: { from: -5, to: 5 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });
    }

    // Apply walk-speed timescale for the resumed scroll.
    this.tweens.timeScale = this.walkSpeed;
    this.time.timeScale = this.walkSpeed;

    // Tween the world container the remaining distance to fully-scrolled.
    const remainingDuration = (1 - fraction) * TOTAL_TRAVEL_MS;
    this.tweens.add({
      targets: this.worldContainer,
      x: -WORLD_SCROLL_DISTANCE,
      duration: remainingDuration,
      ease: 'Linear',
      onComplete: () => this.engageDestination(),
    });
  }

  private fireHpTick(): void {
    const run = appState.get().runState;
    if (!run) return;
    this.heroVisuals.forEach((visual, slot) => {
      const delta = this.deltas[slot] ?? 0;
      const hero = run.party[slot];
      if (hero) {
        // CombatActor exposes setHpBar(currentHp, maxHp) which animates the bar.
        // Returned Promise is fine to ignore — we don't await it.
        void visual.actor.setHpBar(hero.currentHp, hero.maxHp);
      }
      if (delta !== 0) this.spawnHpPopup(visual.actor, delta);
    });
  }

  private spawnHpPopup(actor: CombatActor, delta: number): void {
    const text = delta > 0 ? `+${delta}` : `${delta}`;
    const color = delta > 0 ? '#4caf50' : '#cc6666';
    // Actor anchor is at ROW_Y; head is approximately ROW_Y - 48 (body height).
    const popupY = ROW_Y - 56;
    const popup = this.add
      .text(actor.x, popupY, text, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: popup,
      y: popup.y - 12,
      alpha: 0,
      duration: POPUP_DURATION_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  private maybeScheduleChatter(party: readonly Hero[]): void {
    if (Math.random() >= CHATTER_PROBABILITY) return;
    if (party.length === 0) return;
    const step = Math.random() < 0.5 ? 2 : 4;
    const heroIndex = Math.floor(Math.random() * party.length);
    const hero = party[heroIndex];
    const condition = computeChatterCondition(hero);
    const pool = CHATTER[hero.classId][condition];
    if (pool.length === 0) return; // safety
    const line = pool[Math.floor(Math.random() * pool.length)];

    // Step N happens at (N * STEP_DURATION_MS) into the travel. Speed scaling
    // is handled by `time.timeScale` (set in startWalk based on walkSpeed),
    // so the raw duration here is correct.
    this.time.delayedCall(step * STEP_DURATION_MS, () => this.spawnChatterBubble(heroIndex, line));
  }

  private spawnChatterBubble(heroIndex: number, line: string): void {
    const visual = this.heroVisuals[heroIndex];
    if (!visual) return;

    const text = this.add
      .text(0, 0, line, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: CHATTER_TEXT_COLOR,
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    const padX = 6;
    const padY = 4;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    // CombatActor anchor at ROW_Y=300; bubble above the hero head.
    // Inner-actor coordinates: head top is around y=-48 (above actor anchor).
    const bubbleY = -56;

    const bg = this.add.graphics();
    bg.fillStyle(CHATTER_BUBBLE_BG, 1);
    bg.fillRoundedRect(-w / 2, bubbleY - h / 2, w, h, 3);
    bg.lineStyle(1, CHATTER_BUBBLE_BORDER, 1);
    bg.strokeRoundedRect(-w / 2, bubbleY - h / 2, w, h, 3);
    bg.fillStyle(CHATTER_BUBBLE_BG, 1);
    bg.fillTriangle(-3, bubbleY + h / 2, 3, bubbleY + h / 2, 0, bubbleY + h / 2 + 4);
    bg.lineStyle(1, CHATTER_BUBBLE_BORDER, 1);
    bg.lineBetween(-3, bubbleY + h / 2, 0, bubbleY + h / 2 + 4);
    bg.lineBetween(0, bubbleY + h / 2 + 4, 3, bubbleY + h / 2);

    text.setPosition(0, bubbleY);

    // Add as children of the actor so the bubble follows the hero (including bob).
    visual.actor.add([bg, text]);

    bg.setAlpha(0);
    text.setAlpha(0);
    this.tweens.add({
      targets: [bg, text],
      alpha: 1,
      duration: CHATTER_FADE_IN_MS,
      ease: 'Cubic.easeOut',
    });
    // Speed scaling for the hold duration is handled by `time.timeScale`
    // (set in startWalk). Raw value here is correct.
    const holdMs = CHATTER_HOLD_MS;
    this.time.delayedCall(CHATTER_FADE_IN_MS + holdMs, () => {
      this.tweens.add({
        targets: [bg, text],
        alpha: 0,
        duration: CHATTER_FADE_OUT_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          bg.destroy();
          text.destroy();
        },
      });
    });
  }

  private onTravelComplete(): void {
    this.engageDestination();
  }

  private engageDestination(): void {
    const run = appState.get().runState;
    if (!run) return;
    const node = currentNode(run);
    if (node.type === 'shop') {
      this.scene.launch('shop_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'camp') {
      this.scene.launch('camp_node_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'event') {
      this.scene.launch('event_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'treasure') {
      this.scene.launch('treasure_room_overlay');
      this.scene.pause();
      return;
    }
    // Combat node — start combat in-place (no scene swap).
    this.startCombatInPlace();
  }

  private startCombatInPlace(): void {
    const state = appState.get();
    const run = state.runState;
    if (!run || run.status !== 'in_dungeon') return;
    if (state.runRngState === undefined) {
      console.warn('CorridorScene: runRngState missing for in-corridor combat');
      return;
    }

    const node = currentNode(run);
    if (
      node.type === 'shop' ||
      node.type === 'camp' ||
      node.type === 'event' ||
      node.type === 'treasure'
    ) {
      console.warn(`startCombatInPlace called on non-combat node '${node.type}'`);
      return;
    }
    const encounter: Encounter = node.encounter;

    // Stop the travel-time bob/rotate tweens on hero actors — they kept
    // running during combat and made heroes visibly walk while fighting.
    // Reset y to ROW_Y and angle to 0 so heroes settle into clean combat poses.
    for (const visual of this.heroVisuals) {
      this.tweens.killTweensOf(visual.actor);
      this.tweens.killTweensOf(visual.actor.bodyVisual);
      visual.actor.setY(ROW_Y);
      visual.actor.bodyVisual.setAngle(0);
    }
    // Reset timescales — walk-speed scaling is over; combat-speed has its own
    // timescale managed by playback.setSpeed().
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;

    const rng = createRngFromState(state.runRngState);
    const combatState = buildCombatState(run.party, encounter);
    const result = resolveCombat(combatState, rng);

    // Per spec §2.5: hide the walk-speed FF UI for the duration of combat;
    // the combat-speed FF UI takes over the same screen slot.
    this.combatSpeed = state.preferences?.combatSpeed ?? 1;
    this.ffBg.setVisible(false);
    this.ffLabel.setVisible(false);

    const displayNames = this.buildDisplayNames(run, combatState);
    this.buildEnemyActors(combatState, displayNames, encounter);
    this.combatHud = this.buildCombatHud();

    this.playback = new CombatPlayback(
      this,
      result.events,
      this.actors,
      this.combatHud,
      combatState,
      displayNames,
    );
    this.playback.setSpeed(this.combatSpeed);
    this.playback.onComplete = () => {
      // Persist post-combat state inline (no handoff needed — same scene).
      this.processCombatResultInline(result, rng.getState());
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.playback?.abort();
      this.tweens.timeScale = 1;
      this.time.timeScale = 1;
    });

    // Defer combat playback start until enemies have slid into position.
    // Gives a beat for the player to register "we walked up on these enemies."
    this.time.delayedCall(ENEMY_SLIDE_IN_MS, () => void this.playback?.run());
  }

  private buildDisplayNames(
    run: RunState,
    combatState: CombatState,
  ): Map<CombatantId, string> {
    const names = new Map<CombatantId, string>();
    for (let i = 0; i < run.party.length; i++) {
      names.set(`p${i}` as CombatantId, run.party[i].name);
    }
    for (const c of combatState.combatants) {
      if (c.side === 'enemy' && c.enemyId) {
        names.set(c.id, ENEMIES[c.enemyId].name);
      }
    }
    return names;
  }

  private buildEnemyActors(
    combatState: CombatState,
    displayNames: Map<CombatantId, string>,
    encounter: Encounter,
  ): void {
    let enemyIdx = 0;
    for (const c of combatState.combatants) {
      if (c.side !== 'enemy') continue;
      const finalX = ENEMY_X_BY_SLOT[c.slot];
      const enemyId = c.enemyId!;
      const isBoss = ENEMIES[enemyId].role === 'boss';
      const visual = ENEMY_VISUALS[enemyId];
      const bodyScale = visual.bodyScale ?? (isBoss ? BOSS_BODY_SCALE : 3);
      const placement = encounter.enemies[enemyIdx++];
      // Spawn off-screen right; slide into final position so heroes look like
      // they're walking up to enemies emerging from down the corridor.
      const startX = SCENE_W + ENEMY_SLIDE_IN_OFFSET;
      const actor = new CombatActor(this, startX, ROW_Y, {
        kind: 'enemy',
        combatantId: c.id,
        displayName: displayNames.get(c.id) ?? c.id,
        enemyId,
        currentHp: c.currentHp,
        maxHp: c.maxHp,
        bodyScale,
        ...(placement.modifierIds !== undefined ? { modifierIds: placement.modifierIds } : {}),
      });
      this.actors.set(c.id, actor);
      this.tweens.add({
        targets: actor,
        x: finalX,
        duration: ENEMY_SLIDE_IN_MS,
        ease: 'Cubic.easeOut',
      });
    }
  }

  private buildCombatHud(): CombatPlaybackHud {
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

    // Combat-speed FF UI — same screen position as the (now hidden) walk-speed
    // FF. Only one is visible at a time per spec §2.5. Click handler routes
    // directly to toggleCombatSpeed; the F key is bound in buildHud and routes
    // through toggleWalkSpeed, which forwards to toggleCombatSpeed when the
    // combat FF UI exists.
    this.combatFfBg = this.add
      .rectangle(FF_X, FF_Y, FF_W, FF_H, 0x222222)
      .setOrigin(1, 0)
      .setStrokeStyle(2, this.combatSpeed === 3 ? 0x44cc44 : 0x666666);
    this.combatFfLabel = this.add
      .text(FF_X - FF_W / 2, FF_Y + FF_H / 2, `${this.combatSpeed}×`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.combatFfBg.setInteractive({ useHandCursor: true });
    this.combatFfBg.on('pointerdown', () => this.toggleCombatSpeed());

    this.combatHudObjects.push(roundCounter, roundBanner, actionLog);
    return { roundCounter, roundBanner, actionLog };
  }

  private processCombatResultInline(result: CombatResult, rngStateAfter: number): void {
    const run = appState.get().runState!;
    this.preCombatParty = [...run.party];
    const prePackLen = run.pack.items.length;

    // Loot roll consumes RNG; thread it through completeCombat so the post-loot
    // state is what gets persisted.
    const rng = createRngFromState(rngStateAfter);
    const { runState: nextRun, wipe } = completeCombat(run, result, rng);
    // Items added during this fight = rollLoot drop + recovered fallen-hero gear.
    // addItem appends, so the tail of pack.items past the pre-fight length is
    // exactly what was added. Stash for the result panel.
    this.combatLoot = nextRun.pack.items.slice(prePackLen);
    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: rng.getState(),
    }));

    // Tear down combat HUD; result/wipe panel takes over.
    for (const obj of this.combatHudObjects) obj.destroy();
    this.combatHudObjects = [];
    this.combatHud = undefined;
    // Tear down combat-speed FF UI and restore walk-speed FF visibility
    // (per spec §2.5 — only one FF UI visible at a time).
    this.combatFfBg?.destroy();
    this.combatFfLabel?.destroy();
    this.combatFfBg = undefined;
    this.combatFfLabel = undefined;
    this.ffBg.setVisible(true);
    this.ffLabel.setVisible(true);
    // Tear down enemy actors (heroes stay alive in the actors map for future
    // combats / travel HP ticks).
    for (const [id, actor] of this.actors) {
      if (id.startsWith('e')) {
        actor.destroy();
        this.actors.delete(id);
      }
    }

    if (wipe) {
      this.wipeOutcome = wipe;
      this.buildWipePanel();
    } else {
      this.buildResultPanel();
    }
  }

  private buildResultPanel(): void {
    const run = appState.get().runState!;

    const isBoss = run.status === 'camp_screen';
    let completedNode: Node;
    if (isBoss) {
      completedNode = run.currentFloorNodes.find((n) => n.nextNodeIds.length === 0)!;
    } else if (run.awaitingFork) {
      completedNode = currentNode(run);
    } else {
      completedNode = run.currentFloorNodes.find((n) =>
        n.nextNodeIds.includes(run.currentNodeId),
      )!;
    }
    if (completedNode.type !== 'combat' && completedNode.type !== 'elite' && completedNode.type !== 'boss') {
      throw new Error(`buildResultPanel: completed node has non-combat type '${completedNode.type}'`);
    }
    const reward = nodeRewardGold(
      completedNode.type,
      run.currentFloorNumber,
      DUNGEONS[run.dungeonId].tier,
    );

    const lootCount = this.combatLoot.length;
    const lootBlockHeight = lootCount > 0 ? 16 + lootCount * 14 : 0;
    const bgHeight = 180 + lootBlockHeight;
    const dismissY = 70 + lootBlockHeight;

    const bg = this.add
      .rectangle(0, 0, 320, bgHeight, 0x1a1a1a)
      .setStrokeStyle(2, 0x666666);
    const title = this.add
      .text(0, -bgHeight / 2 + 25, 'Victory!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#4caf50',
      })
      .setOrigin(0.5);
    const gold = this.add
      .text(0, -bgHeight / 2 + 48, `+${reward}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.Text[] = [];
    let y = -bgHeight / 2 + 72;
    const survivorsById = new Map(run.party.map((h) => [h.id, h]));
    for (const preHero of this.preCombatParty) {
      const survivor = survivorsById.get(preHero.id);
      const fallen = survivor === undefined;
      const text = fallen
        ? `${preHero.name}: Fallen`
        : (() => {
            const delta = preHero.currentHp - survivor.currentHp;
            return delta === 0
              ? `${survivor.name}: untouched`
              : `${survivor.name}: -${delta} HP (${survivor.currentHp}/${survivor.maxHp})`;
          })();
      lines.push(
        this.add
          .text(0, y, text, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: fallen ? '#cc8888' : '#aaaaaa',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }

    if (lootCount > 0) {
      y += 4;
      lines.push(
        this.add
          .text(0, y, 'Loot:', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          })
          .setOrigin(0.5),
      );
      y += 14;
      for (const item of this.combatLoot) {
        const name = itemDisplayName(item);
        const affixes = itemAffixDescription(item);
        const text = affixes.length > 0 ? `${name} · ${affixes}` : name;
        lines.push(
          this.add
            .text(0, y, text, {
              fontFamily: 'monospace',
              fontSize: '10px',
              color: RARITY_COLOR_HEX[item.rarity],
            })
            .setOrigin(0.5),
        );
        y += 14;
      }
    }

    const dismiss = this.add
      .text(0, dismissY, '▸ click to continue', {
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
    const run = appState.get().runState!;
    if (run.status === 'camp_screen') {
      this.scene.start('camp_screen');
      return;
    }
    // After combat win, return to dungeon for the next fork pick.
    this.scene.start('dungeon');
  }

  private buildWipePanel(): void {
    const wipe = this.wipeOutcome!;
    const fallenCount = wipe.heroesFallen.length;
    const lostCount = wipe.heroesLost.length;
    const totalLines =
      fallenCount + lostCount +
      (fallenCount > 0 ? 1 : 0) +
      (lostCount > 0 ? 1 : 0);

    // Preview trainee-xp grant for the toast (pure preview; actual grant runs
    // in onWipeReturn). If eligibleCount > 0 we add one extra line to the panel.
    const previewState = appState.get();
    const previewActiveIds = [
      ...wipe.heroesFallen.map((h) => h.id),
      ...wipe.heroesLost.map((h) => h.id),
    ];
    const traineePreview = grantTraineeXp(previewState, wipe.traineeXpBase, previewActiveIds);
    const showTraineeToast = traineePreview.eligibleCount > 0;

    const baseHeight = 220;
    const extraLines = Math.max(0, totalLines - 4) + (showTraineeToast ? 1 : 0);
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

    if (showTraineeToast) {
      const trainees = traineePreview.eligibleCount;
      const xp = traineePreview.xpPerTrainee;
      y += 4;
      lines.push(
        this.add
          .text(
            0,
            y,
            `Training Grounds: ${trainees} trainee${trainees === 1 ? '' : 's'} will gain ${xp} XP.`,
            { fontFamily: 'monospace', fontSize: '11px', color: '#aaddaa' },
          )
          .setOrigin(0.5),
      );
      y += 14;
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

  private onWipeReturn(): void {
    const wipe = this.wipeOutcome!;
    const fallenIds = new Set(wipe.heroesFallen.map((h) => h.id));
    const lostIds = new Set(wipe.heroesLost.map((h) => h.id));

    const activeIds = [
      ...wipe.heroesFallen.map((h) => h.id),
      ...wipe.heroesLost.map((h) => h.id),
    ];

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
      roster = tickRosterWounds(roster, hospitalTickAmount(s.buildingLevels.hospital));
      const next = {
        ...s,
        roster,
        hospitalTreatmentsRemaining: hospitalTreatmentCap(s.buildingLevels.hospital),
        runState: undefined,
        runRngState: undefined,
      };
      const grant = grantTraineeXp(next, wipe.traineeXpBase, activeIds);
      return applyPendingMilestones(grant.state, wipe.milestonesTriggered);
    });

    this.scene.start('camp');
  }
}
