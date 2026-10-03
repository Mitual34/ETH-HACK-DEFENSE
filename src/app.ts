/** Wires source -> validation -> store -> render. Observes; never sends or decides. */

import type { Cancel, Clock, Scheduler } from "./clock";
import type { DashboardConfig } from "./config";
import type { DashboardElements } from "./dom";
import { logWarning } from "./log";
import { renderHandover, renderLog, renderNodes, renderSummary } from "./render";
import { applyEvent, countMalformed, initialState, setConnection, type DashboardState } from "./store";
import type { ConnectionStatus, SwarmEventSource } from "./transport";
import { parseSwarmEvent } from "./validate";

export interface AppDependencies {
  config: DashboardConfig;
  source: SwarmEventSource;
  clock: Clock;
  scheduler: Scheduler;
  elements: DashboardElements;
}

export class DashboardApp {
  private state: DashboardState = initialState();
  private cancelTick: Cancel | null = null;

  constructor(private readonly dependencies: AppDependencies) {}

  start(): void {
    this.renderAll();
    this.dependencies.source.start({
      onMessage: (text) => this.receive(text),
      onStatus: (status) => this.updateConnection(status),
    });
    this.tick();
  }

  stop(): void {
    this.dependencies.source.stop();
    this.cancelTick?.();
    this.cancelTick = null;
  }

  snapshot(): DashboardState {
    return this.state;
  }

  private receive(text: string): void {
    const { config, clock } = this.dependencies;
    const event = parseSwarmEvent(text, config);
    if (event === null) {
      this.dropMalformed();
    } else {
      this.state = applyEvent(this.state, event, clock.now(), config.maxLogRows);
    }
    this.renderAll();
  }

  /** Counts every malformed packet; logs the first and then one per malformedLogEvery. */
  private dropMalformed(): void {
    this.state = countMalformed(this.state);
    const count = this.state.malformedCount;
    if (count === 1 || count % this.dependencies.config.malformedLogEvery === 0) {
      logWarning("malformed_packet_dropped", `total dropped: ${count}`);
    }
  }

  private updateConnection(status: ConnectionStatus): void {
    this.state = setConnection(this.state, status);
    this.renderAll();
  }

  private renderAll(): void {
    const { elements, clock } = this.dependencies;
    renderSummary(elements, this.state);
    renderNodes(elements, this.state);
    renderHandover(elements, this.state.handover, clock.now());
    renderLog(elements, this.state.log);
  }

  /** Redraws only the timer, so a running handover counts up between events. */
  private tick(): void {
    const { elements, clock, scheduler, config } = this.dependencies;
    renderHandover(elements, this.state.handover, clock.now());
    this.cancelTick = scheduler.schedule(config.timerRefreshMs, () => this.tick());
  }
}
