const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}

/** Bump the patch segment: 1.2.3 -> 1.2.4. */
export function bumpPatch(version: string): string {
  const m = SEMVER.exec(version);
  if (!m) return version;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}
