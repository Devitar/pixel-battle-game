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

const PARTY_X = [0, 400, 320, 240, 160] as const;
const ENEMY_X = [0, 560, 640, 720, 800] as const;
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
const BOSS_BODY_SCALE = 4.5;

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
    this.actors = new Map();
    this.playback = undefined;
    this.speed = 1;

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
