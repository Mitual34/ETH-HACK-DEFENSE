/**
 * Opens every connected camera as a feed slot. Camera 1 stands in for drone 1,
 * camera 2 for drone 2, and so on. All cameras stay open at once, so a switch
 * never waits for a camera to start: the successor's feed is already warm.
 *
 * Every failure falls back to a placeholder slot and a log line.
 */

import { logWarning } from "./log";

export interface FeedSlot {
  label: string;
  /** Null for a placeholder shown when no camera is available for the slot. */
  stream: MediaStream | null;
}

export interface CameraLimits {
  maxFeeds: number;
  minFeeds: number;
  feedWidth: number;
  feedHeight: number;
}

/** The part of navigator.mediaDevices this module uses, so tests can fake it. */
export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices(): Promise<{ kind: string; deviceId: string }[]>;
}

/** Device ids are hidden until the user grants access, so ask once before listing. */
async function listCameraIds(devices: MediaDevicesLike): Promise<string[]> {
  const probe = await devices.getUserMedia({ video: true });
  probe.getTracks().forEach((track) => track.stop());
  const found = await devices.enumerateDevices();
  return found.filter((device) => device.kind === "videoinput").map((device) => device.deviceId);
}

async function openCamera(
  devices: MediaDevicesLike,
  deviceId: string,
  limits: CameraLimits,
): Promise<MediaStream | null> {
  const video = {
    deviceId: { exact: deviceId },
    width: { ideal: limits.feedWidth },
    height: { ideal: limits.feedHeight },
  };
  try {
    return await devices.getUserMedia({ video });
  } catch (error) {
    logWarning("camera_open_failed", String(error));
    return null;
  }
}

/** Fills up to minFeeds with placeholders, so a switch can be shown with no cameras. */
export function padSlots(slots: FeedSlot[], minFeeds: number): FeedSlot[] {
  const padded = [...slots];
  while (padded.length < minFeeds) {
    padded.push({ label: `NO CAMERA ${padded.length + 1}`, stream: null });
  }
  return padded;
}

export async function openCameraSlots(
  devices: MediaDevicesLike | undefined,
  limits: CameraLimits,
): Promise<FeedSlot[]> {
  const slots: FeedSlot[] = [];
  if (devices === undefined) {
    logWarning("cameras_unavailable", "this browser exposes no media devices");
    return padSlots(slots, limits.minFeeds);
  }
  try {
    const ids = (await listCameraIds(devices)).slice(0, limits.maxFeeds);
    for (const deviceId of ids) {
      const stream = await openCamera(devices, deviceId, limits);
      if (stream !== null) slots.push({ label: `CAMERA ${slots.length + 1}`, stream });
    }
  } catch (error) {
    logWarning("cameras_unavailable", String(error));
  }
  return padSlots(slots, limits.minFeeds);
}
