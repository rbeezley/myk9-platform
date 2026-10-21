import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { StepId } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentMethod,
} from '@/types/show-registration-types';

const navigateMock = vi.hoisted(() => vi.fn());
const stepProps = vi.hoisted(() => ({
  current: null as null | {
    onClassSelectionChange: (s: ClassSelectionData[]) => void;
    agreedToEntryAgreement?: boolean | undefined;
    onAgreementChange?: ((agreed: boolean) => void) | undefined;
  },
  // The mocked Classes step re-picks a class on every mount; a real person
  // arriving back from Payment has none picked, so the test turns that off.
  repick: true,
}));
const submitShowRegistrationMock = vi.hoisted(() => vi.fn());
const submitRegistrationCartCheckoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const deleteDraftMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const createRegistrationMock = vi.hoisted(() => vi.fn(() => ({ id: 'reg-1' })));
const clearDraftDataMock = vi.hoisted(() => vi.fn());
const discardDraftsWithoutFinalSaveMock = vi.hoisted(() => vi.fn());
const refetchClassAvailabilityMock = vi.hoisted(() => vi.fn());
const cartActionsMock = vi.hoisted(() => ({
  loadCart: vi.fn(),
  clearCart: vi.fn(),
  createCart: vi.fn(),
  addItem: vi.fn(),
  abandonCart: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ showId: 'show-1' }),
    useNavigate: () => navigateMock,
    useMatch: () => null,
  };
});

vi.mock('@/features/registration/submitShowRegistration', () => ({
  submitShowRegistration: submitShowRegistrationMock,
}));

vi.mock('@/features/registration/registrationCartCheckout', () => ({
  submitRegistrationCartCheckout: submitRegistrationCartCheckoutMock,
}));

vi.mock('@/store/showRegistrationStore', () => ({
  useShowRegistrationStore: () => ({
    createRegistration: createRegistrationMock,
    submitRegistration: vi.fn(),
    currentRegistration: { id: 'reg-1', status: 'draft', registrationNumber: 'REG-1' },
    setDraftData: vi.fn(),
    clearDraftData: clearDraftDataMock,
    updateRegistration: vi.fn(),
    updatePaymentStatus: vi.fn(),
    updateEntryStatus: vi.fn(),
    getRegistration: vi.fn(() => ({ id: 'reg-1', handlerId: 'owner-1' })),
  }),
}));

// MYK9-642: PaymentStep and the wizard's Next gate refuse to total an entry
// until the show's entry-window timezone is resolved from the trial store, so
// a test that renders them without a hydrated trial store sees the loading
// state instead of the fees. Nothing here is about the timezone, so it is
// reported resolved by default — but through a fixture that can be flipped, not
// a permanent `true`, so at least one case per suite exercises not-ready and a
// regression in the gate cannot hide behind these mocks (N-F6).
const entryWindowTimezone = vi.hoisted(() => {
  // ONE factory for every field, and the live object is seeded from it. A setter
  // that restored a hand-written subset would leak any field it forgot — and a
  // reset that lives inside one describe leaks the whole object into the next
  // one, which under `--sequence.shuffle` is a ~1/13 red on a file CI runs
  // shuffled and local runs do not (MYK9-642 P-F1, LESSON MYK9-666).
  const defaults = () => ({
    timeZone: 'America/New_York',
    isReady: true,
    isUnavailable: false,
  });
  return { defaults, current: defaults() };
});
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => entryWindowTimezone.current,
}));

// FILE-WIDE, outside every describe: the reset has to outlive whichever describe
// the shuffled order happens to end on.
beforeEach(() => {
  Object.assign(entryWindowTimezone.current, entryWindowTimezone.defaults());
});

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [
      {
        id: 'show-1',
        name: 'Test Show',
        organization: null,
        startDate: '2099-06-01',
        preEntryFee: '25',
      },
    ],
  }),
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: () => ({
    updateRegistration: vi.fn(),
  }),
}));

vi.mock('@/store/cartStore', () => ({
  useCartItems: () => [],
  useCartStore: (selector: (state: typeof cartActionsMock) => unknown) => selector(cartActionsMock),
  // The entries panel's expiry notice reads this; a live, un-expiring cart is
  // the right baseline for the Stripe handoff these tests are about.
  useCartExpiration: () => ({
    expiresAt: null,
    timeRemaining: null,
    isExpired: false,
    isWarning: false,
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    canAssignArmbands: false,
    isSecretary: false,
    isClubAdmin: false,
    isSiteAdmin: false,
  }),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ triggerSync: vi.fn() }),
}));

vi.mock('@/hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    saveDraft: vi.fn(),
    loadDraft: vi.fn(),
    deleteDraft: deleteDraftMock,
    availableDrafts: [],
    clearAllDrafts: vi.fn(),
    discardDraftsWithoutFinalSave: discardDraftsWithoutFinalSaveMock,
    hasUnsavedChanges: false,
  }),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: [{ id: 'dog-1', ownerId: 'owner-1', ownerName: 'Pat Owner', name: 'Rover' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [{ id: 'class-1', entryFee: 20 }] }),
}));

vi.mock('@/hooks/useClassAvailability', () => ({
  useClassAvailability: () => ({
    classes: [
      {
        classId: 'class-1',
        className: 'Class 1',
        element: null,
        level: 'Open',
        section: null,
        trialId: 'trial-1',
        trialName: 'Trial 1',
        trialDate: '2099-06-01',
        entryLimit: 10,
        currentEntries: 0,
        spotsAvailable: 10,
        waitlistCount: 0,
        isFull: false,
        hasWaitlist: false,
        allowsWaitlist: true,
        judgeId: null,
        judgeDayFull: false,
        judgeDayAvailable: 10,
      },
    ],
    isLoading: false,
    error: null,
    refetch: refetchClassAvailabilityMock,
  }),
}));

vi.mock('@/context/RegistrationContext', () => ({
  RegistrationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: (props: {
    currentStepId: StepId;
    onDogSelectionChange: (dogIds: string[]) => void;
    onClassSelectionChange: (selections: ClassSelectionData[]) => void;
    onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void;
    onPaymentMethodChange: (method: PaymentMethod) => void;
    agreedToEntryAgreement?: boolean | undefined;
    onAgreementChange?: ((agreed: boolean) => void) | undefined;
  }) => {
    stepProps.current = props;
    React.useEffect(() => {
      if (props.currentStepId === 'dog-selection') {
        props.onDogSelectionChange(['dog-1']);
      }
      if (props.currentStepId === 'class-selection' && stepProps.repick) {
        props.onClassSelectionChange([
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-1' }],
          },
        ]);
        props.onHandlerAssignmentChange({
          'dog-1|class-1': { handlerId: 'owner-1', handlerName: 'Pat Owner', isOwner: false },
        });
      }
      if (props.currentStepId === 'payment') {
        props.onPaymentMethodChange('credit_card');
      }
      // State is emitted once per step transition; including callback props here
      // re-triggers the mocked child on every parent render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.currentStepId]);

    return <div data-testid="step-content">{props.currentStepId}</div>;
  },
}));

vi.mock('@/components/shows/wizard/components/HorizontalProgressIndicator', () => ({
  default: () => <div data-testid="progress" />,
}));

vi.mock('@/components/shows/wizard/components/WizardNavigation', () => ({
  default: (props: { canGoNext: boolean; onNext: () => void; isLoading?: boolean }) => (
    <button type="button" disabled={!props.canGoNext || props.isLoading} onClick={props.onNext}>
      Next
    </button>
  ),
}));

vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: () => <div data-testid="draft-manager" />,
}));

vi.mock('@/components/common/ErrorBoundary', () => ({
  RegistrationErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/database/armbands', () => ({
  claimNextArmband: vi.fn(),
}));

import RegistrationWizardPage from '../RegistrationWizardPage';

const EMPTY_NOTICE = 'No classes left in this entry.';

describe('RegistrationWizardPage: removing the last class on Payment (MYK9-1289)', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    submitShowRegistrationMock.mockReset();
    submitRegistrationCartCheckoutMock.mockClear();
    stepProps.repick = true;
  });

  async function reachPayment() {
    const utils = render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    const { user } = utils;
    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('dog-selection')
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('class-selection')
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('payment'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    return utils;
  }

  it('removing the last class through the Entries panel returns to Classes with a notice', async () => {
    const { user } = await reachPayment();

    // The real panel's trash control and confirm dialog; only step content is mocked.
    stepProps.repick = false;
    await user.click(screen.getAllByRole('button', { name: /^Remove / })[0]!);
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('class-selection')
    );
    expect(screen.getByText(EMPTY_NOTICE, { selector: '[role="alert"]' })).toBeInTheDocument();
    expect(submitRegistrationCartCheckoutMock).not.toHaveBeenCalled();
    expect(submitShowRegistrationMock).not.toHaveBeenCalled();
  });

  it('sending the person back to Classes clears the entry agreement, as Back does', async () => {
    const { user } = await reachPayment();

    // Agree on Payment through the wizard's own handler.
    act(() => stepProps.current?.onAgreementChange?.(true));
    await waitFor(() => expect(stepProps.current?.agreedToEntryAgreement).toBe(true));

    stepProps.repick = false;
    await user.click(screen.getAllByRole('button', { name: /^Remove / })[0]!);
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('class-selection')
    );
    // The wizard hands the step content an unticked agreement: the person agrees again.
    expect(stepProps.current?.agreedToEntryAgreement).toBe(false);
  });
});
