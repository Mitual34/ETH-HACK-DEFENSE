/** Plays the scripted scenario through the same path real relay packets take. */

import type { Cancel, Clock, Scheduler } from "./clock";
import { buildBootScript, buildCycleScript, cycleStartMs, type ScriptedEvent } from "./demoScript";
import type { SourceHandlers, SwarmEventSource } from "./transport";

export class DemoSource implements SwarmEventSource {
  private handlers: SourceHandlers | null = null;
  private cancels: Cancel[] = [];
  private startedAt = 0;

  constructor(
    private readonly nodeCount: number,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
  ) {}

  start(handlers: SourceHandlers): void {
    this.handlers = handlers;
    this.startedAt = this.clock.now();
    handlers.onStatus("demo");
    const firstCycle = 0;
    this.play([...buildBootScript(this.nodeCount), ...buildCycleScript(this.nodeCount, firstCycle)]);
    this.queueCycle(firstCycle + 1);
  }

  stop(): void {
    this.handlers = null;
    this.cancels.forEach((cancel) => cancel());
    this.cancels = [];
  }

  private delayUntil(atMs: number): number {
    return Math.max(0, atMs - (this.clock.now() - this.startedAt));
  }

  private play(script: ScriptedEvent[]): void {
    for (const scripted of script) {
      const emit = (): void => this.handlers?.onMessage(JSON.stringify(scripted.event));
      this.cancels.push(this.scheduler.schedule(this.delayUntil(scripted.atMs), emit));
    }
  }

  /** Each cycle is scheduled when it starts, so pending timers stay bounded. */
  private queueCycle(cycle: number): void {
    const begin = (): void => {
      this.cancels = [];
      this.play(buildCycleScript(this.nodeCount, cycle));
      this.queueCycle(cycle + 1);
    };
    this.cancels.push(this.scheduler.schedule(this.delayUntil(cycleStartMs(this.nodeCount, cycle)), begin));
  }
}
