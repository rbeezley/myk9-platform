import { describe, expect, it, vi } from 'vitest';
import { submitShowRegistration } from './submitShowRegistration';
import type { SubmitShowRegistrationParams } from './submitShowRegistration';
import type { PaymentDetails } from '@/types/show-registration-types';

/**
 * MYK9-878: the secretary's "charge junior handler fee" choice reaches the
 * submit_show_entries payload as a per-entry `junior_fee_override` request, and
 * the client's quoted fee is the junior fee. The explicit override is the ONLY way
 * the junior fee is charged: nothing is derived from age or ownership.
 */
function makeParams(
  overrides: {
    paymentDetails?: PaymentDetails;
    juniorHandlerFee?: string;
  } = {}
): SubmitShowRegistrationParams {
  return {
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'local-reg-1',
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    paymentMethod: 'check',
    paymentDetails: overrides.paymentDetails ?? { paymentReference: 'check-1' },
    classSelections: [
      { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ],
    handlerAssignments: {
      'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler', isOwner: false },
    },
    classes: [{ id: 'class-1', entryFee: 20 }],
    // Show day (startDate in the past), so the normal fee is the day-of fee, 30.
    showFeeInfo: {
      preEntryFee: '25',
      dayOfShowFee: '30',
      startDate: '2026-05-01',
      ...(overrides.juniorHandlerFee !== undefined
        ? { juniorHandlerFee: overrides.juniorHandlerFee }
        : {}),
    },
    submissionSource: 'organizer',
    deps: {
      submitRegistration: vi.fn().mockResolvedValue(undefined),
      createShowRegistration: vi.fn().mockResolvedValue({
        data: { id: 'db-reg-2', confirmationNumber: 'MK9-000002' },
        error: null,
      }),
      submitShowEntries: vi.fn().mockResolvedValue({
        entries: [{ entryId: 'entry-1', dogId: 'dog-1' }],
        outcomes: [
          {
            dogId: 'dog-1',
            classId: 'class-1',
            outcome: 'created',
            entryId: 'entry-1',
            waitlistEntryId: null,
            waitlistPosition: null,
            feeCents: 1500,
            capacityOverride: false,
          },
        ],
        registrationId: 'db-reg-1',
        submissionId: 'submission-1',
      }),
      claimNextArmband: vi.fn().mockResolvedValue({ armband: '101' }),
      createSubmissionId: () => 'submission-1',
    },
  };
}

function sentEntry(params: SubmitShowRegistrationParams): Record<string, unknown> {
  const call = vi.mocked(params.deps.submitShowEntries!).mock.calls[0]?.[0];
  return (call?.entries[0] ?? {}) as Record<string, unknown>;
}

describe('submitShowRegistration junior handler fee (MYK9-878)', () => {
  it('requests the junior fee override and quotes the junior fee when the secretary chose it', async () => {
    const params = makeParams({
      juniorHandlerFee: '15',
      paymentDetails: { paymentReference: 'check-1', chargeJuniorFee: true },
    });

    await submitShowRegistration(params);

    expect(sentEntry(params)).toMatchObject({ clientFeeCents: 1500, juniorFeeOverride: true });
  });

  it('quotes the normal fee and sends no override when the secretary did not choose it', async () => {
    const params = makeParams({ juniorHandlerFee: '15' });

    await submitShowRegistration(params);

    const entry = sentEntry(params);
    expect(entry.clientFeeCents).toBe(3000);
    expect('juniorFeeOverride' in entry).toBe(false);
  });

  it('sends no override on a show with no junior fee even if the flag is set', async () => {
    const params = makeParams({
      paymentDetails: { paymentReference: 'check-1', chargeJuniorFee: true },
    });

    await submitShowRegistration(params);

    const entry = sentEntry(params);
    expect(entry.clientFeeCents).toBe(3000);
    expect('juniorFeeOverride' in entry).toBe(false);
  });
});
