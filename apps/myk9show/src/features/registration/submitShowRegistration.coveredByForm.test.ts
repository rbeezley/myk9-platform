/**
 * MYK9-2149: an entry the money already on the exhibitor's form covers is submitted with
 * no payment and no method (no cash, check or secretary_paid), so the server settles it
 * from the money held, records nothing received and names no channel. A part-covered or uncovered entry still sends the cash or
 * check the secretary took (the server records only what is due, MYK9-1966).
 */
import { describe, expect, it, vi } from 'vitest';
import { submitShowRegistration } from './submitShowRegistration';
import type { SubmitShowRegistrationParams } from './submitShowRegistration';
import type { PaymentDetails } from '@/types/show-registration-types';
import {
  entryManagementPaymentLabel,
  resolvePaymentChannel,
} from '@/features/payments/paymentChannel';

function makeParams(paymentDetails: PaymentDetails): SubmitShowRegistrationParams {
  return {
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'local-reg-1',
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    paymentMethod: 'secretary_paid',
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
        outcomes: [],
        registrationId: 'db-reg-1',
        submissionId: 'submission-1',
      }),
      claimNextArmband: vi.fn().mockResolvedValue({ armband: '101' }),
      createSubmissionId: () => 'submission-1',
    },
  };
}

describe('an entry the form already covers (MYK9-2149)', () => {
  it('is submitted with no payment and no method, so nothing is recorded as received', async () => {
    const params = makeParams({ coveredByForm: true });

    await submitShowRegistration(params);

    expect(params.deps.submitShowEntries).toHaveBeenCalledTimes(1);
    const call = vi.mocked(params.deps.submitShowEntries!).mock.calls[0]![0];
    expect(call).toEqual(
      expect.objectContaining({
        paymentMethod: null,
        entries: [expect.objectContaining({ paymentMethod: null })],
      })
    );
    expect(call).not.toHaveProperty('payment');
  });

  it('does not ask for cash or check when nothing changed hands', async () => {
    const params = makeParams({ coveredByForm: true });

    await expect(submitShowRegistration(params)).resolves.toMatchObject({ aborted: false });
  });

  it('still sends the cash taken for a part-covered entry (the server records only the due)', async () => {
    const params = makeParams({ receivedMethod: 'cash' });

    await submitShowRegistration(params);

    expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'cash',
        payment: { method: 'cash', receivedOn: null, reference: null },
      })
    );
  });

  it('sends the amount the desk was told to collect, so the server records no more', async () => {
    const params = { ...makeParams({ receivedMethod: 'cash' }), expectedCollectCents: 1000 };

    await submitShowRegistration(params);

    expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { method: 'cash', receivedOn: null, reference: null, expectedCollectCents: 1000 },
      })
    );
  });
});

describe('how Entry Management reads the settled covered entry (MYK9-2149)', () => {
  it('reads "Paid" for a paid entry with no channel, never "Paid by cash" or "Paid by check"', () => {
    const label = (paymentMethod: string | null) =>
      entryManagementPaymentLabel(resolvePaymentChannel({ paymentMethod, paymentStatus: 'paid' }));

    expect(label(null)).toBe('Paid');
    // What the entry would have read had it gone in as a "not paid yet" choice.
    expect(label('cash')).toBe('Paid by cash');
    expect(label('check')).toBe('Paid by check');
  });
});
