/** Browser entry point: builds the real clock, scheduler, cameras and source, then starts the app. */

import { DashboardApp } from "./app";
import { openCameraSlots, padSlots, type FeedSlot } from "./cameras";
import { ChartsView } from "./chartsView";
import { BrowserClock, BrowserScheduler, type Clock, type Scheduler } from "./clock";
import { loadConfig, type DashboardConfig } from "./config";
import { DemoSource } from "./demo";
import { findElements, type DashboardElements } from "./dom";
import { FeedView } from "./feedView";
import { FeedWall } from "./feedWall";
import "./fonts";
import { createFrameWaiter } from "./frames";
import { logWarning } from "./log";
import { PilotScreen } from "./pilotScreen";
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
  const feed = new FeedView({
    elements,
    pilot: new PilotScreen(elements),
    wall: new FeedWall(elements),
    timer: new SwitchTimer(clock),
    waitForFrame: createFrameWaiter(scheduler, config.frameTimeoutMs),
  });
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

/** A live relay: no demo controls, because the dashboard cannot send anything to the swarm. */
function startLive(runtime: Runtime): void {
  const { config, scheduler, elements } = runtime;
  const { websocketUrl, reconnectDelayMs } = config;
  const feed = createFeed(runtime, config.minFeeds, () => undefined);
  const source = new WebSocketSource(websocketUrl, reconnectDelayMs, scheduler, openBrowserSocket);
  elements.demoControls.hidden = true;
  new DashboardApp({ ...runtime, source, onState: createObserver(runtime, feed) }).start();
}

/**
 * The demo: DESTROY fails the scripted lead and RESTORE brings the failed drone back.
 * Every drone has a tile; only drones with a working camera take turns as lead.
 */
function startDemo(runtime: Runtime): void {
  const { config, clock, scheduler, elements } = runtime;
  const source = new DemoSource(config.demoNodeCount, clock, scheduler);
  const tiles = Math.max(config.minFeeds, config.demoNodeCount);
  const feed = createFeed(runtime, tiles, (cameras) => source.setLeadPool(cameras));
  elements.destroy.addEventListener("click", () => {
    feed.noteDestroyPressed();
    source.loseLead();
  });
  elements.restore.addEventListener("click", () => source.restoreLead());
  new DashboardApp({ ...runtime, source, onState: createObserver(runtime, feed) }).start();
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
