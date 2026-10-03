/**
 * The contract between the ground relay and the dashboard: one JSON object per
 * WebSocket text message, with the structured-log fields
 * timestamp, node_id, epoch, state, event, reason.
 *
 * When the daemon exists this file should be generated from protocol/ so C++,
 * Python and TypeScript share one definition. Until then it is the definition.
 */

export const NODE_STATES = [
  "BOOT",
  "FOLLOWER",
  "SUCCESSOR",
  "LEAD",
  "YIELD",
  "ISOLATED",
  "FENCED",
] as const;
export type NodeState = (typeof NODE_STATES)[number];

/** STATE_CHANGE plus the seven timestamps of the handover latency path. */
export const EVENT_NAMES = [
  "STATE_CHANGE",
  "FEED_LOSS",
  "FAILURE_DETECTED",
  "ELECTION_COMPLETE",
  "LEASE_ACQUIRED",
  "FEED_ENABLE_COMMAND",
  "FEED_ENABLED",
  "FEED_DETECTED",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const MAX_EPOCH = 0xffff_ffff;

export interface SwarmEvent {
  /** Monotonic clock, milliseconds. */
  timestamp: number;
  node_id: string;
  epoch: number;
  /** The node's state when it logged the event. */
  state: NodeState;
  event: EventName;
  /** Untrusted text. Only ever placed in the page through textContent. */
  reason: string;
}
