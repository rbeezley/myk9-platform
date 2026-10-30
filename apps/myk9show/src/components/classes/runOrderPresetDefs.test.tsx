import { describe, it, expect } from 'vitest';
import { SCOPED_PRESETS } from './runOrderPresetDefs';

describe('SCOPED_PRESETS', () => {
  it('offers no manual drag option: drag mode reorders the whole list, not one section', () => {
    expect(SCOPED_PRESETS.map(p => p.preset)).not.toContain('manual');
  });
});
