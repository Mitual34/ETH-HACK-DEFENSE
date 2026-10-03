import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config";
import { FakeSocket, FakeTimeline } from "../src/fakes";
import { WebSocketSource, type ConnectionStatus } from "../src/transport";

const RETRY_MS = 1000;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
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
