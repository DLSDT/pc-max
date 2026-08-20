import { describe, expect, it } from 'vitest';
import { tidySettingValue } from '../scripts/import-optimized-settings';

/**
 * Two-option values ("LOW/HIGH") are tidied for readability, but values whose
 * slash separates a HARDWARE or TARGET case carry real guidance and must
 * survive byte-for-byte — reformatting them would destroy information.
 */
describe('tidySettingValue', () => {
  it('spaces out a plain two-option value', () => {
    expect(tidySettingValue('LOW/HIGH')).toBe('LOW / HIGH');
    expect(tidySettingValue('OFF/ON')).toBe('OFF / ON');
    expect(tidySettingValue('X2/X16')).toBe('X2 / X16');
    expect(tidySettingValue('HIGH/VERY HIGH')).toBe('HIGH / VERY HIGH');
  });

  it('drops the profile annotation but keeps both options', () => {
    expect(tidySettingValue('LOW/HIGH ( For Yellow Optimised settings )')).toBe('LOW / HIGH');
    expect(tidySettingValue('MEDIUM/HIGH ( For Yellow Optimised settings )')).toBe('MEDIUM / HIGH');
  });

  it('leaves VRAM / GPU / FPS conditional values exactly as written', () => {
    for (const raw of [
      'HIGH (0.5GB)For 8GB/HIGH (8GB)For 12GB',
      'HIGH ( For 8GG GPUs ) VERY HIGH',
      'ON for 60 FPS/OFF for 120 FPS',
    ]) {
      expect(tidySettingValue(raw)).toBe(raw);
    }
  });

  it('leaves ordinary single values untouched', () => {
    for (const raw of ['ULTRA', 'FXAA+TAA', 'ENABLED+BOOST', '540', 'TAA HIGH', 'PERFORMANCE']) {
      expect(tidySettingValue(raw)).toBe(raw);
    }
  });

  it('does not reformat a parenthesised alternative it cannot read confidently', () => {
    expect(tidySettingValue('LOW/(HIGH)')).toBe('LOW/(HIGH)');
  });
});
