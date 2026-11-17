import { describe, expect, it, vi } from 'vitest';
import { submitShowRegistration } from './submitShowRegistration';
import type { SubmitShowRegistrationParams } from './submitShowRegistration';

/**
 * MYK9-2031: entries the exhibitor left as "I'll decide at the show" are flagged right after a
 * successful submit, with exactly those entry ids; a failed flag never fails the submit.
 */
function outcome(dogId: string, classId: string, entryId: string) {
  return {
    dogId,
    classId,
    outcome: 'created',
    entryId,
    waitlistEntryId: null,
    waitlistPosition: null,
    feeCents: 2500,
    capacityOverride: false,
  };
}

function makeParams(markEntriesHandlerToDecide: ReturnType<typeof vi.fn>) {
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
        selectedClasses: [{ classId: 'class-1' }, { classId: 'class-2' }],
      },
      { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ],
    handlerAssignments: {
      'dog-1|class-1': { handlerId: 'o1', handlerName: 'Pat Owner', isOwner: true },
      'dog-1|class-2': { handlerId: 'o1', handlerName: 'Pat Owner', isOwner: true },
      'dog-2|class-1': {
        handlerId: 'o1',
        handlerName: 'Pat Owner',
        isOwner: true,
        decideAtShow: true,
      },
    },
    classes: [{ id: 'class-1' }, { id: 'class-2' }],
    showFeeInfo: { preEntryFee: '25', dayOfShowFee: '30', startDate: '2026-05-01' },
    submissionSource: 'self_service',
    canAssignArmbands: false,
    deps: {
      submitRegistration: vi.fn().mockResolvedValue(undefined),
      createShowRegistration: vi.fn().mockResolvedValue({
        data: { id: 'db-reg-2', confirmationNumber: 'MK9-000002' },
        error: null,
      }),
      submitShowEntries: vi.fn().mockResolvedValue({
        entries: [],
        outcomes: [
          outcome('dog-1', 'class-1', 'entry-1'),
          outcome('dog-1', 'class-2', 'entry-2'),
          outcome('dog-2', 'class-1', 'entry-3'),
        ],
        registrationId: 'db-reg-1',
        submissionId: 'submission-1',
      }),
      markEntriesHandlerToDecide,
      createSubmissionId: () => 'submission-1',
    },
  } as unknown as SubmitShowRegistrationParams;
}

describe('submitShowRegistration handler to decide (MYK9-2031)', () => {
  it('flags exactly the entries left as "I\'ll decide at the show"', async () => {
    const mark = vi.fn().mockResolvedValue(undefined);
    await submitShowRegistration(makeParams(mark));
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(['entry-3']);
  });

  it('does not call the flag RPC when no entry was left to decide', async () => {
    const mark = vi.fn().mockResolvedValue(undefined);
    const params = makeParams(mark);
    params.handlerAssignments = {
      'dog-2|class-1': { handlerId: 'o1', handlerName: 'Pat Owner', isOwner: true },
    };
    await submitShowRegistration(params);
    expect(mark).not.toHaveBeenCalled();
  });

  it('still completes the submit when the flag call fails', async () => {
    const mark = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await submitShowRegistration(makeParams(mark));
    expect(mark).toHaveBeenCalledWith(['entry-3']);
    expect(result.aborted).toBe(false);
    expect(result).toMatchObject({ dbRegistrationId: 'db-reg-2' });
  });
});
