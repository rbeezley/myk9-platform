import { describe, expect, it } from 'vitest';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildDecisionEmailKeyForEntries } from './decisionEmail';
import { foldEntryDecisionStatuses, type EntryDecisionJobRow } from './entryDecisionStatuses';

const entry = (id: string) =>
  ({ id, showId: 'show-1', registrationId: 'reg-1' }) as unknown as EntryManagementEntry;
// The row as the server stores it: the covered set lives only in the idempotency key.
const MULTI_KEY = buildDecisionEmailKeyForEntries([entry('a'), entry('b'), entry('c')], 'accepted');
const SINGLE_KEY = buildDecisionEmailKeyForEntries([entry('a')], 'accepted');

const row = (overrides: Partial<EntryDecisionJobRow>): EntryDecisionJobRow => ({
  id: 'job-1',
  entry_id: 'a',
  idempotency_key: MULTI_KEY,
  step_type: 'accepted',
  status: 'sent',
  subject: 's',
  body: 'b',
  secretary_note: null,
  due_at: null,
  prepared_at: null,
  sent_at: '2026-11-12T10:00:00Z',
  correction_for_job_id: null,
  ...overrides,
});

describe('foldEntryDecisionStatuses for a job covering several entries (MYK9-1800)', () => {
  it('reads as sent on every covered entry, not only the anchor', () => {
    const statuses = foldEntryDecisionStatuses([row({})]);

    for (const id of ['a', 'b', 'c']) {
      expect(statuses[id]?.sentDecisionJob?.id).toBe('job-1');
      expect(statuses[id]?.sentDecisionJob?.entryId).toBe(id);
    }
  });

  it('shows a ready multi-entry job on each entry, carrying all the covered ids', () => {
    const statuses = foldEntryDecisionStatuses([row({ status: 'ready' })]);

    expect(statuses.b?.readyJob?.coveredEntryIds).toEqual(['a', 'b', 'c']);
  });

  it('leaves a single-entry job on its entry alone', () => {
    const statuses = foldEntryDecisionStatuses([row({ idempotency_key: SINGLE_KEY })]);

    expect(Object.keys(statuses)).toEqual(['a']);
  });
});
