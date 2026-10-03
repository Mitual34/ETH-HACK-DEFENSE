/**
 * Plays scripted scenes through the same path real relay packets take.
 * Scenes are queued one after another, so events never arrive out of order
 * however quickly the controls are pressed.
 */

import type { Cancel, Clock, Scheduler } from "./clock";
import {
  buildBootScript,
  buildHandoverScript,
  buildRejoinScript,
  FIRST_EPOCH,
  type ScriptedEvent,
} from "./demoScript";
import type { SourceHandlers, SwarmEventSource } from "./transport";

const MIN_LEAD_POOL = 2;

interface DownedNode {
  node: number;
  epoch: number;
}

export class DemoSource implements SwarmEventSource {
  private handlers: SourceHandlers | null = null;
  private readonly cancels = new Set<Cancel>();
  private startedAt = 0;
  private busyUntil = 0;
  private leadPool: number;
  private epoch = FIRST_EPOCH;
  private lead = 0;
  private successor: number | null = 1;
  private down: DownedNode[] = [];

  constructor(
    private readonly nodeCount: number,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
  ) {
    this.leadPool = nodeCount;
  }

  /**
   * Limits which nodes may become lead, normally to the nodes that have a
   * camera. Ignored once a handover has happened, so the succession never jumps.
   */
  setLeadPool(size: number): void {
    if (this.epoch > FIRST_EPOCH) return;
    this.leadPool = Math.min(Math.max(size, MIN_LEAD_POOL), this.nodeCount);
  }

  start(handlers: SourceHandlers): void {
    this.handlers = handlers;
    this.startedAt = this.clock.now();
    handlers.onStatus("demo");
    this.play(buildBootScript(this.nodeCount));
  }

  stop(): void {
    this.handlers = null;
    this.cancels.forEach((cancel) => cancel());
    this.cancels.clear();
  }

  /**
   * Destroys the lead. It stays down until restored, and the successor takes
   * over. With no successor left standing there is nothing to hand over to,
   * so the press is ignored.
   */
  loseLead(): void {
    const { lead, successor, epoch } = this;
    if (this.handlers === null || successor === null) return;
    const downNodes = this.down.map((entry) => entry.node);
    const nextSuccessor = this.nextStanding([...downNodes, lead, successor]);
    const plan = { nodeCount: this.nodeCount, epoch, lead, successor, nextSuccessor, down: downNodes };
    this.play(buildHandoverScript(plan));
    this.down.push({ node: lead, epoch });
    this.lead = successor;
    this.successor = nextSuccessor;
    this.epoch += 1;
  }

  /** Brings back the drone that has been down longest. It becomes successor if there is none. */
  restoreLead(): void {
    const returning = this.down.shift();
    if (this.handlers === null || returning === undefined) return;
    const role = this.successor === null ? "SUCCESSOR" : "FOLLOWER";
    if (this.successor === null) this.successor = returning.node;
    this.play(buildRejoinScript(returning.node, returning.epoch, this.epoch, role));
  }

  /** The first drone in the lead pool, counting on from the lead, that is not excluded. */
  private nextStanding(excluded: readonly number[]): number | null {
    for (let step = 1; step <= this.leadPool; step += 1) {
      const candidate = (this.lead + step) % this.leadPool;
      if (!excluded.includes(candidate)) return candidate;
    }
    return null;
  }

  private elapsed(): number {
    return this.clock.now() - this.startedAt;
  }

  /** Queues the scene after whatever is already playing. Timestamps are ms since the demo started. */
  private play(script: ScriptedEvent[]): void {
    const now = this.elapsed();
    const sceneStart = Math.max(now, this.busyUntil);
    const batches = new Map<number, string[]>();
    for (const { offsetMs, event } of script) {
      const timestamp = sceneStart + offsetMs;
      const batch = batches.get(timestamp) ?? [];
      batch.push(JSON.stringify({ timestamp, ...event }));
      batches.set(timestamp, batch);
      this.busyUntil = Math.max(this.busyUntil, timestamp);
    }
    for (const [timestamp, packets] of batches) {
      this.after(timestamp - now, () => this.emit(packets));
    }
  }

  /** Events that share a timestamp leave on one timer, so a real timer cannot reorder them. */
  private emit(packets: string[]): void {
    for (const packet of packets) this.handlers?.onMessage(packet);
  }

  /** Timers remove themselves once fired, so the pending set stays bounded. */
  private after(delayMs: number, task: () => void): void {
    const cancel = this.scheduler.schedule(delayMs, () => {
      this.cancels.delete(cancel);
      task();
    });
    this.cancels.add(cancel);
  }
}
