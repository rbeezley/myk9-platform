/**
 * Two things the page, not the panel, is responsible for (Codex #2210 round 3):
 *
 *  - cart expiry is wired ONLY for the exhibitor self-service flow. Staff flows
 *    never create a cart, and their `exhibitorProfile` is the signed-in
 *    organizer rather than the exhibitor being entered, so an ownership check
 *    would be comparing the wrong id against a cart that should not exist.
 *  - the blocked-Next reason renders wherever the navigation renders. Below
 *    1024 the buttons move into the fixed bottom bar; a reason left behind in
 *    the card footer is a reason off-screen.
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useCartStore, type CartWithDetails } from '@/store/cartStore';

const navigateMock = vi.hoisted(() => vi.fn());
const mockIsSecretaryRoute = vi.hoisted(() => ({ current: false }));
const mockIsDesktop = vi.hoisted(() => ({ current: true }));
const mockShow = vi.hoisted(() => ({
  current: {
    id: 'show-1',
    name: 'Test Show',
    organization: null,
    startDate: '2099-06-01',
    entryOpenDate: undefined as string | undefined,
    entryCloseDate: undefined as string | undefined,
    preEntryFee: '25',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ showId: 'show-1' }),
    useNavigate: () => navigateMock,
    useMatch: () => (mockIsSecretaryRoute.current ? { params: { showId: 'show-1' } } : null),
  };
});

vi.mock('@/store/showRegistrationStore', () => ({
  useShowRegistrationStore: () => ({
    createRegistration: vi.fn(() => ({ id: 'reg-1' })),
    submitRegistration: vi.fn(),
    currentRegistration: null,
    setDraftData: vi.fn(),
    updateRegistration: vi.fn(),
    updatePaymentStatus: vi.fn(),
    updateEntryStatus: vi.fn(),
  }),
}));

vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [mockShow.current] }) }));
vi.mock('@/store/entryStore', () => ({
  useEntryStore: () => ({ createMultipleEntries: vi.fn(), updateRegistration: vi.fn() }),
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ triggerSync: vi.fn() }),
}));
vi.mock('@/hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    saveDraft: vi.fn(),
    loadDraft: vi.fn(),
    deleteDraft: vi.fn(),
    availableDrafts: [],
    clearAllDrafts: vi.fn(),
    hasUnsavedChanges: false,
  }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [], isLoading: false }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: () => ({ classes: [] }) }));

// The exhibitor whose cart this is. Unmocked this hook fetches and resolves to
// undefined, which would make the ownership check fail for the wrong reason and
// leave the staff assertion below without a positive control.
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' }, isLoading: false }),
}));

// The page reads this to decide whether the navigation lives in the card footer
// or the fixed bottom bar; jsdom has no matchMedia worth consulting.
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsDesktop.current,
  default: () => mockIsDesktop.current,
}));

const mockPermissions = {
  canCreateExhibitor: false,
  isSecretary: false,
  isClubAdmin: false,
  isSiteAdmin: false,
};
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => mockPermissions,
}));

// Club Stripe readiness: false = card checkout unavailable, which is what makes
// a `credit_card` selection fall back to check.
const mockCardReady = vi.hoisted(() => ({ current: false }));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: () => ({
    isSuccess: true,
    isPending: false,
    isFetching: false,
    data: mockCardReady.current,
  }),
}));

vi.mock('@/context/RegistrationContext', () => ({
  RegistrationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: () => <div data-testid="step-content" />,
}));
// Capture what the rail is told, so the test can read the wizard's real
// currentStep / completedSteps rather than inferring them from pixels.
const railState = vi.hoisted(() => ({
  current: { currentStep: 0, completedSteps: [] as number[] },
}));
vi.mock('@/components/shows/wizard/components/HorizontalProgressIndicator', () => ({
  default: (props: { currentStep: number; completedSteps: number[] }) => {
    railState.current = { currentStep: props.currentStep, completedSteps: props.completedSteps };
    return <div data-testid="progress" />;
  },
}));

// A lever onto the page's REAL draft-load handler, which is how the wizard
// legitimately arrives on Payment with completion state already set.
const loadedDraft = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: (props: { onDraftLoaded: (draft: unknown) => void }) => (
    <button data-testid="load-draft" onClick={() => props.onDraftLoaded(loadedDraft.current)}>
      load draft
    </button>
  ),
}));
vi.mock('@/components/common/ErrorBoundary', () => ({
  RegistrationErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/services/database/armbands', () => ({ claimNextArmband: vi.fn() }));

import RegistrationWizardPage from '../RegistrationWizardPage';

/** An expired cart that genuinely belongs to this show and this exhibitor. */
function seedExpiredOwnedCart() {
  useCartStore.setState({
    cart: {
      id: 'cart-1',
      show_id: 'show-1',
      exhibitor_id: 'exhibitor-1',
      status: 'active',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      subtotal_cents: 0,
      platform_fee_cents: 0,
      total_cents: 0,
      items: [],
    } as unknown as CartWithDetails,
    expirationWarning: true,
  });
}

beforeEach(() => {
  navigateMock.mockReset();
  mockPermissions.canCreateExhibitor = false;
  mockPermissions.isSecretary = false;
  mockPermissions.isClubAdmin = false;
  mockPermissions.isSiteAdmin = false;
  mockIsSecretaryRoute.current = false;
  mockIsDesktop.current = true;
  mockCardReady.current = false;
  mockShow.current.entryCloseDate = undefined;
  useCartStore.getState().reset();
});

describe('RegistrationWizardPage cart-expiry is an exhibitor-flow concern', () => {
  it('announces an expired cart in the exhibitor flow (positive control)', async () => {
    seedExpiredOwnedCart();
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());
    expect(screen.getAllByTestId('cart-expiry-notice').length).toBeGreaterThan(0);
  });

  it('says nothing in a secretary flow even with an owned expired cart in the store', async () => {
    mockPermissions.isSecretary = true;
    mockIsSecretaryRoute.current = true;
    seedExpiredOwnedCart();

    render(<RegistrationWizardPage />, { initialRoute: '/secretary/register/show-1' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });

  it('says nothing in a site-admin flow either', async () => {
    mockPermissions.isSiteAdmin = true;
    mockIsSecretaryRoute.current = true;
    seedExpiredOwnedCart();

    render(<RegistrationWizardPage />, { initialRoute: '/secretary/register/show-1' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });
});

describe('RegistrationWizardPage blocked-Next reason follows the navigation', () => {
  const blockedReason = () => document.getElementById('registration-wizard-blocked-reason');

  it('renders the reason exactly once', async () => {
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    expect(document.querySelectorAll('#registration-wizard-blocked-reason')).toHaveLength(1);
    expect(blockedReason()).toHaveAttribute('role', 'status');
  });

  it('puts the reason inside the fixed bar below 1024, with the buttons', async () => {
    mockIsDesktop.current = false;
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    const bar = screen.getByTestId('entries-panel-bar');
    expect(within(bar).getByRole('status')).toBe(blockedReason());
  });

  it('keeps the reason in the card footer from 1024 up', async () => {
    mockIsDesktop.current = true;
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    const bar = screen.getByTestId('entries-panel-bar');
    expect(within(bar).queryByRole('status')).toBeNull();
    expect(screen.getByTestId('registration-wizard-card')).toContainElement(blockedReason());
  });
});

/**
 * Rounds 1, 2 and 5 all landed on this path. The defect round 5 named: while
 * `abandonCart()` was awaited, Payment stayed the active step with its
 * completion intact, so Submit was still pressable over an entry whose classes
 * had just been cleared — an empty enrollment.
 */
describe('RegistrationWizardPage start-over leaves no live Payment step', () => {
  /** Land on Payment the way a resumed draft does, with completion recorded. */
  async function arriveOnPaymentWithAnExpiredCart() {
    loadedDraft.current = {
      id: 'draft-1',
      data: {
        selectedDogs: ['dog-1'],
        entries: [],
        documents: [],
        paymentMethod: 'check',
        _workflowState: {
          currentStep: 'payment',
          stepCompletionState: { 'dog-selection': true, 'class-selection': true, payment: true },
          classSelections: [{ dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [] }],
          handlerAssignments: {},
        },
      },
    };
    seedExpiredOwnedCart();
    const view = render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    await view.user.click(screen.getByTestId('load-draft'));
    await waitFor(() => expect(railState.current.currentStep).toBe(2));
    return view;
  }

  it('arrives on Payment with completion recorded (positive control)', async () => {
    await arriveOnPaymentWithAnExpiredCart();

    expect(railState.current.currentStep).toBe(2);
    expect(railState.current.completedSteps).toContain(2);
    expect(screen.getAllByTestId('cart-expiry-notice').length).toBeGreaterThan(0);
  });

  it('moves off Payment and clears every completion when start-over is pressed', async () => {
    const view = await arriveOnPaymentWithAnExpiredCart();

    await view.user.click(
      screen.getAllByRole('button', { name: 'Choose classes again' })[0] as HTMLElement
    );

    // Synchronously, in the same commit: no await window in which Payment is
    // still live over an emptied entry.
    await waitFor(() => expect(railState.current.currentStep).toBe(1));
    expect(railState.current.completedSteps).toEqual([]);
  });

  it('takes the commit control away with it', async () => {
    const view = await arriveOnPaymentWithAnExpiredCart();
    expect(screen.getByRole('button', { name: /^Submit/ })).toBeInTheDocument();

    await view.user.click(
      screen.getAllByRole('button', { name: 'Choose classes again' })[0] as HTMLElement
    );

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Submit/ })).not.toBeInTheDocument()
    );
  });
});

/**
 * `PaymentStep` derived the check/cash fallback for an unpayable card selection
 * privately and only wrote it back to parent state in an effect, so the entries
 * panel could quote Credit/Debit Card plus a service fee while the controls
 * showed Check (Codex #2210 round 5 P2). One derivation now, owned by the page.
 */
describe('RegistrationWizardPage quotes one payment method', () => {
  async function arriveOnPaymentWithCard() {
    loadedDraft.current = {
      id: 'draft-1',
      data: {
        selectedDogs: ['dog-1'],
        entries: [],
        documents: [],
        paymentMethod: 'credit_card',
        _workflowState: {
          currentStep: 'payment',
          stepCompletionState: { 'dog-selection': true, 'class-selection': true },
          classSelections: [{ dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [] }],
          handlerAssignments: {},
        },
      },
    };
    const view = render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());
    await view.user.click(screen.getByTestId('load-draft'));
    await waitFor(() => expect(railState.current.currentStep).toBe(2));
    return view;
  }

  it('shows the fallback method and NO service fee when card checkout is unavailable', async () => {
    mockCardReady.current = false;
    await arriveOnPaymentWithCard();

    const panel = within(screen.getByTestId('entries-panel'));
    expect(panel.getByText('Check at Show')).toBeInTheDocument();
    expect(panel.queryByText('Credit/Debit Card')).not.toBeInTheDocument();
    // The service fee is card-only; quoting it against a check entry overstates
    // what the exhibitor owes.
    expect(panel.queryByText(/Service fee/i)).not.toBeInTheDocument();
  });

  it('shows the card method when card checkout IS available (positive control)', async () => {
    mockCardReady.current = true;
    await arriveOnPaymentWithCard();

    const panel = within(screen.getByTestId('entries-panel'));
    expect(panel.getByText('Credit/Debit Card')).toBeInTheDocument();
  });
});
