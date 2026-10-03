/** Every dashboard threshold lives here. Values come from VITE_TALOS_* settings. */

export type SourceKind = "demo" | "websocket";

export interface DashboardConfig {
  source: SourceKind;
  websocketUrl: string;
  reconnectDelayMs: number;
  timerRefreshMs: number;
  maxLogRows: number;
  maxMessageLength: number;
  maxReasonLength: number;
  maxNodeIdLength: number;
  malformedLogEvery: number;
  demoNodeCount: number;
  maxFeeds: number;
  minFeeds: number;
  feedWidth: number;
  feedHeight: number;
  frameTimeoutMs: number;
}

export const DEFAULT_CONFIG: DashboardConfig = {
  source: "demo",
  websocketUrl: "",
  reconnectDelayMs: 1000,
  timerRefreshMs: 50,
  maxLogRows: 200,
  maxMessageLength: 2048,
  maxReasonLength: 256,
  maxNodeIdLength: 16,
  malformedLogEvery: 100,
  demoNodeCount: 5,
  maxFeeds: 4,
  minFeeds: 2,
  feedWidth: 1280,
  feedHeight: 720,
  frameTimeoutMs: 1000,
};

export const MIN_DEMO_NODE_COUNT = 2;
const WEBSOCKET_URL_PATTERN = /^wss?:\/\//;

export type Environment = Readonly<Record<string, string | undefined>>;

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}

function readWebsocketUrl(env: Environment): string {
  const url = env["VITE_TALOS_WS_URL"] ?? "";
  return WEBSOCKET_URL_PATTERN.test(url) ? url : "";
}

/** A websocket source without a valid URL falls back to the demo source. */
function readSource(env: Environment, websocketUrl: string): SourceKind {
  return env["VITE_TALOS_SOURCE"] === "websocket" && websocketUrl !== "" ? "websocket" : "demo";
}

export function loadConfig(env: Environment): DashboardConfig {
  const defaults = DEFAULT_CONFIG;
  const websocketUrl = readWebsocketUrl(env);
  const demoNodeCount = positiveInteger(env["VITE_TALOS_DEMO_NODE_COUNT"], defaults.demoNodeCount);
  return {
    source: readSource(env, websocketUrl),
    websocketUrl,
    reconnectDelayMs: positiveInteger(env["VITE_TALOS_RECONNECT_DELAY_MS"], defaults.reconnectDelayMs),
    timerRefreshMs: positiveInteger(env["VITE_TALOS_TIMER_REFRESH_MS"], defaults.timerRefreshMs),
    maxLogRows: positiveInteger(env["VITE_TALOS_MAX_LOG_ROWS"], defaults.maxLogRows),
    maxMessageLength: positiveInteger(env["VITE_TALOS_MAX_MESSAGE_LENGTH"], defaults.maxMessageLength),
    maxReasonLength: positiveInteger(env["VITE_TALOS_MAX_REASON_LENGTH"], defaults.maxReasonLength),
    maxNodeIdLength: positiveInteger(env["VITE_TALOS_MAX_NODE_ID_LENGTH"], defaults.maxNodeIdLength),
    malformedLogEvery: positiveInteger(env["VITE_TALOS_MALFORMED_LOG_EVERY"], defaults.malformedLogEvery),
    demoNodeCount: Math.max(demoNodeCount, MIN_DEMO_NODE_COUNT),
    maxFeeds: positiveInteger(env["VITE_TALOS_MAX_FEEDS"], defaults.maxFeeds),
    minFeeds: positiveInteger(env["VITE_TALOS_MIN_FEEDS"], defaults.minFeeds),
    feedWidth: positiveInteger(env["VITE_TALOS_FEED_WIDTH"], defaults.feedWidth),
    feedHeight: positiveInteger(env["VITE_TALOS_FEED_HEIGHT"], defaults.feedHeight),
    frameTimeoutMs: positiveInteger(env["VITE_TALOS_FRAME_TIMEOUT_MS"], defaults.frameTimeoutMs),
  };
}
