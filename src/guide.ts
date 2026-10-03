/** Walks the viewer through the demo one question at a time. Demo source only. */

import type { DemoControls } from "./demo";
import type { DashboardElements } from "./dom";
import {
  FINISHED_PLACEMENT,
  type AnchorName,
  type GuideActionName,
  type GuideSide,
  type GuideStep,
} from "./guideSteps";

const LABEL = "First principles";
const NEXT_LABEL = "Next";
const LAST_LABEL = "Explore freely";
const DONE_LABEL = "Done";
const FINISHED_QUESTION = "Free run";
const FINISHED_ANSWER =
  "Everything is now on screen. The lead is lost and replaced every few seconds. Reload the page to replay the guide.";

/** The parts of the page the guide shows, hides and sits next to. */
export interface GuideScreen {
  panels: readonly HTMLElement[];
  anchors: ReadonlyMap<string, HTMLElement>;
}

export class Guide {
  private index = 0;
  private finished = false;
  private readonly actionsDone = new Set<number>();

  constructor(
    private readonly elements: DashboardElements,
    private readonly screen: GuideScreen,
    private readonly steps: readonly GuideStep[],
    private readonly controls: DemoControls,
  ) {}

  start(): void {
    const { guide, guideBack, guideNext, guideAction, guideSkip } = this.elements;
    guideBack.addEventListener("click", () => this.move(-1));
    guideNext.addEventListener("click", () => this.advance());
    guideAction.addEventListener("click", () => this.runAction());
    guideSkip.addEventListener("click", () => this.finish());
    guide.hidden = false;
    this.render();
  }

  /** For a step that waits on a control outside the thread, such as the DESTROY button. */
  completeAction(name: GuideActionName): void {
    if (this.finished || this.steps[this.index]?.waitFor !== name) return;
    this.actionsDone.add(this.index);
    this.render();
  }

  private isBlocked(): boolean {
    const step = this.steps[this.index];
    const needsAction = step?.action !== undefined || step?.waitFor !== undefined;
    return needsAction && !this.actionsDone.has(this.index);
  }

  private isLast(): boolean {
    return this.index === this.steps.length - 1;
  }

  private move(delta: number): void {
    this.index = Math.min(Math.max(this.index + delta, 0), this.steps.length - 1);
    this.render();
  }

  private advance(): void {
    if (this.isBlocked()) return;
    if (this.isLast()) this.finish();
    else this.move(1);
  }

  private runAction(): void {
    const action = this.steps[this.index]?.action;
    if (action === undefined || this.actionsDone.has(this.index)) return;
    this.actionsDone.add(this.index);
    this.controls[action.run]();
    this.render();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.controls.freeRun();
    this.render();
  }

  private render(): void {
    const step = this.steps[this.index];
    if (this.finished || step === undefined) this.renderFinished();
    else this.renderStep(step);
  }

  private renderStep(step: GuideStep): void {
    const { guideProgress, guideQuestion, guideAnswer } = this.elements;
    guideProgress.textContent = `${LABEL} · ${this.index + 1} of ${this.steps.length}`;
    guideQuestion.textContent = step.question;
    guideAnswer.textContent = step.answer;
    for (const panel of this.screen.panels) {
      panel.hidden = !(step.show as readonly string[]).includes(panel.dataset["panel"] ?? "");
    }
    this.place(step.anchor, step.side);
    this.renderButtons(step);
  }

  private renderButtons(step: GuideStep): void {
    const { guideBack, guideNext, guideAction } = this.elements;
    const done = this.actionsDone.has(this.index);
    guideAction.hidden = step.action === undefined;
    guideAction.textContent = done ? DONE_LABEL : (step.action?.label ?? "");
    guideAction.toggleAttribute("disabled", done);
    guideBack.toggleAttribute("disabled", this.index === 0);
    guideNext.textContent = this.isLast() ? LAST_LABEL : NEXT_LABEL;
    guideNext.toggleAttribute("disabled", this.isBlocked());
  }

  private renderFinished(): void {
    const { guideProgress, guideQuestion, guideAnswer, guideControls } = this.elements;
    guideProgress.textContent = `${LABEL} · complete`;
    guideQuestion.textContent = FINISHED_QUESTION;
    guideAnswer.textContent = FINISHED_ANSWER;
    guideControls.hidden = true;
    for (const panel of this.screen.panels) panel.hidden = false;
    this.place(FINISHED_PLACEMENT.anchor, FINISHED_PLACEMENT.side);
  }

  /** Moves the thread next to the part of the screen it is talking about. */
  private place(anchorName: AnchorName, side: GuideSide): void {
    const { guide } = this.elements;
    const anchor = this.screen.anchors.get(anchorName);
    guide.dataset["side"] = side;
    if (anchor === undefined) return;
    if (side === "above") anchor.before(guide);
    else anchor.after(guide);
  }
}
