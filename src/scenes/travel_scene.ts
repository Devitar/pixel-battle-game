import * as Phaser from 'phaser';
import type { Hero } from '@heroes/hero';
import { heroToLoadout } from '@render/hero_loadout';
import { Paperdoll } from '@render/paperdoll';
import { appState } from './app_state';
import { consumeTravelDeltas } from './travel_handoff';

const SCENE_W = 960;
const SCENE_H = 540;
const GROUND_Y = 380;
const CEILING_Y = 100;

const HERO_BODY_SCALE = 3;
const HERO_FRAME_SIZE = 16;
const HERO_BODY_HALF = (HERO_FRAME_SIZE * HERO_BODY_SCALE) / 2;

// Single-file front-to-back; mirrors combat scene's PARTY_X.
// Slot 0 (frontmost) on the right; slot 2 (back) on the left.
const HERO_X_BY_SLOT: readonly number[] = [400, 320, 240];

const HP_BAR_W = 56;
const HP_BAR_H = 4;
const HPBAR_BELOW_FEET = 6;

const WALK_DISTANCE = 200;             // total horizontal distance heroes traverse
const STEPS_PER_EDGE = 5;
const STEP_DURATION_MS = 1500;          // per-step duration at 1× walkSpeed
const TOTAL_TRAVEL_MS = STEPS_PER_EDGE * STEP_DURATION_MS; // 7500ms at 1×
const HP_TICK_STEP = 3;                 // step (1-indexed) at which the HP popup fires
const HP_TICK_FRACTION = HP_TICK_STEP / STEPS_PER_EDGE;     // 0.6 — fraction of total travel
const POPUP_DURATION_MS = 500;

const FF_X = 944;
const FF_Y = 48;
const FF_W = 60;
const FF_H = 24;

interface HeroVisual {
  container: Phaser.GameObjects.Container;
  paperdoll: Paperdoll;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
}

export class TravelScene extends Phaser.Scene {
  private walkSpeed: 1 | 3 = 1;
  private heroVisuals: HeroVisual[] = [];
  private deltas: readonly number[] = [];
  private ffBg!: Phaser.GameObjects.Rectangle;
  private ffLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('travel');
  }

  create(): void {
    this.heroVisuals = [];

    const state = appState.get();
    const run = state.runState;
    if (!run || run.status !== 'in_dungeon') {
      console.warn('TravelScene entered without active in_dungeon runState');
      this.scene.start('camp');
      return;
    }

    this.walkSpeed = state.preferences?.walkSpeed ?? 1;
    const handoff = consumeTravelDeltas();
    this.deltas = handoff?.deltas ?? [];

    this.buildBackdrop();
    this.buildHud();
    this.buildHeroes(run.party);
    this.startWalk();
  }

  private buildBackdrop(): void {
    // Solid base background — matches dungeon scene.
    this.add.rectangle(0, 0, SCENE_W, SCENE_H, 0x1a1020).setOrigin(0, 0);
    // Ceiling band (slightly lighter) suggesting the corridor's top.
    this.add.rectangle(0, 0, SCENE_W, CEILING_Y, 0x251530).setOrigin(0, 0);
    // Ground line where heroes' feet land.
    this.add.rectangle(0, GROUND_Y, SCENE_W, 1, 0x555555).setOrigin(0, 0);
    // Subtle floor band below ground line.
    this.add.rectangle(0, GROUND_Y + 1, SCENE_W, SCENE_H - GROUND_Y - 1, 0x140820).setOrigin(0, 0);
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
    // Note: a mid-travel toggle does NOT retroactively change the in-flight
    // tween's duration (Phaser locks duration at start). The toggle takes
    // effect on future travels. Matches the combat scene's speed-toggle
    // semantics — call it a feature, not a bug.
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
    this.walkSpeed = this.walkSpeed === 1 ? 3 : 1;
    this.ffLabel.setText(`${this.walkSpeed}×`);
    this.ffBg.setStrokeStyle(2, this.walkSpeed === 3 ? 0x44cc44 : 0x666666);
    appState.update((s) => ({
      ...s,
      preferences: {
        combatSpeed: s.preferences?.combatSpeed ?? 1,
        walkSpeed: this.walkSpeed,
      },
    }));
  }

  private buildHeroes(party: readonly Hero[]): void {
    party.forEach((hero, slot) => {
      if (slot >= HERO_X_BY_SLOT.length) return; // safety; PARTY_SIZE = 3
      const startX = HERO_X_BY_SLOT[slot] - WALK_DISTANCE;
      const bodyCenterY = GROUND_Y - HERO_BODY_HALF;

      const paperdoll = new Paperdoll(this, 0, 0, heroToLoadout(hero));
      paperdoll.setPosition(0, bodyCenterY);
      paperdoll.setScale(HERO_BODY_SCALE);

      const hpBarY = GROUND_Y + HPBAR_BELOW_FEET;
      const hpBarBg = this.add.rectangle(0, hpBarY, HP_BAR_W, HP_BAR_H, 0x333333);
      const ratio = hero.maxHp > 0 ? hero.currentHp / hero.maxHp : 0;
      const hpBarFill = this.add
        .rectangle(-HP_BAR_W / 2, hpBarY, HP_BAR_W * ratio, HP_BAR_H, this.hpColor(ratio))
        .setOrigin(0, 0.5);

      const container = this.add.container(startX, 0, [paperdoll, hpBarBg, hpBarFill]);

      // Bob (vertical sine) + rotate (sine) — phase-offset per slot so heroes
      // bob/rotate out of sync, looking more natural than synchronized.
      const bobPhase = slot * 333; // ms
      this.tweens.add({
        targets: container,
        y: { from: 0, to: -3 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: paperdoll,
        angle: { from: -5, to: 5 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });

      this.heroVisuals.push({ container, paperdoll, hpBarBg, hpBarFill });
    });
  }

  private hpColor(ratio: number): number {
    if (ratio > 0.6) return 0x4caf50;
    if (ratio > 0.3) return 0xffcc66;
    return 0xcc6666;
  }

  private startWalk(): void {
    const totalDuration = TOTAL_TRAVEL_MS / this.walkSpeed;
    const tickDelay = totalDuration * HP_TICK_FRACTION;

    // Schedule the HP-tick popups + bar updates at step 3.
    this.time.delayedCall(tickDelay, () => this.fireHpTick());

    // Walk tween — slide each hero's container right by WALK_DISTANCE.
    this.heroVisuals.forEach((visual, slot) => {
      const targetX = HERO_X_BY_SLOT[slot];
      this.tweens.add({
        targets: visual.container,
        x: targetX,
        duration: totalDuration,
        ease: 'Linear',
        // Only fire the on-complete callback once (from slot 0's tween) to avoid
        // triple-firing the scene transition.
        onComplete: slot === 0 ? () => this.onTravelComplete() : undefined,
      });
    });
  }

  private fireHpTick(): void {
    const run = appState.get().runState;
    if (!run) return;
    this.heroVisuals.forEach((visual, slot) => {
      const delta = this.deltas[slot] ?? 0;
      // Update HP bar to reflect post-tick state (state was already mutated
      // pre-travel in dungeon_scene's onNodeClicked; visual just catches up).
      const hero = run.party[slot];
      if (hero) {
        const ratio = hero.maxHp > 0 ? hero.currentHp / hero.maxHp : 0;
        visual.hpBarFill.width = HP_BAR_W * ratio;
        visual.hpBarFill.setFillStyle(this.hpColor(ratio));
      }
      // Render popup if there was a delta.
      if (delta !== 0) this.spawnHpPopup(visual.container, delta);
    });
  }

  private spawnHpPopup(parent: Phaser.GameObjects.Container, delta: number): void {
    const text = delta > 0 ? `+${delta}` : `${delta}`;
    const color = delta > 0 ? '#4caf50' : '#cc6666';
    const popup = this.add
      .text(parent.x, GROUND_Y - HERO_BODY_HALF * 2 - 8, text, {
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

  private onTravelComplete(): void {
    this.scene.start('dungeon');
  }
}
