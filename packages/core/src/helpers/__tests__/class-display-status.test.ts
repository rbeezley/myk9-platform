import { describe, it, expect } from 'vitest';
import {
  getClassDisplayStatus,
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
      })
    ).toBe('completed');
  });

  it('returns "completed" when status is "Completed"', () => {
    expect(
      getClassDisplayStatus({
        status: 'Completed',
        entry_count: 5,
        scored_count: 0,
      })
    ).toBe('completed');
  });

  it('returns "in-progress" (not "completed") when all local entries scored but is_scoring_finalized is not set', () => {
    // Decision 5: this input shape carries only pre-aggregated counts, no
    // per-entry scratch/withdrawn state, so raw-count equality cannot apply
    // the server's expected/accounted-for exclusion. The client must defer
    // the "completed" verdict to is_scoring_finalized rather than guess from
    // scored_count === entry_count.
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 5,
      })
    ).toBe('in-progress');
  });

  it('returns "in-progress" when has_active_entries is true', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 0,
        has_active_entries: true,
      })
    ).toBe('in-progress');
  });

  it('returns "in-progress" when some entries scored but not all', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 2,
      })
    ).toBe('in-progress');
  });

  it('returns "not-started" by default', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 5,
        scored_count: 0,
      })
    ).toBe('not-started');
  });

  it('returns "not-started" when entry_count is 0 even if scored_count is 0', () => {
    expect(
      getClassDisplayStatus({
        status: 'Scheduled',
        entry_count: 0,
        scored_count: 0,
      })
    ).toBe('not-started');
  });

  it('degrades gracefully when optional fields are undefined', () => {
    expect(
      getClassDisplayStatus({
        entry_count: 5,
        scored_count: 0,
      })
    ).toBe('not-started');
  });

  it('returns "in-progress" for In Progress status', () => {
    expect(
      getClassDisplayStatus({
        status: 'In Progress',
        entry_count: 5,
        scored_count: 0,
      })
    ).toBe('in-progress');
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

describe('getClassDisplayStatus — DB status spellings (classes_status_check)', () => {
  // Migration 138 constraint: 'upcoming' | 'setup' | 'in_progress' | 'completed' | 'cancelled'.
  // Replicated rows reach this helper with those raw spellings.
  it('recognizes a DB-backed completed class with no scored counts', () => {
    expect(getClassDisplayStatus({ status: 'completed', entry_count: 5, scored_count: 0 })).toBe(
      'completed'
    );
  });

  it('recognizes a DB-backed in_progress class with no scoring activity', () => {
    expect(getClassDisplayStatus({ status: 'in_progress', entry_count: 5, scored_count: 0 })).toBe(
      'in-progress'
    );
  });

  it('treats a setup-status class as not started', () => {
    expect(getClassDisplayStatus({ status: 'setup', entry_count: 5, scored_count: 0 })).toBe(
      'not-started'
    );
  });
});

describe('getClassDisplayStatus — Decision 5 dual-path client reconciliation', () => {
  // openspec/changes/class-status-auto-derivation/specs/status-display/spec.md

  it('does not contradict a server-completed class when the local snapshot is mid-sync', () => {
    // Server has written 'completed' + is_scoring_finalized=true, but this
    // client's local entry snapshot hasn't synced the last scoring row yet
    // (scored_count still trails entry_count).
    expect(
      getClassDisplayStatus({
        status: 'in_progress',
        is_scoring_finalized: true,
        entry_count: 5,
        scored_count: 4,
      })
    ).toBe('completed');
  });

  it('excludes a scratched entry from completeness via is_scoring_finalized (input has no per-entry scratch state)', () => {
    // ClassDisplayStatusInput only carries pre-aggregated counts, so it
    // cannot see that the one unscored entry was scratched. The server's
    // is_scoring_finalized already applied the expected/accounted-for
    // exclusion (Decision 2), so the client defers to it rather than
    // guessing from scored_count === entry_count.
    expect(
      getClassDisplayStatus({
        status: 'completed',
        is_scoring_finalized: true,
        entry_count: 5,
        scored_count: 4,
      })
    ).toBe('completed');
  });
});
