import { describe, it, expect } from 'vitest';
import { QUALIFICATION_STATUSES } from '@/types/scent-work-types';
import {
  DISPLAY_LABELS,
  QUALIFICATION_REASONS,
  STATUSES_REQUIRING_REASON,
} from '../constants';

describe('QualificationCell DISPLAY_LABELS', () => {
  it('has a short-code entry for every QualificationStatus union member', () => {
    // Iterates the same const tuple QualificationStatus is derived from, so the
    // assertion can never silently drift out of sync with the union.
    for (const status of QUALIFICATION_STATUSES) {
      expect(
        DISPLAY_LABELS[status],
        `missing DISPLAY_LABELS entry for "${status}"`
      ).toBeTruthy();
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

describe('QUALIFICATION_REASONS / STATUSES_REQUIRING_REASON', () => {
  it('only the reason-bearing statuses require a reason, and each has a reason list', () => {
    for (const status of STATUSES_REQUIRING_REASON) {
      const reasons = QUALIFICATION_REASONS[status as keyof typeof QUALIFICATION_REASONS];
      expect(reasons, `"${status}" requires a reason but has no reason list`).toBeTruthy();
      expect(reasons.length).toBeGreaterThan(0);
    }
  });

  it('keeps STATUSES_REQUIRING_REASON and QUALIFICATION_REASONS keys in exact sync', () => {
    // Both directions: a reason list added without flagging the status would make
    // the reason dropdown silently never render (the editor reads the flag list);
    // a flagged status without a list would render an empty dropdown.
    const flagged = [...STATUSES_REQUIRING_REASON].sort();
    const withLists = Object.keys(QUALIFICATION_REASONS).sort();
    expect(withLists).toEqual(flagged);
  });

  it('every QUALIFICATION_REASONS key is a valid QualificationStatus', () => {
    const allowed = new Set<string>(QUALIFICATION_STATUSES);
    for (const key of Object.keys(QUALIFICATION_REASONS)) {
      expect(allowed.has(key), `unknown reason status "${key}"`).toBe(true);
    }
  });

  it('intentionally excludes pass/no-show/display-only statuses from requiring a reason', () => {
    expect(STATUSES_REQUIRING_REASON).not.toContain('Qualified');
    expect(STATUSES_REQUIRING_REASON).not.toContain('Absent');
    expect(STATUSES_REQUIRING_REASON).not.toContain('Eliminated');
  });
});
