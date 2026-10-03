/**
 * A scripted scenario so the dashboard runs with no relay: the swarm boots, then
 * the lead is lost and replaced once per cycle, forever, for any node count >= 2.
 *
 * The delays below are scripted from the design targets. They are NOT
 * measurements and say nothing about how the real system performs.
 */

import type { EventName, NodeState, SwarmEvent } from "./protocol";

export const DEMO_TIMING = {
  bootStaggerMs: 200,
  settleAfterBootMs: 2000,
  killAtMs: 3000,
  detectMs: 300,
  guardMs: 100,
  feedSwitchMs: 50,
  settleMs: 100,
  resurrectAfterMs: 2500,
  rejoinAfterMs: 500,
  cycleLengthMs: 8000,
} as const;

const FIRST_EPOCH = 1;

/** atMs is milliseconds since the demo started, and is also the event timestamp. */
export interface ScriptedEvent {
  atMs: number;
  event: SwarmEvent;
}

interface Step {
  node: number;
  epoch: number;
  state: NodeState;
  event: EventName;
  reason: string;
}

export function nodeId(index: number): string {
  return `D${index + 1}`;
}

function at(atMs: number, step: Step): ScriptedEvent {
  const { node, epoch, state, event, reason } = step;
  return { atMs, event: { timestamp: atMs, node_id: nodeId(node), epoch, state, event, reason } };
}

function change(node: number, epoch: number, state: NodeState, reason: string): Step {
  return { node, epoch, state, event: "STATE_CHANGE", reason };
}

function firstLeadAtMs(nodeCount: number): number {
  return (nodeCount + 1) * DEMO_TIMING.bootStaggerMs;
}

export function cycleStartMs(nodeCount: number, cycle: number): number {
  const bootEnd = firstLeadAtMs(nodeCount) + DEMO_TIMING.settleAfterBootMs;
  return bootEnd + cycle * DEMO_TIMING.cycleLengthMs;
}

function initialRole(node: number): NodeState {
  if (node === 0) return "LEAD";
  return node === 1 ? "SUCCESSOR" : "FOLLOWER";
}

export function buildBootScript(nodeCount: number): ScriptedEvent[] {
  const stagger = DEMO_TIMING.bootStaggerMs;
  const script: ScriptedEvent[] = [];
  for (let node = 0; node < nodeCount; node += 1) {
    script.push(at(node * stagger, change(node, 0, "BOOT", "joined mesh")));
    script.push(at((node + 1) * stagger, change(node, 0, "FOLLOWER", "discovered")));
  }
  for (let node = 0; node < nodeCount; node += 1) {
    const step = change(node, FIRST_EPOCH, initialRole(node), "initial election");
    script.push(at(firstLeadAtMs(nodeCount), step));
  }
  return script.sort((left, right) => left.atMs - right.atMs);
}

function handoverEndMs(base: number): number {
  const { killAtMs, detectMs, guardMs, feedSwitchMs } = DEMO_TIMING;
  return base + killAtMs + detectMs + guardMs + feedSwitchMs;
}

function handoverSteps(base: number, lead: number, successor: number, epoch: number): ScriptedEvent[] {
  const detected = base + DEMO_TIMING.killAtMs + DEMO_TIMING.detectMs;
  const claimed = detected + DEMO_TIMING.guardMs;
  const enabled = handoverEndMs(base);
  const step = (state: NodeState, stepEpoch: number, event: EventName, reason: string): Step => ({
    node: successor,
    epoch: stepEpoch,
    state,
    event,
    reason,
  });
  return [
    at(base + DEMO_TIMING.killAtMs, {
      node: lead,
      epoch,
      state: "LEAD",
      event: "FEED_LOSS",
      reason: "lead killed (demo)",
    }),
    at(detected, step("SUCCESSOR", epoch, "FAILURE_DETECTED", "lead heartbeats missed")),
    at(detected, step("SUCCESSOR", epoch, "ELECTION_COMPLETE", "ranking precomputed")),
    at(claimed, step("LEAD", epoch + 1, "LEASE_ACQUIRED", "majority reported lead silent")),
    at(claimed, step("LEAD", epoch + 1, "FEED_ENABLE_COMMAND", "standby to full power")),
    at(enabled, step("LEAD", epoch + 1, "FEED_ENABLED", "feed at full power")),
    at(enabled, step("LEAD", epoch + 1, "FEED_DETECTED", "feed restored")),
  ];
}

export function buildCycleScript(nodeCount: number, cycle: number): ScriptedEvent[] {
  const base = cycleStartMs(nodeCount, cycle);
  const epoch = FIRST_EPOCH + cycle;
  const lead = cycle % nodeCount;
  const successor = (cycle + 1) % nodeCount;
  const nextSuccessor = (cycle + 2) % nodeCount;
  const script = handoverSteps(base, lead, successor, epoch);
  const settled = handoverEndMs(base) + DEMO_TIMING.settleMs;
  for (let node = 0; node < nodeCount; node += 1) {
    if (node === lead || node === successor) continue;
    const role = node === nextSuccessor ? "SUCCESSOR" : "FOLLOWER";
    script.push(at(settled, change(node, epoch + 1, role, "new epoch seen")));
  }
  const resurrected = settled + DEMO_TIMING.resurrectAfterMs;
  const rejoinRole = nextSuccessor === lead ? "SUCCESSOR" : "FOLLOWER";
  script.push(at(resurrected, change(lead, epoch, "FENCED", "higher epoch seen; rejoins silent")));
  script.push(
    at(resurrected + DEMO_TIMING.rejoinAfterMs, change(lead, epoch + 1, rejoinRole, "rejoined")),
  );
  return script;
}
