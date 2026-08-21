import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The auto-updater fails SILENTLY when misconfigured — the client just never
 * offers an update — so these are asserted rather than trusted. Both of these
 * were wrong in the first shipped build: no .sig was produced, and the
 * endpoint pointed at a path that 404s.
 */
const conf = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../src-tauri/tauri.conf.json'), 'utf-8'),
) as {
  version: string;
  bundle: { createUpdaterArtifacts?: boolean };
  plugins: { updater: { pubkey: string; endpoints: string[] } };
};

describe('tauri updater config', () => {
  it('emits updater artifacts, or nothing is ever signed', () => {
    expect(conf.bundle.createUpdaterArtifacts).toBe(true);
  });

  it('carries a real public key, not the scaffold placeholder', () => {
    expect(conf.plugins.updater.pubkey).not.toMatch(/REPLACE_WITH/i);
    expect(conf.plugins.updater.pubkey.length).toBeGreaterThan(40);
  });

  it('points at the API prefix the update route is actually served under', () => {
    const [endpoint] = conf.plugins.updater.endpoints;
    expect(endpoint, 'updater endpoint').toContain('/api/v1/updates/');
    // Tauri substitutes these — a hardcoded target/arch would only update one platform.
    expect(endpoint).toContain('{{target}}');
    expect(endpoint).toContain('{{arch}}');
    expect(endpoint).toContain('{{current_version}}');
  });

  it('keeps the app version in step with package.json', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf-8')) as { version: string };
    expect(conf.version, 'tauri.conf.json vs package.json').toBe(pkg.version);
  });

  it('polls the same host the app calls for everything else', () => {
    // Three places name the backend: this endpoint, the production fallback in
    // config.ts, and VITE_API_URL's default in the build workflow. Move one and
    // leave the others, and the app keeps working while auto-update quietly
    // stops — the client just never sees a new version.
    const endpointHost = new URL(conf.plugins.updater.endpoints[0]!).host;

    const configSrc = readFileSync(path.resolve(__dirname, '../config.ts'), 'utf-8');
    const prodFallback = configSrc.match(/return '(https:\/\/[^']+)'/)?.[1];
    expect(prodFallback, 'production API fallback in config.ts').toBeTruthy();
    expect(new URL(prodFallback!).host, 'config.ts fallback vs updater endpoint').toBe(endpointHost);

    const workflow = readFileSync(
      path.resolve(__dirname, '../../../../../.github/workflows/build-windows.yml'),
      'utf-8',
    );
    const ciDefault = workflow.match(/VITE_API_URL:.*?'(https:\/\/[^']+)'/)?.[1];
    expect(ciDefault, "VITE_API_URL default in build-windows.yml").toBeTruthy();
    expect(new URL(ciDefault!).host, 'CI default vs updater endpoint').toBe(endpointHost);
  });
});
