/**
 * MYK9-2149 (collect after submit): after an entry goes in against money the form held, the
 * wizard reads what the form still owes and hands it to the receipt; a failed read says it
 * could not be read, never "covered". Other submissions carry no such outcome.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const submitShowRegistrationMock = vi.hoisted(() => vi.fn());
const fetchDeskFormDueCentsMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/registration/submitShowRegistration', () => ({
  submitShowRegistration: submitShowRegistrationMock,
}));
vi.mock('@/features/registration/deskFormDue', () => ({
  fetchDeskFormDueCents: fetchDeskFormDueCentsMock,
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), warning: vi.fn() },
}));

import { submitPaymentStep } from './submitPaymentStep';
import { makeContextAndOrder } from './submitPaymentStep.testHelpers';

function deskContext(formHoldsMoney: boolean) {
  const setDeskFormOutcome = vi.fn();
  const { ctx } = makeContextAndOrder({
    currentWorkflowMode: 'secretary_new',
    paymentMethod: formHoldsMoney ? 'secretary_paid' : 'check',
    paymentDetails: formHoldsMoney ? { formHoldsMoney: true } : {},
    setDeskFormOutcome,
  });
  return { ctx, setDeskFormOutcome };
}

describe('submitPaymentStep reads what the form still owes (MYK9-2149)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitShowRegistrationMock.mockResolvedValue({
      aborted: false,
      registrationNumber: 'REG-1',
      dbRegistrationId: 'form-1',
      createdEntryOutcomes: [{ dogId: 'dog-1', classId: 'class-1', outcome: 'created' }],
      armbandAssignments: [],
      armbandFailures: [],
    });
  });

  it('hands the receipt what is still owed', async () => {
    fetchDeskFormDueCentsMock.mockResolvedValue(2000);
    const { ctx, setDeskFormOutcome } = deskContext(true);

    await submitPaymentStep(ctx);

    expect(fetchDeskFormDueCentsMock).toHaveBeenCalledWith('show-1', 'owner-1');
    expect(setDeskFormOutcome).toHaveBeenCalledWith({ formId: 'form-1', owedCents: 2000 });
  });

  it('reads nothing owed as covered (0), never as money due back', async () => {
    fetchDeskFormDueCentsMock.mockResolvedValue(-1000);
    const { ctx, setDeskFormOutcome } = deskContext(true);

    await submitPaymentStep(ctx);

    expect(setDeskFormOutcome).toHaveBeenCalledWith({ formId: 'form-1', owedCents: 0 });
  });

  it('says it could not read, never covered, when the read fails', async () => {
    fetchDeskFormDueCentsMock.mockRejectedValue(new Error('offline'));
    const { ctx, setDeskFormOutcome } = deskContext(true);

    await submitPaymentStep(ctx);

    expect(setDeskFormOutcome).toHaveBeenCalledWith({ formId: 'form-1', owedCents: null });
    expect(ctx.setCurrentStep).toHaveBeenCalled();
  });

  it('carries no outcome when no entry was created (all waitlisted or denied)', async () => {
    submitShowRegistrationMock.mockResolvedValue({
      aborted: false,
      registrationNumber: 'REG-1',
      dbRegistrationId: 'form-1',
      entryOutcomes: [{ dogId: 'dog-1', classId: 'class-1', outcome: 'waitlisted' }],
      armbandAssignments: [],
      armbandFailures: [],
    });
    const { ctx, setDeskFormOutcome } = deskContext(true);

    await submitPaymentStep(ctx);

    expect(fetchDeskFormDueCentsMock).not.toHaveBeenCalled();
    expect(setDeskFormOutcome).toHaveBeenCalledWith(null);
  });

  it('carries no outcome for an ordinary submission', async () => {
    const { ctx, setDeskFormOutcome } = deskContext(false);

    await submitPaymentStep(ctx);

    expect(fetchDeskFormDueCentsMock).not.toHaveBeenCalled();
    expect(setDeskFormOutcome).toHaveBeenCalledWith(null);
  });
});
