import { describe, expect, it, vi } from 'vitest';
import { submitShowRegistration } from './submitShowRegistration';
import type { SubmitShowRegistrationParams } from './submitShowRegistration';

function makeParams(
  overrides: Partial<SubmitShowRegistrationParams> = {}
): SubmitShowRegistrationParams {
  return {
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'local-reg-1',
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    paymentMethod: 'check',
    paymentDetails: { paymentReference: 'check-1' },
    classSelections: [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
      },
    ],
    handlerAssignments: {
      'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler' },
    },
    classes: [{ id: 'class-1', entryFee: 20 }],
    showFeeInfo: {
      preEntryFee: '25',
      dayOfShowFee: '30',
      startDate: '2026-05-01',
    },
    deps: {
      submitRegistration: vi.fn().mockResolvedValue(undefined),
      confirmRegistration: vi.fn().mockResolvedValue({
        confirmationNumber: 'MK9-000001',
        dbRegistrationId: 'db-reg-1',
      }),
      createShowRegistration: vi.fn().mockResolvedValue({
        data: { id: 'db-reg-2', confirmationNumber: 'MK9-000002' },
        error: null,
      }),
      submitShowEntries: vi.fn().mockResolvedValue({
        entries: [{ entryId: 'entry-1', dogId: 'dog-1' }],
        registrationId: 'db-reg-1',
        submissionId: 'submission-1',
      }),
      claimNextArmband: vi.fn().mockResolvedValue({ armband: '101' }),
      createSubmissionId: () => 'submission-1',
    },
    ...overrides,
  };
}

describe('submitShowRegistration', () => {
  it('throws when called without a payment method', async () => {
    const params = makeParams({ paymentMethod: undefined });

    await expect(submitShowRegistration(params)).rejects.toThrow(
      'Payment method is required to submit show registration'
    );

    expect(params.deps.submitRegistration).not.toHaveBeenCalled();
    expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
  });

  it('throws when called with credit_card payment method', async () => {
    const params = makeParams({ paymentMethod: 'credit_card' });

    await expect(submitShowRegistration(params)).rejects.toThrow(
      'Invariant: submitShowRegistration called with credit_card payment method'
    );

    expect(params.deps.confirmRegistration).not.toHaveBeenCalled();
    expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
  });

  it('skips armband assignment for exhibitor self-entries (canAssignArmbands=false)', async () => {
    // Exhibitors are not authorized for the staff-only assign_armband RPC; the
    // submit flow must not call it (otherwise every self-entry fires a 400).
    const params = makeParams({ canAssignArmbands: false });

    const result = await submitShowRegistration(params);

    // Entries still submit; only the armband claim is skipped.
    expect(params.deps.submitShowEntries).toHaveBeenCalledTimes(1);
    expect(params.deps.claimNextArmband).not.toHaveBeenCalled();
    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000002',
      dbRegistrationId: 'db-reg-2',
      armbandAssignments: [],
      armbandFailures: [],
    });
  });

  it('passes the selected non-card payment method through the entry payload', async () => {
    const params = makeParams({ paymentMethod: 'check' });

    await submitShowRegistration(params);

    expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'check',
        entries: [
          expect.objectContaining({
            dogId: 'dog-1',
            classId: 'class-1',
            paymentMethod: 'check',
          }),
        ],
      })
    );
  });

  it('passes the selected handler id and name through the entry payload', async () => {
    const params = makeParams({
      handlerAssignments: {
        'dog-1|class-1': {
          handlerId: 'handler-grace',
          handlerName: 'Grace Hollis',
          isOwner: false,
        },
      },
    });

    await submitShowRegistration(params);

    expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            dogId: 'dog-1',
            classId: 'class-1',
            handlerId: 'handler-grace',
            handlerName: 'Grace Hollis',
          }),
        ],
      })
    );
  });

  it('persists the initial secretary-paid enrollment totals and paid state after entries submit', async () => {
    const params = makeParams({
      paymentMethod: 'secretary_paid',
      paymentDetails: {
        paymentReference: 'receipt-100',
        paymentDate: '2026-07-07',
      },
      classes: [{ id: 'class-1', entryFee: 20 }],
    });

    await submitShowRegistration(params);

    expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(1, 'show-1', 'owner-1');
    expect(params.deps.submitShowEntries).toHaveBeenCalledTimes(1);
    expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(
      2,
      'show-1',
      'owner-1',
      'receipt-100',
      expect.objectContaining({
        paymentReference: 'receipt-100',
        paymentDate: '2026-07-07',
      }),
      'secretary_paid',
      3000
    );
  });

  it('does not persist enrollment payment totals when entry submission fails', async () => {
    const params = makeParams({
      paymentMethod: 'secretary_paid',
      paymentDetails: {
        paymentReference: 'receipt-100',
        paymentDate: '2026-07-07',
      },
    });
    vi.mocked(params.deps.submitShowEntries!).mockRejectedValue(new Error('fee mismatch'));

    await expect(submitShowRegistration(params)).rejects.toThrow('fee mismatch');

    expect(params.deps.createShowRegistration).toHaveBeenCalledTimes(1);
    expect(params.deps.createShowRegistration).toHaveBeenCalledWith('show-1', 'owner-1');
  });

  it('reports enrollment payment persistence failures after entries submit', async () => {
    const params = makeParams({
      paymentMethod: 'secretary_paid',
      paymentDetails: {
        paymentReference: 'receipt-100',
        paymentDate: '2026-07-07',
      },
    });
    vi.mocked(params.deps.createShowRegistration!)
      .mockResolvedValueOnce({
        data: { id: 'db-reg-2', confirmationNumber: 'MK9-000002' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error('payment update failed'),
      });

    await expect(submitShowRegistration(params)).rejects.toThrow('payment update failed');

    expect(params.deps.submitShowEntries).toHaveBeenCalledTimes(1);
    expect(params.deps.createShowRegistration).toHaveBeenCalledTimes(2);
    expect(params.deps.claimNextArmband).not.toHaveBeenCalled();
  });

  it('does not duplicate claim-next armband patches through generic entry updates', async () => {
    const params = makeParams();

    const result = await submitShowRegistration(params);

    expect(params.deps.claimNextArmband).toHaveBeenCalledWith('show-1', 'dog-1', {
      entryIds: ['entry-1'],
    });
    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000002',
      dbRegistrationId: 'db-reg-2',
      armbandAssignments: [{ dogId: 'dog-1', armband: '101' }],
      armbandFailures: [],
    });
  });

  it('reports claim-next armband sync errors instead of swallowing them', async () => {
    const params = makeParams();
    vi.mocked(params.deps.claimNextArmband!).mockResolvedValue({
      armband: null,
      error: new Error('replicated entry patch failed'),
    });

    const result = await submitShowRegistration(params);

    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000002',
      dbRegistrationId: 'db-reg-2',
      armbandAssignments: [],
      armbandFailures: [{ dogId: 'dog-1', error: 'replicated entry patch failed' }],
    });
  });

  it('reports armband claim failures without failing the submission', async () => {
    const params = makeParams();
    vi.mocked(params.deps.claimNextArmband!).mockRejectedValue(new Error('P0001: not staff'));

    const result = await submitShowRegistration(params);

    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000002',
      dbRegistrationId: 'db-reg-2',
      armbandAssignments: [],
      armbandFailures: [{ dogId: 'dog-1', error: 'P0001: not staff' }],
    });
  });

  it('rejects non-credit-card submission when selected dogs cannot resolve to one owner', async () => {
    const params = makeParams({
      paymentMethod: 'check',
      ownerResolution: { ok: false, owners: ['owner-1', 'owner-2'] },
    });

    await expect(submitShowRegistration(params)).rejects.toThrow('unresolved enrollment owner');
    expect(params.deps.createShowRegistration).not.toHaveBeenCalled();
  });

  it('stops after local submission when the caller is no longer active', async () => {
    const params = makeParams({ isActive: () => false });

    const result = await submitShowRegistration(params);

    expect(result).toEqual({ aborted: true });
    expect(params.deps.confirmRegistration).not.toHaveBeenCalled();
    expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
  });
});
