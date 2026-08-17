import { api } from './api';
import { cache } from './cache';
import { config } from './config';

let registered = false;

/**
 * Ensure the anonymous device is registered with the server. Best-effort:
 * offline first-run still works — registration retries on the next sync.
 */
export async function ensureDeviceRegistered(): Promise<string> {
  const deviceId = cache.getDeviceId();
  if (registered) return deviceId;
  try {
    const res = await api.registerDevice(deviceId, config.appVersion);
    cache.setDeviceId(res.deviceId);
    registered = true;
  } catch {
    // Offline — retry on next sync cycle.
  }
  return deviceId;
}
