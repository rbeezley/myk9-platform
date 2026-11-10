import { makePaymentResolution } from '@/test/utils/paymentResolution';
/**
 * MYK9-1844: when a secretary's payment-status or entry-status change does not save,
 * the wizard shows a fixed sentence naming which status, never the thrown text, and
 * the thrown error goes to the logger. Real WorkflowStepContent, stubbed leaves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import type { WorkflowConfig } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';

const h = vi.hoisted(() => ({ notifyError: vi.fn() }));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: h.notifyError, info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/store/showStore', () => ({ useShowStore: () => [] }));
vi.mock('@/store/trialStore', () => ({ useTrialStore: () => [] }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => ({ dogs: [] }) }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: () => ({ classes: [] }) }));
vi.mock('@/components/shows/RegistrationWorkflow/PaymentStep', () => ({
  PaymentStep: (p: {
    onPaymentStatusChange: (status: string) => void;
    onEntryStatusChange: (status: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => p.onPaymentStatusChange('paid')}>
        Mark paid
      </button>
      <button type="button" onClick={() => p.onEntryStatusChange('accepted')}>
        Accept entry
      </button>
    </>
  ),
}));
vi.mock('@/components/shows/RegistrationWorkflow/ConfirmationStep', () => ({
  ConfirmationStep: (p: { onStatusChange: (dogId: string, status: string) => void }) => (
    <button type="button" onClick={() => p.onStatusChange('dog-1', 'accepted')}>
      Confirm accept
    </button>
  ),
}));

import { WorkflowStepContent } from '@/components/shows/RegistrationWorkflow/WorkflowStepContent';
import { STATUS_SAVE_FAILED } from '@/components/shows/RegistrationWorkflow/statusSaveError';
import { logger } from '@/services/LoggingService';

const RAW = 'new row for relation "entries" violates check constraint "entries_status_check"';

const config: WorkflowConfig = {
  steps: ['payment', 'confirmation'],
  features: {
    bulkSelection: false,
    createNew: false,
    advancedSearch: false,
    handlerAssignment: false,
    paymentOverride: true,
    statusManagement: true,
  },
  smartDefaults: {
    autoAssignHandler: false,
    autoCalculateFees: false,
    delayRegistrationCreation: false,
  },
};

function props(currentStepId: 'payment' | 'confirmation') {
  return {
    currentStepId,
    currentWorkflowConfig: config,
    currentWorkflowMode: 'secretary' as never,
    registrationData: { selectedDogs: [], classSelections: [], handlerAssignments: {} } as never,
    optimisticState: {
      formData: { selectedDogs: [] } as never,
      classSelections: [],
      handlerAssignments: {},
      paymentStatus: 'pending' as never,
      entryStatus: 'pending' as never,
    },
    showId: 'show-1',
    registrationId: 'registration-1',
    registrationNumber: 'R-1',
    currentRegistrationTotalFees: 0,
    onDogSelectionChange: vi.fn(),
    onClassSelectionChange: vi.fn(),
    onHandlerAssignmentChange: vi.fn(),
    onPaymentMethodChange: vi.fn(),
    onPaymentStatusChange: vi.fn().mockRejectedValue(new Error(RAW)),
    onEntryStatusChange: vi.fn().mockRejectedValue(new Error(RAW)),
    setPaymentStatus: vi.fn(),
    setEntryStatus: vi.fn(),
  };
}

function expectFixedSentence(sentence: string) {
  expect(h.notifyError).toHaveBeenCalledTimes(1);
  expect(h.notifyError).toHaveBeenCalledWith(sentence);
  expect(JSON.stringify(h.notifyError.mock.calls)).not.toContain('violates');
  expect(logger.error).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.anything(),
    expect.objectContaining({ message: RAW })
  );
}

describe('WorkflowStepContent status save errors (MYK9-1844)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  it('a payment status that does not save shows the payment sentence', async () => {
    render(
      <WorkflowStepContent {...props('payment')} paymentResolution={makePaymentResolution()} />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark paid' }));
    expectFixedSentence("We couldn't change the payment status. Try again.");
  });

  it('an entry status that does not save on the payment step shows the entry sentence', async () => {
    render(
      <WorkflowStepContent {...props('payment')} paymentResolution={makePaymentResolution()} />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept entry' }));
    expectFixedSentence(STATUS_SAVE_FAILED.entry);
  });

  it('an entry status that does not save on the confirmation step shows the entry sentence', async () => {
    // A wait-listed outcome renders the plain confirmation step (not the styled receipt).
    const waitlisted = {
      dogId: 'dog-1',
      classId: 'class-1',
      outcome: 'waitlisted' as const,
      entryId: null,
      waitlistEntryId: 'wl-1',
      feeCents: 0,
      capacityOverride: false,
    };
    render(
      <WorkflowStepContent
        {...props('confirmation')}
        entryOutcomes={[waitlisted]}
        paymentResolution={makePaymentResolution()}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm accept' }));
    expectFixedSentence("We couldn't change the entry status. Try again.");
  });
  it('logs a database-shaped plain object as an Error carrying its message and code', async () => {
    const p = props('payment');
    p.onPaymentStatusChange = vi.fn().mockRejectedValue({ message: RAW, code: '23514' });
    render(<WorkflowStepContent {...p} paymentResolution={makePaymentResolution()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark paid' }));

    expect(h.notifyError).toHaveBeenCalledWith(STATUS_SAVE_FAILED.payment);
    const [, , metadata, logged] = vi.mocked(logger.error).mock.calls[0]!;
    expect(metadata).toEqual({ code: '23514' });
    expect(logged).toBeInstanceOf(Error);
    expect(logged?.message).toBe(RAW);
  });
});
