/** Browser entry point: builds the real clock, scheduler, cameras and source, then starts the app. */

import { DashboardApp } from "./app";
import { openCameraSlots, padSlots } from "./cameras";
import { BrowserClock, BrowserScheduler, type Clock, type Scheduler } from "./clock";
import { loadConfig, type DashboardConfig } from "./config";
import { DemoSource } from "./demo";
import { findAnchors, findElements, findPanels, type DashboardElements } from "./dom";
import { FeedView } from "./feedView";
import "./fonts";
import { createFrameWaiter } from "./frames";
import { Guide } from "./guide";
import { GUIDE_STEPS } from "./guideSteps";
import { logWarning } from "./log";
import { SwitchTimer } from "./switchTimer";
import { openBrowserSocket, WebSocketSource } from "./transport";

interface Runtime {
  config: DashboardConfig;
  clock: Clock;
  scheduler: Scheduler;
  elements: DashboardElements;
}

/** Starts with placeholders so the screen works at once, then swaps in the cameras. */
function createFeedView(runtime: Runtime): FeedView {
  const { config, clock, scheduler, elements } = runtime;
  const waitForFrame = createFrameWaiter(scheduler, config.frameTimeoutMs);
  const feed = new FeedView(elements, new SwitchTimer(clock), waitForFrame);
  feed.setSlots(padSlots([], config.minFeeds));
  void openCameraSlots(navigator.mediaDevices, config).then((slots) => feed.setSlots(slots));
  return feed;
}

/** A live relay: every panel at once, no guide, and no DESTROY because the dashboard cannot send. */
function startLive(runtime: Runtime, feed: FeedView): void {
  const { config, scheduler, elements } = runtime;
  const { websocketUrl, reconnectDelayMs } = config;
  const source = new WebSocketSource(websocketUrl, reconnectDelayMs, scheduler, openBrowserSocket);
  elements.destroy.hidden = true;
  new DashboardApp({ ...runtime, source, onState: (state) => feed.update(state) }).start();
}

/** The demo: DESTROY loses the scripted lead, and the guide walks through what happens. */
function startDemo(runtime: Runtime, feed: FeedView): void {
  const { config, clock, scheduler, elements } = runtime;
  const source = new DemoSource(config.demoNodeCount, clock, scheduler);
  const screen = { panels: findPanels(document), anchors: findAnchors(document) };
  const guide = new Guide(elements, screen, GUIDE_STEPS, source);
  elements.destroy.addEventListener("click", () => {
    feed.noteDestroyPressed();
    source.loseLead();
    guide.completeAction("loseLead");
  });
  new DashboardApp({ ...runtime, source, onState: (state) => feed.update(state) }).start();
  guide.start();
}

function main(): void {
  const runtime: Runtime = {
    config: loadConfig(import.meta.env),
    clock: new BrowserClock(),
    scheduler: new BrowserScheduler(),
    elements: findElements(document),
  };
  const feed = createFeedView(runtime);
  if (runtime.config.source === "websocket") startLive(runtime, feed);
  else startDemo(runtime, feed);
}

try {
  main();
} catch (error) {
  logWarning("dashboard_start_failed", String(error));
  document.body.textContent = "TALOS dashboard failed to start. See the browser console.";
}
