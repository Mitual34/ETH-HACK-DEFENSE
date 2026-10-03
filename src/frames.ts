/** Tells the feed view when a newly shown feed has actually reached the screen. */

import type { Scheduler } from "./clock";
import { logWarning } from "./log";

export type FrameWaiter = (surface: HTMLElement, done: () => void) => void;

const PAINTS_UNTIL_VISIBLE = 2;

function afterPaints(remaining: number, done: () => void): void {
  if (remaining === 0) done();
  else requestAnimationFrame(() => afterPaints(remaining - 1, done));
}

/**
 * A camera reports the first frame it presents. A placeholder has no frames, so
 * it waits for the next paints. If a camera stalls, the timeout ends the wait
 * so the screen never hangs on a frame that is not coming.
 */
export function createFrameWaiter(scheduler: Scheduler, timeoutMs: number): FrameWaiter {
  return (surface, done) => {
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      cancelTimeout();
      done();
    };
    const cancelTimeout = scheduler.schedule(timeoutMs, () => {
      logWarning("feed_frame_timeout", `no frame within ${timeoutMs} ms`);
      finish();
    });
    if (surface instanceof HTMLVideoElement && "requestVideoFrameCallback" in surface) {
      surface.requestVideoFrameCallback(finish);
    } else {
      afterPaints(PAINTS_UNTIL_VISIBLE, finish);
    }
  };
}
