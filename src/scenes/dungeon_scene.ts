import * as Phaser from 'phaser';
import { removeHero, tickRosterWounds } from '@camp/roster';
import type { CombatResult } from '@combat/types';
import type { Node } from '@dungeon/node';
import type { Hero } from '@heroes/hero';
import { heroToLoadout } from '@render/hero_loadout';
import { Paperdoll } from '@render/paperdoll';
import {
  chooseNextNode,
  completeCombat,
  currentNode,
  playerPath,
  type RunState,
  type WipeOutcome,
} from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';
import { consumeCombatResult } from './combat_handoff';

type DungeonSceneState =
  | 'walking_in'
  | 'walking_to_next'
  | 'showing_result'
  | 'awaiting_fork_pick'
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
  private partyContainer!: Phaser.GameObjects.Container;
  private nodeIcons: Phaser.GameObjects.Text[] = [];
  private nodeLabels: Phaser.GameObjects.Text[] = [];
  private hudFloor!: Phaser.GameObjects.Text;
  private hudPack!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private resultPanel?: Phaser.GameObjects.Container;
  private forkPicker?: Phaser.GameObjects.Container;
  // Snapshot of party at combat start, captured before completeCombat prunes
  // fallen heroes. Used by the result panel to (a) compute per-hero HP deltas
  // and (b) render Fallen lines for heroes who didn't survive the fight.
  private preCombatParty: Hero[] = [];
  private wipeOutcome?: WipeOutcome;

  constructor() {
    super('dungeon');
  }

  create(): void {
    this.nodeIcons = [];
    this.nodeLabels = [];
    this.preCombatParty = [];
    this.resultPanel = undefined;
    this.forkPicker = undefined;
    this.wipeOutcome = undefined;

    const state = appState.get();
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('DungeonScene entered without active runState');
      this.scene.start('camp');
      return;
    }

    this.buildBackground();
    this.buildHud();
    this.buildNodes();
    this.buildParty();
    this.buildStatusBar();

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.refreshNodeColors();
      this.refreshStatusBar();
      this.rebuildParty();
      this.setState('walking_to_next');
    });

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

    this.preCombatParty = [...run.party];

    // Loot roll consumes RNG; thread it through completeCombat so the post-loot
    // state is what gets persisted.
    const rng = createRngFromState(rngStateAfter);
    const { runState: nextRun, wipe } = completeCombat(run, result, rng);

    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: rng.getState(),
    }));

    this.partyContainer.x = this.partyXForNode(this.pathPositionFor(run));

    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();
    this.rebuildParty();

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
    const path = playerPath(run);
    for (let i = 0; i < path.length && i < NODE_X.length; i++) {
      const node = path[i];
      const glyph =
        node.type === 'boss'  ? '☠' :
        node.type === 'shop'  ? '🛒' :
        node.type === 'elite' ? '💀' :
        node.type === 'camp'  ? '🏕' :
        node.type === 'event' ? '❓' :
        '⚔';
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

  private rebuildParty(): void {
    const x = this.partyContainer.x;
    this.partyContainer.destroy();
    this.buildParty();
    this.partyContainer.x = x;
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
          () => this.handleArrival(),
        );
        break;
      case 'walking_to_next':
        this.tweenPartyTo(
          this.partyXForNode(this.currentNodeIndex()),
          WALK_NEXT_DURATION,
          'Cubic.easeInOut',
          () => this.handleArrival(),
        );
        break;
      case 'showing_result':
        this.buildResultPanel();
        break;
      case 'awaiting_fork_pick':
        this.buildForkPicker();
        break;
      case 'showing_wipe':
        this.buildWipePanel();
        break;
    }
  }

  private handleArrival(): void {
    const run = appState.get().runState;
    if (!run) return;

    if (run.awaitingFork) {
      this.setState('awaiting_fork_pick');
      return;
    }

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

    this.startCombatAtCurrentNode();
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
    return this.pathPositionFor(appState.get().runState);
  }

  /**
   * For the Tier 2 diamond floor (n0 → n1 → n2a/n2b → boss),
   * returns the player's position in the 4-step icon row.
   * Cluster B · 6 (fork picker UI) replaces this with a richer per-node renderer.
   */
  private pathPositionFor(run: RunState | undefined): number {
    if (!run) return 0;
    const referenced = new Set(
      run.currentFloorNodes.flatMap((n) => [...n.nextNodeIds]),
    );
    const start = run.currentFloorNodes.find((n) => !referenced.has(n.id));
    if (!start) return 0;

    // BFS from start to currentNodeId.
    const visited = new Set<string>();
    let frontier: { id: string; depth: number }[] = [{ id: start.id, depth: 0 }];
    while (frontier.length > 0) {
      const next: typeof frontier = [];
      for (const { id, depth } of frontier) {
        if (id === run.currentNodeId) return depth;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = run.currentFloorNodes.find((n) => n.id === id);
        if (!node) continue;
        for (const nextId of node.nextNodeIds) next.push({ id: nextId, depth: depth + 1 });
      }
      frontier = next;
    }
    return 0;
  }

  private startCombatAtCurrentNode(): void {
    this.scene.start('combat');
  }

  private buildResultPanel(): void {
    const run = appState.get().runState!;

    const isBoss = run.status === 'camp_screen';
    let completedNode: Node;
    if (isBoss) {
      // Find the boss node (unique terminal).
      completedNode = run.currentFloorNodes.find((n) => n.nextNodeIds.length === 0)!;
    } else if (run.awaitingFork) {
      // Just cleared the fork source — currentNodeId still points at it.
      completedNode = currentNode(run);
    } else {
      // Just cleared a linear node — currentNodeId has advanced; the just-completed
      // node is the one whose nextNodeIds contains the new current id.
      completedNode = run.currentFloorNodes.find((n) =>
        n.nextNodeIds.includes(run.currentNodeId),
      )!;
    }
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

  private buildForkPicker(): void {
    const run = appState.get().runState!;
    const cur = currentNode(run);
    const branchIds = cur.nextNodeIds;
    if (branchIds.length !== 2) return; // defensive — only render for actual forks

    const forkX = NODE_X[2]; // 540 for Crypt's diamond
    const upperY = 420;
    const lowerY = 500;
    const promptY = 380;

    const prompt = this.add
      .text(forkX, promptY, 'Choose a path:', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    const upper = this.buildForkOption(forkX, upperY, branchIds[0], 'branch A', run);
    const lower = this.buildForkOption(forkX, lowerY, branchIds[1], 'branch B', run);

    this.forkPicker = this.add.container(0, 0, [prompt, upper, lower]);
  }

  private buildForkOption(
    x: number,
    y: number,
    branchId: string,
    subtitle: string,
    run: RunState,
  ): Phaser.GameObjects.Container {
    const branchNode = run.currentFloorNodes.find((n) => n.id === branchId)!;
    const glyph = branchNode.type === 'boss' ? '☠' : branchNode.type === 'shop' ? '🛒' : '⚔';
    const typeLabel = branchNode.type;

    const bg = this.add
      .rectangle(0, 0, 36, 36, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
    const glyphText = this.add
      .text(0, -2, glyph, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const subtitleText = this.add
      .text(0, 24, subtitle, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);
    const labelText = this.add
      .text(0, 36, typeLabel, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffcc66));
    bg.on('pointerout', () => bg.setStrokeStyle(1, 0x444444));
    bg.on('pointerdown', () => this.onForkPick(branchId));

    return this.add.container(x, y, [bg, glyphText, subtitleText, labelText]);
  }

  private onForkPick(branchId: string): void {
    appState.update((s) => ({
      ...s,
      runState: chooseNextNode(s.runState!, branchId),
    }));
    this.destroyForkPicker();
    this.refreshNodeColors();
    this.setState('walking_to_next');
  }

  private destroyForkPicker(): void {
    this.forkPicker?.destroy(true);
    this.forkPicker = undefined;
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
      return;
    }

    if (run.awaitingFork) {
      this.setState('awaiting_fork_pick');
      return;
    }

    this.setState('walking_to_next');
  }

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

  private refreshHud(): void {
    const run = appState.get().runState!;
    const path = playerPath(run);
    const total = path.length;
    const pos = this.pathPositionFor(run);
    const displayIdx = run.status === 'camp_screen' ? total : pos + 1;
    this.hudFloor.setText(
      `The Crypt · Floor ${run.currentFloorNumber} · Node ${displayIdx} / ${total}`,
    );
    const itemCount = run.pack.items.length;
    const packLabel =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    this.hudPack.setText(packLabel);
  }

  private refreshNodeColors(): void {
    const run = appState.get().runState!;
    const path = playerPath(run);
    const pos = this.pathPositionFor(run);
    for (let i = 0; i < this.nodeIcons.length; i++) {
      const node = path[i];
      if (!node) continue;
      const isBoss = node.type === 'boss';
      const isElite = node.type === 'elite';
      let color: string;
      if (i < pos) color = '#444444';
      else if (i === pos && run.status === 'in_dungeon') color = '#ffcc66';
      else color = isBoss ? '#cc6666' : isElite ? '#cc8844' : '#888888';
      this.nodeIcons[i].setColor(color);
      this.nodeLabels[i].setColor(i < pos ? '#555555' : '#aaaaaa');
    }
  }

  private refreshStatusBar(): void {
    const run = appState.get().runState!;
    const parts = run.party.map((h) => `${h.name} ${h.currentHp}/${h.maxHp}`);
    this.statusText.setText(parts.join(' · '));
  }
}
