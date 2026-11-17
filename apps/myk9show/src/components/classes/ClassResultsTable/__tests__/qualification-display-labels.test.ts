import { describe, it, expect } from 'vitest';
import { QUALIFICATION_STATUSES } from '@/types/scent-work-types';
import { DISPLAY_LABELS } from '../constants';

describe('QualificationCell DISPLAY_LABELS', () => {
  it('has a short-code entry for every QualificationStatus union member', () => {
    // Iterates the same const tuple QualificationStatus is derived from, so the
    // assertion can never silently drift out of sync with the union.
    for (const status of QUALIFICATION_STATUSES) {
      expect(DISPLAY_LABELS[status], `missing DISPLAY_LABELS entry for "${status}"`).toBeTruthy();
    }
  });

  it('maps each status to a non-empty short code (no raw status leaks to the UI)', () => {
    for (const status of QUALIFICATION_STATUSES) {
      const label = DISPLAY_LABELS[status];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('does not define labels for statuses outside the union', () => {
    const allowed = new Set<string>(QUALIFICATION_STATUSES);
    for (const key of Object.keys(DISPLAY_LABELS)) {
      expect(allowed.has(key), `unexpected DISPLAY_LABELS key "${key}"`).toBe(true);
    }
  });
});
