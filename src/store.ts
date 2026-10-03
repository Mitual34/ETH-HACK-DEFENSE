/** What the dashboard has observed. Pure functions; every update returns a new state. */

import { applyHandoverEvent, IDLE_HANDOVER, type HandoverState } from "./handover";
import type { NodeState, SwarmEvent } from "./protocol";
import type { ConnectionStatus } from "./transport";

export interface NodeView {
  nodeId: string;
  state: NodeState;
  epoch: number;
  lastTimestamp: number;
}

export interface DashboardState {
  nodes: ReadonlyMap<string, NodeView>;
  /** Highest epoch seen on any event. It never goes down. */
  epoch: number;
  handover: HandoverState;
  log: readonly SwarmEvent[];
  acceptedCount: number;
  malformedCount: number;
  /** Events older than the last one already seen from the same node. */
  staleCount: number;
  connection: ConnectionStatus;
}

export function initialState(): DashboardState {
  return {
    nodes: new Map(),
    epoch: 0,
    handover: IDLE_HANDOVER,
    log: [],
    acceptedCount: 0,
    malformedCount: 0,
    staleCount: 0,
    connection: "connecting",
  };
}

function withNode(nodes: ReadonlyMap<string, NodeView>, event: SwarmEvent): Map<string, NodeView> {
  const next = new Map(nodes);
  next.set(event.node_id, {
    nodeId: event.node_id,
    state: event.state,
    epoch: event.epoch,
    lastTimestamp: event.timestamp,
  });
  return next;
}

function appendBounded(log: readonly SwarmEvent[], event: SwarmEvent, maxRows: number): SwarmEvent[] {
  return [...log, event].slice(-maxRows);
}

/** A stale event is still logged, but it cannot roll a node's state back. */
export function applyEvent(
  state: DashboardState,
  event: SwarmEvent,
  arrivedAt: number,
  maxLogRows: number,
): DashboardState {
  const previous = state.nodes.get(event.node_id);
  const isStale = previous !== undefined && event.timestamp < previous.lastTimestamp;
  return {
    ...state,
    nodes: isStale ? state.nodes : withNode(state.nodes, event),
    epoch: Math.max(state.epoch, event.epoch),
    handover: applyHandoverEvent(state.handover, event, arrivedAt),
    log: appendBounded(state.log, event, maxLogRows),
    acceptedCount: state.acceptedCount + 1,
    staleCount: state.staleCount + (isStale ? 1 : 0),
  };
}

export function countMalformed(state: DashboardState): DashboardState {
  return { ...state, malformedCount: state.malformedCount + 1 };
}

export function setConnection(state: DashboardState, connection: ConnectionStatus): DashboardState {
  return { ...state, connection };
}

/** Nodes reporting LEAD at the highest epoch. More than one breaks the invariant. */
export function leadsAtCurrentEpoch(state: DashboardState): string[] {
  return [...state.nodes.values()]
    .filter((node) => node.state === "LEAD" && node.epoch === state.epoch)
    .map((node) => node.nodeId);
}
