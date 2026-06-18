import { describe, it, expect } from 'vitest';
import { EntryStatus } from '@/types/show-registration-types';
import { mapEntryStatus, mapEntryStatusKindToUi } from './entryStatusUiAdapter';

describe('mapEntryStatus — raw entry_status → UI enum (single classifier)', () => {
  it('classifies the core lifecycle through the shared kind', () => {
    expect(mapEntryStatus('confirmed')).toBe(EntryStatus.ACCEPTED);
    expect(mapEntryStatus('accepted')).toBe(EntryStatus.ACCEPTED);
    expect(mapEntryStatus('submitted')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus('pending')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus('waitlisted')).toBe(EntryStatus.WAITLIST);
    expect(mapEntryStatus('not_accepted')).toBe(EntryStatus.REJECTED);
    expect(mapEntryStatus('rejected')).toBe(EntryStatus.REJECTED);
    expect(mapEntryStatus('withdrawn')).toBe(EntryStatus.CANCELLED);
    expect(mapEntryStatus('scratched')).toBe(EntryStatus.SCRATCHED);
    expect(mapEntryStatus('moved')).toBe(EntryStatus.MOVED);
    expect(mapEntryStatus('completed')).toBe(EntryStatus.COMPLETED);
    expect(mapEntryStatus('move-up-requested')).toBe(EntryStatus.MOVE_UP_REQUESTED);
  });

  it('PRESERVES owner-approved buckets: paid + promotion-expired stay PENDING', () => {
    // Owner decision 2026-06-18 (docs/plan-ia-entry-status-surfaces.md Phase B):
    // the classifier would call 'paid' accepted and 'promotion-expired'
    // not_accepted, which would move these rows OUT of the secretary's
    // "Pending / needs review" lane. They must NOT move.
    expect(mapEntryStatus('paid')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus('promotion-expired')).toBe(EntryStatus.PENDING);
  });

  it('keeps day-of and pre-decision states in the PENDING lane (legacy parity)', () => {
    // The entry_status CHECK constraint permits these; the prior switch bucketed
    // them all via its default → PENDING. No UI enum value exists for in-ring /
    // absent, so they stay PENDING here too.
    for (const raw of [
      'no-status',
      'draft',
      'pending-payment',
      'scratch-requested',
      'scratch_requested',
      'checked-in',
      'at-gate',
      'in-ring',
      'competing',
      'absent',
    ]) {
      expect(mapEntryStatus(raw)).toBe(EntryStatus.PENDING);
    }
  });

  it('resolves the underscore move_up_requested spelling like its hyphen twin', () => {
    // Intentional change from the old switch (which let the underscore form fall
    // through to PENDING): both constraint-permitted spellings are the same state.
    expect(mapEntryStatus('move_up_requested')).toBe(EntryStatus.MOVE_UP_REQUESTED);
  });

  it('maps unknown / null / undefined to PENDING (safe default)', () => {
    expect(mapEntryStatus('totally-unknown')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus(null)).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus(undefined)).toBe(EntryStatus.PENDING);
  });
});

describe('mapEntryStatusKindToUi — kind → UI enum projection', () => {
  it('projects each kind onto its UI enum bucket', () => {
    expect(mapEntryStatusKindToUi('accepted')).toBe(EntryStatus.ACCEPTED);
    expect(mapEntryStatusKindToUi('waitlist')).toBe(EntryStatus.WAITLIST);
    expect(mapEntryStatusKindToUi('completed')).toBe(EntryStatus.COMPLETED);
    expect(mapEntryStatusKindToUi('withdrawn')).toBe(EntryStatus.CANCELLED);
    expect(mapEntryStatusKindToUi('not_accepted')).toBe(EntryStatus.REJECTED);
    expect(mapEntryStatusKindToUi('scratched')).toBe(EntryStatus.SCRATCHED);
    expect(mapEntryStatusKindToUi('moved')).toBe(EntryStatus.MOVED);
    expect(mapEntryStatusKindToUi('move_up_requested')).toBe(EntryStatus.MOVE_UP_REQUESTED);
  });

  it('folds pending / in_ring / absent / unknown into PENDING', () => {
    expect(mapEntryStatusKindToUi('pending')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatusKindToUi('in_ring')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatusKindToUi('absent')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatusKindToUi('unknown')).toBe(EntryStatus.PENDING);
  });
});
