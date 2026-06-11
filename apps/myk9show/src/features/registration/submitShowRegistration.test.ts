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
    currentRegistration: { registrationNumber: 'LOCAL-1' },
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    paymentMethod: 'credit_card',
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
      updateEntryRegistration: vi.fn().mockResolvedValue(undefined),
      createSubmissionId: () => 'submission-1',
    },
    ...overrides,
  };
}

describe('submitShowRegistration', () => {
  it('confirms credit-card registration, submits entries, and writes armbands back', async () => {
    const params = makeParams();

    const result = await submitShowRegistration(params);

    expect(params.deps.confirmRegistration).toHaveBeenCalledWith(
      'local-reg-1',
      'MOCK-PAYMENT-REF',
      params.paymentDetails
    );
    expect(params.deps.submitShowEntries).toHaveBeenCalledWith({
      showId: 'show-1',
      registrationId: 'db-reg-1',
      entries: [
        {
          dogId: 'dog-1',
          classId: 'class-1',
          handlerName: 'Pat Handler',
          paymentMethod: 'credit_card',
          clientFeeCents: 3000,
        },
      ],
      submissionId: 'submission-1',
      paymentMethod: 'credit_card',
    });
    expect(params.deps.updateEntryRegistration).toHaveBeenCalledWith(
      'entry-1',
      { armband: '101' },
      'user-1'
    );
    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000001',
      dbRegistrationId: 'db-reg-1',
      armbandAssignments: [{ dogId: 'dog-1', armband: '101' }],
      armbandFailures: [],
    });
  });

  it('skips armband assignment for exhibitor self-entries (canAssignArmbands=false)', async () => {
    // Exhibitors are not authorized for the staff-only assign_armband RPC; the
    // submit flow must not call it (otherwise every self-entry fires a 400).
    const params = makeParams({ canAssignArmbands: false });

    const result = await submitShowRegistration(params);

    // Entries still submit; only the armband claim is skipped.
    expect(params.deps.submitShowEntries).toHaveBeenCalledTimes(1);
    expect(params.deps.claimNextArmband).not.toHaveBeenCalled();
    expect(params.deps.updateEntryRegistration).not.toHaveBeenCalled();
    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000001',
      dbRegistrationId: 'db-reg-1',
      armbandAssignments: [],
      armbandFailures: [],
    });
  });

  it('reports armband entry-update failures instead of swallowing them', async () => {
    // Regression: armband write errors were silently .catch(() => {})'d —
    // the UI claimed success while the entry had no ring number in the DB.
    const params = makeParams();
    vi.mocked(params.deps.updateEntryRegistration).mockRejectedValue(
      new Error('RLS policy blocked UPDATE')
    );

    const result = await submitShowRegistration(params);

    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000001',
      dbRegistrationId: 'db-reg-1',
      // The armband did not persist, so it must not be reported as assigned.
      armbandAssignments: [],
      armbandFailures: [{ dogId: 'dog-1', error: 'RLS policy blocked UPDATE' }],
    });
  });

  it('reports armband claim failures without failing the submission', async () => {
    const params = makeParams();
    vi.mocked(params.deps.claimNextArmband!).mockRejectedValue(new Error('P0001: not staff'));

    const result = await submitShowRegistration(params);

    expect(params.deps.updateEntryRegistration).not.toHaveBeenCalled();
    expect(result).toEqual({
      aborted: false,
      registrationNumber: 'MK9-000001',
      dbRegistrationId: 'db-reg-1',
      armbandAssignments: [],
      armbandFailures: [{ dogId: 'dog-1', error: 'P0001: not staff' }],
    });
  });

  it('rejects non-credit-card submission when selected dogs cannot resolve to one owner', async () => {
    const params = makeParams({
      paymentMethod: 'check',
      ownerResolution: { ok: false, owners: ['owner-1', 'owner-2'] },
    });

    await expect(submitShowRegistration(params)).rejects.toThrow(
      'unresolved enrollment owner'
    );
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
