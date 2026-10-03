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

function pressRepeatedly(source: DemoSource, timeline: FakeTimeline): void {
  for (let press = 0; press < PRESSES; press += 1) {
    source.loseLead();
    timeline.advance(SETTLE_MS);
  }
}

describe("DemoSource", () => {
  it("is deterministic: two runs produce identical packets", () => {
    expect(run(5, pressRepeatedly).packets).toEqual(run(5, pressRepeatedly).packets);
  });

  it.each([2, 3, 5, 9])("with %i nodes every handover completes and events stay in order", (nodeCount) => {
    const { state } = run(nodeCount, pressRepeatedly);
    expect(state.nodes.size).toBe(nodeCount);
    expect(state.handover.completedCount).toBe(PRESSES);
    expect(state.staleCount).toBe(0);
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

  it("with a lead pool of two, the lead alternates between D1 and D2 while the rest follow", () => {
    const { state } = run(5, (source) => {
      source.setLeadPool(2);
      for (let press = 0; press < 3; press += 1) source.loseLead();
    });
    expect(leadsAtCurrentEpoch(state)).toEqual(["D2"]);
    expect(state.epoch).toBe(4);
    expect(state.nodes.get("D3")?.state).toBe("FOLLOWER");
  });

  it("a second DESTROY does not wait for the old lead's rejoin delay", () => {
    let pressedAt = 0;
    const { feedLossAt } = run(5, (source, timeline) => {
      timeline.advance(SETTLE_MS);
      source.loseLead();
      timeline.advance(SETTLE_MS);
      pressedAt = timeline.now();
      source.loseLead();
    });
    expect(feedLossAt[1]).toBe(pressedAt);
  });

  it("ignores a restore when no lead is down", () => {
    const { state } = run(5, (source) => source.restoreLead());
    expect(state.epoch).toBe(1);
    expect(leadsAtCurrentEpoch(state)).toEqual(["D1"]);
  });
});
