export type DroneRole = "LEAD" | "SUCCESSOR" | "FOLLOWER";
export interface Drone {
  id: string;
  x: number;
  y: number;
  z: number;
  battery: number;
  latency: number;
  link: number;
  online: boolean;
  score: number;
  role: DroneRole;
}

export const DEMO_LIMITS = { latencyMin: 10, latencyMax: 200, leadMargin: 0.04, switchDelayMs: 550, warmRotationMs: 10_000 };
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function rankingScore(drone: Drone): number {
  const { latencyMin, latencyMax } = DEMO_LIMITS;
  const battery = clamp(drone.battery / 100, 0, 1);
  const link = clamp(drone.link / 100, 0, 1);
  const latency = clamp(drone.latency, latencyMin, latencyMax);
  const latencyQuality = 1 - (latency - latencyMin) / (latencyMax - latencyMin);
  return 0.45 * battery + 0.35 * link + 0.20 * latencyQuality;
}

export class DroneSimulation {
  readonly drones: Drone[] = [
    [96, 98, 22], [88, 92, 38], [77, 83, 60], [67, 74, 85], [58, 65, 110],
  ].map(([battery = 0, link = 0, latency = 0], index) => ({
    id: `D${index + 1}`, x: 20 + index * 12, y: 30 + index * 8, z: 45 + index * 3,
    battery, link, latency, online: true, score: 0, role: "FOLLOWER" as DroneRole,
  }));
  private readonly baselines = this.drones.map((drone) => ({ ...drone }));
  private tick = 0;
  leadId = "D1";
  successorId: string | null = "D2";
  rankedCandidates: readonly Drone[] = [];

  constructor() {
    this.varyWarmCandidates(0);
    this.rankAndAllocate();
  }

  updateTelemetry(elapsedMs?: number): void {
    this.tick += 1;
    this.drones.forEach((drone, index) => {
      if (!drone.online) return;
      const base = this.baselines[index]!;
      const wave = Math.sin(this.tick * 0.25 + index);
      drone.x = base.x + 1.5 * wave;
      drone.y = base.y + Math.cos(this.tick * 0.2 + index);
      drone.z = base.z + 0.5 * wave;
      // Hold D2/D3's final metrics after the kill so the promoted lead stays put.
      if (index === 1 || index === 2) return;
      drone.battery = base.battery - 0.5 + 0.5 * wave;
      drone.link = base.link + wave;
      drone.latency = base.latency + 2 * wave;
    });
    if (this.drones[0]!.online) this.varyWarmCandidates(elapsedMs ?? this.tick * 1000);
    this.rankAndAllocate();
  }

  private varyWarmCandidates(elapsedMs: number): void {
    const period = DEMO_LIMITS.warmRotationMs;
    // A linear triangle wave crosses the candidates' scores every 10 seconds.
    // Start just past the midpoint so D2 wins at startup and switches on tick 10.
    const phase = (elapsedMs + 1.5 * period + 100) % (2 * period);
    const blend = phase <= period ? phase / period : 2 - phase / period;
    const high = this.baselines[1]!;
    const low = this.baselines[2]!;
    for (const [index, weight] of [[1, blend], [2, 1 - blend]] as const) {
      const drone = this.drones[index]!;
      drone.battery = high.battery + (low.battery - high.battery) * weight;
      drone.link = high.link + (low.link - high.link) * weight;
      drone.latency = high.latency + (low.latency - high.latency) * weight;
    }
  }

  killD1(): string {
    const promoted = this.successorId!; // Prepared by the last telemetry update.
    this.drones[0]!.online = false;
    this.leadId = promoted;
    this.rankAndAllocate();
    return promoted;
  }

  private rankAndAllocate(): void {
    this.drones.forEach((drone) => { drone.score = rankingScore(drone); });
    this.rankedCandidates = this.drones.filter((drone) => drone.online)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const best = this.rankedCandidates[0]!;
    const retained = this.rankedCandidates.find((drone) => drone.id === this.leadId);
    if (!retained || best.score > retained.score + DEMO_LIMITS.leadMargin) this.leadId = best.id;
    this.successorId = this.rankedCandidates.find((drone) => drone.id !== this.leadId)?.id ?? null;
    this.drones.forEach((drone) => {
      drone.role = drone.online && drone.id === this.leadId ? "LEAD"
        : drone.online && drone.id === this.successorId ? "SUCCESSOR" : "FOLLOWER";
    });
  }
}
