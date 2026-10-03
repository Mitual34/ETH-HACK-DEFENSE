import { describe, expect, it } from "vitest";
import { DemoSource } from "../src/demo";
import { FakeTimeline } from "../src/fakes";
import { applyEvent, initialState, leadsAtCurrentEpoch, type DashboardState } from "../src/store";
import { parseSwarmEvent } from "../src/validate";
import { LIMITS } from "./helpers";

const SETTLE_MS = 10_000;
const PRESSES = 12;

interface Run {
  state: DashboardState;
  packets: string[];
  feedLossAt: number[];
}

/** Plays the demo on fake time, checking after every packet that at most one node leads. */
function run(nodeCount: number, drive: (source: DemoSource, timeline: FakeTimeline) => void): Run {
  const timeline = new FakeTimeline();
  const source = new DemoSource(nodeCount, timeline, timeline);
  const result: Run = { state: initialState(), packets: [], feedLossAt: [] };
  source.start({
    onStatus: () => undefined,
    onMessage: (text) => {
      const parsed = parseSwarmEvent(text, LIMITS);
      expect(parsed).not.toBeNull();
      if (parsed!.event === "FEED_LOSS") result.feedLossAt.push(timeline.now());
      result.packets.push(text);
      result.state = applyEvent(result.state, parsed!, 0, LIMITS.maxLogRows);
      expect(leadsAtCurrentEpoch(result.state).length).toBeLessThanOrEqual(1);
    },
  });
  drive(source, timeline);
  timeline.advance(SETTLE_MS);
  source.stop();
  return result;
}

/** Destroy the lead, then restore it, so a drone is always standing by for the next press. */
function destroyAndRestore(source: DemoSource, timeline: FakeTimeline): void {
  for (let press = 0; press < PRESSES; press += 1) {
    source.loseLead();
    timeline.advance(SETTLE_MS);
    source.restoreLead();
    timeline.advance(SETTLE_MS);
  }
}

function staleNodes(state: DashboardState): string[] {
  return [...state.nodes.values()].filter((node) => node.epoch < state.epoch).map((node) => node.nodeId);
}

describe("DemoSource", () => {
  it("is deterministic: two runs produce identical packets", () => {
    expect(run(5, destroyAndRestore).packets).toEqual(run(5, destroyAndRestore).packets);
  });

  it.each([2, 3, 5, 9])("with %i nodes every handover completes and events stay in order", (nodeCount) => {
    const { state } = run(nodeCount, destroyAndRestore);
    expect(state.nodes.size).toBe(nodeCount);
    expect(state.handover.completedCount).toBe(PRESSES);
    expect(state.staleCount).toBe(0);
    expect(staleNodes(state)).toEqual([]);
  });

  it("a destroyed drone stays down while the lead moves on to the next drone", () => {
    const { state } = run(5, (source) => {
      source.loseLead();
      source.loseLead();
    });
    expect(leadsAtCurrentEpoch(state)).toEqual(["D3"]);
    expect(staleNodes(state)).toEqual(["D1", "D2"]);
    expect(state.nodes.get("D4")?.state).toBe("SUCCESSOR");
  });

  it("with two cameras, a second DESTROY is ignored until a destroyed drone is restored", () => {
    const { state } = run(5, (source) => {
      source.setLeadPool(2);
      source.loseLead();
      source.loseLead();
    });
    expect(leadsAtCurrentEpoch(state)).toEqual(["D2"]);
    expect(state.handover.completedCount).toBe(1);
    expect(staleNodes(state)).toEqual(["D1"]);
  });

  it("a restored drone becomes the successor when none is left, so the lead can move back to it", () => {
    const { state } = run(5, (source) => {
      source.setLeadPool(2);
      source.loseLead();
      source.restoreLead();
      source.loseLead();
    });
    expect(leadsAtCurrentEpoch(state)).toEqual(["D1"]);
    expect(staleNodes(state)).toEqual(["D2"]);
    expect(state.nodes.get("D3")?.state).toBe("FOLLOWER");
  });

  it("queues scenes in order even when the controls are pressed before boot finishes", () => {
    const { state } = run(5, (source) => {
      source.loseLead();
      source.restoreLead();
      source.loseLead();
    });
    expect(state.staleCount).toBe(0);
    expect(state.epoch).toBe(3);
    expect(leadsAtCurrentEpoch(state)).toEqual(["D3"]);
  });

  it("ignores a restore when no drone is down", () => {
    const { state } = run(5, (source) => source.restoreLead());
    expect(state.epoch).toBe(1);
    expect(leadsAtCurrentEpoch(state)).toEqual(["D1"]);
  });
});
