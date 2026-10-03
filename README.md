# TALOS dashboard

The ground dashboard for TALOS swarm handover. It shows node states, the current
epoch, the handover timer and the event log.

**The dashboard observes and never decides.** It has no code path that sends
anything to the swarm. If the browser crashes, the handover is unaffected.

This repository is the front end only. The daemon, the simulator and the ground
relay are not here.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

With no settings it opens a guided demo: seven questions, each answered from first
principles in a sentence or two, each showing only the panels it talks about. The
guide is a short text-message thread that moves next to the panel it explains. Two
steps ask the viewer to press a button (lose the lead, bring it back). "Skip the
guide" or the last step reveals every panel and loops the scenario. The steps live
in `src/guideSteps.ts`.

## Cameras and the DESTROY button

Plug in two or more USB cameras and allow camera access when the browser asks.
Camera 1 stands in for drone 1, camera 2 for drone 2, and so on. The pilot screen
shows the camera of whichever node the system says is lead.

Press **DESTROY** to lose the lead. The screen goes to FEED LOST, the handover
runs, and when the new lead is named the screen switches to its camera. The
switch time is shown in milliseconds, split in two:

- **decision**: from the press until the system names the new lead. In demo mode
  this is the scripted handover delay, not a measurement of a real swarm.
- **picture**: from that moment until the first frame of the new camera is on
  screen. This is measured on this screen, every time.

All cameras stay open at once, so the switch never waits for a camera to start.
With fewer than two cameras, or if access is refused, placeholders are shown and
everything else still works. If two USB cameras will not open together, lower
`VITE_TALOS_FEED_WIDTH` and `VITE_TALOS_FEED_HEIGHT`.

Camera access needs `localhost` or HTTPS. With a live relay the DESTROY button is
hidden, because the dashboard cannot send anything to the swarm.

To read a real ground relay, copy `.env.example` to `.env` and set:

```
VITE_TALOS_SOURCE=websocket
VITE_TALOS_WS_URL=ws://<relay-host>:<port>/<path>
```

Every setting is listed in `.env.example`; defaults live in `src/config.ts`.

## Checks

```bash
npm test          # deterministic: fake clock, fake socket, no real sleeps
npm run typecheck
npm run build
```

## What the relay must send

One JSON object per WebSocket text message:

```json
{ "timestamp": 1450, "node_id": "D2", "epoch": 2, "state": "LEAD", "event": "FEED_DETECTED", "reason": "feed restored" }
```

- `state`: `BOOT`, `FOLLOWER`, `SUCCESSOR`, `LEAD`, `YIELD`, `ISOLATED`, `FENCED`
- `event`: `STATE_CHANGE`, `FEED_LOSS`, `FAILURE_DETECTED`, `ELECTION_COMPLETE`,
  `LEASE_ACQUIRED`, `FEED_ENABLE_COMMAND`, `FEED_ENABLED`, `FEED_DETECTED`
- `timestamp`: milliseconds on a monotonic clock

Anything else is dropped and counted on screen as malformed.

## Reading the screen

The screen is laid out like an operations dashboard: collapsible rows (Pilot,
Summary, Handover, Event log) of bordered panels on a 24-column grid. Click a row
title to collapse it.

- **Epoch**: the highest epoch seen on any event. It never goes down.
- **Lead**: nodes reporting `LEAD` at that epoch. More than one raises an alarm.
- **Handover timer**: starts at `FEED_LOSS`. While running it counts on the
  dashboard's own clock. The final figure is `FEED_DETECTED` minus `FEED_LOSS`
  from the event timestamps, so it is only as accurate as the clocks that
  produced them.
- **Dropped packets**: malformed packets, and events that arrived older than one
  already seen from the same node.

## Structure

```
index.html          page shell
src/protocol.ts     event contract (states, event names, fields)
src/config.ts       every threshold and setting
src/validate.ts     untrusted packet -> event or null
src/handover.ts     handover timer (pure functions)
src/store.ts        observed state (pure functions)
src/transport.ts    event source interface + WebSocket source
src/demo*.ts        scripted demo source and its controls
src/guide*.ts       guided demo: steps and the thread that walks through them
src/cameras.ts      opens the USB cameras as feed slots
src/feedView.ts     pilot screen: follows the lead, never picks the feed
src/switchTimer.ts  times a feed switch in milliseconds
src/frames.ts       detects the first frame of a switched feed
src/clock.ts        clock and scheduler interfaces
src/fakes.ts        fakes of every interface, for tests
src/render.ts       DOM rendering (textContent only)
src/fonts.ts        self-hosted Inter and IBM Plex Mono
src/charts*.ts      pies, sparklines and the handover history
src/*.css           theme tokens (styles), panel grid (layout), panels, charts, guide, feed
src/app.ts          wiring
tests/              vitest suites
```
