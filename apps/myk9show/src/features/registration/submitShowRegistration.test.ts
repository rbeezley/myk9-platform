import { describe, expect, it, vi } from 'vitest';
import { submitShowRegistration } from './submitShowRegistration';
import type { SubmitShowRegistrationParams } from './submitShowRegistration';
import { fromAny } from '@total-typescript/shoehorn';

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
      'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler', isOwner: false },
    },
    classes: [{ id: 'class-1', entryFee: 20 }],
    showFeeInfo: {
      preEntryFee: '25',
      dayOfShowFee: '30',
      startDate: '2026-05-01',
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
    ...overrides,
  };
}

describe('submitShowRegistration', () => {
  // MYK9-567: the handler name the exhibitor typed is printed on the check-in
  // sheet, the running order, the catalog and the registry entry form. Pin the
  // value at the RPC boundary so a future "normalise the name" helper cannot
  // quietly collapse the space the input fix restored.
  it('passes the handler name to submitShowEntries with its spaces intact', async () => {
    const params = makeParams({
      handlerAssignments: {
        'dog-1|class-1': {
          handlerId: 'handler-1',
          handlerName: "Mary-Jane O'Brien",
          isOwner: false,
        },
      },
    });

    await submitShowRegistration(params);

    expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ handlerName: "Mary-Jane O'Brien" })],
      })
    );
  });

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

  describe('Secretary Payment (Already Received) names cash or check (MYK9-677)', () => {
    it('sends the received payment in the single submit call, with no second ledger step', async () => {
      const params = makeParams({
        paymentMethod: 'secretary_paid',
        paymentDetails: {
          paymentReference: 'receipt-100',
          paymentDate: '2026-07-07',
          receivedMethod: 'check',
        },
        classes: [{ id: 'class-1', entryFee: 20 }],
      });

      await submitShowRegistration(params);

      expect(params.deps.submitShowEntries).toHaveBeenCalledTimes(1);
      expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: 'check',
          entries: [expect.objectContaining({ paymentMethod: 'check' })],
          payment: { method: 'check', receivedOn: '2026-07-07', reference: 'receipt-100' },
        })
      );
      // The follow-up enrollment write carries only the payment details: no
      // method, no total, so the RPC's total and paid_amount are not added to twice.
      expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(
        2,
        'show-1',
        'owner-1',
        'receipt-100',
        expect.objectContaining({ paymentReference: 'receipt-100', paymentDate: '2026-07-07' }),
        undefined,
        undefined,
        { selfService: false }
      );
    });

    it('leaves the received date to the server (today on the show calendar) when none was typed', async () => {
      const params = makeParams({
        paymentMethod: 'secretary_paid',
        paymentDetails: { receivedMethod: 'cash' },
      });

      await submitShowRegistration(params);

      expect(params.deps.submitShowEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          payment: { method: 'cash', receivedOn: null, reference: null },
        })
      );
    });

    it('refuses money received with no method before writing anything', async () => {
      const params = makeParams({
        paymentMethod: 'secretary_paid',
        paymentDetails: { paymentReference: 'receipt-100' },
      });

      await expect(submitShowRegistration(params)).rejects.toThrow(
        'Choose whether the payment was received as cash or check.'
      );

      expect(params.deps.submitRegistration).not.toHaveBeenCalled();
      expect(params.deps.createShowRegistration).not.toHaveBeenCalled();
      expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
    });

    it('sends no payment for a $0 entry and keeps the secretary_paid label', async () => {
      const params = makeParams({
        paymentMethod: 'secretary_paid',
        paymentDetails: {},
        classes: [{ id: 'class-1', entryFee: 0 }],
        showFeeInfo: { preEntryFee: '0', dayOfShowFee: '0', startDate: '2026-05-01' },
      });

      await submitShowRegistration(params);

      const call = vi.mocked(params.deps.submitShowEntries!).mock.calls[0]![0];
      expect(call.paymentMethod).toBe('secretary_paid');
      expect(call).not.toHaveProperty('payment');
    });

    it('sends no payment for any other method, so other callers are unchanged', async () => {
      const params = makeParams({ paymentMethod: 'check' });

      await submitShowRegistration(params);

      expect(vi.mocked(params.deps.submitShowEntries!).mock.calls[0]![0]).not.toHaveProperty(
        'payment'
      );
    });
  });

  it('does not persist enrollment payment totals when entry submission fails', async () => {
    const params = makeParams({
      paymentMethod: 'secretary_paid',
      paymentDetails: {
        paymentReference: 'receipt-100',
        paymentDate: '2026-07-07',
        receivedMethod: 'check',
      },
    });
    vi.mocked(params.deps.submitShowEntries!).mockRejectedValue(new Error('fee mismatch'));

    await expect(submitShowRegistration(params)).rejects.toThrow('fee mismatch');

    expect(params.deps.createShowRegistration).toHaveBeenCalledTimes(1);
    expect(params.deps.createShowRegistration).toHaveBeenCalledWith('show-1', 'owner-1');
  });

  it('records payment and claims armbands only for created capacity outcomes', async () => {
    const params = makeParams({
      paymentMethod: 'secretary_paid',
      paymentDetails: { paymentReference: 'check-1', receivedMethod: 'check' },
      classSelections: [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
        },
        {
          dogId: 'dog-2',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-2', jumpHeight: '16' }],
        },
      ],
      handlerAssignments: {
        'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler', isOwner: false },
        'dog-2|class-2': { handlerId: 'handler-2', handlerName: 'Lee Handler', isOwner: false },
      },
      classes: [
        { id: 'class-1', entryFee: 20 },
        { id: 'class-2', entryFee: 20 },
      ],
    });
    vi.mocked(params.deps.submitShowEntries!).mockResolvedValue({
      entries: [{ entryId: 'entry-1', dogId: 'dog-1' }],
      outcomes: [
        {
          dogId: 'dog-1',
          classId: 'class-1',
          outcome: 'created',
          entryId: 'entry-1',
          waitlistEntryId: null,
          feeCents: 3000,
          capacityOverride: false,
        },
        {
          dogId: 'dog-2',
          classId: 'class-2',
          outcome: 'waitlisted',
          entryId: null,
          waitlistEntryId: 'wait-2',
          feeCents: 0,
          capacityOverride: false,
        },
      ],
      registrationId: 'db-reg-1',
      submissionId: 'submission-1',
    } as Awaited<ReturnType<NonNullable<typeof params.deps.submitShowEntries>>>);

    const result = await submitShowRegistration(params);

    expect(params.deps.createShowRegistration).toHaveBeenNthCalledWith(
      2,
      'show-1',
      'owner-1',
      'check-1',
      { paymentReference: 'check-1', receivedMethod: 'check' },
      undefined,
      undefined,
      { selfService: false }
    );
    expect(params.deps.claimNextArmband).toHaveBeenCalledTimes(1);
    expect(params.deps.claimNextArmband).toHaveBeenCalledWith('show-1', 'dog-1', {
      entryIds: ['entry-1'],
    });
    expect(result).toEqual(
      expect.objectContaining({
        entryOutcomes: expect.arrayContaining([
          expect.objectContaining({ dogId: 'dog-2', outcome: 'waitlisted' }),
        ]),
      })
    );
  });

  it('reports enrollment payment persistence failures after entries submit', async () => {
    const params = makeParams({
      paymentMethod: 'secretary_paid',
      paymentDetails: {
        paymentReference: 'receipt-100',
        paymentDate: '2026-07-07',
        receivedMethod: 'cash',
      },
    });
    vi.mocked(params.deps.createShowRegistration!)
      .mockResolvedValueOnce(
        fromAny({
          data: { id: 'db-reg-2', confirmationNumber: 'MK9-000002' },
          error: null,
        })
      )
      .mockResolvedValueOnce({
        data: null,
        error: new Error('payment update failed'),
      });

    await expect(submitShowRegistration(params)).rejects.toThrow('payment update failed');

    expect(params.deps.submitShowEntries).toHaveBeenCalledTimes(1);
    expect(params.deps.createShowRegistration).toHaveBeenCalledTimes(2);
    expect(params.deps.claimNextArmband).not.toHaveBeenCalled();
  });

  it('throws when enrollment creation fails instead of reporting an empty success', async () => {
    // MYK9-302: createShowRegistration returns { data: null, error } on RLS,
    // offline, or the registration_confirmation_seq 42501. Swallowing it left
    // the wizard on the confirmation step with zero entries and an empty cart.
    const params = makeParams();
    vi.mocked(params.deps.createShowRegistration!).mockResolvedValueOnce(
      fromAny({
        data: null,
        error: {
          name: 'DatabaseError',
          message: 'permission denied for sequence registration_confirmation_seq',
        },
      })
    );

    await expect(submitShowRegistration(params)).rejects.toMatchObject({
      message: 'permission denied for sequence registration_confirmation_seq',
    });

    expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
    expect(params.deps.claimNextArmband).not.toHaveBeenCalled();
  });

  it('throws when enrollment creation returns no row and no error', async () => {
    // The unique-violation race path re-reads the concurrent row and can return
    // { data: null, error: null } when that read comes back empty.
    const params = makeParams();
    vi.mocked(params.deps.createShowRegistration!).mockResolvedValueOnce(
      fromAny({ data: null, error: null })
    );

    await expect(submitShowRegistration(params)).rejects.toThrow(
      /enrollment could not be created/i
    );

    expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
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
    expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
  });
});
