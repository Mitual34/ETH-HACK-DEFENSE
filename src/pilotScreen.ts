/**
 * The pilot's screen: one large picture that always shows the live drone.
 * Every camera stays running underneath, so moving to another drone never
 * waits for a camera to start.
 */

import type { FeedSlot } from "./cameras";
import type { DashboardElements } from "./dom";
import { createSurface, NO_TILE } from "./feedSurface";

const LOST_TEXT = "FEED LOST";

export class PilotScreen {
  private surfaces: HTMLElement[] = [];
  private labels: string[] = [];

  constructor(private readonly elements: DashboardElements) {}

  setSlots(slots: FeedSlot[]): void {
    this.surfaces.forEach((surface) => surface.remove());
    this.surfaces = slots.map(createSurface);
    this.labels = slots.map((slot) => slot.label);
    this.elements.pilotScreen.prepend(...this.surfaces);
  }

  /** Shows the feed at this position and returns its surface, if there is one. */
  show(index: number): HTMLElement | undefined {
    this.surfaces.forEach((surface, position) => {
      surface.dataset["active"] = String(position === index);
    });
    this.elements.pilotBadge.textContent = this.labels[index] ?? "";
    this.elements.pilotLost.hidden = index !== NO_TILE;
    return this.surfaces[index];
  }

  showLost(): void {
    this.elements.pilotLost.textContent = LOST_TEXT;
    this.show(NO_TILE);
  }
}
