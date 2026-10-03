import { describe, expect, it } from "vitest";
import { DemoSource, type DemoControls } from "../src/demo";
import type { DashboardElements } from "../src/dom";
import { FakeTimeline } from "../src/fakes";
import { Guide } from "../src/guide";
import { GUIDE_STEPS, type PanelName } from "../src/guideSteps";
import { applyEvent, initialState, leadsAtCurrentEpoch, type DashboardState } from "../src/store";
import { parseSwarmEvent } from "../src/validate";
import { LIMITS, mountShell } from "./helpers";

const PANEL_NAMES: PanelName[] = ["epoch", "lead", "dropped", "handover", "stages", "nodes", "log"];
const ACTION_STEP = GUIDE_STEPS.findIndex((step) => step.action !== undefined);
const MAX_WORDS_PER_ANSWER = 30;
const SETTLE_MS = 10_000;

interface Harness {
  elements: DashboardElements;
  panels: HTMLElement[];
  calls: string[];
}

function startGuide(): Harness {
  const elements = mountShell();
  const panels = PANEL_NAMES.map((name) => {
    const panel = document.createElement("section");
    panel.dataset["panel"] = name;
    return panel;
  });
  const calls: string[] = [];
  const controls: DemoControls = {
    loseLead: () => calls.push("loseLead"),
    restoreLead: () => calls.push("restoreLead"),
    freeRun: () => calls.push("freeRun"),
  };
  new Guide(elements, panels, GUIDE_STEPS, controls).start();
  return { elements, panels, calls };
}

function visible(panels: HTMLElement[]): string[] {
  return panels.filter((panel) => !panel.hidden).map((panel) => panel.dataset["panel"] ?? "");
}

function clickNext(elements: DashboardElements, times: number): void {
  for (let count = 0; count < times; count += 1) elements.guideNext.click();
}

describe("Guide", () => {
  it("opens on the first question and shows only the panel it talks about", () => {
    const { elements, panels } = startGuide();
    expect(elements.guideProgress.textContent).toBe(`First principles · 1 of ${GUIDE_STEPS.length}`);
    expect(elements.guideQuestion.textContent).toBe("What is the problem?");
    expect(visible(panels)).toEqual(["nodes"]);
  });

  it("holds the viewer on an action step until the action is pressed, and runs it once", () => {
    const { elements, calls } = startGuide();
    clickNext(elements, ACTION_STEP + 3);
    expect(elements.guideProgress.textContent).toContain(`${ACTION_STEP + 1} of`);
    elements.guideAction.click();
    elements.guideAction.click();
    expect(calls).toEqual(["loseLead"]);
    clickNext(elements, 1);
    expect(elements.guideProgress.textContent).toContain(`${ACTION_STEP + 2} of`);
  });

  it("skipping reveals every panel, hides the controls and starts the free run once", () => {
    const { elements, panels, calls } = startGuide();
    elements.guideSkip.click();
    elements.guideSkip.click();
    expect(visible(panels)).toEqual(PANEL_NAMES);
    expect(elements.guideControls.hidden).toBe(true);
    expect(calls).toEqual(["freeRun"]);
  });

  it("keeps every step short and never shows more than three panels", () => {
    for (const step of GUIDE_STEPS) {
      expect(step.answer.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS_PER_ANSWER);
      expect(step.show.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("DemoSource controls", () => {
  function observe(drive: (source: DemoSource) => void): DashboardState {
    const timeline = new FakeTimeline();
    const source = new DemoSource(5, timeline, timeline);
    let state = initialState();
    source.start({
      onStatus: () => undefined,
      onMessage: (text) => {
        state = applyEvent(state, parseSwarmEvent(text, LIMITS)!, 0, LIMITS.maxLogRows);
        expect(leadsAtCurrentEpoch(state).length).toBeLessThanOrEqual(1);
      },
    });
    drive(source);
    timeline.advance(SETTLE_MS);
    return state;
  }

  it("queues scenes in order even when the controls are pressed before boot finishes", () => {
    const state = observe((source) => {
      source.loseLead();
      source.restoreLead();
      source.loseLead();
    });
    expect(state.staleCount).toBe(0);
    expect(state.epoch).toBe(3);
    expect(leadsAtCurrentEpoch(state)).toEqual(["D3"]);
    expect(state.handover.completedCount).toBe(2);
  });

  it("ignores a restore when no lead is down", () => {
    const state = observe((source) => source.restoreLead());
    expect(state.epoch).toBe(1);
    expect(leadsAtCurrentEpoch(state)).toEqual(["D1"]);
  });
});
