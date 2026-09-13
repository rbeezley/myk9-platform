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

vi.mock('@/context/RegistrationContext', () => ({
  RegistrationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: () => <div data-testid="step-content" />,
}));
vi.mock('@/components/shows/wizard/components/HorizontalProgressIndicator', () => ({
  default: () => <div data-testid="progress" />,
}));
vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: () => <div data-testid="draft-manager" />,
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
