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
});
