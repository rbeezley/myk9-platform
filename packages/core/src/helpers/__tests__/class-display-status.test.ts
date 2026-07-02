import { describe, it, expect } from 'vitest';
import {
  getClassDisplayStatus,
  getClassDisplayStatusLabel,
  shouldShowClassLifecycleChips,
} from '../../index';

describe('getClassDisplayStatus', () => {
  it('returns "completed" when is_scoring_finalized is true', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        is_scoring_finalized: true,
        entry_count: 5,
        scored_count: 3,
      }),
    ).toBe('completed');
  });

  it('returns "completed" when status is "Completed"', () => {
    expect(
      getClassDisplayStatus({
        status: 'Completed',
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('completed');
  });

  it('returns "completed" when all entries scored and entry_count > 0', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 5,
      }),
    ).toBe('completed');
  });

  it('returns "in-progress" when has_active_entries is true', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 0,
        has_active_entries: true,
      }),
    ).toBe('in-progress');
  });

  it('returns "in-progress" when some entries scored but not all', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 2,
      }),
    ).toBe('in-progress');
  });

  it('returns "not-started" by default', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('not-started');
  });

  it('returns "not-started" when entry_count is 0 even if scored_count is 0', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 0,
        scored_count: 0,
      }),
    ).toBe('not-started');
  });

  it('degrades gracefully when optional fields are undefined', () => {
    expect(
      getClassDisplayStatus({
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('not-started');
  });

  it('returns "in-progress" for In Progress status', () => {
    expect(
      getClassDisplayStatus({
        status: 'In Progress',
        entry_count: 5,
        scored_count: 0,
      }),
    ).toBe('in-progress');
  });
});

describe('getClassDisplayStatusLabel', () => {
  it('maps each lifecycle stage to its one canonical label', () => {
    expect(getClassDisplayStatusLabel('not-started')).toBe('Not started');
    expect(getClassDisplayStatusLabel('in-progress')).toBe('In Progress');
    expect(getClassDisplayStatusLabel('completed')).toBe('Completed');
  });

  it('never renders "No Status" or a raw enum for unrecognized values', () => {
    expect(getClassDisplayStatusLabel('no_status')).toBe('Not started');
    expect(getClassDisplayStatusLabel(null)).toBe('Not started');
    expect(getClassDisplayStatusLabel(undefined)).toBe('Not started');
  });
});

describe('shouldShowClassLifecycleChips', () => {
  it('hides lifecycle chips on draft shows', () => {
    expect(shouldShowClassLifecycleChips('draft')).toBe(false);
  });

  it('shows chips for published and live shows', () => {
    expect(shouldShowClassLifecycleChips('published')).toBe(true);
    expect(shouldShowClassLifecycleChips('active')).toBe(true);
    expect(shouldShowClassLifecycleChips('completed')).toBe(true);
  });

  it('keeps chips when the show status is not yet known (cold store)', () => {
    expect(shouldShowClassLifecycleChips(null)).toBe(true);
    expect(shouldShowClassLifecycleChips(undefined)).toBe(true);
  });
});
