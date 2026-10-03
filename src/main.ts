/** Browser entry point: builds the real clock, scheduler, cameras and source, then starts the app. */

import { DashboardApp } from "./app";
import { openCameraSlots, padSlots, type FeedSlot } from "./cameras";
import { ChartsView } from "./chartsView";
import { BrowserClock, BrowserScheduler, type Clock, type Scheduler } from "./clock";
import { loadConfig, type DashboardConfig } from "./config";
import { DemoSource } from "./demo";
import { findAnchors, findElements, findPanels, findRows, type DashboardElements } from "./dom";
import { FeedView } from "./feedView";
import "./fonts";
import { createFrameWaiter } from "./frames";
import { Guide } from "./guide";
import { GUIDE_STEPS } from "./guideSteps";
import { logWarning } from "./log";
import type { DashboardState } from "./store";
import { SwitchTimer } from "./switchTimer";
import { openBrowserSocket, WebSocketSource } from "./transport";

interface Runtime {
  config: DashboardConfig;
  clock: Clock;
  scheduler: Scheduler;
  elements: DashboardElements;
}

/**
 * Shows one tile per drone at once: placeholders first so the screen works
 * immediately, then the cameras. onCameras is told how many drones have a
 * working camera, each time that is known.
 */
function createFeed(runtime: Runtime, tiles: number, onCameras: (count: number) => void): FeedView {
  const { config, clock, scheduler, elements } = runtime;
  const waitForFrame = createFrameWaiter(scheduler, config.frameTimeoutMs);
  const feed = new FeedView(elements, new SwitchTimer(clock), waitForFrame);
  const useSlots = (slots: FeedSlot[]): void => {
    feed.setSlots(padSlots(slots, tiles));
    onCameras(slots.filter((slot) => slot.stream !== null).length);
  };
  useSlots([]);
  void openCameraSlots(navigator.mediaDevices, config).then(useSlots);
  return feed;
}

/** The views the app does not draw itself, each told about every new state. */
function createObserver(runtime: Runtime, feed: FeedView): (state: DashboardState) => void {
  const charts = new ChartsView(runtime.elements, runtime.config);
  return (state) => {
    feed.update(state);
    charts.update(state);
  };
}

/** A live relay: every panel at once, no guide, and no DESTROY because the dashboard cannot send. */
function startLive(runtime: Runtime): void {
  const { config, scheduler, elements } = runtime;
  const feed = createFeed(runtime, config.minFeeds, () => undefined);
  const { websocketUrl, reconnectDelayMs } = config;
  const source = new WebSocketSource(websocketUrl, reconnectDelayMs, scheduler, openBrowserSocket);
  elements.destroy.hidden = true;
  new DashboardApp({ ...runtime, source, onState: createObserver(runtime, feed) }).start();
}

/**
 * The demo: DESTROY loses the scripted lead, and the guide walks through what happens.
 * Every drone has a tile; only drones with a working camera take turns as lead.
 */
function startDemo(runtime: Runtime): void {
  const { config, clock, scheduler, elements } = runtime;
  const source = new DemoSource(config.demoNodeCount, clock, scheduler);
  const tiles = Math.max(config.minFeeds, config.demoNodeCount);
  const feed = createFeed(runtime, tiles, (cameras) => source.setLeadPool(cameras));
  const screen = {
    panels: findPanels(document),
    anchors: findAnchors(document),
    rows: findRows(document),
  };
  const guide = new Guide(elements, screen, GUIDE_STEPS, source);
  elements.destroy.addEventListener("click", () => {
    feed.noteDestroyPressed();
    source.loseLead();
    guide.completeAction("loseLead");
  });
  new DashboardApp({ ...runtime, source, onState: createObserver(runtime, feed) }).start();
  guide.start();
}

function main(): void {
  const runtime: Runtime = {
    config: loadConfig(import.meta.env),
    clock: new BrowserClock(),
    scheduler: new BrowserScheduler(),
    elements: findElements(document),
  };
  if (runtime.config.source === "websocket") startLive(runtime);
  else startDemo(runtime);
}

try {
  main();
} catch (error) {
  logWarning("dashboard_start_failed", String(error));
  document.body.textContent = "TALOS dashboard failed to start. See the browser console.";
}
