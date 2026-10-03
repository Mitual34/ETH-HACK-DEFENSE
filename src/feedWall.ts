/**
 * The feed wall: every drone in its own labelled tile, all on screen at once.
 * A destroyed drone stops working: its picture goes dark and the tile says so.
 */

import type { FeedSlot } from "./cameras";
import { make, type DashboardElements } from "./dom";
import { createSurface } from "./feedSurface";
import { logWarning } from "./log";

const STATUS = {
  pilot: "LIVE",
  standby: "STANDBY",
  unavailable: "NOT AVAILABLE",
  stopped: "DESTROYED",
} as const;

interface Tile {
  root: HTMLElement;
  surface: HTMLElement;
  status: HTMLElement;
  available: boolean;
}

function createTile(slot: FeedSlot): Tile {
  const available = slot.stream !== null;
  const root = make("div", "feed-tile", "");
  const surface = createSurface(slot);
  const status = make("p", "feed-tile-status", "");
  root.dataset["available"] = String(available);
  root.append(surface, make("p", "feed-tile-label", slot.label), status);
  return { root, surface, status, available };
}

function statusText(tile: Tile, isPilot: boolean, isStopped: boolean): string {
  if (isStopped) return STATUS.stopped;
  if (isPilot) return STATUS.pilot;
  return tile.available ? STATUS.standby : STATUS.unavailable;
}

/** Stops a destroyed drone's picture, and resumes it when the drone is back. */
function setPlaying(surface: HTMLElement, playing: boolean): void {
  if (!(surface instanceof HTMLVideoElement) || surface.paused === !playing) return;
  if (!playing) {
    surface.pause();
    return;
  }
  surface.play().catch((error: unknown) => logWarning("feed_resume_failed", String(error)));
}

export class FeedWall {
  private tiles: Tile[] = [];

  constructor(private readonly elements: DashboardElements) {}

  setSlots(slots: FeedSlot[]): void {
    this.tiles = slots.map(createTile);
    this.elements.feedScreen.replaceChildren(...this.tiles.map((tile) => tile.root));
  }

  /** pilot is the tile the pilot is seeing; stopped are the tiles of failed drones. */
  render(pilot: number, stopped: ReadonlySet<number>): void {
    this.tiles.forEach((tile, index) => {
      const isStopped = stopped.has(index);
      const isPilot = index === pilot && !isStopped;
      tile.root.dataset["pilot"] = String(isPilot);
      tile.root.dataset["stopped"] = String(isStopped);
      tile.status.textContent = statusText(tile, isPilot, isStopped);
      setPlaying(tile.surface, !isStopped);
    });
  }
}
