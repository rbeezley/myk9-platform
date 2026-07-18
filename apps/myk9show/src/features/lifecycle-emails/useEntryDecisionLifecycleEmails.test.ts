import { describe, expect, it } from 'vitest';
import {
  buildEntryDecisionLifecycleEmailIdempotencyKey,
  isDecisionEmailSuperseded,
} from './useEntryDecisionLifecycleEmails';
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
