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
  DEMO_TIMING,
  type ScriptedEvent,
} from "./demoScript";
import type { SourceHandlers, SwarmEventSource } from "./transport";

const MIN_LEAD_POOL = 2;
const IMMEDIATELY = 0;

export class DemoSource implements SwarmEventSource {
  private handlers: SourceHandlers | null = null;
  private readonly cancels = new Set<Cancel>();
  private startedAt = 0;
  private busyUntil = 0;
  private handoverCount = 0;
  private leadIsDown = false;
  private leadPool: number;

  constructor(
    private readonly nodeCount: number,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
  ) {
    this.leadPool = nodeCount;
  }

  /**
   * Limits which nodes take turns as lead, normally to the nodes that have a
   * feed. Ignored once a handover has happened, so the rotation never jumps.
   */
  setLeadPool(size: number): void {
    if (this.handoverCount > 0) return;
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
   * If the previous lead is still down it rejoins at once, so a node is free to
   * take over and the wait is not counted in the switch being timed.
   */
  loseLead(): void {
    if (this.handlers === null) return;
    this.rejoin(IMMEDIATELY);
    this.play(buildHandoverScript(this.nodeCount, this.handoverCount, this.leadPool));
    this.handoverCount += 1;
    this.leadIsDown = true;
  }

  restoreLead(): void {
    this.rejoin(DEMO_TIMING.rejoinAfterMs);
  }

  private rejoin(afterMs: number): void {
    if (this.handlers === null || !this.leadIsDown) return;
    this.play(buildRejoinScript(this.handoverCount - 1, this.leadPool, afterMs));
    this.leadIsDown = false;
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
