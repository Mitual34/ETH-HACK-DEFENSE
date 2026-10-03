/** Browser entry point: builds the real clock, scheduler and source, then starts the app. */

import { DashboardApp } from "./app";
import { BrowserClock, BrowserScheduler, type Clock, type Scheduler } from "./clock";
import { loadConfig, type DashboardConfig } from "./config";
import { DemoSource } from "./demo";
import { findElements } from "./dom";
import { logWarning } from "./log";
import { openBrowserSocket, WebSocketSource, type SwarmEventSource } from "./transport";

function createSource(config: DashboardConfig, clock: Clock, scheduler: Scheduler): SwarmEventSource {
  if (config.source === "websocket") {
    return new WebSocketSource(config.websocketUrl, config.reconnectDelayMs, scheduler, openBrowserSocket);
  }
  return new DemoSource(config.demoNodeCount, clock, scheduler);
}

function main(): void {
  const config = loadConfig(import.meta.env);
  const clock = new BrowserClock();
  const scheduler = new BrowserScheduler();
  const source = createSource(config, clock, scheduler);
  new DashboardApp({ config, source, clock, scheduler, elements: findElements(document) }).start();
}

try {
  main();
} catch (error) {
  logWarning("dashboard_start_failed", String(error));
  document.body.textContent = "TALOS dashboard failed to start. See the browser console.";
}
