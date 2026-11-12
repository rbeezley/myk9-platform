import { describe, expect, it } from 'vitest';
import {
  buildDecisionEmailIdempotencyKey,
  buildDecisionEmailKeyForEntries,
  coveredEntryIds,
  buildEntryDecisionLifecycleEmailIdempotencyKey,
  decisionEmailContext,
  isDecisionEmailSuperseded,
  showSendsDecisionEmailsUnasked,
} from './decisionEmail';
import { buildLifecycleEmailDraft } from './render';
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

describe('one decision email for several entries of a registration (MYK9-1800)', () => {
  const entry = (id: string, overrides: Partial<EntryManagementEntry> = {}) =>
    ({
      id,
      showId: 'show-1',
      registrationId: 'registration-1',
      ownerName: 'Pat Owner',
      ownerEmail: 'pat@example.com',
      dogName: 'Rex',
      armbandNumber: '12',
      entryStatus: EntryStatus.ACCEPTED,
      classes: [{ name: `Class ${id}` }],
      totalFee: 20,
      paidAmount: 20,
      ...overrides,
    }) as unknown as EntryManagementEntry;

  it('keys one entry exactly as before, so it matches an email already saved for it', () => {
    const only = entry('entry-1');
    expect(buildDecisionEmailKeyForEntries([only], 'accepted')).toBe(
      buildDecisionEmailIdempotencyKey(only, 'accepted')
    );
  });

  it('keys several entries by registration, step and the sorted ids, whatever order they arrive in', () => {
    const a = entry('entry-a');
    const b = entry('entry-b');
    const c = entry('entry-c');
    const key = buildDecisionEmailKeyForEntries([c, a, b], 'accepted');

    expect(key).toBe(buildDecisionEmailKeyForEntries([a, b, c], 'accepted'));
    expect(key).toContain('registration-1');
    expect(key).toContain('accepted');
    expect(key).toContain('registration-1:decided:entry-a,entry-b,entry-c');
    expect(key).not.toBe(buildDecisionEmailKeyForEntries([a, b], 'accepted'));
    expect(key).not.toBe(buildDecisionEmailKeyForEntries([a, b, c], 'waitlisted'));
  });

  it('leaves the context of one entry as it was', () => {
    const only = entry('entry-1');
    expect(decisionEmailContext(only, 'Show').entry).toEqual({
      dogName: 'Rex',
      className: 'Class entry-1',
      armbandNumber: '12',
      amountDue: 0,
    });
    expect(decisionEmailContext([only], 'Show')).toEqual(decisionEmailContext(only, 'Show'));
  });

  it('writes one acceptance that lists every class of one dog, with the armband once', () => {
    const draft = buildLifecycleEmailDraft({
      stepType: 'accepted',
      ...decisionEmailContext([entry('entry-2'), entry('entry-1'), entry('entry-3')], 'Show'),
    });

    expect(draft.subject).toBe('Entries accepted - Show');
    expect(draft.body).toContain('Your entries for Rex have been accepted for Show.');
    expect(draft.body).toContain('Classes: Class entry-1, Class entry-2, Class entry-3');
    expect(draft.body.match(/Armband: 12/g)).toHaveLength(1);
  });

  it('lists each dog with its own classes when the registration holds several dogs', () => {
    const draft = buildLifecycleEmailDraft({
      stepType: 'waitlisted',
      ...decisionEmailContext(
        [entry('entry-1'), entry('entry-2', { dogName: 'Bess', armbandNumber: '14' })],
        'Show'
      ),
    });

    expect(draft.body).toContain('Your entries for Rex and Bess are on the waitlist for Show.');
    expect(draft.body).toContain('- Rex: Class entry-1');
    expect(draft.body).toContain('- Bess: Class entry-2');
  });

  it('adds up what is owed across the entries listed, each clamped at zero', () => {
    const { entry: context } = decisionEmailContext(
      [
        entry('entry-1', { totalFee: 20, paidAmount: 5 }),
        entry('entry-2', { totalFee: 20, paidAmount: 30 }),
        entry('entry-3', { totalFee: 10, paidAmount: 0 }),
      ],
      'Show'
    );
    expect(context.amountDue).toBe(25);
  });

  it('is superseded when any one of the decided entries has since changed status', () => {
    const a = entry('entry-1');
    const b = entry('entry-2');
    const prompt = { entry: a, decidedEntries: [a, b], stepType: 'accepted' as const };
    expect(isDecisionEmailSuperseded(prompt, [a, b])).toBe(false);
    expect(isDecisionEmailSuperseded(prompt, [a, { ...b, entryStatus: EntryStatus.PENDING }])).toBe(
      true
    );
  });
});

describe('coveredEntryIds', () => {
  it('reads every entry from a multi-entry batch key', () => {
    expect(coveredEntryIds('reg-1:decided:a,b,c', 'a')).toEqual(['a', 'b', 'c']);
  });

  it('covers just the anchor for a single-entry job (no batch key or a "single" one)', () => {
    expect(coveredEntryIds(null, 'a')).toEqual(['a']);
    expect(coveredEntryIds('single', 'a')).toEqual(['a']);
  });

  it('covers just the anchor for a malformed key, and nothing for a job with no entry', () => {
    expect(coveredEntryIds('reg-1:decided:', 'a')).toEqual(['a']);
    expect(coveredEntryIds('reg-1:decided:x,y', 'a')).toEqual(['a']);
    expect(coveredEntryIds('reg-1:decided:a,b', null)).toEqual([]);
  });

  it('round-trips the key the save builds', () => {
    const e = (id: string) =>
      ({ id, showId: 's', registrationId: 'reg-1' }) as unknown as EntryManagementEntry;
    const key = buildDecisionEmailKeyForEntries([e('c'), e('a'), e('b')], 'accepted');
    expect(key).toContain('reg-1:decided:a,b,c');
    expect(coveredEntryIds('reg-1:decided:a,b,c', 'a')).toEqual(['a', 'b', 'c']);
  });
});
