import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCameraSlots, type MediaDevicesLike } from "../src/cameras";
import { DEFAULT_CONFIG } from "../src/config";
import type { DashboardElements } from "../src/dom";
import { FakeTimeline } from "../src/fakes";
import { FeedView } from "../src/feedView";
import { FeedWall } from "../src/feedWall";
import { PilotScreen } from "../src/pilotScreen";
import { applyEvent, initialState, type DashboardState } from "../src/store";
import { SwitchTimer } from "../src/switchTimer";
import { event, mountShell } from "./helpers";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const PLACEHOLDERS = [
  { label: "DRONE 1", stream: null },
  { label: "DRONE 2", stream: null },
];

interface Harness {
  timeline: FakeTimeline;
  elements: DashboardElements;
  feed: FeedView;
  presentFrame: () => void;
  observe: (overrides: Parameters<typeof event>[0]) => void;
}

/** Frames arrive only when the test calls presentFrame, so every duration is exact. */
function startFeed(): Harness {
  const timeline = new FakeTimeline();
  const elements = mountShell();
  const pending: (() => void)[] = [];
  const feed = new FeedView({
    elements,
    pilot: new PilotScreen(elements),
    wall: new FeedWall(elements),
    timer: new SwitchTimer(timeline),
    waitForFrame: (_surface, done) => pending.push(done),
  });
  feed.setSlots(PLACEHOLDERS);
  let state: DashboardState = initialState();
  const observe: Harness["observe"] = (overrides) => {
    state = applyEvent(state, event(overrides), timeline.now(), DEFAULT_CONFIG.maxLogRows);
    feed.update(state);
  };
  return { timeline, elements, feed, observe, presentFrame: () => pending.shift()?.() };
}

/** The status shown on each tile of the wall, in drone order. Every tile is always on screen. */
function tileStatuses(elements: DashboardElements): (string | null)[] {
  const statuses = elements.feedScreen.querySelectorAll(".feed-tile-status");
  return Array.from(statuses).map((status) => status.textContent);
}

function bootTwoNodes({ observe, presentFrame }: Harness): void {
  observe({ node_id: "D2", epoch: 1, state: "SUCCESSOR" });
  observe({ node_id: "D1", epoch: 1, state: "LEAD" });
  presentFrame();
}

function failLead({ timeline, observe, presentFrame }: Harness): void {
  observe({ timestamp: 100, node_id: "D1", epoch: 1, state: "LEAD", event: "FEED_LOSS" });
  timeline.advance(400);
  observe({ timestamp: 500, node_id: "D2", epoch: 2, state: "LEAD", event: "LEASE_ACQUIRED" });
  observe({ timestamp: 550, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_DETECTED" });
  timeline.advance(12.5);
  presentFrame();
}

describe("FeedView", () => {
  it("shows every drone at once, the lead on the pilot screen, and says which have no camera", () => {
    const harness = startFeed();
    bootTwoNodes(harness);
    const { feedScreen, pilotBadge, pilotLost, switchTime } = harness.elements;
    expect(tileStatuses(harness.elements)).toEqual(["LIVE", "NOT AVAILABLE"]);
    expect(feedScreen.querySelector(".feed-tile-label")?.textContent).toBe("DRONE 1");
    expect(feedScreen.querySelector(".feed-placeholder")?.textContent).toBe("CAMERA NOT AVAILABLE");
    expect(pilotBadge.textContent).toBe("DRONE 1");
    expect(pilotLost.hidden).toBe(true);
    expect(switchTime.textContent).toBe("");
  });

  it("stops the destroyed drone, moves the pilot screen to the next one by itself, and times it in ms", () => {
    const harness = startFeed();
    const { timeline, elements, feed, observe } = harness;
    bootTwoNodes(harness);
    feed.noteDestroyPressed();
    timeline.advance(5);
    observe({ timestamp: 100, node_id: "D1", epoch: 1, state: "LEAD", event: "FEED_LOSS" });
    expect(tileStatuses(elements)).toEqual(["DESTROYED", "NOT AVAILABLE"]);
    expect(elements.pilotLost.hidden).toBe(false);
    expect(elements.destroy.hasAttribute("disabled")).toBe(true);
    timeline.advance(400);
    observe({ timestamp: 500, node_id: "D2", epoch: 2, state: "LEAD", event: "LEASE_ACQUIRED" });
    expect(elements.pilotLost.hidden).toBe(false);
    observe({ timestamp: 550, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_DETECTED" });
    expect(elements.pilotBadge.textContent).toBe("DRONE 2");
    expect(elements.pilotLost.hidden).toBe(true);
    timeline.advance(12.5);
    harness.presentFrame();
    expect(tileStatuses(elements)).toEqual(["DESTROYED", "LIVE"]);
    expect(elements.switchTime.textContent).toBe("417.5 ms");
    expect(elements.switchNote.textContent).toBe("decision 405.0 ms + picture 12.5 ms");
    expect(elements.destroy.hasAttribute("disabled")).toBe(true);
    expect(elements.demoHint.textContent).toContain("No drone is left");
    observe({ timestamp: 950, node_id: "D1", epoch: 2, state: "SUCCESSOR" });
    expect(elements.destroy.hasAttribute("disabled")).toBe(false);
  });

  it("keeps the failed drone stopped until it rejoins at the current epoch", () => {
    const harness = startFeed();
    bootTwoNodes(harness);
    failLead(harness);
    harness.observe({ timestamp: 900, node_id: "D1", epoch: 1, state: "FENCED" });
    expect(tileStatuses(harness.elements)).toEqual(["DESTROYED", "LIVE"]);
    harness.observe({ timestamp: 950, node_id: "D1", epoch: 2, state: "FOLLOWER" });
    expect(tileStatuses(harness.elements)).toEqual(["NOT AVAILABLE", "LIVE"]);
  });

  it("times from the feed loss when nobody pressed DESTROY", () => {
    const harness = startFeed();
    const { timeline, elements, observe, presentFrame } = harness;
    bootTwoNodes(harness);
    observe({ timestamp: 100, node_id: "D1", epoch: 1, state: "LEAD", event: "FEED_LOSS" });
    timeline.advance(300);
    observe({ timestamp: 400, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_DETECTED" });
    timeline.advance(20);
    presentFrame();
    expect(elements.switchTime.textContent).toBe("320.0 ms");
  });
});

describe("openCameraSlots", () => {
  const stream = (): MediaStream => ({ getTracks: () => [] }) as unknown as MediaStream;

  it("opens each camera, skips one that fails, and pads to the minimum with placeholders", async () => {
    const devices: MediaDevicesLike = {
      enumerateDevices: async () => [
        { kind: "videoinput", deviceId: "a" },
        { kind: "audioinput", deviceId: "mic" },
        { kind: "videoinput", deviceId: "broken" },
      ],
      getUserMedia: async (constraints) => {
        if (JSON.stringify(constraints).includes("broken")) throw new Error("in use");
        return stream();
      },
    };
    const slots = await openCameraSlots(devices, DEFAULT_CONFIG);
    expect(slots.map((slot) => slot.label)).toEqual(["DRONE 1", "DRONE 2"]);
    expect(slots.map((slot) => slot.stream !== null)).toEqual([true, false]);
  });

  it("falls back to placeholders when camera access is refused or unavailable", async () => {
    const refused: MediaDevicesLike = {
      enumerateDevices: async () => [],
      getUserMedia: async () => {
        throw new Error("NotAllowedError");
      },
    };
    const expected = ["DRONE 1", "DRONE 2"];
    expect((await openCameraSlots(refused, DEFAULT_CONFIG)).map((slot) => slot.label)).toEqual(expected);
    expect((await openCameraSlots(undefined, DEFAULT_CONFIG)).map((slot) => slot.label)).toEqual(expected);
  });
});
