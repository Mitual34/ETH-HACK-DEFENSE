/**
 * Times one feed switch on this screen, in milliseconds.
 *
 *   start    the DESTROY press, or the feed being lost if nobody pressed
 *   command  the system names a new lead and the screen is told to switch
 *   finish   the first frame from the new camera is on screen
 *
 * decision = command - start   (how long the system took to decide)
 * picture  = finish - command  (how long this screen took to show it)
 */

import type { Clock } from "./clock";

export interface SwitchResult {
  totalMs: number;
  decisionMs: number;
  pictureMs: number;
}

export class SwitchTimer {
  private startedAt: number | null = null;
  private commandedAt: number | null = null;

  constructor(private readonly clock: Clock) {}

  /** The first start wins, so a press is not overwritten by the loss that follows it. */
  start(): void {
    if (this.startedAt === null) this.startedAt = this.clock.now();
  }

  command(): void {
    if (this.startedAt !== null && this.commandedAt === null) this.commandedAt = this.clock.now();
  }

  isRunning(): boolean {
    return this.startedAt !== null;
  }

  /** Returns the result and resets, or null when no switch was being timed. */
  finish(): SwitchResult | null {
    const { startedAt, commandedAt } = this;
    this.startedAt = null;
    this.commandedAt = null;
    if (startedAt === null || commandedAt === null) return null;
    const finishedAt = this.clock.now();
    return {
      totalMs: finishedAt - startedAt,
      decisionMs: commandedAt - startedAt,
      pictureMs: finishedAt - commandedAt,
    };
  }
}
