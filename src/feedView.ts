/**
 * The pilot's screen. It shows the feed of whichever node the system says is
 * lead, and nothing while a handover is running. It follows the swarm's
 * decision; it never picks the feed itself.
 */

import type { FeedSlot } from "./cameras";
import type { DashboardElements } from "./dom";
import type { FrameWaiter } from "./frames";
import { handoverStatus } from "./handover";
import { leadsAtCurrentEpoch, type DashboardState } from "./store";
import type { SwitchResult, SwitchTimer } from "./switchTimer";

const MS_DIGITS = 1;
const LOST_TEXT = "FEED LOST";
const PULSE_CLASS = "pulse";
const LIVE_TEXT = "LIVE CAMERA";
const NO_CAMERA_TEXT = "NO CAMERA";

function formatMs(ms: number): string {
  return `${ms.toFixed(MS_DIGITS)} ms`;
}

function createSurface(slot: FeedSlot): HTMLElement {
  if (slot.stream === null) {
    const placeholder = document.createElement("div");
    placeholder.className = "feed-surface feed-placeholder";
    placeholder.textContent = NO_CAMERA_TEXT;
    return placeholder;
  }
  const video = document.createElement("video");
  video.className = "feed-surface";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = slot.stream;
  return video;
}

/** Position of the lead among the nodes, in numeric id order: D1 is 0, D2 is 1. */
function leadPosition(state: DashboardState, lead: string): number {
  const ids = [...state.nodes.keys()].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  return ids.indexOf(lead);
}

export class FeedView {
  private slots: FeedSlot[] = [];
  private surfaces: HTMLElement[] = [];
  private shownLead: string | null = null;
  private shownPosition = 0;

  constructor(
    private readonly elements: DashboardElements,
    private readonly timer: SwitchTimer,
    private readonly waitForFrame: FrameWaiter,
  ) {}

  /** Replaces the feeds, for example when the cameras finish opening. */
  setSlots(slots: FeedSlot[]): void {
    this.surfaces.forEach((surface) => surface.remove());
    this.slots = slots;
    this.surfaces = slots.map(createSurface);
    this.elements.feedScreen.prepend(...this.surfaces);
    this.activate();
  }

  noteDestroyPressed(): void {
    this.timer.start();
    this.renderDestroy();
  }

  update(state: DashboardState): void {
    const running = handoverStatus(state.handover) === "running";
    const lead = running ? null : (leadsAtCurrentEpoch(state)[0] ?? null);
    if (lead === this.shownLead) return;
    this.shownLead = lead;
    if (lead === null) {
      this.timer.start();
      this.showLost();
    } else {
      this.shownPosition = leadPosition(state, lead);
      this.showLead(lead);
    }
    this.renderDestroy();
  }

  private showLost(): void {
    this.elements.feedLost.textContent = LOST_TEXT;
    this.elements.feedLost.hidden = false;
    this.activate();
  }

  private showLead(lead: string): void {
    this.elements.feedLost.hidden = true;
    const surface = this.activate(lead);
    this.timer.command();
    if (surface === undefined) this.report(this.timer.finish());
    else this.waitForFrame(surface, () => this.report(this.timer.finish()));
  }

  /**
   * Shows the surface for the current lead, or none while the feed is lost.
   * The badge names the drone the feed stands in for; a lead with no feed of
   * its own keeps its node id, so the label never claims the wrong drone.
   */
  private activate(lead: string | null = this.shownLead): HTMLElement | undefined {
    const count = this.surfaces.length;
    const index = lead === null || count === 0 ? -1 : this.shownPosition % count;
    const slot = this.slots[index];
    const ownFeed = this.shownPosition < count;
    this.surfaces.forEach((surface, position) => {
      surface.dataset["active"] = String(position === index);
    });
    this.elements.feedBadge.textContent = slot !== undefined && ownFeed ? slot.label : (lead ?? "");
    this.elements.feedSource.textContent =
      slot === undefined ? "" : slot.stream === null ? NO_CAMERA_TEXT : LIVE_TEXT;
    return this.surfaces[index];
  }

  private report(result: SwitchResult | null): void {
    this.renderDestroy();
    if (result === null) return;
    const { switchTime, switchNote, feedBadge } = this.elements;
    switchTime.textContent = formatMs(result.totalMs);
    switchNote.textContent = `decision ${formatMs(result.decisionMs)} + picture ${formatMs(result.pictureMs)}`;
    feedBadge.classList.remove(PULSE_CLASS);
    void feedBadge.offsetWidth;
    feedBadge.classList.add(PULSE_CLASS);
  }

  /** One switch at a time: the button waits until the last one is on screen. */
  private renderDestroy(): void {
    this.elements.destroy.toggleAttribute("disabled", this.timer.isRunning());
  }
}
