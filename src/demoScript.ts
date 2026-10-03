/**
 * Scripted scenes so the dashboard runs with no relay: boot, lose the lead,
 * bring the old lead back. They work for any node count >= 2.
 *
 * The delays below are scripted from the design targets. They are NOT
 * measurements and say nothing about how the real system performs.
 */

import type { EventName, NodeState, SwarmEvent } from "./protocol";

export const DEMO_TIMING = {
  bootStaggerMs: 200,
  detectMs: 300,
  guardMs: 100,
  feedSwitchMs: 50,
  settleMs: 100,
  rejoinAfterMs: 2000,
  freeRunKillAtMs: 3000,
  freeRunRestoreAtMs: 5500,
  freeRunCycleMs: 8000,
} as const;

const FIRST_EPOCH = 1;

/** offsetMs is measured from the moment the scene starts playing. */
export interface ScriptedEvent {
  offsetMs: number;
  event: Omit<SwarmEvent, "timestamp">;
}

function nodeId(index: number): string {
  return `D${index + 1}`;
}

function scripted(
  offsetMs: number,
  node: number,
  epoch: number,
  state: NodeState,
  event: EventName,
  reason: string,
): ScriptedEvent {
  return { offsetMs, event: { node_id: nodeId(node), epoch, state, event, reason } };
}

function initialRole(node: number): NodeState {
  if (node === 0) return "LEAD";
  return node === 1 ? "SUCCESSOR" : "FOLLOWER";
}

/** Nodes join one by one, then the first election settles at epoch 1. */
export function buildBootScript(nodeCount: number): ScriptedEvent[] {
  const stagger = DEMO_TIMING.bootStaggerMs;
  const electedAt = (nodeCount + 1) * stagger;
  const script: ScriptedEvent[] = [];
  for (let node = 0; node < nodeCount; node += 1) {
    script.push(scripted(node * stagger, node, 0, "BOOT", "STATE_CHANGE", "joined mesh"));
    script.push(scripted((node + 1) * stagger, node, 0, "FOLLOWER", "STATE_CHANGE", "discovered"));
  }
  for (let node = 0; node < nodeCount; node += 1) {
    const role = initialRole(node);
    script.push(scripted(electedAt, node, FIRST_EPOCH, role, "STATE_CHANGE", "initial election"));
  }
  return script.sort((left, right) => left.offsetMs - right.offsetMs);
}

function takeoverSteps(lead: number, successor: number, epoch: number): ScriptedEvent[] {
  const detected = DEMO_TIMING.detectMs;
  const claimed = detected + DEMO_TIMING.guardMs;
  const enabled = claimed + DEMO_TIMING.feedSwitchMs;
  const next = epoch + 1;
  return [
    scripted(0, lead, epoch, "LEAD", "FEED_LOSS", "lead lost (demo)"),
    scripted(detected, successor, epoch, "SUCCESSOR", "FAILURE_DETECTED", "lead heartbeats missed"),
    scripted(detected, successor, epoch, "SUCCESSOR", "ELECTION_COMPLETE", "ranking precomputed"),
    scripted(claimed, successor, next, "LEAD", "LEASE_ACQUIRED", "majority reported lead silent"),
    scripted(claimed, successor, next, "LEAD", "FEED_ENABLE_COMMAND", "standby to full power"),
    scripted(enabled, successor, next, "LEAD", "FEED_ENABLED", "feed at full power"),
    scripted(enabled, successor, next, "LEAD", "FEED_DETECTED", "feed restored"),
  ];
}

/**
 * The lead of this cycle is lost and the successor takes over at epoch + 1.
 * The lead rotates through the first leadPool nodes only, so with two cameras
 * the lead alternates between drone 1 and drone 2 while the rest follow.
 */
export function buildHandoverScript(nodeCount: number, cycle: number, leadPool: number): ScriptedEvent[] {
  const epoch = FIRST_EPOCH + cycle;
  const lead = cycle % leadPool;
  const successor = (cycle + 1) % leadPool;
  const nextSuccessor = (cycle + 2) % leadPool;
  const script = takeoverSteps(lead, successor, epoch);
  const settled = (script.at(-1)?.offsetMs ?? 0) + DEMO_TIMING.settleMs;
  for (let node = 0; node < nodeCount; node += 1) {
    if (node === lead || node === successor) continue;
    const role = node === nextSuccessor ? "SUCCESSOR" : "FOLLOWER";
    script.push(scripted(settled, node, epoch + 1, role, "STATE_CHANGE", "new epoch seen"));
  }
  return script;
}

/**
 * The lead lost in this cycle returns, is fenced by the higher epoch, and rejoins
 * after rejoinAfterMs. Zero makes it rejoin at once.
 */
export function buildRejoinScript(
  cycle: number,
  leadPool: number,
  rejoinAfterMs: number,
): ScriptedEvent[] {
  const epoch = FIRST_EPOCH + cycle;
  const lead = cycle % leadPool;
  const role = (cycle + 2) % leadPool === lead ? "SUCCESSOR" : "FOLLOWER";
  const fenced = "higher epoch seen; stays silent";
  return [
    scripted(0, lead, epoch, "FENCED", "STATE_CHANGE", fenced),
    scripted(rejoinAfterMs, lead, epoch + 1, role, "STATE_CHANGE", "rejoined"),
  ];
}
