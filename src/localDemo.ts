import { openCameraSlots } from "./cameras";
import { ChartsView } from "./chartsView";
import type { DashboardConfig } from "./config";
import { make, type DashboardElements } from "./dom";
import { createSurface } from "./feedSurface";
import type { EventName, NodeState } from "./protocol";
import { renderHandover, renderLog, renderSummary } from "./render";
import { DEMO_LIMITS, DroneSimulation } from "./simulation";
import { applyEvent, initialState, setConnection } from "./store";

export function startLocalDemo(elements: DashboardElements, config: DashboardConfig): void {
  const simulation = new DroneSimulation();
  const charts = new ChartsView(elements, config);
  let state = setConnection(initialState(), "demo");
  let epoch = 1;
  const startedAt = performance.now();
  let cameraReady = false;
  let handoffPending = false;
  let warmVideo: HTMLVideoElement | null = null;
  const surfaces = new Map<string, HTMLVideoElement>();
  const cards = new Map<string, { root: HTMLElement; role: HTMLElement; telemetry: HTMLElement }>();

  // Slot 1 is the existing pilot screen; slot 2 is the existing feed wall.
  const standby = make("div", "feed-tile", "");
  standby.dataset["slot"] = "2";
  const standbyLabel = make("p", "feed-tile-label", "D2 · SLOT 2");
  const standbyStatus = make("p", "feed-tile-status", "SUCCESSOR · CAMERA STARTING");
  const standbyPlaceholder = make("div", "feed-surface feed-placeholder", "CAMERA STARTING");
  standby.append(standbyPlaceholder, standbyLabel, standbyStatus);
  elements.feedScreen.replaceChildren(standby);
  elements.feedScreen.classList.add("demo-feed-screen");
  elements.pilotScreen.dataset["slot"] = "1";
  elements.pilotLost.textContent = "CAMERA STARTING";
  elements.pilotBadge.textContent = "D1 · LEAD · SLOT 1";
  elements.destroy.textContent = "KILL D1";
  elements.destroy.setAttribute("disabled", "");
  elements.restore.hidden = true;

  simulation.drones.forEach((drone) => {
    const root = make("div", "drone-card", "");
    root.dataset["droneId"] = drone.id;
    const role = make("p", "node-state", "");
    const telemetry = make("p", "telemetry", "");
    root.append(make("p", "node-id", drone.id), role, telemetry);
    elements.feedScreen.append(root);
    cards.set(drone.id, { root, role, telemetry });
  });
  const header = elements.nodes.closest("table")!.querySelector("thead tr")!;
  header.replaceChildren(...["Drone", "Role", "Online", "Position x / y / z", "Battery", "Latency", "Link", "Score", "Rank"]
    .map((title) => make("th", "", title)));
  elements.nodes.closest("section")!.classList.add("telemetry-panel");

  function event(id: string, nodeState: NodeState, name: EventName, reason: string, timestamp = performance.now() - startedAt): void {
    state = applyEvent(state, {
      timestamp, node_id: id, epoch,
      state: nodeState, event: name, reason,
    }, performance.now(), config.maxLogRows);
  }

  function publishRoles(reason: string): void {
    simulation.drones.forEach((drone) => event(drone.id, drone.online ? drone.role : "ISOLATED", "STATE_CHANGE", reason));
  }

  function render(): void {
    if (simulation.drones[0]!.online) {
      const warmId = simulation.successorId!;
      standbyLabel.textContent = `${warmId} · WEBCAM 2 · SLOT 2`;
      if (warmVideo) warmVideo.dataset["droneId"] = warmId;
    }
    renderSummary(elements, state);
    renderHandover(elements, state.handover, performance.now());
    renderLog(elements, state.log);
    charts.update(state);
    const rows = simulation.drones.map((drone) => {
      const rank = simulation.rankedCandidates.findIndex((candidate) => candidate.id === drone.id) + 1;
      const position = `${drone.x.toFixed(1)} / ${drone.y.toFixed(1)} / ${drone.z.toFixed(1)}`;
      const card = cards.get(drone.id)!;
      card.root.dataset["state"] = drone.online ? drone.role : "ISOLATED";
      card.role.textContent = `${drone.role} · ${drone.online ? "ONLINE" : "OFFLINE"}`;
      card.telemetry.textContent = `${drone.battery.toFixed(1)}% BAT · ${drone.latency.toFixed(0)} ms · ${drone.link.toFixed(1)}% LINK\n${position}\nSCORE ${drone.score.toFixed(4)} · RANK ${rank || "—"}`;
      const row = make("tr", "node-row", "");
      row.dataset["state"] = card.root.dataset["state"];
      row.append(...[drone.id, drone.role, drone.online ? "ONLINE" : "OFFLINE", position,
        `${drone.battery.toFixed(1)}%`, `${drone.latency.toFixed(0)} ms`, `${drone.link.toFixed(1)}%`,
        drone.score.toFixed(4), rank ? String(rank) : "—"].map((value, index) =>
        make("td", index === 0 ? "node-id" : index === 1 ? "node-state" : "telemetry", value)));
      return row;
    });
    elements.nodes.replaceChildren(...rows);
    elements.demoHint.textContent = handoffPending
      ? `D1 offline. Slot 1 is black while ${simulation.leadId} stays warm for the timed handoff.`
      : simulation.drones[0]!.online
      ? cameraReady ? `${simulation.successorId} is the warm successor. D2 and D3 alternate every 10 seconds. KILL D1 promotes the cached successor.`
        : "Allow camera access to warm both live webcam feeds."
      : `D1 offline. ${simulation.leadId} leads in slot 1. ${simulation.successorId} is the next successor.`;
  }

  publishRoles("Five-drone local simulation initialized; successor cached");
  render();
  const telemetryTimer = window.setInterval(() => {
    const previousSuccessor = simulation.successorId;
    simulation.updateTelemetry(performance.now() - startedAt);
    if (simulation.successorId !== previousSuccessor) {
      publishRoles(`Linear telemetry ranking selected ${simulation.successorId} as warm successor`);
    }
    render();
  }, 1000);

  void openCameraSlots(navigator.mediaDevices, { ...config, maxFeeds: 2, minFeeds: 2 }).then(async (slots) => {
    for (const [index, slot] of slots.entries()) {
      if (!slot.stream) continue;
      const id = `D${index + 1}`;
      const video = createSurface({ label: id, stream: slot.stream }) as HTMLVideoElement;
      video.dataset["droneId"] = id;
      video.dataset["active"] = "true";
      surfaces.set(id, video);
      if (index === 0) {
        elements.pilotScreen.prepend(video);
        elements.pilotLost.hidden = true;
      } else {
        // Webcam 2 represents the ranked simulated successor, D2 or D3.
        warmVideo = video;
        standbyPlaceholder.remove();
        standby.prepend(video);
      }
    }
    await Promise.all([...surfaces.values()].map(async (video) => {
      await video.play();
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve) => video.addEventListener("loadeddata", () => resolve(), { once: true }));
      }
    }));
    cameraReady = surfaces.size === 2;
    standbyStatus.textContent = cameraReady ? "SUCCESSOR · WARM / PLAYING" : "CAMERA NOT AVAILABLE";
    elements.destroy.toggleAttribute("disabled", !cameraReady);
    event(simulation.successorId!, "SUCCESSOR", "STATE_CHANGE", "Both device-bound webcams playing; selected successor warm");
    render();
  }).catch((error: unknown) => {
    elements.demoHint.textContent = `Camera startup: ${String(error)}`;
  });

  elements.destroy.addEventListener("click", () => {
    const pressedAt = performance.now();
    handoffPending = true;
    elements.destroy.setAttribute("disabled", "");
    elements.switchNote.textContent = `Switch queued · ${DEMO_LIMITS.switchDelayMs} ms demo delay`;
    event("D1", "ISOLATED", "FEED_LOSS", `KILL D1 pressed; ${DEMO_LIMITS.switchDelayMs} ms demo delay`, pressedAt - startedAt);
    const promoted = simulation.killD1();
    epoch += 1;
    event(promoted, "LEAD", "FAILURE_DETECTED", "Offline lead bypasses retention hysteresis");
    publishRoles("D1 offline; cached successor allocated; display handoff pending");
    // Remove D1 immediately; the selected warm drone keeps playing in slot 2.
    surfaces.get("D1")!.remove();
    elements.pilotBadge.textContent = "";
    standbyStatus.textContent = `${promoted} · WARM / HANDOFF PENDING`;
    render();
    window.setTimeout(() => {
      event(promoted, "LEAD", "ELECTION_COMPLETE", "Promoted cached successor; no connection setup");
      event(promoted, "LEAD", "LEASE_ACQUIRED", "Local lead allocation updated");
      event(promoted, "LEAD", "FEED_ENABLE_COMMAND", `Move already-playing ${promoted} element to slot 1`);
      const video = warmVideo!;
      // moveBefore preserves the playing element's media state during reparenting.
      const leadSlot = elements.pilotScreen as HTMLElement & {
        moveBefore: (node: Node, child: Node | null) => void;
      };
      leadSlot.moveBefore(video, elements.pilotBadge);
      handoffPending = false;
      elements.pilotBadge.textContent = `${promoted} · LEAD · WEBCAM 2 · SLOT 1`;
      standby.prepend(make("div", "feed-surface feed-placeholder", "TELEMETRY ONLY"));
      standbyLabel.textContent = `${simulation.successorId} · SLOT 2`;
      standbyStatus.textContent = "SUCCESSOR · NO WEBCAM";
      event(promoted, "LEAD", "FEED_ENABLED", "Existing webcam 2 stream and video reused");
      publishRoles("Failover complete; online ranking and next successor cached");
      elements.destroy.setAttribute("disabled", "");
      render();
      // Observe presentation separately; promotion never waits for another frame.
      video.requestVideoFrameCallback(() => {
        event(promoted, "LEAD", "FEED_DETECTED", `First presented ${promoted} frame after slot move`);
        elements.switchTime.textContent = `${(performance.now() - pressedAt).toFixed(1)} ms`;
        elements.switchNote.textContent = `kill click → presented ${promoted} frame; includes ${DEMO_LIMITS.switchDelayMs} ms demo delay`;
        render();
      });
    }, DEMO_LIMITS.switchDelayMs);
  });
  window.addEventListener("pagehide", () => {
    window.clearInterval(telemetryTimer);
    surfaces.forEach((video) => (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop()));
  }, { once: true });
}
