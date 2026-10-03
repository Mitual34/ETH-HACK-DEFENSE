/** Structured JSON log lines for the dashboard's own failure paths. */

const COMPONENT = "dashboard";

export function logWarning(event: string, reason: string): void {
  console.warn(JSON.stringify({ timestamp: Date.now(), component: COMPONENT, event, reason }));
}
