import { describe, expect, it } from "vitest";
import { handoverStatus, stageDurations } from "../src/handover";
import type { SwarmEvent } from "../src/protocol";
import { applyEvent, initialState, leadsAtCurrentEpoch, type DashboardState } from "../src/store";
import { event } from "./helpers";

const MAX_ROWS = 3;
const ARRIVED_AT = 0;

function replay(events: SwarmEvent[]): DashboardState {
  return events.reduce((state, next) => applyEvent(state, next, ARRIVED_AT, MAX_ROWS), initialState());
}

// Fixture timestamps chosen for easy arithmetic. They are not measurements.
const HANDOVER: SwarmEvent[] = [
  event({ timestamp: 1000, node_id: "D1", epoch: 1, state: "LEAD", event: "FEED_LOSS" }),
  event({ timestamp: 1300, node_id: "D2", epoch: 1, state: "SUCCESSOR", event: "FAILURE_DETECTED" }),
  event({ timestamp: 1300, node_id: "D2", epoch: 1, state: "SUCCESSOR", event: "ELECTION_COMPLETE" }),
  event({ timestamp: 1400, node_id: "D2", epoch: 2, state: "LEAD", event: "LEASE_ACQUIRED" }),
  event({ timestamp: 1400, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_ENABLE_COMMAND" }),
  event({ timestamp: 1450, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_ENABLED" }),
  event({ timestamp: 1450, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_DETECTED" }),
];

describe("handover timer", () => {
  it("reports each stage as the difference between event timestamps", () => {
    const { handover } = replay(HANDOVER);
    expect(handoverStatus(handover)).toBe("complete");
    expect(handover.totalMs).toBe(450);
    expect(handover.newLeadId).toBe("D2");
    expect(stageDurations(handover.marks).map((stage) => stage.ms)).toEqual([300, 0, 100, 50, 450]);
  });

  it("stays running, with no total, until FEED_DETECTED arrives", () => {
    const { handover } = replay(HANDOVER.slice(0, -1));
    expect(handoverStatus(handover)).toBe("running");
    expect(handover.totalMs).toBeNull();
  });

  it("reports no total when timestamps run backwards", () => {
    const backwards = event({ timestamp: 900, node_id: "D2", epoch: 2, state: "LEAD", event: "FEED_DETECTED" });
    const { handover } = replay([HANDOVER[0]!, backwards]);
    expect(handoverStatus(handover)).toBe("complete");
    expect(handover.totalMs).toBeNull();
  });
});

describe("observed swarm state", () => {
  it("never lowers the epoch and counts one lead after a resurrected old lead", () => {
    const resurrected = event({ timestamp: 5000, node_id: "D1", epoch: 1, state: "LEAD" });
    const state = replay([...HANDOVER, resurrected]);
    expect(state.epoch).toBe(2);
    expect(leadsAtCurrentEpoch(state)).toEqual(["D2"]);
  });

  it("reports two leads when two nodes claim LEAD at the same epoch", () => {
    const duplicate = event({ timestamp: 2000, node_id: "D3", epoch: 2, state: "LEAD" });
    expect(leadsAtCurrentEpoch(replay([...HANDOVER, duplicate]))).toEqual(["D2", "D3"]);
  });

  it("counts an out-of-order event without rolling the node state back", () => {
    const late = event({ timestamp: 1200, node_id: "D2", epoch: 1, state: "FOLLOWER" });
    const state = replay([...HANDOVER, late]);
    expect(state.staleCount).toBe(1);
    expect(state.nodes.get("D2")?.state).toBe("LEAD");
  });

  it("keeps only the newest rows in the event log", () => {
    expect(replay(HANDOVER).log).toEqual(HANDOVER.slice(-MAX_ROWS));
  });
});
