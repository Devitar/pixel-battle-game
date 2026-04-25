import * as Phaser from 'phaser';
import { ABILITIES } from '../data/abilities';
import type { AbilityId, SlotIndex, StatusId } from '../data/types';
import type {
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

const PARTY_X: Record<number, number> = { 1: 400, 2: 320, 3: 240, 4: 160 };
const ENEMY_X: Record<number, number> = { 1: 560, 2: 640, 3: 720, 4: 800 };

const D_ROUND_BANNER_IN = 100;
const D_ROUND_BANNER_HOLD = 100;
const D_ROUND_BANNER_OUT = 200;
const D_TURN_START = 100;
const D_TURN_SKIP_STUNNED = 250;
const D_DAMAGE_BUFFER = 0;
const D_STATUS_APPLIED = 150;
const D_STATUS_EXPIRED = 100;
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
      if (this.aborted) return;
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
    if (this.aborted) return 1;
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
      : ev.targetIds.length === 0
        ? `${casterEntry.displayName} casts ${ability.name}`
        : `${casterEntry.displayName} casts ${ability.name} on ${targetNames}`;
    this.setLog(log);

    if (isAoE) {
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
      const pulsePromise = caster.pulse();
      const damagePromises = followingDamages.map(d => this.applyDamageVisual(d));
      await Promise.all([pulsePromise, ...damagePromises]);
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
    return 1;
  }

  private async onDamage(ev: Extract<CombatEvent, { kind: 'damage_applied' }>): Promise<number> {
    await this.applyDamageVisual(ev);
    this.appendLog(` — ${ev.amount} dmg`);
    if (D_DAMAGE_BUFFER > 0) await this.delay(D_DAMAGE_BUFFER);
    return 1;
  }

  private async applyDamageVisual(
    ev: Extract<CombatEvent, { kind: 'damage_applied' }>,
  ): Promise<void> {
    const actor = this.actors.get(ev.targetId);
    const entry = this.running.get(ev.targetId);
    if (!actor || !entry) return;
    const newHp = Math.max(0, entry.hp - ev.amount);
    entry.hp = newHp;
    actor.spawnNumber(`-${ev.amount}`, COLOR_DAMAGE);
    const flashPromise = actor.flashHit();
    const hpPromise = actor.setHpBar(newHp, entry.maxHp);
    await Promise.all([flashPromise, hpPromise]);
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
