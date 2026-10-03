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

With no settings it plays a scripted demo scenario in the browser. **Timings shown
in demo mode are scripted, not measured**, and the page says so.

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
src/demo*.ts        scripted demo source
src/clock.ts        clock and scheduler interfaces
src/fakes.ts        fakes of every interface, for tests
src/render.ts       DOM rendering (textContent only)
src/app.ts          wiring
tests/              vitest suites
```
