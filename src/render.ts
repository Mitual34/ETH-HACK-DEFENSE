/** Draws the observed state. Rendering reads state and never changes it. */

import { formatSeconds, make, type DashboardElements } from "./dom";
import { handoverStatus, stageDurations, type HandoverState } from "./handover";
import type { SwarmEvent } from "./protocol";
import { leadsAtCurrentEpoch, type DashboardState, type NodeView } from "./store";
import type { ConnectionStatus } from "./transport";

const MAX_LEADS = 1;
const TIMER_DIGITS = 2;
const LOG_TIME_DIGITS = 3;
const UNKNOWN_NODE = "unknown";
const STALE_LABEL = "Stale epoch";
const CURRENT_LABEL = "Current";

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting to relay",
  open: "Relay connected",
  closed: "Relay disconnected, retrying",
  demo: "Demo source",
};

export function renderSummary(elements: DashboardElements, state: DashboardState): void {
  const leads = leadsAtCurrentEpoch(state);
  elements.connection.textContent = CONNECTION_LABELS[state.connection];
  elements.connection.dataset["status"] = state.connection;
  elements.demoNotice.hidden = state.connection !== "demo";
  elements.epoch.textContent = String(state.epoch);
  elements.lead.textContent = leads.length === 0 ? "none" : leads.join(", ");
  elements.leadAlarm.hidden = leads.length <= MAX_LEADS;
  elements.nodeCount.textContent = String(state.nodes.size);
  elements.accepted.textContent = String(state.acceptedCount);
  elements.malformed.textContent = String(state.malformedCount);
  elements.stale.textContent = String(state.staleCount);
}

function nodeRow(node: NodeView, currentEpoch: number): HTMLElement {
  const stale = node.epoch < currentEpoch;
  const row = make("tr", "node-row", "");
  row.dataset["state"] = node.state;
  row.dataset["stale"] = String(stale);
  row.append(
    make("td", "node-id", node.nodeId),
    make("td", "node-state", node.state),
    make("td", "node-epoch", String(node.epoch)),
    make("td", "", stale ? STALE_LABEL : CURRENT_LABEL),
  );
  return row;
}

export function renderNodes(elements: DashboardElements, state: DashboardState): void {
  const nodes = [...state.nodes.values()].sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId, undefined, { numeric: true }),
  );
  elements.nodes.replaceChildren(...nodes.map((node) => nodeRow(node, state.epoch)));
}

function bannerText(handover: HandoverState): string {
  const status = handoverStatus(handover);
  if (status === "idle") return "No handover observed";
  if (status === "running") return "LEAD LOST · handover in progress";
  const total = formatSeconds(handover.totalMs, TIMER_DIGITS);
  return `LEAD LOST → ${handover.newLeadId ?? UNKNOWN_NODE} ASSUMING FEED · ${total}`;
}

function timerNote(handover: HandoverState): string {
  const status = handoverStatus(handover);
  if (status === "idle") return "Waiting for a FEED_LOSS event";
  if (status === "running") return "Running on the dashboard clock";
  return handover.totalMs === null
    ? "Event timestamps were inconsistent"
    : "From event timestamps: FEED_DETECTED minus FEED_LOSS";
}

function stageRow(label: string, ms: number | null): HTMLElement {
  const row = make("tr", "", "");
  row.append(make("td", "", label), make("td", "stage-value", formatSeconds(ms, LOG_TIME_DIGITS)));
  return row;
}

/** While a handover runs the timer counts on the dashboard clock; the final value comes from events. */
export function renderHandover(elements: DashboardElements, handover: HandoverState, now: number): void {
  const status = handoverStatus(handover);
  const running = handover.startedLocalAt === null ? null : now - handover.startedLocalAt;
  elements.banner.textContent = bannerText(handover);
  elements.banner.dataset["status"] = status;
  elements.timer.textContent = formatSeconds(status === "running" ? running : handover.totalMs, TIMER_DIGITS);
  elements.timerNote.textContent = timerNote(handover);
  const rows = stageDurations(handover.marks).map((stage) => stageRow(stage.label, stage.ms));
  elements.stages.replaceChildren(...rows);
}

function logRow(event: SwarmEvent): HTMLElement {
  const row = make("tr", "", "");
  row.dataset["state"] = event.state;
  row.append(
    make("td", "log-time", formatSeconds(event.timestamp, LOG_TIME_DIGITS)),
    make("td", "", event.node_id),
    make("td", "", String(event.epoch)),
    make("td", "log-state", event.state),
    make("td", "", event.event),
    make("td", "log-reason", event.reason),
  );
  return row;
}

/** Newest event first. */
export function renderLog(elements: DashboardElements, log: readonly SwarmEvent[]): void {
  elements.log.replaceChildren(...[...log].reverse().map(logRow));
}
