import * as Phaser from 'phaser';
import { computeMapLayout, type MapLayout } from '@dungeon/map_layout';
import type { Node } from '@dungeon/node';
import { computeVisibility, LOOKAHEAD_ROWS, type VisibilityResult } from '@dungeon/visibility';
import { applyTravelTick, chooseNextNode, currentNode } from '@run/run_state';
import { appState } from './app_state';
import { setCorridorDeltas } from './corridor_handoff';

const MAP_LEFT = 120;
const MAP_TOP = 100;
const MAP_WIDTH = 720;
const MAP_HEIGHT = 380;

const NODE_RADIUS = 18;

const FF_X = 944;
const FF_Y = 48;
const FF_W = 60;
const FF_H = 24;

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
  private walkSpeed: 1 | 3 = 1;
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

  constructor() {
    super('dungeon');
  }

  create(): void {
    this.nodeContainers = new Map();
    this.nodeBgByNodeId = new Map();
    this.nodeGlyphByNodeId = new Map();
    this.nodeLabelByNodeId = new Map();

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
    this.buildStatusBar();

    this.refreshHud();
    this.refreshNodeStates();
    this.refreshStatusBar();
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

  private buildStatusBar(): void {
    this.statusText = this.add
      .text(16, 524, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      })
      .setOrigin(0, 0);
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

  private onNodeClicked(nodeId: string): void {
    const run = appState.get().runState;
    if (!run || run.status !== 'in_dungeon') return;

    // Fresh-entry engage: clicking the start node on a brand-new floor
    // transitions to corridor for the first combat. No state advance, no HP
    // tick, no scroll — the corridor detects this case and engages immediately.
    if (
      nodeId === run.currentNodeId &&
      !run.awaitingFork &&
      run.traversedNodeIds.length === 1
    ) {
      this.scene.start('corridor');
      return;
    }

    if (!run.awaitingFork) return;
    const cur = currentNode(run);
    if (!cur.nextNodeIds.includes(nodeId)) return;

    // Advance currentNodeId, then apply per-edge HP tick BEFORE handing off to
    // the corridor scene so saved state is consistent if the user closes mid-travel.
    appState.update((s) => {
      const advanced = chooseNextNode(s.runState!, nodeId);
      const { runState: postTick, deltas } = applyTravelTick(advanced);
      setCorridorDeltas(deltas);
      return { ...s, runState: postTick };
    });
    this.scene.start('corridor');
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
      // Fresh-entry start node is clickable to engage the first combat.
      const isFreshEntryStart =
        run.traversedNodeIds.length === 1 &&
        node.id === run.currentNodeId &&
        !run.awaitingFork;
      if ((state === 'fork_choice' && !isGhost) || isFreshEntryStart) {
        bg.setInteractive({ useHandCursor: true });
      } else {
        bg.disableInteractive();
      }
    }
    this.refreshEdges();
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
