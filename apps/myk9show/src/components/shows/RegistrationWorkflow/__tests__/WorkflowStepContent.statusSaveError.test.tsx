import { makePaymentResolution } from '@/test/utils/paymentResolution';
/**
 * MYK9-1844: when a secretary's entry-status change does not save, the wizard
 * shows a fixed sentence naming which status, never the thrown text, and the
 * thrown error goes to the logger. Real WorkflowStepContent, stubbed leaves.
 * MYK9-1822 removed the payment step's own status controls (Entry management
 * owns them), so the confirmation step is the one caller left.
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

function props(currentStepId: 'confirmation') {
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
    onEntryStatusChange: vi.fn().mockRejectedValue(new Error(RAW)),
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

  it('an entry status that does not save on the confirmation step shows the entry sentence', async () => {
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
    const p = props('confirmation');
    p.onEntryStatusChange = vi.fn().mockRejectedValue({ message: RAW, code: '23514' });
    render(
      <WorkflowStepContent
        {...p}
        entryOutcomes={[waitlisted]}
        paymentResolution={makePaymentResolution()}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm accept' }));

    expect(h.notifyError).toHaveBeenCalledWith(STATUS_SAVE_FAILED.entry);
    const [, , metadata, logged] = vi.mocked(logger.error).mock.calls[0]!;
    expect(metadata).toEqual({ code: '23514' });
    expect(logged).toBeInstanceOf(Error);
    expect(logged?.message).toBe(RAW);
  });
});
