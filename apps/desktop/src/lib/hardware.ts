import type { HardwareProfileInput } from '@goh/types';
import { isTauriShell } from './optimizer';

/**
 * Hardware detection.
 *
 * In the packaged Windows app this calls the Rust `detect_hardware` command
 * (PowerShell/WMI). Anywhere else — the browser preview — there is no native
 * side, and what the page can see about the machine is not hardware: it is a
 * user-agent string and a screen size. Those are reported separately rather
 * than dressed up as a detection result, because a CPU field reading
 * "16 logical processors" next to a blank GPU looks like detection worked
 * badly, not like it never ran.
 */

export type HardwareSource = 'native' | 'browser';

export interface DetectionResult {
  profile: HardwareProfileInput;
  /** Where the numbers came from. Only 'native' is real hardware detection. */
  source: HardwareSource;
}

function detectVendorFromModel(model: string | null): HardwareProfileInput['gpuVendor'] | undefined {
  if (!model) return undefined;
  const m = model.toLowerCase();
  if (m.includes('nvidia') || m.includes('geforce') || m.includes('rtx') || m.includes('gtx')) return 'nvidia';
  if (m.includes('radeon') || m.includes('amd') || m.includes('rx ')) return 'amd';
  if (m.includes('intel') || m.includes('arc') || m.includes('uhd') || m.includes('iris')) return 'intel';
  return 'unknown';
}

function osFromUserAgent(ua: string): string {
  if (/windows nt 10/.test(ua)) return 'Windows 10/11';
  if (/windows nt 6\.3/.test(ua)) return 'Windows 8.1';
  if (/mac os x/.test(ua)) return 'macOS';
  if (/linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

/** Drop empty strings so a blank WMI field does not read as detected data. */
function clean(v: string | null | undefined): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

function positive(v: number | null | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

export async function detectHardware(): Promise<DetectionResult> {
  if (isTauriShell()) {
    // Dynamic import, like every other native call in this app. The previous
    // implementation reached for `window.__TAURI__`, which only exists when
    // `withGlobalTauri` is enabled in tauri.conf.json — it is not, so the
    // native branch never ran and the packaged app silently reported the
    // browser fallback as its hardware.
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = (await invoke('detect_hardware')) as Partial<HardwareProfileInput>;
    const gpuModel = clean(raw.gpuModel);
    return {
      source: 'native',
      profile: {
        cpu: clean(raw.cpu),
        gpuVendor: raw.gpuVendor ?? detectVendorFromModel(gpuModel ?? null),
        gpuModel,
        vramMb: positive(raw.vramMb),
        ramGb: positive(raw.ramGb),
        windowsVersion: clean(raw.windowsVersion),
        arch: clean(raw.arch),
        resolution: clean(raw.resolution),
        driverVersion: clean(raw.driverVersion),
      },
    };
  }

  // Browser preview. Deliberately no `cpu` — logical-core count is not a CPU
  // name, and presenting it as one is exactly the wrong kind of wrong.
  const ua = navigator.userAgent;
  const archMatch = /(x86_64|arm64|amd64)/.exec(ua);
  return {
    source: 'browser',
    profile: {
      arch: archMatch?.[1] === 'amd64' ? 'x64' : (archMatch?.[1] ?? undefined),
      resolution: `${screen.width}x${screen.height}`,
      windowsVersion: osFromUserAgent(ua),
    },
  };
}

/** Human-readable GPU summary for the "Your PC" panel. */
export function gpuLabel(hw: HardwareProfileInput): string | null {
  if (hw.gpuModel) return hw.gpuModel;
  if (hw.gpuVendor) return hw.gpuVendor;
  return null;
}
