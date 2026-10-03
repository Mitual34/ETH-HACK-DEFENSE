import { describe, expect, it, vi } from "vitest";
import { DashboardApp } from "../src/app";
import { DEFAULT_CONFIG } from "../src/config";
import type { DashboardElements } from "../src/dom";
import { FakeSource, FakeTimeline } from "../src/fakes";
import { event, mountShell } from "./helpers";

interface Harness {
  source: FakeSource;
  timeline: FakeTimeline;
  elements: DashboardElements;
  app: DashboardApp;
}

function startApp(): Harness {
  const source = new FakeSource();
  const timeline = new FakeTimeline();
  const elements = mountShell();
  const app = new DashboardApp({ config: DEFAULT_CONFIG, source, clock: timeline, scheduler: timeline, elements });
  app.start();
  return { source, timeline, elements, app };
}

describe("DashboardApp", () => {
  it("shows event-log markup as text and creates no elements from it", () => {
    const { source, elements } = startApp();
    const attack = '<img src=x onerror="alert(1)">';
    source.emit(JSON.stringify(event({ reason: attack })));
    expect(elements.log.querySelector(".log-reason")?.textContent).toBe(attack);
    expect(document.querySelector("img")).toBeNull();
  });

  it("counts malformed packets, keeps running and logs the first one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { source, elements } = startApp();
    source.emit("{not json");
    source.emit(JSON.stringify(event({ epoch: -4 })));
    source.emit(JSON.stringify(event({ node_id: "D2", epoch: 7, state: "LEAD" })));
    expect(elements.malformed.textContent).toBe("2");
    expect(elements.epoch.textContent).toBe("7");
    expect(elements.lead.textContent).toBe("D2");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("counts a running handover on the injected clock, then shows the event-timestamp total", () => {
    const { source, timeline, elements } = startApp();
    source.emit(JSON.stringify(event({ timestamp: 1000, state: "LEAD", event: "FEED_LOSS" })));
    timeline.advance(250);
    expect(elements.timer.textContent).toBe("0.25 s");
    expect(elements.banner.dataset["status"]).toBe("running");
    source.emit(JSON.stringify(event({ timestamp: 1600, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_DETECTED" })));
    expect(elements.timer.textContent).toBe("0.60 s");
    expect(elements.banner.dataset["status"]).toBe("complete");
  });

  it("raises the alarm only when two nodes report LEAD at the same epoch", () => {
    const { source, elements } = startApp();
    source.emit(JSON.stringify(event({ node_id: "D1", epoch: 3, state: "LEAD" })));
    expect(elements.leadAlarm.hidden).toBe(true);
    source.emit(JSON.stringify(event({ node_id: "D2", epoch: 3, state: "LEAD" })));
    expect(elements.leadAlarm.hidden).toBe(false);
  });
});
