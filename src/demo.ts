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

/** What the guide may ask the demo to do. It steers the demo only, never a real swarm. */
export interface DemoControls {
  loseLead(): void;
  restoreLead(): void;
  freeRun(): void;
}

export class DemoSource implements SwarmEventSource, DemoControls {
  private handlers: SourceHandlers | null = null;
  private readonly cancels = new Set<Cancel>();
  private startedAt = 0;
  private busyUntil = 0;
  private handoverCount = 0;
  private leadIsDown = false;
  private freeRunning = false;

  constructor(
    private readonly nodeCount: number,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
  ) {}

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

  /** If the previous lead is still down it is restored first, so a node is always free to take over. */
  loseLead(): void {
    if (this.handlers === null) return;
    this.restoreLead();
    this.play(buildHandoverScript(this.nodeCount, this.handoverCount));
    this.handoverCount += 1;
    this.leadIsDown = true;
  }

  restoreLead(): void {
    if (this.handlers === null || !this.leadIsDown) return;
    this.play(buildRejoinScript(this.nodeCount, this.handoverCount - 1));
    this.leadIsDown = false;
  }

  /** Loses and restores the lead once per cycle, forever. */
  freeRun(): void {
    if (this.handlers === null || this.freeRunning) return;
    this.freeRunning = true;
    this.runCycle();
  }

  private runCycle(): void {
    this.after(DEMO_TIMING.freeRunKillAtMs, () => this.loseLead());
    this.after(DEMO_TIMING.freeRunRestoreAtMs, () => this.restoreLead());
    this.after(DEMO_TIMING.freeRunCycleMs, () => this.runCycle());
  }

  private elapsed(): number {
    return this.clock.now() - this.startedAt;
  }

  /** Queues the scene after whatever is already playing. Timestamps are ms since the demo started. */
  private play(script: ScriptedEvent[]): void {
    const sceneStart = Math.max(this.elapsed(), this.busyUntil);
    for (const { offsetMs, event } of script) {
      const timestamp = sceneStart + offsetMs;
      const packet = JSON.stringify({ timestamp, ...event });
      this.after(timestamp - this.elapsed(), () => this.handlers?.onMessage(packet));
      this.busyUntil = Math.max(this.busyUntil, timestamp);
    }
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
