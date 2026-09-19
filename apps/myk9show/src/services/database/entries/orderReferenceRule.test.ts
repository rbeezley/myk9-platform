/**
 * MYK9-659: one rule for the order reference, and it must be the SAME rule on
 * both read paths — which is why both call this function rather than each
 * resolving the value for itself.
 */
import { describe, expect, it } from 'vitest';

import { applyOrderReferenceRule } from './orderReferenceRule';

const ENROLLMENT_ID = 'cdc232e8-6d0a-408b-8e14-2f4be11adc36';

describe('applyOrderReferenceRule', () => {
  it('prefers the view column over the PostgREST embed', () => {
    // The embed resolves under `enrollments_select`, whose exhibitor arm
    // matches the ORDER's handler; the view column is guarded by
    // `can_view_admin`, which is the ENTRY's access. The view column is the
    // rule, so it wins.
    const row: Record<string, unknown> = {
      registration_id: ENROLLMENT_ID,
      registration_confirmation_number: 'MK9-000146',
      registration: { id: ENROLLMENT_ID, confirmation_number: 'MK9-STALE', payment_status: 'paid' },
    };

    applyOrderReferenceRule(row);

    expect(row.registration).toEqual({
      id: ENROLLMENT_ID,
      confirmation_number: 'MK9-000146',
      payment_status: 'paid',
    });
  });

  it('keeps every other field the embed carries', () => {
    const row: Record<string, unknown> = {
      registration_id: ENROLLMENT_ID,
      registration_confirmation_number: 'MK9-000146',
      registration: {
        id: ENROLLMENT_ID,
        payment_status: 'paid',
        payment_reference: 'check 1042',
        paid_amount: 50,
      },
    };

    applyOrderReferenceRule(row);

    expect(row.registration).toMatchObject({
      payment_status: 'paid',
      payment_reference: 'check 1042',
      paid_amount: 50,
    });
  });

  it('builds the registration stub when the embed is missing entirely', () => {
    // The enrollments policy refused the embed, or this is the offline replica
    // rebuild where there is no embed to make. The entry's own access already
    // admitted the column, so the reference still reaches the receipt.
    const row: Record<string, unknown> = {
      registration_id: ENROLLMENT_ID,
      registration_confirmation_number: 'MK9-000146',
      registration: null,
    };

    applyOrderReferenceRule(row);

    expect(row.registration).toEqual({
      id: ENROLLMENT_ID,
      confirmation_number: 'MK9-000146',
    });
  });

  it('leaves the embed untouched when the view column is absent', () => {
    // A database that has not received 20260918193700 yet: the online receipt
    // keeps printing exactly what it printed before this change.
    const registration = { id: ENROLLMENT_ID, confirmation_number: 'MK9-000146' };
    const row: Record<string, unknown> = { registration_id: ENROLLMENT_ID, registration };

    applyOrderReferenceRule(row);

    expect(row.registration).toBe(registration);
  });

  it('adds nothing when there is no order at all', () => {
    const row: Record<string, unknown> = { registration_id: null };

    applyOrderReferenceRule(row);

    expect(row.registration).toBeUndefined();
  });

  it('ignores an empty-string column rather than minting a blank reference', () => {
    const row: Record<string, unknown> = {
      registration_id: ENROLLMENT_ID,
      registration_confirmation_number: '',
    };

    applyOrderReferenceRule(row);

    expect(row.registration).toBeUndefined();
  });
});
