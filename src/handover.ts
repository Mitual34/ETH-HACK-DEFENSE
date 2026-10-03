/**
 * The handover timer. Pure functions over event timestamps.
 *
 * A handover starts at FEED_LOSS and completes at FEED_DETECTED. Durations are
 * differences between event timestamps, so they are only as good as the clocks
 * that produced them; the dashboard reports them and measures nothing itself.
 */

import type { EventName, SwarmEvent } from "./protocol";

export type StageMarks = Readonly<Partial<Record<EventName, number>>>;

export interface HandoverState {
  marks: StageMarks;
  /** Dashboard clock when FEED_LOSS arrived; null unless a handover is running. */
  startedLocalAt: number | null;
  totalMs: number | null;
  newLeadId: string | null;
  completedCount: number;
}

export type HandoverStatus = "idle" | "running" | "complete";

export interface StageDuration {
  label: string;
  ms: number | null;
}

const STAGES: readonly { label: string; from: EventName; to: EventName }[] = [
  { label: "Detect lead loss", from: "FEED_LOSS", to: "FAILURE_DETECTED" },
  { label: "Elect successor", from: "FAILURE_DETECTED", to: "ELECTION_COMPLETE" },
  { label: "Acquire lease and epoch", from: "ELECTION_COMPLETE", to: "LEASE_ACQUIRED" },
  { label: "Feed standby to full power", from: "FEED_ENABLE_COMMAND", to: "FEED_ENABLED" },
  { label: "Total feed-dark", from: "FEED_LOSS", to: "FEED_DETECTED" },
];

export const IDLE_HANDOVER: HandoverState = {
  marks: {},
  startedLocalAt: null,
  totalMs: null,
  newLeadId: null,
  completedCount: 0,
};

export function handoverStatus(handover: HandoverState): HandoverStatus {
  if (handover.marks.FEED_LOSS === undefined) return "idle";
  return handover.startedLocalAt === null ? "complete" : "running";
}

/** Null when either mark is missing or the timestamps run backwards. */
function elapsed(marks: StageMarks, from: EventName, to: EventName): number | null {
  const start = marks[from];
  const end = marks[to];
  if (start === undefined || end === undefined || end < start) return null;
  return end - start;
}

export function stageDurations(marks: StageMarks): StageDuration[] {
  return STAGES.map((stage) => ({ label: stage.label, ms: elapsed(marks, stage.from, stage.to) }));
}

function begin(previous: HandoverState, event: SwarmEvent, arrivedAt: number): HandoverState {
  return {
    marks: { FEED_LOSS: event.timestamp },
    startedLocalAt: arrivedAt,
    totalMs: null,
    newLeadId: null,
    completedCount: previous.completedCount,
  };
}

/** The first occurrence of each stage event wins; repeats are ignored. */
export function applyHandoverEvent(
  handover: HandoverState,
  event: SwarmEvent,
  arrivedAt: number,
): HandoverState {
  if (event.event === "STATE_CHANGE") return handover;
  if (event.event === "FEED_LOSS") return begin(handover, event, arrivedAt);
  if (handoverStatus(handover) !== "running" || handover.marks[event.event] !== undefined) {
    return handover;
  }
  const marks: StageMarks = { ...handover.marks, [event.event]: event.timestamp };
  const newLeadId = event.event === "LEASE_ACQUIRED" ? event.node_id : handover.newLeadId;
  if (event.event !== "FEED_DETECTED") return { ...handover, marks, newLeadId };
  return {
    marks,
    startedLocalAt: null,
    totalMs: elapsed(marks, "FEED_LOSS", "FEED_DETECTED"),
    newLeadId,
    completedCount: handover.completedCount + 1,
  };
}
