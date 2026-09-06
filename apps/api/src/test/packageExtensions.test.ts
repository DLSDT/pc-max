import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSafeDestination, assertSafeFilename, PACKAGE_EXT } from '../services/packages';

/**
 * The server decides what may be uploaded; the desktop's Rust `safe_destination`
 * decides what may actually be written to a game folder. Nothing but this test
 * keeps the two lists in step, and a mismatch is silent in both directions:
 * an extension only the server allows publishes fine and then fails to install
 * on every machine, and one only the client allows can never be uploaded.
 */
const RUST_SRC = join(__dirname, '../../../desktop/src-tauri/src/lib.rs');

function rustAllowedExtensions(): string[] {
  const src = readFileSync(RUST_SRC, 'utf-8');
  const block = src.slice(src.indexOf('const ALLOWED_EXT'));
  const body = block.slice(block.indexOf('['), block.indexOf('];'));
  return [...body.matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]!).sort();
}

describe('package extension allowlist', () => {
  it('matches the desktop client exactly', () => {
    expect(rustAllowedExtensions()).toEqual([...PACKAGE_EXT].sort());
  });

  it('rejects executables and scripts by name and by destination', () => {
    for (const bad of ['payload.exe', 'run.bat', 'x.ps1', 'a.sh', 'x.msi', 'x.reg']) {
      expect(() => assertSafeFilename(bad), bad).toThrow();
      expect(() => assertSafeDestination(bad), bad).toThrow();
    }
  });

  it('rejects an extension that is on neither list', () => {
    // The filename check used to be a denylist, so anything not explicitly
    // named — .hta, .lnk, .jar — sailed through.
    for (const bad of ['payload.hta', 'shortcut.lnk', 'app.jar', 'noextension']) {
      expect(() => assertSafeFilename(bad), bad).toThrow();
    }
  });

  it('gates the destination, not just the filename', () => {
    // assertSafeDestination checked traversal but never the extension, so a
    // package could be published pointing at "payload.exe" and then be refused
    // by every client at install time.
    expect(() => assertSafeDestination('bin/payload.exe')).toThrow();
    expect(() => assertSafeDestination('bin/dlss.dll')).not.toThrow();
  });

  it('still accepts the real payloads packages carry', () => {
    for (const good of ['nvngx_dlss.dll', 'engine.ini', 'profile.nvpreset', 'settings.cfg', 'data/x.pak']) {
      expect(() => assertSafeFilename(good.split('/').pop()!), good).not.toThrow();
      expect(() => assertSafeDestination(good), good).not.toThrow();
    }
  });

  it("accepts a folder uploaded whole, licence notices and nesting included", () => {
    // What an admin actually picks: the OptiScaler directory, with the
    // Streamline set in a subfolder of it. Two of those files are `.license`
    // notices, and refusing them meant the folder could not be uploaded as it
    // ships — the admin would get a partial package and no clear reason why.
    for (const good of [
      'OptiScaler/libxess.dll',
      'OptiScaler/streamline/sl.interposer.dll',
      'OptiScaler/streamline/nvngx_dlss.license',
      'OptiScaler/streamline/reflex.license',
    ]) {
      expect(() => assertSafeFilename(good.split('/').pop()!), good).not.toThrow();
      expect(() => assertSafeDestination(good), good).not.toThrow();
    }
  });
});
