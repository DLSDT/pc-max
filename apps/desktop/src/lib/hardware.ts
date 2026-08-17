import type { HardwareProfileInput } from '@goh/types';

/**
 * Hardware detection.
 *
 * In the packaged Windows app this calls the Rust `detect_hardware` command
 * (PowerShell/WMI). In the browser preview (Vite) the Rust side is absent, so
 * we fall back to whatever the platform exposes — usually just CPU cores, arch
 * and resolution.
 */

interface TauriBridge {
  __TAURI__?: { core?: { invoke: (cmd: string) => Promise<unknown> } };
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

export async function detectHardware(): Promise<HardwareProfileInput> {
  const tauri = (window as unknown as TauriBridge).__TAURI__;

  if (tauri?.core?.invoke) {
    try {
      const raw = (await tauri.core.invoke('detect_hardware')) as HardwareProfileInput;
      const gpuModel = raw.gpuModel ?? null;
      return {
        cpu: raw.cpu ?? undefined,
        gpuVendor: raw.gpuVendor ?? detectVendorFromModel(gpuModel),
        gpuModel: gpuModel ?? undefined,
        vramMb: raw.vramMb ?? undefined,
        ramGb: raw.ramGb ?? undefined,
        windowsVersion: raw.windowsVersion ?? undefined,
        arch: raw.arch ?? undefined,
        resolution: raw.resolution ?? undefined,
        driverVersion: raw.driverVersion ?? undefined,
      };
    } catch {
      // Fall through to the browser path.
    }
  }

  // Browser preview fallback — partial but honest.
  const ua = navigator.userAgent;
  const cores = navigator.hardwareConcurrency;
  const resolution = `${screen.width}x${screen.height}`;
  const archMatch = /(x86_64|arm64|amd64)/.exec(ua);
  return {
    cpu: cores ? `${cores} logical processors` : undefined,
    arch: archMatch?.[1] === 'amd64' ? 'x64' : (archMatch?.[1] ?? undefined),
    resolution,
    windowsVersion: osFromUserAgent(ua),
  };
}

/** Human-readable GPU summary for the "Your PC" panel. */
export function gpuLabel(hw: HardwareProfileInput): string | null {
  if (hw.gpuModel) return hw.gpuModel;
  if (hw.gpuVendor) return hw.gpuVendor;
  return null;
}
