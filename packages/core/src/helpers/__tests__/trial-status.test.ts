import { describe, expect, it } from 'vitest';
import { deriveTrialCompositeStatus } from '../trial-status';
import type { ClassDisplayStatusInput } from '../class-display-status';

function cls(overrides: Partial<ClassDisplayStatusInput> = {}): ClassDisplayStatusInput {
  return { entry_count: 10, scored_count: 0, ...overrides };
}

const completed = () => cls({ status: 'Completed' });
const inProgress = () => cls({ status: 'In Progress' });
const notStarted = () => cls({ status: 'Scheduled' });

describe('deriveTrialCompositeStatus', () => {
  it('renders an empty trial as "No classes yet", never a zero-counter row', () => {
    expect(deriveTrialCompositeStatus([])).toEqual({
      kind: 'no-classes',
      label: 'No classes yet',
      completedCount: 0,
      totalCount: 0,
      needsWrapUp: false,
    });
  });

  it('renders an untouched trial as "Not started"', () => {
    const result = deriveTrialCompositeStatus([notStarted(), notStarted()]);
    expect(result.kind).toBe('not-started');
    expect(result.label).toBe('Not started');
    expect(result.needsWrapUp).toBe(false);
  });

  it('composes the one in-progress line (C7)', () => {
    const result = deriveTrialCompositeStatus([completed(), inProgress(), notStarted()]);
    expect(result.label).toBe('In progress — 1 of 3 classes complete');
    expect(result.kind).toBe('in-progress');
    expect(result.completedCount).toBe(1);
    expect(result.totalCount).toBe(3);
    expect(result.needsWrapUp).toBe(false);
  });

  it('counts a finalized class as complete (defers to is_scoring_finalized, not raw counts)', () => {
    // A server-completed class carries is_scoring_finalized=true. The client no
    // longer infers completion from scored_count === entry_count alone, so it
    // cannot contradict the server (Decision 5 of class-status-auto-derivation).
    const finalized = cls({ entry_count: 5, scored_count: 5, is_scoring_finalized: true });
    const result = deriveTrialCompositeStatus([finalized, notStarted()]);
    expect(result.label).toBe('In progress — 1 of 2 classes complete');
  });

  it('does not count a fully-scored class complete without a finalized/completed signal', () => {
    const scoredNotFinalized = cls({ entry_count: 5, scored_count: 5 });
    const result = deriveTrialCompositeStatus([scoredNotFinalized, notStarted()]);
    expect(result.completedCount).toBe(0);
  });

  it('treats any scoring activity as in progress', () => {
    const result = deriveTrialCompositeStatus([cls({ scored_count: 3 }), notStarted()]);
    expect(result.kind).toBe('in-progress');
    expect(result.label).toBe('In progress — 0 of 2 classes complete');
  });

  it('asserts needs-wrap-up ONLY when every class is finished', () => {
    const result = deriveTrialCompositeStatus([completed(), completed()]);
    expect(result).toEqual({
      kind: 'completed',
      label: 'Completed',
      completedCount: 2,
      totalCount: 2,
      needsWrapUp: true,
    });
  });

  it('uses the singular noun for a one-class trial', () => {
    const result = deriveTrialCompositeStatus([cls({ scored_count: 1, entry_count: 2 })]);
    expect(result.label).toBe('In progress — 0 of 1 class complete');
  });
});

describe('deriveTrialCompositeStatus — DB status spellings', () => {
  it('asserts needsWrapUp for classes carrying the raw DB completed spelling', () => {
    const dbCompleted = { status: 'completed', entry_count: 5, scored_count: 0 };
    const result = deriveTrialCompositeStatus([dbCompleted, dbCompleted]);
    expect(result.kind).toBe('completed');
    expect(result.needsWrapUp).toBe(true);
  });

  it('composes the in-progress line from raw DB spellings', () => {
    const result = deriveTrialCompositeStatus([
      { status: 'completed', entry_count: 5, scored_count: 0 },
      { status: 'in_progress', entry_count: 5, scored_count: 0 },
    ]);
    expect(result.label).toBe('In progress — 1 of 2 classes complete');
  });
});
