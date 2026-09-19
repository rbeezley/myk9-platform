import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { StepId } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentMethod,
} from '@/types/show-registration-types';

const navigateMock = vi.hoisted(() => vi.fn());
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

function withUnresolvedShowTimezone(): void {
  entryWindowTimezone.current.isReady = false;
  entryWindowTimezone.current.isUnavailable = false;
}

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
  }) => {
    React.useEffect(() => {
      if (props.currentStepId === 'dog-selection') {
        props.onDogSelectionChange(['dog-1']);
      }
      if (props.currentStepId === 'class-selection') {
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

describe('RegistrationWizardPage — Stripe payment handoff', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    submitShowRegistrationMock.mockReset();
    submitRegistrationCartCheckoutMock.mockClear();
    deleteDraftMock.mockClear();
    createRegistrationMock.mockClear();
    clearDraftDataMock.mockClear();
    discardDraftsWithoutFinalSaveMock.mockClear();
  });

  it('hands credit-card payment to the cart checkout flow instead of submitShowRegistration', async () => {
    const { user } = render(<RegistrationWizardPage />, {
      initialRoute: '/shows/show-1/register',
    });

    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('dog-selection')
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('class-selection')
    );
    await waitFor(() =>
      expect(createRegistrationMock).toHaveBeenCalledWith('show-1', 'user-1', 'owner-1')
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('payment'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(submitRegistrationCartCheckoutMock).toHaveBeenCalledTimes(1));
    expect(submitShowRegistrationMock).not.toHaveBeenCalled();
  });

  it('will not hand payment to Stripe while the show timezone is unresolved (MYK9-642)', async () => {
    // The whole reason the gate exists: the day-of fee tier is decided in the
    // show's own timezone, so an entry must not leave this page priced from the
    // America/New_York fallback. Same walk as the test above, one flag flipped.
    withUnresolvedShowTimezone();
    const { user } = render(<RegistrationWizardPage />, {
      initialRoute: '/shows/show-1/register',
    });

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

    // Next is disabled on the payment step, and neither writer ran.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled());
    expect(submitRegistrationCartCheckoutMock).not.toHaveBeenCalled();
    expect(submitShowRegistrationMock).not.toHaveBeenCalled();
  });

  // Advancing scrolled the wizard but never moved focus, so a keyboard user
  // stayed on the Next button of the step they had just left — and on the
  // payment -> receipt swap that button is unmounted entirely, dropping focus
  // to <body>. Mounted through the real page: the heading and the effect that
  // focuses it are page-level, and a test of the effect alone would not catch
  // the ref being unwired.
  it('moves focus to the step heading when the step changes', async () => {
    const { user } = render(<RegistrationWizardPage />, {
      initialRoute: '/shows/show-1/register',
    });

    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('dog-selection')
    );
    // First render must NOT steal focus — the user has only just arrived.
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: /step 1 of/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveTextContent('class-selection')
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: /step 2 of/i }))
    );
  });

  it('keeps the wizard draft alive across the Stripe handoff so a cancelled checkout can resume', async () => {
    // MYK9-509: this assertion is the inverse of the one it replaces. The
    // hand-off used to discard the draft the moment the lines reached the cart,
    // which is what left a cancelled checkout with nothing to come back to. The
    // draft is now retired only where entries are actually filed.
    const { user } = render(<RegistrationWizardPage />, {
      initialRoute: '/shows/show-1/register',
    });

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
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(submitRegistrationCartCheckoutMock).toHaveBeenCalledTimes(1));
    const [{ deps }] = submitRegistrationCartCheckoutMock.mock.calls[0] as Array<{
      deps: Record<string, unknown>;
    }>;

    // No draft-deleting dependency is handed to the cart checkout at all, so
    // there is no longer a path that can retire the draft from here.
    expect(deps).not.toHaveProperty('deleteDraft');
    expect(discardDraftsWithoutFinalSaveMock).not.toHaveBeenCalled();
    expect(clearDraftDataMock).not.toHaveBeenCalled();
    expect(deleteDraftMock).not.toHaveBeenCalled();
  });
});
