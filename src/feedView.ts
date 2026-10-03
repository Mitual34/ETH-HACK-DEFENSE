/**
 * The feed wall. Every drone's camera is on screen at once, each in its own
 * labelled tile, and the tile of whichever node the system says is lead is
 * marked as the pilot's view. It follows the swarm's decision; it never picks
 * the feed itself.
 */

import type { FeedSlot } from "./cameras";
import { make, type DashboardElements } from "./dom";
import type { FrameWaiter } from "./frames";
import { handoverStatus } from "./handover";
import { leadsAtCurrentEpoch, type DashboardState } from "./store";
import type { SwitchResult, SwitchTimer } from "./switchTimer";

const MS_DIGITS = 1;
const NO_TILE = -1;
const NO_CAMERA_TEXT = "CAMERA NOT AVAILABLE";
const STATUS = {
  pilot: "PILOT VIEW",
  standby: "STANDBY",
  unavailable: "NOT AVAILABLE",
  lost: "FEED LOST",
} as const;

interface Tile {
  root: HTMLElement;
  surface: HTMLElement;
  status: HTMLElement;
  available: boolean;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(MS_DIGITS)} ms`;
}

function createSurface(slot: FeedSlot): HTMLElement {
  if (slot.stream === null) return make("div", "feed-surface feed-placeholder", NO_CAMERA_TEXT);
  const video = document.createElement("video");
  video.className = "feed-surface";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = slot.stream;
  return video;
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

function statusText(tile: Tile, isPilot: boolean, isLost: boolean): string {
  if (isLost) return STATUS.lost;
  if (isPilot) return STATUS.pilot;
  return tile.available ? STATUS.standby : STATUS.unavailable;
}

/** Position of the lead among the nodes, in numeric id order: D1 is 0, D2 is 1. */
function leadPosition(state: DashboardState, lead: string): number {
  const ids = [...state.nodes.keys()].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  return ids.indexOf(lead);
}

export class FeedView {
  private tiles: Tile[] = [];
  private shownLead: string | null = null;
  private shownPosition = 0;
  private lostIndex = NO_TILE;

  constructor(
    private readonly elements: DashboardElements,
    private readonly timer: SwitchTimer,
    private readonly waitForFrame: FrameWaiter,
  ) {}

  /** Replaces the feeds, for example when the cameras finish opening. */
  setSlots(slots: FeedSlot[]): void {
    this.tiles = slots.map(createTile);
    this.elements.feedScreen.replaceChildren(...this.tiles.map((tile) => tile.root));
    this.renderTiles();
  }

  noteDestroyPressed(): void {
    this.timer.start();
    this.renderDestroy();
  }

  update(state: DashboardState): void {
    const running = handoverStatus(state.handover) === "running";
    const lead = running ? null : (leadsAtCurrentEpoch(state)[0] ?? null);
    if (lead === this.shownLead) return;
    if (lead === null) {
      this.lostIndex = this.pilotIndex();
      this.shownLead = null;
      this.timer.start();
      this.renderTiles();
    } else {
      this.shownLead = lead;
      this.shownPosition = leadPosition(state, lead);
      this.lostIndex = NO_TILE;
      this.showPilot();
    }
    this.renderDestroy();
  }

  private pilotIndex(): number {
    const count = this.tiles.length;
    return this.shownLead === null || count === 0 ? NO_TILE : this.shownPosition % count;
  }

  private showPilot(): void {
    const tile = this.renderTiles();
    this.timer.command();
    if (tile === undefined) this.report(this.timer.finish());
    else this.waitForFrame(tile.surface, () => this.report(this.timer.finish()));
  }

  /** Marks the pilot's tile, the lost tile and the rest. Returns the pilot's tile, if any. */
  private renderTiles(): Tile | undefined {
    const pilot = this.pilotIndex();
    this.tiles.forEach((tile, index) => {
      const isPilot = index === pilot;
      const isLost = index === this.lostIndex;
      tile.root.dataset["pilot"] = String(isPilot);
      tile.root.dataset["lost"] = String(isLost);
      tile.status.textContent = statusText(tile, isPilot, isLost);
    });
    return this.tiles[pilot];
  }

  private report(result: SwitchResult | null): void {
    this.renderDestroy();
    if (result === null) return;
    const { switchTime, switchNote } = this.elements;
    switchTime.textContent = formatMs(result.totalMs);
    switchNote.textContent = `decision ${formatMs(result.decisionMs)} + picture ${formatMs(result.pictureMs)}`;
  }

  /** One switch at a time: the button waits until the last one is on screen. */
  private renderDestroy(): void {
    this.elements.destroy.toggleAttribute("disabled", this.timer.isRunning());
  }
}
