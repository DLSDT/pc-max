import { describe, expect, it, vi, afterEach } from 'vitest';

/**
 * The packaged app must reach the Rust `detect_hardware` command. It used to
 * call it through `window.__TAURI__`, a bridge that only exists when
 * `withGlobalTauri` is enabled in tauri.conf.json — it is not. The native
 * branch therefore never ran, and the installed Windows app silently reported
 * the browser fallback as the user's hardware: "16 logical processors" for a
 * CPU, a user-agent guess for the OS, and no GPU, VRAM or RAM at all.
 */
describe('detectHardware', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('invokes the native command through the Tauri API, not a global bridge', async () => {
    const invoke = vi.fn().mockResolvedValue({
      cpu: 'Intel(R) Core(TM) i7-12700K',
      gpuModel: 'NVIDIA GeForce RTX 4070',
      vramMb: 12288,
      ramGb: 32,
      windowsVersion: 'Microsoft Windows 11 Pro 10.0.22631',
    });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
    vi.doMock('../optimizer', () => ({ isTauriShell: () => true }));

    const { detectHardware } = await import('../hardware');
    const res = await detectHardware();

    expect(invoke).toHaveBeenCalledWith('detect_hardware');
    expect(res.source).toBe('native');
    expect(res.profile.cpu).toBe('Intel(R) Core(TM) i7-12700K');
    expect(res.profile.ramGb).toBe(32);
    // Vendor is inferred from the model when the native side omits it.
    expect(res.profile.gpuVendor).toBe('nvidia');
  });

  it('drops blank and zero fields rather than reporting them as detected', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockResolvedValue({ cpu: '   ', gpuModel: '', vramMb: 0, ramGb: null }),
    }));
    vi.doMock('../optimizer', () => ({ isTauriShell: () => true }));

    const { detectHardware } = await import('../hardware');
    const { profile } = await detectHardware();
    expect(profile.cpu).toBeUndefined();
    expect(profile.gpuModel).toBeUndefined();
    expect(profile.vramMb).toBeUndefined();
    expect(profile.ramGb).toBeUndefined();
  });

  it('never passes off a browser reading as a CPU', async () => {
    // The suite runs in node, where these do not exist; the browser path reads
    // them directly.
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    vi.stubGlobal('screen', { width: 1920, height: 1080 });
    vi.doMock('../optimizer', () => ({ isTauriShell: () => false }));
    const { detectHardware } = await import('../hardware');
    const res = await detectHardware();

    expect(res.source).toBe('browser');
    // A logical-core count is not a processor name; the old fallback reported
    // "N logical processors" here and the dashboard showed it as the CPU.
    expect(res.profile.cpu).toBeUndefined();
    expect(res.profile.gpuModel).toBeUndefined();
    expect(res.profile.ramGb).toBeUndefined();
  });
});
