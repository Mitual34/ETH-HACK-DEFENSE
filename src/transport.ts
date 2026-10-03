/**
 * Where events come from. The dashboard only ever receives: no source has a
 * send method, so it cannot take part in a decision.
 */

import type { Cancel, Scheduler } from "./clock";
import { logWarning } from "./log";

export type ConnectionStatus = "connecting" | "open" | "closed" | "demo";

export interface SourceHandlers {
  onMessage(text: string): void;
  onStatus(status: ConnectionStatus): void;
}

export interface SwarmEventSource {
  start(handlers: SourceHandlers): void;
  stop(): void;
}

/** The part of a WebSocket the dashboard uses. Deliberately has no send. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((data: unknown) => void) | null;
  onclose: (() => void) | null;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

/** A socket error is followed by close, so close alone drives the reconnect. */
export function openBrowserSocket(url: string): SocketLike {
  const socket = new WebSocket(url);
  const adapter: SocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    close: () => socket.close(),
  };
  socket.addEventListener("open", () => adapter.onopen?.());
  socket.addEventListener("message", (message) => adapter.onmessage?.(message.data));
  socket.addEventListener("close", () => adapter.onclose?.());
  return adapter;
}

export class WebSocketSource implements SwarmEventSource {
  private handlers: SourceHandlers | null = null;
  private socket: SocketLike | null = null;
  private cancelRetry: Cancel | null = null;

  constructor(
    private readonly url: string,
    private readonly reconnectDelayMs: number,
    private readonly scheduler: Scheduler,
    private readonly createSocket: SocketFactory,
  ) {}

  start(handlers: SourceHandlers): void {
    this.handlers = handlers;
    this.open();
  }

  stop(): void {
    this.handlers = null;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.socket?.close();
    this.socket = null;
  }

  private open(): void {
    this.handlers?.onStatus("connecting");
    try {
      this.socket = this.createSocket(this.url);
    } catch (error) {
      logWarning("socket_open_failed", String(error));
      this.retryLater();
      return;
    }
    this.socket.onopen = () => this.handlers?.onStatus("open");
    this.socket.onmessage = (data) => this.forward(data);
    this.socket.onclose = () => this.retryLater();
  }

  /** Non-text frames are forwarded as an empty packet, which is counted as malformed. */
  private forward(data: unknown): void {
    this.handlers?.onMessage(typeof data === "string" ? data : "");
  }

  private retryLater(): void {
    if (this.handlers === null || this.cancelRetry !== null) return;
    this.socket = null;
    this.handlers.onStatus("closed");
    logWarning("socket_closed", `reconnecting in ${this.reconnectDelayMs} ms`);
    this.cancelRetry = this.scheduler.schedule(this.reconnectDelayMs, () => {
      this.cancelRetry = null;
      this.open();
    });
  }
}
