/** Draws the pies, sparklines and handover history from the observed state. */

import { buildBars, buildPie, buildSparkline, type PieSlice } from "./charts";
import { make, type DashboardElements } from "./dom";
import { NODE_STATES } from "./protocol";
import type { DashboardState } from "./store";

export interface ChartLimits {
  maxSparkSamples: number;
  maxHistory: number;
}

const MS_DIGITS = 0;
const NO_VALUE = "—";

function formatMs(ms: number | undefined): string {
  return ms === undefined ? NO_VALUE : `${ms.toFixed(MS_DIGITS)} ms`;
}

function stateSlices(state: DashboardState): PieSlice[] {
  const nodes = [...state.nodes.values()];
  return NODE_STATES.map((name) => ({
    key: name,
    value: nodes.filter((node) => node.state === name).length,
  })).filter((slice) => slice.value > 0);
}

function legendRow(slice: PieSlice): HTMLElement {
  const row = make("tr", "", "");
  row.dataset["key"] = slice.key;
  row.append(make("td", "", slice.key), make("td", "", String(slice.value)));
  return row;
}

export class ChartsView {
  private readonly epochSamples: number[] = [];
  private readonly nodeSamples: number[] = [];
  private readonly history: number[] = [];
  private recordedHandovers = 0;

  constructor(
    private readonly elements: DashboardElements,
    private readonly limits: ChartLimits,
  ) {}

  update(state: DashboardState): void {
    this.sample(this.epochSamples, state.epoch);
    this.sample(this.nodeSamples, state.nodes.size);
    this.recordHandover(state);
    this.renderPies(state);
    this.renderSeries(state);
  }

  private sample(samples: number[], value: number): void {
    samples.push(value);
    if (samples.length > this.limits.maxSparkSamples) samples.shift();
  }

  /** Each completed handover is recorded once; one with inconsistent timestamps is skipped. */
  private recordHandover(state: DashboardState): void {
    const { completedCount, totalMs } = state.handover;
    if (completedCount === this.recordedHandovers) return;
    this.recordedHandovers = completedCount;
    if (totalMs === null) return;
    this.history.push(totalMs);
    if (this.history.length > this.limits.maxHistory) this.history.shift();
  }

  private renderPies(state: DashboardState): void {
    const { statesChart, statesLegend, packetsChart } = this.elements;
    const slices = stateSlices(state);
    statesChart.replaceChildren(buildPie(slices));
    statesLegend.replaceChildren(...slices.map(legendRow));
    packetsChart.replaceChildren(
      buildPie([
        { key: "accepted", value: state.acceptedCount },
        { key: "malformed", value: state.malformedCount },
        { key: "stale", value: state.staleCount },
      ]),
    );
  }

  private renderSeries(state: DashboardState): void {
    const { epochSpark, nodesSpark, historyChart } = this.elements;
    const { historyLast, historyMean, historyMax, handoverCount } = this.elements;
    const { history } = this;
    const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
    epochSpark.replaceChildren(buildSparkline(this.epochSamples));
    nodesSpark.replaceChildren(buildSparkline(this.nodeSamples));
    historyChart.replaceChildren(buildBars(history, this.limits.maxHistory));
    historyLast.textContent = formatMs(history.at(-1));
    historyMean.textContent = formatMs(history.length === 0 ? undefined : mean);
    historyMax.textContent = formatMs(history.length === 0 ? undefined : Math.max(...history));
    handoverCount.textContent = String(state.handover.completedCount);
  }
}
