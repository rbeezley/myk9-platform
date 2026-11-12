import { describe, expect, it } from 'vitest';
import {
  buildEntryDecisionLifecycleEmailIdempotencyKey,
  isDecisionEmailSuperseded,
  showSendsDecisionEmailsUnasked,
} from './decisionEmail';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

describe('buildEntryDecisionLifecycleEmailIdempotencyKey', () => {
  it('scopes decision emails by entry even when entries share one enrollment', () => {
    const firstEntryKey = buildEntryDecisionLifecycleEmailIdempotencyKey({
      showId: 'show-1',
      stepType: 'accepted',
      entryId: 'entry-1',
      enrollmentId: 'enrollment-1',
      correctionForJobId: null,
    });
    const secondEntryKey = buildEntryDecisionLifecycleEmailIdempotencyKey({
      showId: 'show-1',
      stepType: 'accepted',
      entryId: 'entry-2',
      enrollmentId: 'enrollment-1',
      correctionForJobId: null,
    });

    expect(firstEntryKey).toContain(':entry-1:');
    expect(secondEntryKey).toContain(':entry-2:');
    expect(firstEntryKey).not.toBe(secondEntryKey);
  });
});

describe('isDecisionEmailSuperseded', () => {
  const prompt = (
    over: Partial<{
      id: string;
      stepType: 'accepted' | 'waitlisted';
      jobId: string;
      correctionForJobId: string;
    }> = {}
  ) => ({
    entry: { id: over.id ?? 'entry-1' } as EntryManagementEntry,
    stepType: (over.stepType ?? 'accepted') as 'accepted' | 'waitlisted',
    jobId: over.jobId,
    correctionForJobId: over.correctionForJobId,
  });
  const entry = (id: string, status: EntryStatus): EntryManagementEntry =>
    ({ id, entryStatus: status }) as EntryManagementEntry;

  it('is not superseded when the entry still matches the decision', () => {
    const entries = [entry('entry-1', EntryStatus.ACCEPTED)];
    expect(isDecisionEmailSuperseded(prompt({ stepType: 'accepted' }), entries)).toBe(false);
  });

  it('is superseded when the entry was undone to a different status', () => {
    // Secretary accepted, opened the prompt, then Undid → status reverted.
    const entries = [entry('entry-1', EntryStatus.PENDING)];
    expect(isDecisionEmailSuperseded(prompt({ stepType: 'accepted' }), entries)).toBe(true);
  });

  it('is superseded when an accepted entry is now waitlisted', () => {
    const entries = [entry('entry-1', EntryStatus.WAITLIST)];
    expect(isDecisionEmailSuperseded(prompt({ stepType: 'accepted' }), entries)).toBe(true);
  });

  it('exempts ready-job reviews and corrections (they reference a prior decision)', () => {
    const entries = [entry('entry-1', EntryStatus.PENDING)];
    expect(isDecisionEmailSuperseded(prompt({ jobId: 'job-1' }), entries)).toBe(false);
    expect(isDecisionEmailSuperseded(prompt({ correctionForJobId: 'job-2' }), entries)).toBe(false);
  });

  it('is not superseded when the entry is absent (nothing to contradict)', () => {
    expect(isDecisionEmailSuperseded(prompt({ id: 'gone' }), [])).toBe(false);
  });
});

describe('showSendsDecisionEmailsUnasked (MYK9-1800)', () => {
  const now = new Date(2026, 9, 10, 15, 0);

  it.each(['published', 'upcoming', 'in_progress', 'Published'])(
    'sends with no preview on a %s show that has not finished',
    status => {
      expect(showSendsDecisionEmailsUnasked({ status, endDate: '2026-10-11' }, now)).toBe(true);
    }
  );

  it.each(['draft', 'completed', 'cancelled', '', null, undefined])(
    'keeps the preview on a show whose status is %s',
    status => {
      expect(showSendsDecisionEmailsUnasked({ status, endDate: '2026-10-11' }, now)).toBe(false);
    }
  );

  it('keeps the preview when the show is not known yet', () => {
    expect(showSendsDecisionEmailsUnasked(undefined, now)).toBe(false);
    expect(showSendsDecisionEmailsUnasked(null, now)).toBe(false);
  });

  it('still sends through the whole last day of the show', () => {
    const lastEvening = new Date(2026, 9, 11, 23, 30);
    expect(
      showSendsDecisionEmailsUnasked({ status: 'published', endDate: '2026-10-11' }, lastEvening)
    ).toBe(true);
  });

  it('keeps the preview once a published show is over', () => {
    const later = new Date(2026, 9, 12, 0, 30);
    expect(
      showSendsDecisionEmailsUnasked({ status: 'published', endDate: '2026-10-11' }, later)
    ).toBe(false);
  });

  it('sends on a published show with no end date on record', () => {
    expect(showSendsDecisionEmailsUnasked({ status: 'published', endDate: null }, now)).toBe(true);
  });
});
