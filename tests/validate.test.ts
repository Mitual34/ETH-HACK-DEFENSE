import { describe, expect, it } from "vitest";
import { MAX_EPOCH } from "../src/protocol";
import { parseSwarmEvent } from "../src/validate";
import { event, LIMITS } from "./helpers";

const valid = event({ timestamp: 1000, node_id: "D3", epoch: 17, state: "SUCCESSOR" });

function parseWith(overrides: Record<string, unknown>): unknown {
  return parseSwarmEvent(JSON.stringify({ ...valid, ...overrides }), LIMITS);
}

describe("parseSwarmEvent", () => {
  it("accepts a well-formed event and keeps only the known fields", () => {
    expect(parseWith({ extra: "ignored" })).toEqual(valid);
  });

  it.each([
    ["not JSON", "{oops"],
    ["empty packet", ""],
    ["JSON array", "[]"],
    ["JSON null", "null"],
    ["over-long packet", " ".repeat(LIMITS.maxMessageLength + 1)],
  ])("drops %s without throwing", (_name, text) => {
    expect(parseSwarmEvent(text, LIMITS)).toBeNull();
  });

  it.each([
    ["negative timestamp", { timestamp: -1 }],
    ["non-finite timestamp", { timestamp: "soon" }],
    ["fractional epoch", { epoch: 1.5 }],
    ["epoch above the 32-bit range", { epoch: MAX_EPOCH + 1 }],
    ["unknown state", { state: "ADMIN" }],
    ["unknown event", { event: "TAKE_OVER" }],
    ["node_id with markup", { node_id: "<b>D1</b>" }],
    ["over-long node_id", { node_id: "D".repeat(LIMITS.maxNodeIdLength + 1) }],
    ["over-long reason", { reason: "x".repeat(LIMITS.maxReasonLength + 1) }],
    ["missing reason", { reason: undefined }],
  ])("drops an event with %s", (_name, overrides) => {
    expect(parseWith(overrides)).toBeNull();
  });
});
