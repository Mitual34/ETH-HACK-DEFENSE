/**
 * The guided demo: one question per step, answered from first principles.
 * Each step shows only the panels it talks about, so the screen never holds
 * more than the idea being explained.
 */

export type PanelName = "epoch" | "lead" | "dropped" | "handover" | "stages" | "nodes" | "log";
export type GuideActionName = "loseLead" | "restoreLead";

export interface GuideStep {
  question: string;
  answer: string;
  show: readonly PanelName[];
  /** A step with an action cannot be passed until the viewer has pressed it. */
  action?: { label: string; run: GuideActionName };
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    question: "What is the problem?",
    answer:
      "The pilot sees through one drone's camera: the lead. If the lead is lost, the pilot is blind.",
    show: ["nodes"],
  },
  {
    question: "Why does only one drone transmit?",
    answer:
      "Every drone shares one video channel. Two transmitting at once ruin the picture, so exactly one may hold the feed.",
    show: ["nodes", "lead"],
  },
  {
    question: "Who takes over?",
    answer:
      "Every drone ranks the swarm with the same formula on the same data, so they all agree without a discussion. The runner-up waits, ready: the successor.",
    show: ["nodes"],
  },
  {
    question: "How does the swarm know the lead is gone?",
    answer:
      "A lost drone cannot say so. Each drone sends a steady heartbeat, and several missed in a row can only mean it is gone.",
    show: ["nodes", "handover"],
    action: { label: "Lose the lead", run: "loseLead" },
  },
  {
    question: "What stops two drones both taking over?",
    answer:
      "Taking over means claiming the next epoch number. Only the holder of the highest epoch may transmit, so there is never a tie.",
    show: ["nodes", "epoch", "lead"],
  },
  {
    question: "What if the old lead comes back?",
    answer:
      "Its epoch is now out of date. It sees the higher number, stays silent and rejoins as a follower.",
    show: ["nodes", "epoch"],
    action: { label: "Bring it back", run: "restoreLead" },
  },
  {
    question: "How do we know it worked?",
    answer:
      "One number: how long the pilot was dark. Every stage is timed, and the total is the result. In this demo the timings are scripted, not measured.",
    show: ["handover", "stages"],
  },
];
