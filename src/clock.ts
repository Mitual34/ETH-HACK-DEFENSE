/** Time sits behind two interfaces so tests can fake it and never sleep. */

export interface Clock {
  /** Monotonic milliseconds. */
  now(): number;
}

export type Cancel = () => void;

export interface Scheduler {
  schedule(delayMs: number, task: () => void): Cancel;
}

export class BrowserClock implements Clock {
  now(): number {
    return performance.now();
  }
}

export class BrowserScheduler implements Scheduler {
  schedule(delayMs: number, task: () => void): Cancel {
    const handle = setTimeout(task, delayMs);
    return () => clearTimeout(handle);
  }
}
