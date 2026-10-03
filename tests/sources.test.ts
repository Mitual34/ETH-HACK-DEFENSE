import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config";
import { DemoSource } from "../src/demo";
import { DEMO_TIMING } from "../src/demoScript";
import { FakeSocket, FakeTimeline } from "../src/fakes";
import { applyEvent, initialState, leadsAtCurrentEpoch } from "../src/store";
import { WebSocketSource, type ConnectionStatus } from "../src/transport";
import { parseSwarmEvent } from "../src/validate";
import { LIMITS } from "./helpers";

const RETRY_MS = 1000;
const CYCLES = 12;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function runDemo(nodeCount: number): string[] {
  const timeline = new FakeTimeline();
  const packets: string[] = [];
  const source = new DemoSource(nodeCount, timeline, timeline);
  source.start({ onMessage: (text) => packets.push(text), onStatus: () => undefined });
  source.freeRun();
  timeline.advance(CYCLES * DEMO_TIMING.freeRunCycleMs);
  source.stop();
  return packets;
}

describe("DemoSource", () => {
  it("is deterministic: two runs produce identical packets", () => {
    expect(runDemo(5)).toEqual(runDemo(5));
  });

  it.each([2, 3, 5, 9])("with %i nodes every packet is valid and at most one node leads", (nodeCount) => {
    let state = initialState();
    for (const packet of runDemo(nodeCount)) {
      const parsed = parseSwarmEvent(packet, LIMITS);
      expect(parsed).not.toBeNull();
      state = applyEvent(state, parsed!, 0, LIMITS.maxLogRows);
      expect(leadsAtCurrentEpoch(state).length).toBeLessThanOrEqual(1);
    }
    expect(state.nodes.size).toBe(nodeCount);
    expect(state.handover.completedCount).toBeGreaterThanOrEqual(CYCLES - 1);
    expect(state.staleCount).toBe(0);
  });
});

describe("WebSocketSource", () => {
  it("reconnects after the configured delay and forwards text frames only", () => {
    const timeline = new FakeTimeline();
    const sockets: FakeSocket[] = [];
    const statuses: ConnectionStatus[] = [];
    const packets: string[] = [];
    const source = new WebSocketSource("ws://relay.test", RETRY_MS, timeline, () => {
      sockets.push(new FakeSocket());
      return sockets.at(-1)!;
    });
    source.start({ onMessage: (text) => packets.push(text), onStatus: (status) => statuses.push(status) });
    sockets[0]!.onopen?.();
    sockets[0]!.onmessage?.("hello");
    sockets[0]!.onmessage?.(new ArrayBuffer(4));
    sockets[0]!.onclose?.();
    timeline.advance(RETRY_MS - 1);
    expect(sockets).toHaveLength(1);
    timeline.advance(1);
    expect(sockets).toHaveLength(2);
    expect(packets).toEqual(["hello", ""]);
    expect(statuses).toEqual(["connecting", "open", "closed", "connecting"]);
  });

  it("retries when the socket cannot be created, and stops retrying after stop()", () => {
    const timeline = new FakeTimeline();
    let attempts = 0;
    const source = new WebSocketSource("ws://relay.test", RETRY_MS, timeline, () => {
      attempts += 1;
      throw new Error("refused");
    });
    source.start({ onMessage: () => undefined, onStatus: () => undefined });
    timeline.advance(RETRY_MS);
    expect(attempts).toBe(2);
    source.stop();
    timeline.advance(RETRY_MS * 3);
    expect(attempts).toBe(2);
  });
});

describe("loadConfig", () => {
  it("falls back to defaults and to the demo source on bad settings", () => {
    const config = loadConfig({
      VITE_TALOS_SOURCE: "websocket",
      VITE_TALOS_WS_URL: "javascript:alert(1)",
      VITE_TALOS_MAX_LOG_ROWS: "-5",
      VITE_TALOS_DEMO_NODE_COUNT: "1",
    });
    expect(config.source).toBe("demo");
    expect(config.maxLogRows).toBe(DEFAULT_CONFIG.maxLogRows);
    expect(config.demoNodeCount).toBe(2);
  });

  it("uses the relay when the source is websocket and the URL is valid", () => {
    const config = loadConfig({ VITE_TALOS_SOURCE: "websocket", VITE_TALOS_WS_URL: "ws://ground:9000/events" });
    expect(config.source).toBe("websocket");
    expect(config.websocketUrl).toBe("ws://ground:9000/events");
  });
});
