/** Small SVG chart builders. Pure: values in, an SVG element out. No colours here; CSS owns those. */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const PIE = { size: 100, radius: 25 } as const;
const SPARK = { width: 100, height: 30, top: 4, bottom: 28 } as const;
const BARS = { width: 300, height: 100, top: 8, gap: 3, gridlines: 3 } as const;

export interface PieSlice {
  /** Becomes data-key, which CSS maps to a series colour. */
  key: string;
  value: number;
}

type Attributes = Record<string, string | number>;

function svg(tag: string, attributes: Attributes): SVGElement {
  const created = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, String(value));
  return created;
}

/** A stroke as wide as the diameter turns a circle outline into a filled pie slice. */
function pieSlice(key: string, start: number, length: number, circumference: number): SVGElement {
  const centre = PIE.size / 2;
  return svg("circle", {
    class: "pie-slice",
    "data-key": key,
    cx: centre,
    cy: centre,
    r: PIE.radius,
    "stroke-width": PIE.radius * 2,
    "stroke-dasharray": `${length} ${circumference}`,
    "stroke-dashoffset": -start,
    transform: `rotate(-90 ${centre} ${centre})`,
  });
}

/** An empty pie is drawn as one neutral slice, so the panel never collapses. */
export function buildPie(slices: readonly PieSlice[]): SVGElement {
  const circumference = 2 * Math.PI * PIE.radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const root = svg("svg", { viewBox: `0 0 ${PIE.size} ${PIE.size}`, role: "img" });
  if (total === 0) {
    root.append(pieSlice("none", 0, circumference, circumference));
    return root;
  }
  let start = 0;
  for (const slice of slices.filter((candidate) => candidate.value > 0)) {
    const length = (slice.value / total) * circumference;
    root.append(pieSlice(slice.key, start, length, circumference));
    start += length;
  }
  return root;
}

function sparkPoints(samples: readonly number[]): string {
  const low = Math.min(...samples);
  const range = Math.max(...samples) - low || 1;
  const step = SPARK.width / Math.max(samples.length - 1, 1);
  return samples
    .map((sample, index) => {
      const y = SPARK.bottom - ((sample - low) / range) * (SPARK.bottom - SPARK.top);
      return `${index * step},${y}`;
    })
    .join(" ");
}

/** The strip under a stat value: how the value moved over the recent samples. */
export function buildSparkline(samples: readonly number[]): SVGElement {
  const root = svg("svg", { viewBox: `0 0 ${SPARK.width} ${SPARK.height}`, preserveAspectRatio: "none" });
  const drawn = samples.length < 2 ? [0, 0] : samples;
  const points = sparkPoints(drawn);
  const area = `M0,${SPARK.height} L${points.replaceAll(" ", " L")} L${SPARK.width},${SPARK.height} Z`;
  root.append(svg("path", { class: "spark-area", d: area }));
  root.append(svg("polyline", { class: "spark-line", points }));
  return root;
}

/** One bar per value, newest on the right, in a fixed number of slots so bars never resize. */
export function buildBars(values: readonly number[], slots: number): SVGElement {
  const root = svg("svg", { viewBox: `0 0 ${BARS.width} ${BARS.height}`, preserveAspectRatio: "none" });
  for (let line = 1; line <= BARS.gridlines; line += 1) {
    const y = (BARS.height / (BARS.gridlines + 1)) * line;
    root.append(svg("line", { class: "gridline", x1: 0, x2: BARS.width, y1: y, y2: y }));
  }
  const slotWidth = BARS.width / slots;
  const tallest = Math.max(...values, 1);
  const shown = values.slice(-slots);
  shown.forEach((value, index) => {
    const height = (value / tallest) * (BARS.height - BARS.top);
    const x = (slots - shown.length + index) * slotWidth;
    const bar = { class: "bar", x, y: BARS.height - height, width: slotWidth - BARS.gap, height };
    root.append(svg("rect", bar));
  });
  return root;
}
