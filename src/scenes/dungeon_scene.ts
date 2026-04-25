import * as Phaser from 'phaser';
import { removeHero } from '../camp/roster';
import { resolveCombat } from '../combat/combat';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import { buildCombatState } from '../run/combat_setup';
import {
  completeCombat,
  currentNode,
  type WipeOutcome,
} from '../run/run_state';
import { createRngFromState, type Rng } from '../util/rng';
import { appState } from './app_state';

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
    // Reset per-launch state (Phaser scene reuse trap)
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
    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();

    this.setState('walking_in');
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
    const run = appState.get().runState!;
    const node = currentNode(run);

    this.preCombatHp.clear();
    for (const hero of run.party) {
      this.preCombatHp.set(hero.id, hero.currentHp);
    }

    const combatState = buildCombatState(run.party, node.encounter);
    const result = resolveCombat(combatState, this.rng);
    const { runState: nextRun, wipe } = completeCombat(run, result);

    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: this.rng.getState(),
    }));

    if (wipe) {
      this.wipeOutcome = wipe;
      this.setState('showing_wipe');
    } else {
      this.setState('showing_result');
    }
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
