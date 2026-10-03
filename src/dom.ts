/** DOM helpers. Text only ever enters the page through textContent, never as HTML. */

const ELEMENT_IDS = {
  connection: "connection",
  demoNotice: "demo-notice",
  epoch: "epoch",
  lead: "lead",
  leadAlarm: "lead-alarm",
  malformed: "malformed",
  stale: "stale",
  banner: "banner",
  timer: "timer",
  timerNote: "timer-note",
  stages: "stages",
  nodes: "nodes",
  log: "log",
  accepted: "accepted",
  nodeCount: "node-count",
  statesChart: "states-chart",
  statesLegend: "states-legend",
  packetsChart: "packets-chart",
  epochSpark: "epoch-spark",
  nodesSpark: "nodes-spark",
  historyChart: "history-chart",
  historyLast: "history-last",
  historyMean: "history-mean",
  historyMax: "history-max",
  handoverCount: "handover-count",
  feedScreen: "feed-screen",
  destroy: "destroy",
  switchTime: "switch-time",
  switchNote: "switch-note",
  guide: "guide",
  guideProgress: "guide-progress",
  guideQuestion: "guide-question",
  guideAnswer: "guide-answer",
  guideControls: "guide-controls",
  guideAction: "guide-action",
  guideBack: "guide-back",
  guideNext: "guide-next",
  guideSkip: "guide-skip",
} as const;

export type ElementKey = keyof typeof ELEMENT_IDS;
export type DashboardElements = Record<ElementKey, HTMLElement>;
export const ELEMENT_ID_LIST: readonly string[] = Object.values(ELEMENT_IDS);

const MS_PER_SECOND = 1000;
const NO_VALUE = "—";

/** Throws at startup if the page shell is missing an element the dashboard needs. */
export function findElements(root: Document): DashboardElements {
  const entries = Object.entries(ELEMENT_IDS).map(([key, id]) => {
    const found = root.getElementById(id);
    if (found === null) throw new Error(`page is missing #${id}`);
    return [key, found] as const;
  });
  return Object.fromEntries(entries) as DashboardElements;
}

/** The sections the guide can show or hide, marked with data-panel in the page. */
export function findPanels(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-panel]"));
}

/** The collapsible rows that group panels, marked with data-row in the page. */
export function findRows(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-row]"));
}

/** The parts of the screen the guide thread can sit next to, keyed by data-anchor. */
export function findAnchors(root: ParentNode): Map<string, HTMLElement> {
  const anchors = Array.from(root.querySelectorAll<HTMLElement>("[data-anchor]"));
  return new Map(anchors.map((anchor) => [anchor.dataset["anchor"] ?? "", anchor]));
}

export function make(tag: string, className: string, text: string): HTMLElement {
  const created = document.createElement(tag);
  if (className !== "") created.className = className;
  created.textContent = text;
  return created;
}

export function formatSeconds(ms: number | null, digits: number): string {
  return ms === null ? NO_VALUE : `${(ms / MS_PER_SECOND).toFixed(digits)} s`;
}
