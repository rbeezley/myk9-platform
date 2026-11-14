import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitPaymentStep } from './submitPaymentStep';
import { makeContextAndOrder } from './submitPaymentStep.testHelpers';

const submitShowRegistrationMock = vi.hoisted(() => vi.fn());
const sendSubmittedEntryEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/registration/submitShowRegistration', () => ({
  submitShowRegistration: submitShowRegistrationMock,
}));
vi.mock('@/features/registration/registrationCartCheckout', () => ({
  submitRegistrationCartCheckout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/features/registration/submitOfflineLateEntry', () => ({
  submitOfflineLateEntry: vi.fn(),
}));
vi.mock('./sendSubmittedEntryEmail', async importOriginal => ({
  ...(await importOriginal<typeof import('./sendSubmittedEntryEmail')>()),
  sendSubmittedEntryEmail: sendSubmittedEntryEmailMock,
}));
vi.mock('@/lib/notifications', () => ({ notifications: { error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  submitShowRegistrationMock.mockResolvedValue({
    aborted: false,
    registrationNumber: 'REG-1',
    armbandAssignments: [],
    armbandFailures: [],
  });
});

describe('the one confirmation email for a check or cash entry (MYK9-1963)', () => {
  const createdOutcome = {
    dogId: 'dog-1',
    classId: 'class-1',
    outcome: 'created' as const,
    entryId: 'entry-1',
    waitlistEntryId: null,
    feeCents: 2500,
    capacityOverride: false,
  };

  it('sends one email, for the submitted entries, when an exhibitor submits a check entry', async () => {
    submitShowRegistrationMock.mockResolvedValue({
      aborted: false,
      registrationNumber: 'REG-1',
      dbRegistrationId: 'enrollment-1',
      armbandAssignments: [],
      armbandFailures: [],
      createdEntryOutcomes: [createdOutcome],
    });
    const { ctx } = makeContextAndOrder({ paymentMethod: 'check' });

    await submitPaymentStep(ctx);

    expect(sendSubmittedEntryEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSubmittedEntryEmailMock).toHaveBeenCalledWith('enrollment-1', ['entry-1']);
  });

  it('sends one email for a cash entry too', async () => {
    submitShowRegistrationMock.mockResolvedValue({
      aborted: false,
      dbRegistrationId: 'enrollment-1',
      armbandAssignments: [],
      armbandFailures: [],
      createdEntryOutcomes: [createdOutcome],
    });
    const { ctx } = makeContextAndOrder({ paymentMethod: 'cash' });

    await submitPaymentStep(ctx);

    expect(sendSubmittedEntryEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSubmittedEntryEmailMock).toHaveBeenCalledWith('enrollment-1', ['entry-1']);
  });

  it('sends nothing when a secretary enters the dog, or when no entry was created', async () => {
    submitShowRegistrationMock.mockResolvedValue({
      aborted: false,
      dbRegistrationId: 'enrollment-1',
      armbandAssignments: [],
      armbandFailures: [],
      createdEntryOutcomes: [createdOutcome],
    });
    await submitPaymentStep(makeContextAndOrder({ currentWorkflowMode: 'secretary_new' }).ctx);

    submitShowRegistrationMock.mockResolvedValue({
      aborted: false,
      dbRegistrationId: 'enrollment-1',
      armbandAssignments: [],
      armbandFailures: [],
    });
    await submitPaymentStep(makeContextAndOrder().ctx);

    expect(sendSubmittedEntryEmailMock).not.toHaveBeenCalled();
  });

  it('sends nothing on the card path: the Stripe receipt is its one email', async () => {
    const { ctx } = makeContextAndOrder({ paymentMethod: 'credit_card' });

    await submitPaymentStep(ctx);

    expect(sendSubmittedEntryEmailMock).not.toHaveBeenCalled();
  });
});
