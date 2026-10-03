/**
 * Keeps the pilot's screen and the feed wall in step with the swarm.
 *
 * When the lead fails its drone stops, the pilot's screen moves on its own to
 * the drone the system names as the new lead, and that move is timed. The
 * view follows the swarm's decision; it never picks the feed itself.
 */

import type { FeedSlot } from "./cameras";
import type { DashboardElements } from "./dom";
import { NO_TILE } from "./feedSurface";
import type { FeedWall } from "./feedWall";
import type { FrameWaiter } from "./frames";
import { handoverStatus } from "./handover";
import type { PilotScreen } from "./pilotScreen";
import { leadsAtCurrentEpoch, type DashboardState } from "./store";
import type { SwitchResult, SwitchTimer } from "./switchTimer";

const MS_DIGITS = 1;

export interface FeedParts {
  elements: DashboardElements;
  pilot: PilotScreen;
  wall: FeedWall;
  timer: SwitchTimer;
  waitForFrame: FrameWaiter;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(MS_DIGITS)} ms`;
}

/** Node ids in numeric order, so D1 is tile 0 and D2 is tile 1. */
function orderedIds(state: DashboardState): string[] {
  return [...state.nodes.keys()].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

export class FeedView {
  private tileCount = 0;
  private shownLead: string | null = null;
  private pilotIndex = NO_TILE;
  private lostIndex = NO_TILE;

  constructor(private readonly parts: FeedParts) {}

  /** Replaces the feeds, for example when the cameras finish opening. */
  setSlots(slots: FeedSlot[]): void {
    this.tileCount = slots.length;
    this.parts.pilot.setSlots(slots);
    this.parts.wall.setSlots(slots);
    this.parts.pilot.show(this.pilotIndex);
    this.parts.wall.render(this.pilotIndex, new Set());
  }

  noteDestroyPressed(): void {
    this.parts.timer.start();
    this.renderDestroy();
  }

  update(state: DashboardState): void {
    const ids = orderedIds(state);
    const running = handoverStatus(state.handover) === "running";
    const lead = running ? null : (leadsAtCurrentEpoch(state)[0] ?? null);
    if (lead !== this.shownLead) this.changeLead(lead, ids);
    this.parts.wall.render(this.pilotIndex, this.stoppedTiles(state, ids));
    this.renderDestroy();
  }

  private tileOf(position: number): number {
    return position < 0 || this.tileCount === 0 ? NO_TILE : position % this.tileCount;
  }

  private changeLead(lead: string | null, ids: string[]): void {
    this.shownLead = lead;
    if (lead === null) {
      this.lostIndex = this.pilotIndex;
      this.pilotIndex = NO_TILE;
      this.parts.timer.start();
      this.parts.pilot.showLost();
      return;
    }
    this.lostIndex = NO_TILE;
    this.pilotIndex = this.tileOf(ids.indexOf(lead));
    this.showPilot();
  }

  private showPilot(): void {
    const { pilot, timer, waitForFrame } = this.parts;
    const surface = pilot.show(this.pilotIndex);
    timer.command();
    if (surface === undefined) this.report(timer.finish());
    else waitForFrame(surface, () => this.report(timer.finish()));
  }

  /** A drone is stopped while its feed is lost, and for as long as its epoch is out of date. */
  private stoppedTiles(state: DashboardState, ids: string[]): Set<number> {
    const stopped = new Set<number>();
    if (this.lostIndex !== NO_TILE) stopped.add(this.lostIndex);
    ids.forEach((id, position) => {
      const node = state.nodes.get(id);
      if (node !== undefined && node.epoch < state.epoch) stopped.add(this.tileOf(position));
    });
    return stopped;
  }

  private report(result: SwitchResult | null): void {
    this.renderDestroy();
    if (result === null) return;
    const { switchTime, switchNote } = this.parts.elements;
    switchTime.textContent = formatMs(result.totalMs);
    switchNote.textContent = `decision ${formatMs(result.decisionMs)} + picture ${formatMs(result.pictureMs)}`;
  }

  /** One switch at a time: the button waits until the last one is on screen. */
  private renderDestroy(): void {
    this.parts.elements.destroy.toggleAttribute("disabled", this.parts.timer.isRunning());
  }
}
