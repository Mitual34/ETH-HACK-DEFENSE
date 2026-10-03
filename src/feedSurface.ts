/** One drone's picture: its live camera, or a placeholder saying there is none. */

import type { FeedSlot } from "./cameras";
import { make } from "./dom";

export const NO_TILE = -1;
const NO_CAMERA_TEXT = "CAMERA NOT AVAILABLE";

/** A stream can feed several video elements, so each view builds its own surface. */
export function createSurface(slot: FeedSlot): HTMLElement {
  if (slot.stream === null) return make("div", "feed-surface feed-placeholder", NO_CAMERA_TEXT);
  const video = document.createElement("video");
  video.className = "feed-surface";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = slot.stream;
  return video;
}
