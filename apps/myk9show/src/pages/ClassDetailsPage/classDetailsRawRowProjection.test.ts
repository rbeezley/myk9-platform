import { describe, it, expect } from 'vitest';
import { secretaryEntryToRawRow } from './useClassDetailsData';
import { buildClassReadinessSummary, type ClassReadinessEntry } from './classReadiness';
import type { SecretaryEntry } from '@/services/database/entries';

/**
 * MYK9-639. `buildClassReadinessSummary` is pure and already tested, but the
 * Class Details strip does not feed it database rows -- it feeds it the output
 * of `secretaryEntryToRawRow`, a hand-written projection. A unit test of the
 * summariser cannot see a column that projection forgets, so these drive the
 * REAL projection end to end: secretary rows in, readiness summary out.
 */

const SOURCE_ID = '11111111-1111-1111-1111-111111111111';
const DESTINATION_ID = '22222222-2222-2222-2222-222222222222';
const CLASS_ID = '33333333-3333-3333-3333-333333333333';

function secretaryEntry(overrides: Partial<SecretaryEntry>): SecretaryEntry {
  return {
    id: SOURCE_ID,
    dog_id: 'dog-1',
    class_id: CLASS_ID,
    trial_id: 'trial-1',
    show_id: 'show-1',
    handler: 'Alex Handler',
    handler_id: 'person-1',
    payment_status: 'paid',
    entry_status: 'confirmed',
    entry_fee: 35,
    submitted_at: null,
    created_at: null,
    updated_at: null,
    armband: '100',
    special_requests: null,
    jump_height: null,
    run_order: null,
    is_in_ring: null,
    is_scored: null,
    result_status: null,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: 'no-status',
    withdrawal_reason: null,
    payment_method: 'check',
    refund_amount: null,
    refunded_at: null,
    stripe_payment_intent_id: null,
    registration_id: null,
    registration: null,
    dog: null,
    ...overrides,
  } as SecretaryEntry;
}

const CLASS_INPUT = { status: 'setup' };

describe('secretaryEntryToRawRow feeding buildClassReadinessSummary', () => {
  it('does not report Payment due for the money-neutral destination of a move-up', () => {
    const rows = [
      secretaryEntry({ id: SOURCE_ID, entry_status: 'moved', payment_status: 'paid' }),
      secretaryEntry({
        id: DESTINATION_ID,
        entry_status: 'confirmed',
        payment_status: 'pending',
        entry_fee: 0,
        payment_method: null,
        moved_from_entry_id: SOURCE_ID,
      }),
    ].map(secretaryEntryToRawRow) as ClassReadinessEntry[];

    const summary = buildClassReadinessSummary(CLASS_INPUT, rows);

    expect(summary.paymentDueCount).toBe(0);
  });

  it('still reports Payment due for an unpaid entry that is not a move-up destination', () => {
    const rows = [
      secretaryEntry({
        id: DESTINATION_ID,
        entry_status: 'confirmed',
        payment_status: 'pending',
        entry_fee: 35,
        payment_method: null,
      }),
    ].map(secretaryEntryToRawRow) as ClassReadinessEntry[];

    expect(buildClassReadinessSummary(CLASS_INPUT, rows).paymentDueCount).toBe(1);
  });

  it('carries the move-up link through the projection itself', () => {
    const row = secretaryEntryToRawRow(
      secretaryEntry({ id: DESTINATION_ID, moved_from_entry_id: SOURCE_ID })
    );

    expect(row.moved_from_entry_id).toBe(SOURCE_ID);
  });

  it('carries the hydrated handler person through the run-sheet projection', () => {
    const row = secretaryEntryToRawRow(
      secretaryEntry({
        handler: null,
        handler_person: {
          id: 'person-1',
          first_name: 'Alex',
          last_name: 'Assigned',
          auth_user_id: null,
        },
      })
    );

    expect(row.handler_person).toMatchObject({
      id: 'person-1',
      first_name: 'Alex',
      last_name: 'Assigned',
    });
  });
});
