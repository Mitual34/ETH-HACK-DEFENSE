/** Fakes of every interface, for deterministic tests: no real time, no network. */

import type { Cancel, Clock, Scheduler } from "./clock";
import type { SocketLike, SourceHandlers, SwarmEventSource } from "./transport";

interface PendingTask {
  at: number;
  order: number;
  task: () => void;
}

/** A clock and scheduler in one. Time moves only when advance() is called. */
export class FakeTimeline implements Clock, Scheduler {
  private current = 0;
  private nextOrder = 0;
  private pending: PendingTask[] = [];

  now(): number {
    return this.current;
  }

  schedule(delayMs: number, task: () => void): Cancel {
    const entry: PendingTask = { at: this.current + delayMs, order: this.nextOrder, task };
    this.nextOrder += 1;
    this.pending.push(entry);
    return () => {
      this.pending = this.pending.filter((candidate) => candidate !== entry);
    };
  }

  /** Runs every task due within the window, in time order then scheduling order. */
  advance(durationMs: number): void {
    const target = this.current + durationMs;
    for (let next = this.takeDue(target); next !== undefined; next = this.takeDue(target)) {
      this.current = next.at;
      next.task();
    }
    this.current = target;
  }

  private takeDue(target: number): PendingTask | undefined {
    const due = this.pending
      .filter((entry) => entry.at <= target)
      .sort((left, right) => left.at - right.at || left.order - right.order)[0];
    if (due !== undefined) this.pending = this.pending.filter((entry) => entry !== due);
    return due;
  }
}

export class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((data: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  close(): void {
    this.closed = true;
  }
}

/** A source the test drives by hand. */
export class FakeSource implements SwarmEventSource {
  handlers: SourceHandlers | null = null;

  start(handlers: SourceHandlers): void {
    this.handlers = handlers;
  }

  stop(): void {
    this.handlers = null;
  }

  emit(text: string): void {
    this.handlers?.onMessage(text);
  }
}
