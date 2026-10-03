/** Browser entry point: builds the real clock, scheduler and source, then starts the app. */

import { DashboardApp } from "./app";
import { BrowserClock, BrowserScheduler } from "./clock";
import { loadConfig } from "./config";
import { DemoSource } from "./demo";
import { findAnchors, findElements, findPanels } from "./dom";
import "./fonts";
import { Guide } from "./guide";
import { GUIDE_STEPS } from "./guideSteps";
import { logWarning } from "./log";
import { openBrowserSocket, WebSocketSource } from "./transport";

/** The guide exists only with the demo source; a live relay shows every panel at once. */
function main(): void {
  const config = loadConfig(import.meta.env);
  const clock = new BrowserClock();
  const scheduler = new BrowserScheduler();
  const elements = findElements(document);
  if (config.source === "websocket") {
    const { websocketUrl, reconnectDelayMs } = config;
    const source = new WebSocketSource(websocketUrl, reconnectDelayMs, scheduler, openBrowserSocket);
    new DashboardApp({ config, source, clock, scheduler, elements }).start();
    return;
  }
  const source = new DemoSource(config.demoNodeCount, clock, scheduler);
  new DashboardApp({ config, source, clock, scheduler, elements }).start();
  const screen = { panels: findPanels(document), anchors: findAnchors(document) };
  new Guide(elements, screen, GUIDE_STEPS, source).start();
}

try {
  main();
} catch (error) {
  logWarning("dashboard_start_failed", String(error));
  document.body.textContent = "TALOS dashboard failed to start. See the browser console.";
}
