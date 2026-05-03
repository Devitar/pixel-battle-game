import * as Phaser from 'phaser';
import { hospitalTickAmount, hospitalTreatmentCap } from '@camp/building_levels';
import { removeHero, tickRosterWounds } from '@camp/roster';
import type { CombatResult } from '@combat/types';
import { computeMapLayout, type MapLayout } from '@dungeon/map_layout';
import type { Node } from '@dungeon/node';
import { computeVisibility, LOOKAHEAD_ROWS, type VisibilityResult } from '@dungeon/visibility';
import type { Item, Rarity } from '@data/types';
import type { Hero } from '@heroes/hero';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import {
  applyTravelTick,
  chooseNextNode,
  completeCombat,
  currentNode,
  type WipeOutcome,
} from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';
import { consumeCombatResult } from './combat_handoff';
import { setTravelDeltas } from './travel_handoff';

type DungeonSceneState =
  | 'walking_in'
  | 'walking_to_next'
  | 'showing_result'
  | 'showing_wipe';

const MAP_LEFT = 120;
const MAP_TOP = 100;
const MAP_WIDTH = 720;
const MAP_HEIGHT = 380;

const PARTY_OFFSCREEN_X = -40;
const PARTY_TOKEN_Y_OFFSET = -32;

const NODE_RADIUS = 18;

const FF_X = 944;
const FF_Y = 48;
const FF_W = 60;
const FF_H = 24;

const COMBAT_NODE_REWARD = 15;
const BOSS_NODE_REWARD = 100;

const RARITY_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const WALK_IN_DURATION = 800;
const WALK_NEXT_DURATION = 600;

const GHOST_ALPHA = 0.25;

const NODE_FILL_BY_STATE = {
  cleared: 0x2a2a2a,
  current: 0x4a3a1a,
  upcoming: 0x1a1a1a,
  fork_choice: 0x2a3a4a,
} as const;
const NODE_STROKE_BY_STATE = {
  cleared: 0x444444,
  current: 0xffcc66,
  upcoming: 0x666666,
  fork_choice: 0x88aaff,
} as const;
const GLYPH_COLOR_BY_STATE = {
  cleared: '#555555',
  current: '#ffcc66',
  upcoming: '#aaaaaa',
  fork_choice: '#ffffff',
} as const;
type NodeRenderState = keyof typeof NODE_FILL_BY_STATE;

export class DungeonScene extends Phaser.Scene {
  private partyToken!: Phaser.GameObjects.Container;
  private walkSpeed: 1 | 3 = 1;
  // After walk-in, sit idle until the player clicks the current node to engage
  // (combat / overlay). Subsequent arrivals reach the node via an explicit
  // next-node click, so they auto-engage on arrival — only walk-in needs the
  // extra gate to avoid the "ambushed-on-spawn" feel.
  private awaitingEngage = false;
  private ffBg!: Phaser.GameObjects.Rectangle;
  private ffLabel!: Phaser.GameObjects.Text;
  private layout: MapLayout = { positions: new Map(), edges: [], rowCount: 0 };
  private visibility: VisibilityResult = {
    revealed: new Set(),
    visible: new Set(),
    ghost: new Set(),
    isEdgeVisible: () => false,
    isEdgeGhost: () => false,
  };
  private nodeContainers = new Map<string, Phaser.GameObjects.Container>();
  private nodeBgByNodeId = new Map<string, Phaser.GameObjects.Arc>();
  private nodeGlyphByNodeId = new Map<string, Phaser.GameObjects.Text>();
  private nodeLabelByNodeId = new Map<string, Phaser.GameObjects.Text>();
  private edgeGraphics?: Phaser.GameObjects.Graphics;
  private hudFloor!: Phaser.GameObjects.Text;
  private hudPack!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private resultPanel?: Phaser.GameObjects.Container;
  // Snapshot of party at combat start, captured before completeCombat prunes
  // fallen heroes. Used by the result panel to (a) compute per-hero HP deltas
  // and (b) render Fallen lines for heroes who didn't survive the fight.
  private preCombatParty: Hero[] = [];
  // Items added to the pack during the just-completed combat (rollLoot drops +
  // recovered fallen-hero gear). Captured by diffing pack.items length.
  private combatLoot: readonly Item[] = [];
  private wipeOutcome?: WipeOutcome;

  constructor() {
    super('dungeon');
  }

  create(): void {
    this.nodeContainers = new Map();
    this.nodeBgByNodeId = new Map();
    this.nodeGlyphByNodeId = new Map();
    this.nodeLabelByNodeId = new Map();
    this.preCombatParty = [];
    this.combatLoot = [];
    this.resultPanel = undefined;
    this.wipeOutcome = undefined;

    const state = appState.get();
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('DungeonScene entered without active runState');
      this.scene.start('camp');
      return;
    }

    this.walkSpeed = state.preferences?.walkSpeed ?? 1;

    this.layout = computeMapLayout(state.runState.currentFloorNodes, {
      left: MAP_LEFT,
      top: MAP_TOP,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    });
    this.visibility = computeVisibility(
      state.runState.currentFloorNodes,
      state.runState.currentNodeId,
      state.runState.traversedNodeIds,
      LOOKAHEAD_ROWS,
    );

    this.buildBackground();
    this.buildHud();
    this.buildEdges();
    this.buildNodes();
    this.buildPartyToken();
    this.buildStatusBar();

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      // Post-Phase-3, every node-resolution function (leaveShop, claimTreasure,
      // chooseCampNodeEffect, applyEventChoice) leaves the run with
      // awaitingFork=true. Sit idle so the player picks the next-row click
      // target. The walking_to_next branch covers the legacy auto-advance flow
      // and stays for safety, but is now effectively dead code.
      const run = appState.get().runState;
      if (run?.awaitingFork) return;
      this.setState('walking_to_next');
    });

    const handoff = consumeCombatResult();
    if (handoff) {
      this.processCombatReturn(handoff.result, handoff.rngStateAfter);
    } else if (state.runState.traversedNodeIds.length === 1) {
      // First node of the floor — true walk-in from off-screen.
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      this.setState('walking_in');
    } else {
      // Returning from travel scene — party is already at currentNodeId per
      // the pre-travel state mutation. Snap the token (no walk-in tween) and
      // auto-engage; the player chose this node by clicking, so consent is
      // aligned (no awaitingEngage gate needed).
      const pos = this.partyTokenPosFor(state.runState.currentNodeId);
      this.partyToken.x = pos.x;
      this.partyToken.y = pos.y;
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      this.handleArrival();
    }
  }

  private processCombatReturn(result: CombatResult, rngStateAfter: number): void {
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

    // Combat → dungeon scene transition rebuilds the party token at
    // PARTY_OFFSCREEN_X (scene.start destroys the previous scene's objects).
    // Snap it to the just-cleared node so the result panel anchors correctly
    // and the subsequent click-to-walk tween starts from the right origin
    // instead of from off-screen.
    const posAfter = this.partyTokenPosFor(nextRun.currentNodeId);
    this.partyToken.x = posAfter.x;
    this.partyToken.y = posAfter.y;

    this.refreshHud();
    this.refreshNodeStates();
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
    this.add.rectangle(0, 510, this.scale.width, 1, 0x555555).setOrigin(0, 0);
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

  private buildEdges(): void {
    this.edgeGraphics = this.add.graphics();
    this.refreshEdges();
  }

  private refreshEdges(): void {
    if (!this.edgeGraphics) return;
    this.edgeGraphics.clear();
    for (const edge of this.layout.edges) {
      if (!this.visibility.isEdgeVisible(edge.fromId, edge.toId)) continue;
      const from = this.layout.positions.get(edge.fromId);
      const to = this.layout.positions.get(edge.toId);
      if (!from || !to) continue;
      const alpha = this.visibility.isEdgeGhost(edge.fromId, edge.toId) ? GHOST_ALPHA : 1;
      this.edgeGraphics.lineStyle(2, 0x555555, alpha);
      this.edgeGraphics.beginPath();
      this.edgeGraphics.moveTo(from.x, from.y);
      this.edgeGraphics.lineTo(to.x, to.y);
      this.edgeGraphics.strokePath();
    }
  }

  private buildNodes(): void {
    const run = appState.get().runState!;
    for (const node of run.currentFloorNodes) {
      const pos = this.layout.positions.get(node.id);
      if (!pos) continue;
      const bg = this.add
        .circle(0, 0, NODE_RADIUS, NODE_FILL_BY_STATE.upcoming)
        .setStrokeStyle(2, NODE_STROKE_BY_STATE.upcoming);
      const glyph = this.add
        .text(0, -1, glyphForNodeType(node.type), {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: GLYPH_COLOR_BY_STATE.upcoming,
        })
        .setOrigin(0.5);
      const label = this.add
        .text(0, NODE_RADIUS + 8, node.type, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      const container = this.add.container(pos.x, pos.y, [bg, glyph, label]);
      this.nodeContainers.set(node.id, container);
      this.nodeBgByNodeId.set(node.id, bg);
      this.nodeGlyphByNodeId.set(node.id, glyph);
      this.nodeLabelByNodeId.set(node.id, label);

      bg.on('pointerdown', () => this.onNodeClicked(node.id));
      bg.on('pointerover', () => this.onNodeHover(node.id, true));
      bg.on('pointerout',  () => this.onNodeHover(node.id, false));
    }
  }

  private buildPartyToken(): void {
    const ring = this.add
      .circle(0, 0, 11, 0x222244)
      .setStrokeStyle(2, 0xffcc66);
    const text = this.add
      .text(0, -1, '◆◆◆', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);
    this.partyToken = this.add.container(PARTY_OFFSCREEN_X, MAP_TOP, [ring, text]);
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
      case 'walking_in': {
        const target = this.partyTokenPosFor(this.currentNodeIdSafe());
        this.tweenPartyTo(target.x, target.y, WALK_IN_DURATION, 'Cubic.easeOut',
          () => this.handleWalkInArrival());
        break;
      }
      case 'walking_to_next': {
        const target = this.partyTokenPosFor(this.currentNodeIdSafe());
        this.tweenPartyTo(target.x, target.y, WALK_NEXT_DURATION, 'Cubic.easeInOut',
          () => this.handleArrival());
        break;
      }
      case 'showing_result':
        this.buildResultPanel();
        break;
      case 'showing_wipe':
        this.buildWipePanel();
        break;
    }
  }

  private handleWalkInArrival(): void {
    // Walk-in completes (fresh dungeon entry or post-reload). Don't auto-engage
    // the current node; flag awaitingEngage so the player explicitly clicks the
    // start node to begin. Avoids the jarring "ambushed-on-spawn" feel.
    const run = appState.get().runState;
    if (!run) return;
    if (run.awaitingFork) {
      // Reload landed mid-fork-pause; refreshNodeStates already lit fork
      // choices. Sit idle and let the player click a next-row node.
      return;
    }
    this.awaitingEngage = true;
    this.refreshNodeStates();
  }

  private handleArrival(): void {
    const run = appState.get().runState;
    if (!run) return;

    if (run.awaitingFork) {
      // Map's per-node interactivity is wired by refreshNodeStates; the scene
      // sits idle until the player clicks a fork branch (via onNodeClicked).
      this.refreshNodeStates();
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
    if (node.type === 'treasure') {
      this.scene.launch('treasure_room_overlay');
      this.scene.pause();
      return;
    }

    this.startCombatAtCurrentNode();
  }

  private tweenPartyTo(
    targetX: number,
    targetY: number,
    duration: number,
    ease: string,
    onComplete: () => void,
  ): void {
    this.tweens.add({
      targets: this.partyToken,
      x: targetX,
      y: targetY,
      duration: duration / this.walkSpeed,
      ease,
      onComplete,
    });
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

  private partyTokenPosFor(nodeId: string): { x: number; y: number } {
    const pos = this.layout.positions.get(nodeId);
    if (!pos) return { x: PARTY_OFFSCREEN_X, y: MAP_TOP };
    return { x: pos.x, y: pos.y + PARTY_TOKEN_Y_OFFSET };
  }

  private currentNodeIdSafe(): string {
    const run = appState.get().runState;
    return run ? run.currentNodeId : '';
  }

  private startCombatAtCurrentNode(): void {
    this.scene.start('combat');
  }

  private onNodeClicked(nodeId: string): void {
    const run = appState.get().runState;
    if (!run || run.status !== 'in_dungeon') return;

    // Click on the current node when awaiting engage (post walk-in only):
    // engage combat / open the overlay.
    if (this.awaitingEngage && nodeId === run.currentNodeId) {
      this.awaitingEngage = false;
      this.refreshNodeStates();
      this.handleArrival();
      return;
    }

    if (!run.awaitingFork) return;
    const cur = currentNode(run);
    if (!cur.nextNodeIds.includes(nodeId)) return;

    // Advance currentNodeId, then apply per-edge HP tick BEFORE handing off to
    // the travel scene so saved state is consistent if the user closes mid-travel.
    appState.update((s) => {
      const advanced = chooseNextNode(s.runState!, nodeId);
      const { runState: postTick, deltas } = applyTravelTick(advanced);
      setTravelDeltas(deltas);
      return { ...s, runState: postTick };
    });
    this.scene.start('travel');
  }

  private onNodeHover(nodeId: string, hovering: boolean): void {
    const state = this.computeNodeState(nodeId);
    if (state !== 'fork_choice') return;
    const bg = this.nodeBgByNodeId.get(nodeId);
    if (!bg) return;
    bg.setStrokeStyle(hovering ? 3 : 2, NODE_STROKE_BY_STATE.fork_choice);
  }

  private computeNodeState(nodeId: string): NodeRenderState {
    const run = appState.get().runState;
    if (!run) return 'upcoming';
    if (nodeId === run.currentNodeId) return 'current';
    if (run.awaitingFork) {
      const cur = currentNode(run);
      if (cur.nextNodeIds.includes(nodeId)) return 'fork_choice';
    }
    if (run.traversedNodeIds.includes(nodeId)) return 'cleared';
    return 'upcoming';
  }

  private refreshNodeStates(): void {
    const run = appState.get().runState;
    if (!run) return;
    this.visibility = computeVisibility(
      run.currentFloorNodes,
      run.currentNodeId,
      run.traversedNodeIds,
      LOOKAHEAD_ROWS,
    );
    for (const node of run.currentFloorNodes) {
      const state = this.computeNodeState(node.id);
      const container = this.nodeContainers.get(node.id);
      const bg = this.nodeBgByNodeId.get(node.id);
      const glyph = this.nodeGlyphByNodeId.get(node.id);
      const label = this.nodeLabelByNodeId.get(node.id);
      if (!container || !bg || !glyph || !label) continue;
      const isGhost = this.visibility.ghost.has(node.id);
      const isVisibleOrRevealed = this.visibility.revealed.has(node.id) || this.visibility.visible.has(node.id);
      const isFogged = !isGhost && !isVisibleOrRevealed;
      container.setVisible(!isFogged);
      container.setAlpha(isGhost ? GHOST_ALPHA : 1);
      if (isFogged) {
        bg.disableInteractive();
        continue;
      }
      bg.setFillStyle(NODE_FILL_BY_STATE[state]);
      bg.setStrokeStyle(2, NODE_STROKE_BY_STATE[state]);
      glyph.setColor(GLYPH_COLOR_BY_STATE[state]);
      label.setColor(state === 'cleared' ? '#555555' : '#aaaaaa');
      const isAwaitingEngage = this.awaitingEngage && node.id === run.currentNodeId;
      if ((state === 'fork_choice' && !isGhost) || isAwaitingEngage) {
        bg.setInteractive({ useHandCursor: true });
      } else {
        bg.disableInteractive();
      }
    }
    this.refreshEdges();
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
    const reward =
      completedNode.type === 'boss'
        ? BOSS_NODE_REWARD * run.currentFloorNumber
        : COMBAT_NODE_REWARD * run.currentFloorNumber;

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
              color: RARITY_HEX[item.rarity],
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
    this.refreshHud();
    this.refreshNodeStates();
    this.refreshStatusBar();

    const run = appState.get().runState!;
    if (run.status === 'camp_screen') {
      this.scene.start('camp_screen');
      return;
    }

    if (run.awaitingFork) {
      // Sit idle on the map; refreshNodeStates above lit fork branches as
      // interactive. Player picks via onNodeClicked.
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
      roster = tickRosterWounds(roster, hospitalTickAmount(s.buildingLevels.hospital));
      return {
        ...s,
        roster,
        hospitalTreatmentsRemaining: hospitalTreatmentCap(s.buildingLevels.hospital),
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.start('camp');
  }

  private refreshHud(): void {
    const run = appState.get().runState!;
    const total = run.currentFloorNodes.length;
    this.hudFloor.setText(
      `The Crypt · Floor ${run.currentFloorNumber} · ${total} nodes`,
    );
    const itemCount = run.pack.items.length;
    const packLabel =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    this.hudPack.setText(packLabel);
  }

  private refreshStatusBar(): void {
    const run = appState.get().runState!;
    const parts = run.party.map((h) => `${h.name} ${h.currentHp}/${h.maxHp}`);
    this.statusText.setText(parts.join(' · '));
  }
}

function glyphForNodeType(type: Node['type']): string {
  switch (type) {
    case 'boss':     return '☠';
    case 'shop':     return '🛒';
    case 'elite':    return '💀';
    case 'camp':     return '🏕';
    case 'event':    return '❓';
    case 'treasure': return '📦';
    case 'combat':
    default:         return '⚔';
  }
}
