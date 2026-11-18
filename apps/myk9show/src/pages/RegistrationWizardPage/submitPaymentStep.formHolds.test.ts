/**
 * MYK9-2149 (inform only): after an entry is added to a form the Payment step confirmed held
 * money, the wizard reads what the form still owes and hands it to the receipt; a failed read
 * says it could not be read, never "covered". Other submissions carry no such outcome.
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

function deskContext(heldBeforeSubmit: boolean, usedFormMoney = false) {
  const setDeskFormOutcome = vi.fn();
  const { ctx } = makeContextAndOrder({
    currentWorkflowMode: 'secretary_new',
    paymentMethod: usedFormMoney ? 'form_money' : 'secretary_paid',
    paymentDetails: usedFormMoney ? {} : { receivedMethod: 'cash' },
    deskFormHeldBeforeSubmit: heldBeforeSubmit,
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

  // Codex P2: the SUBMITTED choice triggers the notice, whatever the form held before or the
  // read finds after (here the step had no confirmed read before submit).
  it.each([
    [2000, 2000],
    [0, 0],
    [-500, 0],
  ])(
    'after using the form money, tells the balance (due %i cents -> owed %i)',
    async (due, owed) => {
      fetchDeskFormDueCentsMock.mockResolvedValue(due);
      const { ctx, setDeskFormOutcome } = deskContext(false, true);

      await submitPaymentStep(ctx);

      expect(setDeskFormOutcome).toHaveBeenCalledWith({ formId: 'form-1', owedCents: owed });
    }
  );

  it('after using the form money, says it could not check when the read fails', async () => {
    fetchDeskFormDueCentsMock.mockRejectedValue(new Error('offline'));
    const { ctx, setDeskFormOutcome } = deskContext(false, true);

    await submitPaymentStep(ctx);

    expect(setDeskFormOutcome).toHaveBeenCalledWith({ formId: 'form-1', owedCents: null });
  });

  it('carries no outcome when the form held no money before submit', async () => {
    const { ctx, setDeskFormOutcome } = deskContext(false);

    await submitPaymentStep(ctx);

    expect(fetchDeskFormDueCentsMock).not.toHaveBeenCalled();
    expect(setDeskFormOutcome).toHaveBeenCalledWith(null);
  });
});
