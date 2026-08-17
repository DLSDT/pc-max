import { describe, expect, it } from 'vitest';
import { bumpPatch, compareSemver } from '../semver';

describe('compareSemver', () => {
  it('orders versions', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.4.2', '1.4.2')).toBe(0);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
  });
});

describe('bumpPatch', () => {
  it('bumps the patch segment', () => {
    expect(bumpPatch('1.0.0')).toBe('1.0.1');
    expect(bumpPatch('1.4.2')).toBe('1.4.3');
    expect(bumpPatch('2.0.9')).toBe('2.0.10');
  });
});
