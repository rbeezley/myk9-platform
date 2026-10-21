import { describe, expect, it } from 'vitest';
import { formatEntryLimit } from './entryLimit';

describe('formatEntryLimit', () => {
  it('says there is no limit when none is set', () => {
    expect(formatEntryLimit(null)).toBe('No entry limit');
  });

  it('names the run limit when one is set', () => {
    expect(formatEntryLimit(360)).toBe('360 runs');
  });
});
