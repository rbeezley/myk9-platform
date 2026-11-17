/**
 * MYK9-2149 (inform only): "Use the money already on this form (take nothing now)" submits
 * with no payment and no method; cash received still sends the payment, which the server
 * records in full; and only the final choice's details are saved onto the entry form.
 */
import { describe, expect, it, vi } from 'vitest';
import { submitShowRegistration } from './submitShowRegistration';
import type { SubmitShowRegistrationParams } from './submitShowRegistration';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';

function makeParams(
  paymentMethod: PaymentMethod,
  paymentDetails: PaymentDetails
): SubmitShowRegistrationParams {
  return {
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'local-reg-1',
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    paymentMethod,
    paymentDetails,
    classSelections: [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
      },
    ],
    handlerAssignments: {
      'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler', isOwner: false },
    },
    classes: [{ id: 'class-1' }],
    showFeeInfo: { preEntryFee: '30', dayOfShowFee: '35', startDate: '2026-05-01' },
    submissionSource: 'organizer',
    deps: {
      submitRegistration: vi.fn().mockResolvedValue(undefined),
      createShowRegistration: vi.fn().mockResolvedValue({
        data: { id: 'db-reg-1', confirmationNumber: 'MK9-000001' },
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
            feeCents: 3000,
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

const checkLeftovers: PaymentDetails = {
  paymentReference: '1042',
  paymentDate: '2026-11-01',
  paymentNotes: 'Mailed with the form',
};

describe('using the money already on the form (MYK9-2149)', () => {
  it('sends no payment and no method, and asks for no cash or check', async () => {
    const params = makeParams('form_money', { ...checkLeftovers, receivedMethod: 'check' });

    await submitShowRegistration(params);

    const call = vi.mocked(params.deps.submitShowEntries!).mock.calls[0]![0];
    expect(call).toEqual(
      expect.objectContaining({
        paymentMethod: null,
        entries: [expect.objectContaining({ paymentMethod: null })],
      })
    );
    expect(call).not.toHaveProperty('payment');
    // No details from the choice left behind are saved.
    expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(2, 'show-1', 'owner-1', {});
  });

  it('cash received still sends the payment (the server records the full fee)', async () => {
    const params = makeParams('secretary_paid', { receivedMethod: 'cash' });

    await submitShowRegistration(params);

    expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'cash',
        payment: { method: 'cash', receivedOn: null, reference: null },
      })
    );
  });
});

describe('only the final choice saves its details (MYK9-2149)', () => {
  it('switching from check received to pay at the show saves none of the check details', async () => {
    const params = makeParams('check', { ...checkLeftovers, receivedMethod: 'check' });

    await submitShowRegistration(params);

    expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(2, 'show-1', 'owner-1', {});
  });

  it('switching from check received to a club or group saves only its reference', async () => {
    const params = makeParams('group_payment', {
      ...checkLeftovers,
      receivedMethod: 'check',
      groupReference: 'Club batch 7',
    });

    await submitShowRegistration(params);

    expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(2, 'show-1', 'owner-1', {
      groupReference: 'Club batch 7',
    });
  });

  it('check received saves its own details', async () => {
    const params = makeParams('secretary_paid', { ...checkLeftovers, receivedMethod: 'check' });

    await submitShowRegistration(params);

    expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(
      2,
      'show-1',
      'owner-1',
      checkLeftovers
    );
  });
});
