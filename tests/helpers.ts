import { DEFAULT_CONFIG } from "../src/config";
import { ELEMENT_ID_LIST, findElements, type DashboardElements } from "../src/dom";
import type { SwarmEvent } from "../src/protocol";

export const LIMITS = DEFAULT_CONFIG;

export function event(overrides: Partial<SwarmEvent>): SwarmEvent {
  return {
    timestamp: 0,
    node_id: "D1",
    epoch: 1,
    state: "FOLLOWER",
    event: "STATE_CHANGE",
    reason: "",
    ...overrides,
  };
}

/** Builds an empty page shell with every element the dashboard looks up. */
export function mountShell(): DashboardElements {
  const shell = ELEMENT_ID_LIST.map((id) => {
    const created = document.createElement("div");
    created.id = id;
    return created;
  });
  document.body.replaceChildren(...shell);
  return findElements(document);
}
