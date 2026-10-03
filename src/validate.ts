/** Every received packet is untrusted. Anything that fails a check is dropped. */

import { EVENT_NAMES, MAX_EPOCH, NODE_STATES, type SwarmEvent } from "./protocol";

export interface ValidationLimits {
  maxMessageLength: number;
  maxReasonLength: number;
  maxNodeIdLength: number;
}

const NODE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMember<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isEpoch(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_EPOCH;
}

function isNodeId(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength && NODE_ID_PATTERN.test(value);
}

function isReason(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

/** Copies only the known fields, so extra fields never reach the store. */
function toSwarmEvent(raw: unknown, limits: ValidationLimits): SwarmEvent | null {
  if (!isRecord(raw)) return null;
  const { timestamp, node_id, epoch, state, event, reason } = raw;
  if (!isTimestamp(timestamp) || !isEpoch(epoch)) return null;
  if (!isNodeId(node_id, limits.maxNodeIdLength)) return null;
  if (!isMember(NODE_STATES, state) || !isMember(EVENT_NAMES, event)) return null;
  if (!isReason(reason, limits.maxReasonLength)) return null;
  return { timestamp, node_id, epoch, state, event, reason };
}

/** Returns the event, or null when the packet is malformed. Never throws. */
export function parseSwarmEvent(text: string, limits: ValidationLimits): SwarmEvent | null {
  if (text.length > limits.maxMessageLength) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  return toSwarmEvent(raw, limits);
}
