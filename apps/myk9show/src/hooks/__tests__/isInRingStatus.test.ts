/**
 * Regression: isInRingStatus must return true for both 'competing' (myK9Show
 * legacy) and 'in-ring' (myK9Q DB value). Before this fix the hook only
 * checked 'competing', hiding in-ring entries in ClassCard previews.
 */

import { describe, it, expect } from 'vitest';
import { isInRingStatus } from '@/types/entry-lifecycle';

describe('isInRingStatus', () => {
  it('returns true for competing', () => {
    expect(isInRingStatus('competing')).toBe(true);
  });

  it('returns true for in-ring', () => {
    expect(isInRingStatus('in-ring')).toBe(true);
  });

  it('returns false for confirmed', () => {
    expect(isInRingStatus('confirmed')).toBe(false);
  });

  it('returns false for completed', () => {
    expect(isInRingStatus('completed')).toBe(false);
  });
});
